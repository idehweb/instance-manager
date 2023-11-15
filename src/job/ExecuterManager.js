import fs from "fs";
import { JobStatus, JobSteps, JobType, jobModel } from "../model/job.model.js";
import {
  axiosError2String,
  err2Str,
  getPublicPath,
  slugify,
  wait,
} from "../utils/helpers.js";
import { Global } from "../global.js";
import { transform } from "../common/transform.js";
import { Remote } from "../utils/remote.js";
import { catchFn } from "../utils/catchAsync.js";
import CreateExecuter from "./CreateExecuter.js";
import UpdateExecuter from "./UpdateExecuter.js";
import DeleteExecuter from "./DeleteExecuter.js";
import { getLogFilePath, log } from "./utils.js";

export default class ExecuteManager {
  last_log;
  constructor(job, instance, res, req) {
    this.job = { ...job._doc };
    this.instance = { ...instance._doc };
    this.remote = new Remote(instance.region);
    this.log_file = fs.createWriteStream(getLogFilePath(this), {
      encoding: "utf8",
    });
    this.res = res;
    this.req = req;

    // initial executer
    this.executer = new (this.#convertJobTypeToExecuter())(
      this.job,
      this.instance,
      this.log_file
    );
  }
  static buildAndRun(job, instance, res, req) {
    const manager = new ExecuteManager(job, instance, res, req);
    manager
      .execute()
      .then()
      .catch((err) => {
        manager.log(
          `#Executer Error#\n${axiosError2String(err)}`,
          true,
          true,
          true
        );
        manager.sendResultToClient(false);
        manager.clean().then();
      });
  }
  get instance_name() {
    return `nwi-${this.instance.name}`;
  }
  log(chunk, isEnd = false, isError = false, whenDifferent = false) {
    this.last_log = log({
      chunk,
      isEnd,
      isError,
      whenDifferent,
      jobId: this.job._id,
      instanceName: this.instance_name,
      last_log: this.last_log,
      labels: [slugify(this.constructor.name)],
      log_file: this.log_file,
    });
  }
  async execute() {
    // create
    let isRun;
    this.log("Start");
    if (this.job.attempt === 1) {
      await this.executer.init();
      // set job to map
      Global.jobs.set(this.executer.id, this.executer);
    }

    try {
      if (this.job.type === JobType.CREATE) {
        await this.#create_instance();
      }
      // update
      if (this.job.type === JobType.UPDATE) {
        await this.#update_instance(this.req.body);
      }
      // delete
      if (this.job.type === JobType.DELETE) {
        await this.#delete_instance();
      }
      isRun = true;
    } catch (err) {
      this.log(
        `Error${
          this.job.progress_step ? ` in step:${this.job.progress_step}` : ""
        }, attempt:${this.job.attempt}, message:${axiosError2String(err)}`,
        false,
        true
      );
      isRun = false;
    }
    if (!isRun) {
      const isThereAnyChance = await this.#checkAttempts();
      if (!isThereAnyChance) return;
      // failed
      this.job = {
        ...(
          await jobModel.findByIdAndUpdate(
            this.job._id,
            { $inc: { attempt: 1 } },
            { new: true }
          )
        )._doc,
      };
      await wait(10);
      return this.execute();
    }
    // success
    this.log("Finish successfully", true);
    // callback nodeeweb
    this.sendResultToClient(true);
  }
  sendResultToClient(isOk) {
    if (!this.res || !this.res?.writable) return;
    let code;
    if (isOk) {
      switch (this.job.type) {
        case JobType.CREATE:
          code = 201;
          break;
        case JobType.DELETE:
          code = 204;
          break;
        case JobType.UPDATE:
          code = 200;
          break;
      }
    } else code = 500;

    const status = isOk ? "success" : "error";
    const data = transform(
      {
        status,
        job: this.job,
        instance: this.instance,
      },
      code,
      this.req
    );
    this.res.status(code).json(data);
  }
  async #checkAttempts() {
    // check attempts
    if (this.job.attempt < this.job.max_attempts) return true;
    this.log("try to sync-db, after error");
    await this.#sync_db(true);
    this.log("try to clean, after error");
    await this.clean();
    this.log("Finish with Error", true);
    this.sendResultToClient(false);
    return false;
  }
  #sync_db = async (isError = false) => {
    // inner sync
    const newInstance = await this.executer.sync_db(isError);
    this.instance = newInstance;

    // outer sync
    const newJob = await jobModel.findByIdAndUpdate(
      this.job._id,
      { $set: { status: isError ? JobStatus.ERROR : JobStatus.SUCCESS } },
      { new: true }
    );
    this.job = newJob._doc;
    this.executer.job = this.job;
  };

  async #execute_stack(
    stack,
    { ignoreError, executer, update_step, filter } = {
      update_step: true,
      ignoreError: false,
      executer: this.executer,
      filter: true,
    }
  ) {
    stack = [
      ...new Set([
        JobSteps.PRE_REQUIRED,
        ...(filter
          ? stack.filter((step) => !this.job.done_steps.includes(step))
          : stack),
      ]),
    ];

    for (const step of stack) {
      this.log(`Execute Stack step: ${step}`);

      // set db step
      if (update_step) await this.#updateJobStep({ progress_step: step });

      // execute each step
      const fn = this.#convertJobStepToFunc(step, executer);
      const myFn = ignoreError
        ? catchFn(fn, {
            self: executer,
            onError(err) {
              executer.log(
                `Error step ${step} \n` + axiosError2String(err),
                false,
                true
              );
            },
          })
        : fn;
      await myFn.call(executer);

      // set db step
      if (update_step)
        await this.#updateJobStep({ done_step: step, progress_step: null });
    }
  }

  async #create_instance() {
    const stack = [
      JobSteps.CREATE_STATIC_DIRS,
      JobSteps.COPY_STATIC,
      JobSteps.CREATE_USER_IN_DB,
      JobSteps.CREATE_SERVICE,
      JobSteps.CDN_REGISTER,
      JobSteps.ADD_DOMAIN_CERT,
      JobSteps.ADD_DOMAIN_CONFIG,
      JobSteps.RESTORE_DB,
      JobSteps.SYNC_DB,
    ].filter((step) => {
      // not use demo steps on none pattern mode
      if (
        !this.instance.pattern &&
        [JobSteps.COPY_STATIC, JobSteps.RESTORE_DB].includes(step)
      )
        return false;

      // not use docker steps in dev env
      if (
        !Global.env.isPro &&
        [
          // JobSteps.CREATE_USER_IN_DB,
          JobSteps.CDN_REGISTER,
          JobSteps.CREATE_STATIC_DIRS,
          JobSteps.COPY_STATIC,
          JobSteps.CREATE_SERVICE,
          JobSteps.RESTORE_DB,
          JobSteps.ADD_DOMAIN_CONFIG,
          JobSteps.ADD_DOMAIN_CERT,
        ].includes(step)
      )
        return false;

      // not use add domain config when there is not any custom config
      if (
        this.instance.domains.length <= 1 &&
        [JobSteps.ADD_DOMAIN_CONFIG, JobSteps.ADD_DOMAIN_CERT].includes(step)
      )
        return false;

      return true;
    });

    // execute
    await this.#execute_stack(stack);
  }
  async #update_instance({
    domains_add,
    domains_rm,
    image,
    site_name,
    primary_domain,
    status,
  }) {
    const stack = [JobSteps.PARSE_UPDATE_QUERY];
    // change status
    if (status) {
      stack.push(JobSteps.CHANGE_STATUS);
    }

    // change domain
    if (
      (domains_add && domains_add.length) ||
      (domains_rm && domains_rm.length)
    ) {
      stack.push(
        JobSteps.UPDATE_DOMAIN_CDN,
        JobSteps.UPDATE_DOMAIN_CERT,
        JobSteps.UPDATE_DOMAIN_CONFIG
      );
    }

    // change image version
    if (image) {
      stack.push(JobSteps.CHANGE_IMAGE);
    }

    // change primary domain
    if (primary_domain) {
      stack.push(JobSteps.CHANGE_SERVICE_PRIMARY_DOMAIN);
    }

    // site name
    if (site_name) {
      stack.push(JobSteps.UPDATE_SITE_NAME);
    }

    // sync db
    stack.push(JobSteps.SYNC_DB);

    // execute stack
    await this.#execute_stack(stack);
  }
  async #delete_instance() {
    const stack = [
      JobSteps.CDN_UNREGISTER,
      JobSteps.REMOVE_DOMAIN_CERT,
      JobSteps.REMOVE_DOMAIN_CONFIG,
      JobSteps.REMOVE_SERVICE,
      JobSteps.BACKUP_STATIC,
      JobSteps.REMOVE_STATIC,
      JobSteps.BACKUP_DB,
      JobSteps.REMOVE_DB,
      JobSteps.SYNC_DB,
    ].filter((step) => {
      if (
        Global.env.isLocal &&
        [
          JobSteps.REMOVE_SERVICE,
          JobSteps.BACKUP_STATIC,
          JobSteps.REMOVE_DOMAIN_CERT,
          JobSteps.REMOVE_DOMAIN_CONFIG,
          JobSteps.REMOVE_STATIC,
          JobSteps.BACKUP_DB,
        ].includes(step)
      )
        return false;
      return true;
    });

    await this.#execute_stack(stack);
  }
  async clean() {
    if (this.job.type != JobType.CREATE) return;

    // true flag job clean phase
    await this.#updateJobAtr({ isInCleanPhase: true });

    const stack = [
      JobSteps.CDN_UNREGISTER,
      JobSteps.REMOVE_SERVICE,
      JobSteps.REMOVE_DOMAIN_CERT,
      JobSteps.REMOVE_DOMAIN_CONFIG,
      JobSteps.REMOVE_STATIC,
      JobSteps.REMOVE_DB,
    ].filter((step) => {
      if (
        Global.env.isLocal &&
        [
          JobSteps.REMOVE_SERVICE,
          JobSteps.REMOVE_STATIC,
          JobSteps.REMOVE_DOMAIN_CERT,
          JobSteps.REMOVE_DOMAIN_CONFIG,
        ].includes(step)
      )
        return false;
      return true;
    });
    await this.#execute_stack(stack, {
      ignoreError: true,
      executer: new DeleteExecuter(this.job, this.instance, this.log_file),
      filter: false,
      update_step: true,
    });

    // unset job clean phase
    await this.#updateJobAtr({ $unset: { isInCleanPhase: "" } });
  }
  async #updateJobAtr(update, opt = {}) {
    this.job = {
      ...(
        await jobModel.findByIdAndUpdate(this.job._id, update, {
          new: true,
          ...opt,
        })
      )._doc,
    };
  }
  async #updateJobStep({ progress_step, done_step }) {
    await this.#updateJobAtr({
      ...(progress_step === null
        ? { $unset: { progress_step: "" } }
        : { $set: { progress_step } }),
      ...(done_step ? { $push: { done_steps: done_step } } : {}),
    });
  }
  #convertJobStepToFunc(step, executer = this.executer) {
    switch (step) {
      case JobSteps.PRE_REQUIRED:
        return executer.pre_require;
      case JobSteps.COPY_STATIC:
        return executer.copy_static;
      case JobSteps.CREATE_SERVICE:
        return executer.docker_create;
      case JobSteps.CDN_REGISTER:
        return executer.register_cdn;
      case JobSteps.CDN_UNREGISTER:
        return executer.unregister_cdn;
      case JobSteps.RESTORE_DB:
        return executer.restore_demo;
      case JobSteps.CHANGE_DOMAINS:
        return executer.changeDomains;
      case JobSteps.CHANGE_STATUS:
        return executer.changeStatus;
      case JobSteps.BACKUP_DB:
        return executer.backup_db;
      case JobSteps.BACKUP_STATIC:
        return executer.backup_static;
      case JobSteps.REMOVE_DB:
        return executer.rm_db;
      case JobSteps.REMOVE_SERVICE:
        return executer.service_remove;
      case JobSteps.REMOVE_STATIC:
        return executer.rm_static;
      case JobSteps.SYNC_DB:
        return this.#sync_db;
      case JobSteps.CHANGE_IMAGE:
        return executer.changeImage;
      case JobSteps.CHANGE_SERVICE_PRIMARY_DOMAIN:
        return executer.change_primary_domain;
      case JobSteps.ADD_DOMAIN_CONFIG:
        return executer.nginx_domain_config;
      case JobSteps.REMOVE_DOMAIN_CONFIG:
        return executer.rm_domain_config;
      case JobSteps.ADD_DOMAIN_CERT:
        return executer.domain_certs;
      case JobSteps.REMOVE_DOMAIN_CERT:
        return executer.rm_domain_cert;
      case JobSteps.CREATE_STATIC_DIRS:
        return executer.create_static_dirs;
      case JobSteps.UPDATE_DOMAIN_CDN:
        return executer.update_domain_cdn;
      case JobSteps.UPDATE_DOMAIN_CERT:
        return executer.update_domain_cert;
      case JobSteps.UPDATE_DOMAIN_CONFIG:
        return executer.update_domain_config;
      case JobSteps.PARSE_UPDATE_QUERY:
        return executer.parse_update_query;
      case JobSteps.CREATE_USER_IN_DB:
        return executer.create_user_in_db;
      case JobSteps.REMOVE_USER_FROM_DB:
        return executer.rm_user_from_db;
      case JobSteps.UPDATE_SITE_NAME:
        return executer.update_site_name;
    }
  }
  #convertJobTypeToExecuter() {
    switch (this.job.type) {
      case JobType.CREATE:
        return CreateExecuter;

      case JobType.UPDATE:
        return UpdateExecuter;

      case JobType.DELETE:
        return DeleteExecuter;
    }
  }
}

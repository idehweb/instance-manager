import fs from "fs";
import crypto from "crypto";
import { JobStatus, JobSteps, JobType, jobModel } from "../model/job.model.js";
import { axiosError2String, getMyIp, slugify, wait } from "../utils/helpers.js";
import { Global } from "../global.js";
import { transform } from "../common/transform.js";
import { Remote } from "../utils/remote.js";
import { catchFn } from "../utils/catchAsync.js";
import {
  convertJobTypeToExecuter,
  convertStack,
  step2Rollback,
  uniqueStack,
  getLogFilePath,
  convertJobStepToFunc,
} from "./manager.utils.js";
import { log } from "./utils.js";
import RollbackExecuter from "./RollbackExecuter.js";

export default class ExecuteManager {
  last_log;
  constructor(job, instance, res, req, id) {
    this.id = id ?? crypto.randomUUID();
    this.job = { ...job._doc };
    this.instance = { ...instance._doc };
    this.remote = new Remote(instance.region);
    this.log_file = fs.createWriteStream(getLogFilePath(this), {
      encoding: "utf8",
    });
    this.res = res;
    this.req = req;

    // initial executer
    this.executer = new (convertJobTypeToExecuter(this.job.type))(
      this.job,
      this.instance,
      this.log_file,
      this.myLogger
    );
  }
  static async buildAndRun(job, instance, res, req, id) {
    const manager = new ExecuteManager(job, instance, res, req, id);

    // undertake
    try {
      await manager.undertakeJob();
    } catch (err) {
      manager.log(axiosError2String(err), false, true, true, [
        "manager-global-catch",
      ]);
      return false;
    }

    // execute
    try {
      await manager.execute();
    } catch (err) {
      manager.log(axiosError2String(err), false, true, true, [
        "manager-global-catch",
      ]);
      await manager.finishWithError();
      return false;
    }

    return manager;
  }
  get instance_name() {
    return `nwi-${this.instance.name}`;
  }
  log(
    chunk,
    isEnd = false,
    isError = false,
    whenDifferent = false,
    labels = [],
    credentials = []
  ) {
    this.last_log = log({
      chunk,
      isEnd,
      isError,
      whenDifferent,
      jobId: this.job._id,
      instanceName: this.instance_name,
      last_log: this.last_log,
      labels: [this.constructor.name, ...labels].map(slugify),
      log_file: this.log_file,
      credentials,
    });
  }
  myLogger = (conf) => {
    this.log(
      conf.chunk,
      conf.isEnd,
      conf.isError,
      conf.whenDifferent,
      conf.labels,
      conf.credentials
    );
  };

  async undertakeJob() {
    const newJob = await this.#updateJobAtr(
      {
        executer: {
          id: this.id,
          ip: getMyIp(false),
        },
      },
      {
        filter: {
          _id: this.job._id,
          $expr: {
            $or: [
              { executer: { $exists: false } },
              { "executer.isAlive": false },
              { "executer.id": this.id },
            ],
          },
        },
      }
    );

    // set job to map
    Global.jobs.set(this.job.id, this);

    if (!newJob) throw new Error("can not undertake this job");
  }

  async execute() {
    // create
    let isRun;
    this.log("Start");

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
          this.job.progress_step ? ` in step: ${this.job.progress_step}` : ""
        } attempt ${this.job.attempt} with executer: ${
          this.executer?.constructor?.name
        }, message: ${axiosError2String(err)}`,
        false,
        true
      );
      isRun = false;
    }
    if (!isRun) {
      const isThereAnyChance = await this.#checkAttempts();
      if (!isThereAnyChance) {
        return await this.finishWithError();
      }
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
    return false;
  }

  async #rollback(progress_step) {
    const done_steps = this.job.done_steps ?? [];

    // true flag job clean phase
    await this.#updateJobAtr({ isInCleanPhase: true });

    const needRollbackSteps = [progress_step, ...done_steps.reverse()];
    const rollbackSteps = step2Rollback(...needRollbackSteps);

    // execute steps stack
    await this.#execute_stack(rollbackSteps, {
      ignoreError: true,
      executer: new RollbackExecuter(
        this.job,
        this.instance,
        this.log_file,
        this.myLogger
      ),
      filter: false,
      update_step: true,
    });

    // unset job clean phase
    await this.#updateJobAtr({ $unset: { isInCleanPhase: "" } });
  }

  async finishWithError() {
    // snapshot of step
    const progress_step = this.job.progress_step;

    // sync db
    this.log("try to sync db", false, true, false, ["finishWithError"]);
    await this.#updateJobStep({ progress_step: JobSteps.SYNC_DB });
    await this.#sync_db(true);
    await this.#updateJobStep({ done_step: JobSteps.SYNC_DB });

    // rollback
    this.log("start rollback", false, true, false, ["finishWithError"]);
    await this.#rollback(progress_step);

    // serve
    this.log("Finish with Error", true, true, false, ["finishWithError"]);
    this.sendResultToClient(false);
  }

  #sync_db = async (isError = false) => {
    // sync
    const { instance, job } = await this.executer.sync_db(isError);
    this.instance = instance;
    this.job = job;
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
    const inputStack = convertStack(
      { ignoreError, update_step, executer, filter },
      ...stack
    ).filter(
      ({ step, filter }) => !filter || !this.job.done_steps.includes(step)
    );

    const normalizeStack = uniqueStack(
      convertStack(
        { ignoreError, update_step, executer, filter },
        JobSteps.PRE_REQUIRED
      )[0],
      ...inputStack
    );
    for (const { step, update_step, executer, ignoreError } of normalizeStack) {
      this.log(
        `Execute Stack step: ${step}, executer: ${executer?.constructor?.name}`
      );

      // set db step
      if (update_step) await this.#updateJobStep({ progress_step: step });

      // execute each step
      const fn = this.#convertJobStepToFunc(step, executer);
      const myFn = ignoreError
        ? catchFn(fn, {
            self: executer,
            onError: (err) => {
              this.log(
                `Error in step ${step} with executer ${
                  executer?.constructor?.name
                }, message: ${axiosError2String(err)}`,
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
      JobSteps.CREATE_LINKS,
      JobSteps.COPY_STATIC,
      JobSteps.CREATE_USER_IN_DB,
      JobSteps.CREATE_SERVICE,
      JobSteps.CDN_REGISTER,
      JobSteps.ADD_DOMAIN_CERT,
      JobSteps.RESTORE_DEMO,
      JobSteps.SYNC_DB,
    ].filter((step) => {
      // not use demo steps on none pattern mode
      if (
        !this.instance.pattern &&
        [JobSteps.COPY_STATIC, JobSteps.RESTORE_DEMO].includes(step)
      )
        return false;

      // not use docker steps in dev env
      if (
        !Global.env.isPro &&
        [
          // JobSteps.CREATE_USER_IN_DB,
          // JobSteps.CDN_REGISTER,
          // JobSteps.CREATE_STATIC_DIRS,
          // JobSteps.COPY_STATIC,
          // JobSteps.CREATE_SERVICE,
          // JobSteps.RESTORE_DEMO,
          // JobSteps.ADD_DOMAIN_CONFIG,
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
    const stack = [];
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
        JobSteps.UPDATE_SERVICE_LINKS,
        JobSteps.UPDATE_SERVICE_ALIASES
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
      JobSteps.REMOVE_LINKS,
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
          JobSteps.REMOVE_STATIC,
          JobSteps.BACKUP_DB,
        ].includes(step)
      )
        return false;
      return true;
    });

    await this.#execute_stack(stack);
  }

  async #updateJobAtr(update, opt = {}) {
    const filter = opt.filter ?? { _id: this.job._id };
    const newJob = await jobModel.findOneAndUpdate(filter, update, {
      new: true,
      ...opt,
    });

    if (!newJob) return null;

    this.job = {
      ...newJob._doc,
    };

    return this.job;
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
      case JobSteps.SYNC_DB:
        return this.#sync_db;
      default:
        return convertJobStepToFunc(step, executer);
    }
  }
}

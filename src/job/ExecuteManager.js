import { JobStatus, JobSteps, JobType, jobModel } from "../model/job.model.js";
import { instanceModel } from "../model/instance.model.js";
import fs from "fs";
import {
  axiosError2String,
  createRandomName,
  getPublicPath,
  wait,
} from "../utils/helpers.js";
import { InstanceStatus } from "../model/instance.model.js";
import { Global } from "../global.js";
import { transform } from "../common/transform.js";
import exec from "../utils/exec.js";
import { Remote } from "../utils/remote.js";
import { catchFn } from "../utils/catchAsync.js";
import CreateExecuter from "./CreateExecuter.js";
import UpdateExecuter from "./UpdateExecuter.js";
import DeleteExecuter from "./DeleteExecuter.js";
import { customAlphabet } from "nanoid";

export default class ExecuteManager {
  last_log;
  domainsResult = [];
  constructor(job, instance, res, req) {
    this.job = { ...job._doc };
    this.instance = { ...instance._doc };
    this.remote = new Remote(instance.region);
    this.log_file = fs.createWriteStream(
      getPublicPath(`logs/${String(this.job._id)}-${this.instance_name}.log`),
      { encoding: "utf8" }
    );
    this.res = res;
    this.req = req;

    // initial executer
    this.child_executer = new (this.#convertJobTypeToChildExecuter())(
      this.job,
      this.instance,
      this.exec.bind(this),
      this.log.bind(this)
    );
  }
  static buildAndRun(job, instance, res, req) {
    const manager = new ExecuteManager(job, instance, res, req);
    manager
      .execute()
      .then()
      .catch((err) => {
        manager.log(`#Executer Error#\n${err.toString()}`, true, true, true);
        manager.sendResultToClient(false);
        manager.clean().then();
      });
  }
  get instance_name() {
    return `nwi-${this.instance.name}`;
  }
  log(chunk, isEnd = false, isError = false, whenDifferent = false) {
    if (this.last_log == String(chunk) && whenDifferent) return;
    this.last_log = String(chunk);

    const chunk_with_id =
      `#${this.instance_name}-${String(this.job._id).slice(0, 8)}#: ` + chunk;

    // console log
    console.log(chunk_with_id);

    // db log
    jobModel
      .findByIdAndUpdate(this.job._id, {
        $push: { logs: chunk },
        ...(isError ? { $set: { error: chunk } } : {}),
      })
      .then()
      .catch();

    // fs log
    if (this.log_file.writable) {
      if (isEnd) {
        this.log_file.end("\n" + chunk);
        this.log_file.close();
      } else {
        this.log_file.write("\n" + chunk);
      }
    }
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
      console.log("$$execute error$$ :", err);
      isRun = false;
    }
    if (!isRun) {
      const isThereChance = await this.#checkAttempts();
      if (!isThereChance) return;
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
    await this.#sync_db(true);
    await this.clean();
    this.log("Finish with Error", true);
    this.sendResultToClient(false);
    return false;
  }
  async #sync_db(isError = false) {
    // instance status , active , domains
    let set_body = {},
      addFields_body;
    if (this.job.type === JobType.CREATE) {
      if (isError) {
        addFields_body = {
          status: InstanceStatus.JOB_ERROR,
          name: { $concat: ["$name", `-errored-${createRandomName(8)}`] },
          old_name: "$name",
          active: false,
        };
        set_body = null;
      } else {
        set_body.status = InstanceStatus.UP;
      }
    } else if (this.job.type === JobType.UPDATE) {
      set_body.status = isError
        ? InstanceStatus.JOB_ERROR
        : this.job.update_query.status;
      set_body.domains = this.instance.new_domains;
    } else if (this.job.type === JobType.DELETE && !isError) {
      addFields_body = {
        status: InstanceStatus.DELETED,
        name: { $concat: ["$name", `-deleted-${createRandomName(8)}`] },
        old_name: "$name",
        active: false,
      };
      set_body = null;
    }

    this.instance = {
      ...(
        await instanceModel.findByIdAndUpdate(
          this.instance._id,
          set_body
            ? {
                $set: set_body,
              }
            : addFields_body
            ? [
                {
                  $addFields: addFields_body,
                },
              ]
            : {},
          { new: true }
        )
      )._doc,
    };

    this.job = {
      ...(
        await jobModel.findByIdAndUpdate(
          this.job._id,
          { $set: { status: isError ? JobStatus.ERROR : JobStatus.SUCCESS } },
          { new: true }
        )
      )._doc,
    };
  }

  async #execute_stack(
    stack,
    { ignoreError, executer, update_step, filter } = {
      update_step: true,
      ignoreError: false,
      executer: this.child_executer,
      filter: true,
    }
  ) {
    stack = [
      ...new Set(
        filter
          ? stack.filter((step) => !this.job.done_steps.includes(step))
          : stack
      ),
    ];

    for (const step of stack) {
      this.log(`Execute Stack step: ${step}`);

      // set db step
      if (update_step) await this.#updateJobStep(step);

      // execute each step
      const fn = this.#convertJobStepToFunc(step, executer);
      const myFn = ignoreError
        ? catchFn(fn, {
            self: this,
            onError(err) {
              this.log(`Error step ${step} \n` + axiosError2String(err));
            },
          })
        : fn;
      await myFn.call(executer);
    }

    // set db step
    if (update_step) await this.#updateJobStep(null);
  }

  async #create_instance() {
    const stack = [
      JobSteps.COPY_STATIC,
      JobSteps.CREATE_SERVICE,
      JobSteps.CDN_REGISTER,
      JobSteps.RESTORE_DB,
      JobSteps.SYNC_DB,
    ].filter((step) => {
      if (
        Global.env.isPro ||
        ![
          JobSteps.COPY_STATIC,
          JobSteps.CREATE_SERVICE,
          JobSteps.RESTORE_DB,
        ].includes(step)
      )
        return true;
      return false;
    });

    // execute
    await this.#execute_stack(stack);
  }
  async #update_instance({
    domains_add,
    domains_rm,
    cpu,
    memory,
    image,
    status,
    name,
    replica,
  }) {
    const stack = [];
    // change status
    if (status) {
      stack.push(JobSteps.CHANGE_STATUS);
    }
    // change name
    else if (name) {
    }

    // change domain
    else if (
      (domains_add && domains_add.length) ||
      (domains_rm && domains_rm.length)
    ) {
      stack.push(JobSteps.CHANGE_DOMAINS);
    }

    // change resource
    if (cpu || memory || image || replica) {
    }

    // sync db
    stack.push(JobSteps.SYNC_DB);

    // execute stack
    await this.#execute_stack(stack);
  }
  async #delete_instance() {
    const stack = [
      JobSteps.CDN_UNREGISTER,
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
          JobSteps.REMOVE_STATIC,
          JobSteps.BACKUP_DB,
        ].includes(step)
      )
        return false;
      return true;
    });

    await this.#execute_stack(stack);
  }
  exec(cmd) {
    return exec(this.remote.autoDiagnostic(cmd), {
      onLog: (msg, isError) => {
        this.log(msg, false, isError, true);
      },
    });
  }
  async clean() {
    if (this.job.type != JobType.CREATE) return;
    const stack = [
      JobSteps.CDN_UNREGISTER,
      JobSteps.REMOVE_SERVICE,
      JobSteps.REMOVE_STATIC,
      JobSteps.REMOVE_DB,
    ].filter((step) => {
      if (
        Global.env.isLocal &&
        [JobSteps.REMOVE_SERVICE, JobSteps.REMOVE_STATIC].includes(step)
      )
        return false;
      return true;
    });
    await this.#execute_stack(stack, {
      ignoreError: true,
      executer: new DeleteExecuter(
        this.job,
        this.instance,
        this.exec.bind(this),
        this.log.bind(this)
      ),
      filter: false,
      update_step: true,
    });
  }
  async #updateJobStep(progress_step) {
    // no progress
    if (progress_step === this.job.progress_step) return;

    this.job = {
      ...(
        await jobModel.findByIdAndUpdate(
          this.job._id,
          {
            ...(progress_step === null
              ? { $unset: { progress_step: "" } }
              : { $set: { progress_step } }),
            ...(this.job.progress_step
              ? { $addToSet: { done_steps: this.job.progress_step } }
              : {}),
          },
          { new: true }
        )
      )._doc,
    };
  }
  #convertJobStepToFunc(step, executer = this.child_executer) {
    switch (step) {
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
    }
  }
  #convertJobTypeToChildExecuter() {
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

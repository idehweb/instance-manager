import { spawn } from "child_process";
import { JobStatus, JobType, jobModel } from "../model/job.model.js";
import { instanceModel } from "../model/instance.model.js";
import fs from "fs";
import { axiosError2String, getPublicPath, wait } from "../utils/helpers.js";
import { InstanceStatus } from "../model/instance.model.js";
import Cloudflare from "cloudflare";
import { Global } from "../global.js";
import { nsCreate, nsList } from "../utils/cf.js";
import { Service as DockerService } from "../docker/service.js";
import { transform } from "../common/transform.js";

export default class Executer {
  static cf = new Cloudflare({
    email: Global.env.CF_EMAIL,
    token: Global.env.CF_TOKEN,
  });
  last_log;
  constructor(job, instance, res, req) {
    this.job = job;
    this.instance = instance;
    this.log_file = fs.createWriteStream(
      getPublicPath(`logs/${String(this.job._id)}-${this.instance_name}.log`),
      { encoding: "utf8" }
    );
    this.res = res;
    this.req = req;
  }

  static buildAndRun(job, instance, res, req) {
    const executerNode = new Executer(job, instance, res, req);
    executerNode
      .execute()
      .then()
      .catch((err) => {
        executerNode.log(
          `#Executer Error#\n${err.toString()}`,
          true,
          true,
          true
        );
        executerNode.callback_nodeeweb(false);
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
    this.job
      .updateOne({
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
    // check attempts
    if (this.job.attempt >= this.job.max_attempts) {
      // error
      this.job = await jobModel.findByIdAndUpdate(
        this.job._id,
        { $set: { status: JobStatus.ERROR } },
        { new: true }
      );
      this.instance = await instanceModel.findByIdAndUpdate(
        this.instance._id,
        { $set: { status: InstanceStatus.JOB_ERROR } },
        { new: true }
      );
      this.log("Finish with Error", true);
      this.callback_nodeeweb(false);
      return;
    }

    // create
    let isRun;
    this.log("Start");
    try {
      if (this.job.type === JobType.CREATE) {
        await this.#create_instance();
      }
      // update
      if (this.job.type === JobType.CREATE) {
        await this.#update_instance();
      }
      // delete
      if (this.job.type === JobType.CREATE) {
        await this.#delete_instance();
      }
      isRun = true;
    } catch (err) {
      console.log(err);
      isRun = false;
    }
    if (!isRun) {
      // failed
      this.job = await jobModel.findByIdAndUpdate(
        this.job._id,
        { $inc: { attempt: 1 } },
        { new: true }
      );
      await wait(10);
      return this.execute();
    }
    // success
    this.log("Finish successfully", true);
    // callback nodeeweb
    this.callback_nodeeweb(true);
  }

  callback_nodeeweb(isOk) {
    if (!this.res?.writable) return;
    const code = isOk ? 201 : 500;
    const status = isOk ? "success" : "error";
    this.res.status(code).json(
      transform(
        {
          status,
          job: this.job,
          instance: this.instance,
        },
        code,
        this.req
      )
    );
  }

  async #create_instance() {
    // create public
    const createFolders = `mkdir -p /var/instances/${this.instance_name} && mkdir -p /var/instances/${this.instance_name}/shared && mkdir -p /var/instances/${this.instance_name}/public`;
    this.log(createFolders);
    await this.#exec(createFolders);

    // copy static files
    const copyStatics = `cp -r ${getPublicPath("static")}/* /var/instances/${
      this.instance_name
    }/public`;
    this.log(copyStatics);
    await this.#exec(copyStatics);

    // check docker services
    const dockerServiceLs = `docker service ls --format "{{.Name}} {{.Replicas}}"`;
    this.log(dockerServiceLs);
    const listServices = (await this.#exec(dockerServiceLs)).split("\n");
    const myService = listServices.find((s) => s.includes(this.instance_name));

    // create docker service
    const dockerCreateCmd = DockerService.getCreateServiceCommand(
      this.instance_name,
      this.instance.name,
      {
        replica: this.instance.replica,
        memory: this.instance.memory,
        image: this.instance.image,
        cpu: this.instance.cpu,
      }
    );

    // create if not exist
    if (myService) {
      if (myService.split(" ")[1].startsWith("0")) {
        // must remove service
        const dockerRm = `docker service rm ${this.instance_name}`;
        this.log(dockerRm);
        await this.#exec(dockerRm);

        // create new one
        await wait(0.5);
        this.log(dockerCreateCmd);
        await this.#exec(dockerCreateCmd);
      } else {
        // exists service
        this.log("Service created before");
      }
    } else {
      this.log(dockerCreateCmd);
      await this.#exec(dockerCreateCmd);
    }

    // ns record
    try {
      // list
      const nl = await nsList();
      if (nl.includes(this.instance.name)) {
        this.log("DND record exists before");
        return;
      }
      // create record
      await nsCreate(this.instance.name);
      this.log("DNS record create");
    } catch (err) {
      this.log("Axios Error in DNS:\n" + axiosError2String(err));
      throw err;
    }

    // change status
    await this.#doneJob(true, InstanceStatus.UP);
  }

  async #update_instance() {}
  async #delete_instance() {}

  #exec(cmd) {
    return new Promise((resolve, reject) => {
      let res_ok = "",
        res_err = "";
      const sp = spawn(cmd, { shell: true, cwd: "." });
      sp.stdout.on("data", (msg) => {
        res_ok += msg;
        this.log(String(msg), false, false, true);
      });
      sp.stderr.on("data", (msg) => {
        res_err += msg;
        this.log(String(msg), false, true, true);
      });
      sp.on("error", (err) => {
        const msg = err?.toString ? err.toString() : String(err);
        res_err += msg;
        this.log(msg, false, true, true);
      });
      sp.on("close", (code) => {
        if (code !== 0) {
          reject(res_err);
        } else {
          resolve(res_ok);
        }
      });
    });
  }
  async #doneJob(isDone = true, instanceStatus = InstanceStatus.UP) {
    this.instance = await instanceModel.findByIdAndUpdate(
      this.instance._id,
      { $set: { status: instanceStatus } },
      { new: true }
    );
    this.job = await jobModel.findByIdAndUpdate(
      this.job._id,
      { $set: { status: isDone ? JobStatus.SUCCESS : JobStatus.ERROR } },
      { new: true }
    );
  }
}

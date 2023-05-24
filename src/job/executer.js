import { spawn } from "child_process";
import { JobStatus, JobType, jobModel } from "../model/job.model.js";
import fs from "fs";
import { getPublicPath, wait } from "../utils/helpers.js";
import { InstanceStatus } from "../model/instance.model.js";

export default class Executer {
  constructor(job, instance) {
    this.job = job;
    this.instance = instance;
    this.log_file = fs.createWriteStream(
      getPublicPath(`logs/${String(this.job._id)}-${this.instance.name}.log`),
      { encoding: "utf8" }
    );
  }

  static buildAndRun(job, instance) {
    const executerNode = new Executer(job, instance);
    executerNode.execute().then().catch();
  }

  log(chunk, isEnd = false, isError = false) {
    const chunk_with_id =
      `#${this.instance.name}-${String(this.job._id).slice(0, 8)}#: ` + chunk;

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
    if (isEnd) {
      this.log_file.end("\n" + chunk);
      this.log_file.close();
    } else {
      this.log_file.write("\n" + chunk);
    }
  }

  async execute() {
    // check attempts
    if (this.job.attempt >= this.job.max_attempts) {
      // error
      await this.job.updateOne({ status: JobStatus.ERROR });
      await this.instance.updateOne({ status: InstanceStatus.ERROR });
      this.log("Finish with Error", true);
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
  }

  async #create_instance() {
    // create public
    const createFolders = `mkdir -p /var/${this.instance.name} && mkdir -p /var/${this.instance.name}/shared && mkdir -p /var/${this.instance.name}/public`;
    this.log(createFolders);
    await this.#exec(createFolders);

    // copy static files
    const copyStatics = `cp -r ${getPublicPath("static", "*")} /var/${
      this.instance.name
    }/public`;
    this.log(copyStatics);
    await this.#exec(copyStatics);

    // check docker services
    const dockerServiceLs = `docker service ls --format "{{.Name}} {{.Replicas}}"`;
    this.log(dockerServiceLs);
    const listServices = (await this.#exec(dockerServiceLs)).split("\n");
    const myService = listServices.find((s) => s.includes(this.instance.name));
    // create docker service
    const dockerCreate = `docker service create --hostname ${
      this.instance.name
    } --name ${
      this.instance.name
    } -e PUBLIC_PATH=/app/public -e SHARED_PATH=/app/shared -e mongodbConnectionUrl="mongodb://mongomaster:27017,mongoslave1:27017,mongoslave2:27017/?replicaSet=mongoReplica" -e SERVER_PORT=3000 -e BASE_URL="https://${
      this.instance.name
    }.nodeeweb.com" -e SHOP_URL="https://${
      this.instance.name
    }.nodeeweb.com/" --mount type=bind,source=/var/${
      this.instance.name
    }/shared/,destination=/app/shared/  --mount type=bind,source=/var/${
      this.instance.name
    }/public/,destination=/app/public/  --mount type=bind,source=/var/${
      this.instance.name
    }/public/public_media/,destination=/app/public_media/  --mount type=bind,source=/var/${
      this.instance.name
    }/public/admin/,destination=/app/admin/  --mount type=bind,source=/var/${
      this.instance.name
    }/public/theme/,destination=/app/theme/ --network nodeeweb_webnet --network nodeeweb_mongonet --replicas ${
      this.instance.replica
    } ${this.instance.cpu === -1 ? "" : `--limit-cpu=${this.instance.cpu}`} ${
      this.instance.memory === -1
        ? ""
        : `--limit-memory=${this.instance.memory}MB`
    } --restart-condition on-failure --restart-delay 30s --restart-max-attempts 8 --restart-window 1m30s --update-parallelism ${Math.max(
      1,
      Math.floor(this.instance.replica / 2)
    )} --update-delay 30s ${this.instance.image}`.replace(/\n/g, " ");

    if (myService) {
      if (myService.split(" ")[1].startsWith("0")) {
        // must remove service
        const dockerRm = `docker service rm ${this.instance.name}`;
        this.log(dockerRm);
        await this.#exec(dockerRm);

        // create new one
        await wait(0.5);
        this.log(dockerCreate);
        await this.#exec(dockerCreate);
      } else {
        // exists service
        this.log("Service created before");
      }
    } else {
      this.log(dockerCreate);
      await this.#exec(dockerCreate);
    }

    // ns record
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
        this.log(String(msg));
      });
      sp.stderr.on("data", (msg) => {
        res_err += msg;
        this.log(String(msg), false, true);
      });
      sp.on("error", (err) => {
        const msg = err?.toString ? err.toString() : String(err);
        res_err += msg;
        this.log(msg, false, true);
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
}

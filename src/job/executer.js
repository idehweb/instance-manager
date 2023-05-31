import { spawn } from "child_process";
import { JobStatus, JobType, jobModel } from "../model/job.model.js";
import { instanceModel } from "../model/instance.model.js";
import fs from "fs";
import {
  axiosError2String,
  getInstanceDbPath,
  getInstanceStaticPath,
  getPublicPath,
  wait,
} from "../utils/helpers.js";
import { InstanceStatus } from "../model/instance.model.js";
import Cloudflare from "cloudflare";
import { Global } from "../global.js";
import {
  CF_ZONE_STATUS,
  nsCreate,
  nsCreateAndCNAME,
  nsList,
  nsRemove,
} from "../utils/cf.js";
import { Service as DockerService } from "../docker/service.js";
import { transform } from "../common/transform.js";
import exec from "../utils/exec.js";

export default class Executer {
  static cf = new Cloudflare({
    email: Global.env.CF_EMAIL,
    token: Global.env.CF_TOKEN,
  });
  last_log;
  domainsResult = [];
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
        executerNode.sendResultToClient(false);
        executerNode.clean().then();
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
      this.sendResultToClient(false);
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
      if (this.job.type === JobType.UPDATE) {
        await this.#update_instance();
      }
      // delete
      if (this.job.type === JobType.DELETE) {
        await this.#delete_instance({
          delDB: true,
          delDocker: true,
          delNs: true,
          delStatic: true,
          ignoreErrors: ![
            InstanceStatus.DOWN,
            InstanceStatus.UP,
            InstanceStatus.ERROR,
          ].includes(this.instance.status),
        });
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
    this.sendResultToClient(true);
  }
  sendResultToClient(isOk) {
    if (!this.res?.writable) return;
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
    const static_files = async () => {
      // create public
      const createFolders = `mkdir -p /var/instances/${this.instance_name} && mkdir -p /var/instances/${this.instance_name}/shared && mkdir -p /var/instances/${this.instance_name}/public`;
      await this.#exec(createFolders);

      // copy static files
      const copyStatics = `cp -r ${getInstanceStaticPath(
        this.instance
      )} /var/instances/${this.instance_name}/public`;
      await this.#exec(copyStatics);
    };
    const docker_cmd = async () => {
      // check docker services
      const dockerServiceLs = `docker service ls --format "{{.Name}} {{.Replicas}}"`;
      const listServices = (await this.#exec(dockerServiceLs)).split("\n");
      const myService = listServices.find((s) =>
        s.includes(this.instance_name)
      );

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
          await this.#exec(dockerRm);

          // create new one
          await wait(0.5);
          await this.#exec(dockerCreateCmd);
        } else {
          // exists service
          this.log("Service created before");
        }
      } else {
        await this.#exec(dockerCreateCmd);
      }
    };
    const ns = async () => {
      // ns record
      try {
        // list
        const nl = await nsList();
        if (nl.includes(`${this.instance.name}.nodeeweb.com`)) {
          this.log("DND record exists before");
          return;
        }
        // create record
        await nsCreate(this.instance.name);
        this.log("DNS record create");

        // domains
        const domains = this.instance.domains.filter(
          ({ content, status }) =>
            content !== this.instance.primary_domain &&
            status === CF_ZONE_STATUS.IN_PROGRESS
        );
        if (domains.length) {
          this.log(
            `creating zones for : ${domains
              .map(({ content }) => content)
              .join(" , ")}`
          );
          this.domainsResult = await Promise.all(
            domains.map(async ({ content }) => ({
              ...(await nsCreateAndCNAME(
                content,
                this.instance.primary_domain
              )),
              content,
            }))
          );
        }
      } catch (err) {
        this.log("Axios Error in DNS:\n" + axiosError2String(err));
        throw err;
      }
    };

    const init_db = async () => {
      this.log(`initial db base on : ${this.instance.pattern}`);
      const cmd = `mongorestore --db ${this.instance_name} ${
        Global.env.MONGO_URL
      } ${getInstanceDbPath(this.instance)}`;
      await this.#exec(cmd);
    };

    if (Global.env.isPro) {
      await static_files();
      await docker_cmd();
    }
    await ns();
    await init_db();

    // change status
    await this.#doneJob(true, InstanceStatus.UP);
  }
  async #update_instance({
    domains,
    cpu,
    memory,
    image,
    status,
    name,
    replica,
  }) {
    // change status
    if (status) {
      const docker_cmd = DockerService.getUpdateServiceCommand(
        this.instance_name,
        { replicas: status === InstanceStatus.UP ? this.instance.replica : 0 }
      );
      await this.#exec(docker_cmd);

      this.instance = await instanceModel.findByIdAndUpdate(
        this.instance._id,
        {
          $set: { status },
        },
        { new: true }
      );
      await this.#doneJob(true, null);
      return;
    }

    // change name
    if (name) {
    }

    // change domain
    if (domains) {
      const inProgressDomains = this.instance
        .filter(({ status }) => status === CF_ZONE_STATUS.IN_PROGRESS)
        .map(({ content }) => content);
      domains = [...new Set(domains)].filter(
        (d) =>
          !inProgressDomains.includes(d) && d !== this.instance.primary_domain
      );
      const myDomains = this.instance.domains.map(({ content }) => content);
      const removedDomains = myDomains.filter(
        (d) =>
          !domains.includes(d) &&
          !inProgressDomains.includes(d) &&
          d !== this.instance.primary_domain
      );

      // 1. Add new
      this.log(`creating new zones: ${domains.join(" , ")}`);
      let newDomains = await Promise.all(
        domains.map((d) => nsCreateAndCNAME(d, this.instance.primary_domain))
      );
      newDomains = [
        {
          status: CF_ZONE_STATUS.CREATE,
          content: this.instance.primary_domain,
        },
        ...newDomains,
        ...inProgressDomains.map((d) => ({
          content: d,
          status: CF_ZONE_STATUS.IN_PROGRESS,
        })),
      ];

      // 2. Remove old
      this.log(`removing old zones: ${removedDomains.join(" , ")}`);
      await nsRemove(
        this.instance.primary_domain,
        removedDomains.map((d) => ({
          content: d,
          status: CF_ZONE_STATUS.CREATE,
        }))
      );

      // 3. Update DB
      this.log("update db");
      await instanceModel.findByIdAndUpdate(this.instance._id, {
        $set: { domains: newDomains },
      });
      await this.#doneJob(true, null);
      return;
    }

    // change resource
    if (cpu || memory || image || replica) {
    }
  }
  async #delete_instance({ ignoreErrors, delDocker, delNs, delStatic, delDB }) {
    // 1. docker service
    const docker_cmd = async () => {
      const cmd = DockerService.getDeleteServiceCommand(this.instance_name);
      await this.#exec(cmd);
    };

    // 2. cloudflare
    const ns = async () => {
      this.log(
        `Removing domains : ${this.instance.domains
          .map(({ content }) => content)
          .join(" , ")}`
      );
      await nsRemove(this.instance.primary_domain, this.instance.domains);
    };

    // 3. static files
    const static_files = async () => {
      // backup
      const static_path = `/var/instances/${this.instance_name}`;
      const backup_cmd = `zip -r ${getPublicPath(
        `backup/${this.instance_name}/static/media.zip`
      )} ${static_path}`;
      this.log("backup instance static files");
      await this.#exec(backup_cmd);

      const cmd = `rm -r ${static_path}`;
      await this.#exec(cmd);
    };

    // 4. db
    const db = async () => {
      this.log("backup instance db");
      const backup_cmd = `mongodump --db ${
        this.instance_name
      } --out ${getPublicPath(`backup/${this.instance_name}/db`)} --gzip ${
        Global.env.MONGO_URL
      }`;
      await this.#exec(backup_cmd);

      this.log("Delete instance db");
      const delete_cmd = `mongosh ${Global.env.MONGO_URL} --eval "use ${this.instance_name}" --eval "db.dropDatabase()"`;
      await this.#exec(delete_cmd);

      this.log("Disable Instance in db");
      this.instance = await instanceModel.findByIdAndUpdate(
        this.instance._id,
        [
          {
            $addFields: {
              status: InstanceStatus.DELETED,
              name: { $concat: ["$name", "-deleted"] },
              old_name: "$name",
              active: false,
            },
          },
        ],
        { new: true }
      );
      await this.#doneJob(true, null);
    };

    // execute
    try {
      if (delNs) await ns();
      if (delDocker && Global.env.isPro) await docker_cmd();
      if (delStatic && Global.env.isPro) await static_files();
      if (delDB) await db();
    } catch (err) {
      if (!ignoreErrors) {
        this.log(axiosError2String(err));
        throw err;
      }
    }
  }
  #exec(cmd) {
    return exec(cmd, {
      onLog: (msg, isError) => {
        this.log(msg, false, isError, true);
      },
    });
  }
  async #doneJob(isDone = true, instanceStatus = InstanceStatus.UP) {
    if (instanceStatus !== null)
      this.instance = await instanceModel.findByIdAndUpdate(
        this.instance._id,
        {
          $set: {
            status: instanceStatus,
            domains: [
              {
                status: CF_ZONE_STATUS.CREATE,
                content: this.instance.primary_domain,
              },
              ...this.domainsResult,
            ],
          },
        },
        { new: true }
      );
    this.job = await jobModel.findByIdAndUpdate(
      this.job._id,
      { $set: { status: isDone ? JobStatus.SUCCESS : JobStatus.ERROR } },
      { new: true }
    );
  }
  async clean() {
    await this.#delete_instance({
      ignoreErrors: true,
      delDocker: Global.env.isPro,
      delStatic: Global.env.isPro,
      delDB: true,
      delNs: true,
    });
  }
}

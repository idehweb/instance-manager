import crypto from "crypto";
import { jobModel } from "../model/job.model.js";
import { Remote } from "../utils/remote.js";
import { runRemoteCmd, runRemoteCmdWithId } from "../ws/index.js";
import { getMyIp, getSlaveSocketOpt, slugify } from "../utils/helpers.js";
import { SimpleError } from "../common/error.js";
import { log } from "./utils.js";

export class BaseExecuter {
  last_log;
  constructor(job, instance, log_file) {
    this.job = job;
    this.instance = instance;
    this.log_file = log_file;
    this.remote = new Remote(instance.region);
    this.id = crypto.randomUUID();
  }
  get instance_name() {
    return `nwi-${this.instance.name}`;
  }

  async init() {
    const newJob = await jobModel.findOneAndUpdate(
      { _id: this.job._id, executer: { $exists: false } },
      {
        executer: {
          id: this.id,
          ip: getMyIp(true),
        },
      },
      { new: true }
    );

    if (!newJob)
      throw new SimpleError(
        "can not initial the job, because executer set before"
      );
    this.job = { ...newJob._doc };
  }

  log = (
    chunk,
    isEnd = false,
    isError = false,
    whenDifferent = false,
    labels = []
  ) => {
    this.last_log = log({
      chunk,
      isEnd,
      isError,
      whenDifferent,
      jobId: this.job._id,
      instanceName: this.instance_name,
      last_log: this.last_log,
      labels: [slugify(this.constructor.name), ...labels],
      log_file: this.log_file,
    });
  };

  exec = (cmd) => {
    return runRemoteCmd(this.instance.server_socket, cmd, {
      log: (isSlave, ...msgs) => {
        this.log(
          msgs,
          false,
          false,
          true,
          isSlave ? ["slave", this.instance.server_ip] : []
        );
      },
      error: (isSlave, ...msgs) => {
        this.log(
          msgs,
          false,
          true,
          true,
          isSlave ? ["slave", this.instance.server_ip] : []
        );
      },
    });
  };

  async pre_require() {
    try {
      await this.setup_metadata();
    } catch (err) {
      if (this.job.isInCleanPhase) this.log(err, false, true);
      else throw err;
    }
  }

  async setup_metadata() {
    const {
      id: server_id,
      ip: server_ip,
      isConnect,
      socket: server_socket,
    } = getSlaveSocketOpt(this.instance.region);
    if (!server_ip || !server_id || !isConnect)
      throw new SimpleError(
        `not found any connected server with region ${this.instance.region}`
      );
    this.instance.server_ip = server_ip;
    this.instance.server_id = server_id;
    this.instance.server_socket = server_socket;
    return;
  }

  async sync_db() {
    throw new Error("Sync DB Not Implement Yet");
  }
}

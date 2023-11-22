import { JobStatus, jobModel } from "../model/job.model.js";
import { Remote } from "../utils/remote.js";
import { runRemoteCmd, runRemoteCmdWithId } from "../ws/index.js";
import { getMyIp, getSlaveSocketOpt, slugify } from "../utils/helpers.js";
import { SimpleError } from "../common/error.js";
import { log } from "./utils.js";
import { Command } from "../common/Command.js";

export class BaseExecuter {
  last_log;
  constructor(job, instance, log_file, logger) {
    this.job = job;
    this.instance = instance;
    this.log_file = log_file;
    this.logger = logger;
    this.remote = new Remote(instance.region);
  }
  get instance_name() {
    return `nwi-${this.instance.name}`;
  }

  log = (
    chunk,
    isEnd = false,
    isError = false,
    whenDifferent = false,
    labels = [],
    credentials = []
  ) => {
    const conf = {
      chunk,
      isEnd,
      isError,
      whenDifferent,
      jobId: this.job._id,
      instanceName: this.instance_name,
      last_log: this.last_log,
      labels: [slugify(this.constructor.name), ...labels],
      log_file: this.log_file,
      credentials,
    };

    this.#log(conf);
  };
  logWithConf = (conf = {}) => {
    const newConf = {
      chunk: conf.chunk,
      isEnd: conf.isEnd ?? false,
      isError: conf.isError ?? false,
      whenDifferent: conf.whenDifferent ?? false,
      jobId: this.job._id,
      instanceName: this.instance_name,
      last_log: this.last_log,
      labels: [slugify(this.constructor.name), ...conf.labels],
      log_file: this.log_file,
      credentials: conf.credentials,
    };
    return this.#log(newConf);
  };

  #log = (conf) => {
    if (this.logger) this.last_log = this.logger(conf);
    else this.last_log = log(conf);
  };

  exec = (cmd) => {
    cmd = cmd instanceof Command ? cmd : new Command({ cmd });
    return runRemoteCmd(this.instance.server_socket, cmd, {
      log: (isSlave, ...msgs) => {
        this.log(
          msgs,
          false,
          false,
          true,
          isSlave ? ["slave", this.instance.server_ip] : [],
          cmd.credentials
        );
      },
      error: (isSlave, ...msgs) => {
        this.log(
          msgs,
          false,
          true,
          true,
          isSlave ? ["slave", this.instance.server_ip] : [],
          cmd.credentials
        );
      },
    });
  };

  async pre_require() {
    try {
      await this.base_pre_require();
    } catch (err) {
      if (this.job.isInCleanPhase) this.log(err, false, true);
      else throw err;
    }
  }

  async base_pre_require() {
    await this.setup_metadata();
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

  async sync_db(isError) {
    // job sync
    const newJob = await jobModel.findByIdAndUpdate(
      this.job._id,
      { $set: { status: isError ? JobStatus.ERROR : JobStatus.SUCCESS } },
      { new: true }
    );

    this.job = newJob._doc;
    return { job: this.job };
  }
}

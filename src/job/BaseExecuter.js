import crypto from "crypto";
import { jobModel } from "../model/job.model.js";
import { Remote } from "../utils/remote.js";
import { runRemoteCmd, runRemoteCmdWithId } from "../ws/index.js";
import { getMyIp, getSlaveSocketOpt } from "../utils/helpers.js";
import { SimpleError } from "../common/error.js";

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

  log = (chunk, isEnd = false, isError = false, whenDifferent = false) => {
    const chunkArr = Array.isArray(chunk) ? chunk : [chunk];
    const msg = chunkArr
      .map((c) =>
        typeof c === "object" ? JSON.stringify(c, null, " ") : String(c)
      )
      .join(" ");

    if (this.last_log == msg && whenDifferent) return;
    this.last_log = msg;

    const chunk_with_id =
      `#${this.instance_name}-${String(this.job._id).slice(0, 8)}#: ` + msg;

    // console log
    console.log(chunk_with_id);

    // db log
    jobModel
      .findByIdAndUpdate(this.job._id, {
        $push: { logs: msg },
        ...(isError ? { $set: { error: msg } } : {}),
      })
      .then()
      .catch();

    // fs log
    if (this.log_file.writable) {
      if (isEnd) {
        this.log_file.end("\n" + msg);
        this.log_file.close();
      } else {
        this.log_file.write("\n" + msg);
      }
    }
  };

  exec = (cmd) => {
    return runRemoteCmd(this.instance.socket, cmd, {
      log: (...msgs) => {
        this.log(msgs, false, false, true);
      },
      error: (...msgs) => {
        this.log(msgs, false, true, true);
      },
    });
  };

  pre_require = async () => {
    await this.setup_metadata();
  };

  setup_metadata = async () => {
    const {
      id: server_id,
      ip: server_ip,
      socket: server_socket,
    } = getSlaveSocketOpt(this.instance.region);
    if (!server_ip || server_id)
      throw new SimpleError(
        `not found any connected server with region ${this.instance.region}`
      );
    this.instance.server_ip = server_ip;
    this.instance.server_id = server_id;
    this.instance.server_socket = server_socket;
    return;
  };

  async sync_db() {
    throw new Error("Sync DB Not Implement Yet");
  }
}

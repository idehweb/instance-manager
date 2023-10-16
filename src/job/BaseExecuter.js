import crypto from "crypto";
import { jobModel } from "../model/job.model.js";
import { Remote } from "../utils/remote.js";
import { runRemoteCmd } from "../ws/index.js";
import { getMyIp } from "../utils/helpers.js";

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
      throw new Error("can not initial the job, because executer set before");
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
    return runRemoteCmd(this.instance.region, cmd, {
      log: (...msgs) => {
        this.log(msgs, false, false, true);
      },
      error: (...msgs) => {
        this.log(msgs, false, true, true);
      },
    });
    // return exec(this.remote.autoDiagnostic(cmd), {
    //   onLog: (msg, isError) => {
    //     this.log(msg, false, isError, true);
    //   },
    // });
  };
}

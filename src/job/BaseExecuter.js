import { jobModel } from "../model/job.model.js";
import exec from "../utils/exec.js";
import { Remote } from "../utils/remote.js";

export class BaseExecuter {
  last_log;
  constructor(job, instance, log_file) {
    this.job = job;
    this.instance = instance;
    this.log_file = log_file;
    this.remote = new Remote(instance.region);
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
  exec(cmd) {
    return exec(this.remote.autoDiagnostic(cmd), {
      onLog: (msg, isError) => {
        this.log(msg, false, isError, true);
      },
    });
  }
}

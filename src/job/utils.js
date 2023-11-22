import { jobModel } from "../model/job.model.js";
import {
  convertToString,
  regexFactory,
  log as coreLog,
} from "../utils/helpers.js";

function logTransport(
  { isError, isEnd, jobId, log_file },
  { _time_error_id_labels_msg, _time_error_labels_msg, _time_labels_msg }
) {
  // console log
  console[isError ? "error" : "log"](_time_error_id_labels_msg);

  // db log
  jobModel
    .findByIdAndUpdate(jobId, {
      $push: {
        logs: _time_error_labels_msg,
        ...(isError ? { errs: _time_labels_msg } : {}),
      },
    })
    .then()
    .catch();

  // fs log
  if (log_file.writable) {
    if (isEnd) {
      log_file.end("\n" + _time_error_labels_msg);
      log_file.close();
    } else {
      log_file.write("\n" + _time_error_labels_msg);
    }
  }
}

export function log({
  chunk,
  isEnd = false,
  isError = false,
  whenDifferent = false,
  labels = [],
  jobId,
  instanceName,
  last_log,
  log_file,
  credentials = [],
}) {
  //   id
  const id = `[${instanceName}-${String(jobId).slice(0, 8)}]`;
  const logger = logTransport.bind(null, { isError, isEnd, jobId, log_file });
  return coreLog({
    chunk,
    isError,
    labels,
    id,
    last_log,
    credentials,
    whenDifferent,
    loggerTransports: [logger],
  });
}

export function detectAction(newArr, oldArr) {
  const add = [],
    rm = [];
  // add
  for (const str of newArr) {
    if (oldArr.includes(str)) break;
    add.push(str);
  }
  // rm
  for (const str of oldArr) {
    if (newArr.includes(str)) break;
    rm.push(str);
  }

  return { add, rm };
}

export function nameToDir(name, root = "/var/instances") {
  return `${root}/${name.startsWith("nwi-") ? name : `nwi-${name}`}`;
}

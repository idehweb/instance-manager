import { jobModel } from "../model/job.model.js";
import { convertToString, getPublicPath } from "../utils/helpers.js";

export function getLogFilePath(executer) {
  return getPublicPath(
    `logs/${executer.instance_name}-${String(executer.job._id).slice(0, 8)}.log`
  );
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
}) {
  const time = `[${new Date().toISOString()}]`;
  const chunkArr = Array.isArray(chunk) ? chunk : [chunk];
  const _msg = chunkArr.map((c) => convertToString(c, true)).join(" ");

  // labels
  const _labels_msg = `${labels.map((l) => `[${l}]`).join(" ")}${
    labels.length ? " " : ""
  }${_msg}`;

  //   id
  const id = `[${instanceName}-${String(jobId).slice(0, 8)}]`;
  const _id_labels_msg = `${id} ${_labels_msg}`;

  // error
  let _error_id_labels_msg = _id_labels_msg;
  let _error_labels_msg = _labels_msg;
  if (isError) {
    _error_id_labels_msg = `[error] ${_id_labels_msg}`;
    _error_labels_msg = `[error] ${_labels_msg}`;
  }

  const newLastLog = _error_id_labels_msg;
  if (last_log == _error_id_labels_msg && whenDifferent) return newLastLog;

  // time
  const _time_error_id_labels_msg = `${time} ${_error_id_labels_msg}`;
  const _time_labels_msg = `${time} ${_labels_msg}`;
  const _time_error_labels_msg = `${time} ${_error_labels_msg}`;

  // console log
  console[isError ? "error" : "log"](_time_error_id_labels_msg);

  // db log
  jobModel
    .findByIdAndUpdate(jobId, {
      $push: {
        logs: _time_labels_msg,
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
  return newLastLog;
}

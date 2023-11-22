import { log } from "../utils/helpers.js";
import Doctor from "./Doctor.js";

const logger = {
  log: (msg) => {
    const transport = ({ isError, _time_error_id_labels_msg }) => {
      console[isError ? "error" : "log"](_time_error_id_labels_msg);
    };

    log({
      chunk: msg,
      labels: ["doctor"],
      loggerTransports: [transport],
    });
  },
  error: (msg) => {
    const transport = ({ isError, _time_error_id_labels_msg }) => {
      console[isError ? "error" : "log"](_time_error_id_labels_msg);
    };

    log({
      chunk: msg,
      labels: ["doctor"],
      loggerTransports: [transport],
      isError: true,
    });
  },
};

export default function registerDoctor() {
  const doctor = new Doctor(logger);
  doctor
    .examine()
    .then(() => {
      logger.log("examine finish successfully");
    })
    .catch((err) => {
      logger.error(["examine failed", err]);
    });
}

import { log } from "../utils/helpers.js";
import Doctor from "./Doctor.js";

const logger = {
  parseArgs(args) {
    const labels = ["doctor"];

    if (typeof args[0] === "boolean") {
      const isRemote = args.shift();
      if (isRemote) labels.push("remote");
    }

    if (args.length === 1 && Array.isArray(args[0])) args = args[0];

    return { chunk: args, labels };
  },
  log: (...args) => {
    const { labels, chunk } = logger.parseArgs(args);

    const transport = ({ isError, _time_error_id_labels_msg }) => {
      console[isError ? "error" : "log"](_time_error_id_labels_msg);
    };

    log({
      chunk,
      labels,
      loggerTransports: [transport],
    });
  },
  error: (...args) => {
    const { labels, chunk } = logger.parseArgs(args);

    const transport = ({ isError, _time_error_id_labels_msg }) => {
      console[isError ? "error" : "log"](_time_error_id_labels_msg);
    };

    log({
      chunk,
      labels,
      loggerTransports: [transport],
      isError: true,
    });
  },
};

export default function registerDoctor() {
  const doctor = new Doctor(logger);
  doctor.startInterval();
}

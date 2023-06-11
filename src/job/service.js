import SSE from "../utils/sse.js";
import { jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";

class Service {
  static async getAll(req, res, next) {
    const findQuery = {};
    if (req.customer) findQuery["instance.user"] = req.customer._id;

    const jobs = await jobModel
      .find(findQuery)
      .limit(req.query?.limit ?? 24)
      .skip(req.query?.skip ?? 0);
    return res.status(200).json({ status: "success", jobs });
  }
  static async getOne(req, res, next) {
    return res.status(200).json({ status: "success", job: req.job });
  }

  static async getSSE(req, res) {
    const sse = new SSE(res);
    const watch = jobModel.watch([
      { $match: { operationType: "update", "documentKey._id": req.job._id } },
    ]);
    watch.on("change", (cs) => {
      const data = cs.updateDescription?.updatedFields;

      // remove log fields
      delete data.logs;
      delete data.error;

      if (!Object.values(data).length) return;

      const canSendData = sse.sendData(data);
      if (!canSendData) watch.close();
    });
  }
}

classCatchBuilder(Service);

export default Service;

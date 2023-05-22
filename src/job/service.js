import { jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";

class Service {
  static async getAll(req, res, next) {
    const jobs = await jobModel
      .find()
      .limit(req.query?.limit ?? 24)
      .skip(req.query?.skip ?? 0);
    return res.status(200).json({ status: "success", jobs });
  }
  static async getOne(req, res, next) {
    const job = await jobModel.findById(req.params.id);
    return res.status(200).json({ status: "success", job });
  }
}

classCatchBuilder(Service);

export default Service;

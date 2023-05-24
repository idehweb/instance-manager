import { InstanceStatus, instanceModel } from "../model/instance.model.js";
import { JobType, jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";
import DockerService from "../docker/service.js";
import Executer from "../job/executer.js";

class Service {
  static async getAll(req, res, next) {
    const instances = await instanceModel
      .find()
      .limit(req.query?.limit ?? 24)
      .skip(req.query?.skip ?? 0);
    return res.status(200).json({ status: "success", instances });
  }
  static async getOne(req, res, next) {
    const instance = await instanceModel.findById(req.params.id).lean();
    if (instance.status === InstanceStatus.UP) {
      instance.status = await DockerService.getServiceStatus(instance.name);
    }
    return res.status(200).json({ status: "success", instance });
  }
  static async updateOne(req, res, next) {
    const job = await jobModel.create({
      type: JobType.UPDATE,
      instance: req.params.id,
      update_query: req.body,
    });

    return res.status(202).json({ status: "success", job });
  }
  static async deleteOne(req, res, next) {
    const job = await jobModel.create({
      type: JobType.DELETE,
      instance: req.params.id,
    });
    return res.status(202).json({ status: "success", job });
  }
  static async createOne(req, res, next) {
    const instance = await instanceModel.create({
      user: req.body.user,
      name: req.body.name,
      cpu: req.body.cpu ?? -1,
      memory: req.body.memory ?? -1,
      disk: req.body.disk ?? -1,
      replica: req.body.replica ?? 1,
      image: req.body.image,
    });

    const job = await jobModel.create({
      instance: instance._id,
      type: JobType.CREATE,
      max_attempts: req.body.max_attempts,
    });

    //  assign executer
    Executer.buildAndRun(job, instance);

    return res.status(202).json({ status: "success", instance, job });
  }
  static async getSystemStatus(req, res, next) {
    return res.status(200).json({
      status: "success",
      system_status: await DockerService.getSystemStatus(),
    });
  }
}

classCatchBuilder(Service);

export default Service;

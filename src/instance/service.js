import { InstanceStatus, instanceModel } from "../model/instance.model.js";
import { JobType, jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";
import DockerService from "../docker/service.js";
import Executer from "../job/executer.js";
import { createRandomName } from "../utils/helpers.js";
import { CF_ZONE_STATUS } from "../utils/cf.js";

class Service {
  static async getAll(req, res, next) {
    const findQuery = {};
    if (req.customer) {
      findQuery.user = req.customer._id;
      findQuery.status = { $ne: InstanceStatus.JOB_ERROR };
    }
    const instances = await instanceModel
      .find(findQuery)
      .limit(req.query?.limit ?? 24)
      .skip(req.query?.skip ?? 0)
      .sort({ createdAt: -1 });
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
      instance: req.instance,
      update_query: req.body,
    });

    //  assign executer
    Executer.buildAndRun(job, req.instance, res, req);

    // return res.status(202).json({ status: "success", job });
  }
  static async deleteOne(req, res, next) {
    const job = await jobModel.create({
      type: JobType.DELETE,
      instance: req.instance,
    });
    //  assign executer
    Executer.buildAndRun(job, req.instance, res, req);

    // return res.status(202).json({ status: "success", job });
  }
  static async createOne(req, res, next) {
    const user = req.admin || req.customer;
    const name = req.body.name ?? createRandomName(8);
    const primary_domain = `${name}.nodeeweb.com`;
    const domains = [
      ...new Set([
        primary_domain,
        ...(req.body.domains ?? []).map((d) =>
          d.replace(/^https?:\/\//, "").replace(/^www\./, "")
        ),
      ]),
    ];
    const instance = await instanceModel.create({
      user: user._id,
      name: req.body.name,
      cpu: req.body.cpu ?? 2,
      memory: req.body.memory ?? 1024,
      disk: req.body.disk ?? -1,
      replica: req.body.replica ?? 2,
      image: req.body.image,
      primary_domain,
      domains: domains.map((d) => ({
        status: CF_ZONE_STATUS.IN_PROGRESS,
        content: d,
      })),
    });

    const job = await jobModel.create({
      instance: { _id: instance._id, user: user._id },
      type: JobType.CREATE,
      max_attempts: req.body.max_attempts,
    });

    //  assign executer
    Executer.buildAndRun(job, instance, res, req);

    // return res.status(202).json({ status: "success", instance, job });
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

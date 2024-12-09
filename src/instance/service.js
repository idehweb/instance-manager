import { InstanceStatus, instanceModel } from "../model/instance.model.js";
import { JobType, jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";
import DockerService from "../docker/service.js";
import ExecuterManager from "../job/ExecuterManager.js";
import { createRandomName } from "../utils/helpers.js";
import { Network } from "../common/network.js";

class Service {
  static async getAll(req, res, next) {
    const findQuery = {};
    if (req.customer) {
      findQuery.user = req.customer._id;
      findQuery.status = { $ne: InstanceStatus.JOB_ERROR };
      findQuery.active = true;
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
    const update = req.body;
    const statusAccept = [InstanceStatus.DOWN, InstanceStatus.UP];
    if (update.status && !statusAccept.includes(update.status)) {
      return res.status(400).json({
        status: "error",
        message: `status must be ${statusAccept.join(" or ")}.`,
      });
    }
    if (update.status == req.instance.status) {
      return res.status(400).json({ status: "error", message: "same status" });
    }

    const job = await jobModel.create({
      type: JobType.UPDATE,
      instance: req.instance,
      update_query: req.body,
    });

    // link instance to job
    await req.instance.updateOne({ $push: { jobs: job._id } });

    //  assign execute manager
    ExecuterManager.buildAndRun(job, req.instance, null, req);

    return res.status(202).json({ status: "success", job });
  }
  static async deleteOne(req, res, next) {
    if (req.instance.status === InstanceStatus.JOB_CREATE)
      return res.status(400).json({
        status: "error",
        message: "can not delete instance when job is still executing...",
      });
    const job = await jobModel.create({
      type: JobType.DELETE,
      instance: req.instance,
    });

    // link instance to job
    await req.instance.updateOne({ $push: { jobs: job._id } });

    //  assign executer
    ExecuterManager.buildAndRun(job, req.instance, null, req);

    return res.status(202).json({ status: "success", job });
  }
  static async createOne(req, res, next) {
    if (!req.body.expiredAt)
      return res
        .status(400)
        .json({ status: "error", message: "expired at is required" });
    const user = req.admin || req.customer;
    const region = req.body.region ?? "german";
    const name = req.body.name ?? createRandomName(8);
    const primary_domain = Network.getPrimaryDomain({
      name,
      region,
    });
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
      name,
      site_name: req.body.site_name ?? name,
      cpu: Math.min(2, req.body.cpu ?? 2),
      memory: Math.min(1024, req.body.memory ?? 1024),
      disk: req.body.disk ?? -1,
      replica: Math.min(2, req.body.replica ?? 2),
      image: req.body.image,
      expiredAt: new Date(req.body.expiredAt),
      pattern: req.body.pattern ?? "demo0",
      primary_domain,
      region,
      domains: domains.map((d) => ({
        content: d,
      })),
    });

    const job = await jobModel.create({
      instance: { _id: instance._id, user: user._id },
      type: JobType.CREATE,
      max_attempts: req.body.max_attempts,
    });

    // link instance to job
    await instance.updateOne({ $push: { jobs: job._id } });

    //  assign execute manager
    ExecuterManager.buildAndRun(job, instance, null, req);

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

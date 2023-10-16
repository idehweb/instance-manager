import {
  InstanceRegion,
  InstanceStatus,
  instanceModel,
} from "../model/instance.model.js";
import { JobType, jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";
import DockerService from "../docker/service.js";
import ExecuterManager from "../job/ExecuterManager.js";
import { createRandomName, slugify } from "../utils/helpers.js";
import { Network } from "../common/network.js";
import instanceCreateValSch from "../validator/instance.js";
import imageService from "../image/service.js";

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
    const body = req.body;

    if (!(await imageService.isIn(body.image)))
      return res.status(404).json({ message: `image ${body.image} not found` });

    const user = req.admin || req.customer;
    // const region = body.region ?? "german";
    const region = InstanceRegion.GERMAN;
    const slug = slugify(body.name);
    const defaultDomain = Network.getDefaultDomain({
      name: slug,
      region,
    });
    const primary_domain =
      body.primary_domain?.replace(/^https?:\/\//, "").replace(/^www\./, "") ??
      defaultDomain;
    const domains = [
      ...new Set([
        defaultDomain,
        ...(body.domains ?? []).map((d) =>
          d.replace(/^https?:\/\//, "").replace(/^www\./, "")
        ),
      ]),
    ];

    const instance = await instanceModel.create({
      user: user._id,
      name: slug,
      db: `nwi-${slug}`,
      site_name: body.site_name,
      cpu: body.cpu,
      memory: body.memory,
      disk: body.disk,
      replica: body.replica,
      image: body.image,
      expiredAt: new Date(body.expiredAt),
      pattern: body.pattern,
      primary_domain,
      region,
      domains: domains.map((d) => ({
        content: d,
      })),
    });

    const job = await jobModel.create({
      instance: { _id: instance._id, user: user._id },
      type: JobType.CREATE,
      max_attempts: body.max_attempts,
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

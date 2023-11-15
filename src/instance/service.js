import {
  InstanceRegion,
  InstanceStatus,
  instanceModel,
} from "../model/instance.model.js";
import { JobType, jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";
import DockerService from "../docker/service.js";
import ExecuterManager from "../job/ExecuterManager.js";
import {
  createRandomName,
  getEnvFromMultiChoose,
  getNodeewebhub,
  getSafeReferrer,
  slugify,
} from "../utils/helpers.js";
import { Network } from "../common/network.js";
import instanceCreateValSch from "../validator/instance.js";
import imageService from "../image/service.js";
import { Global } from "../global.js";

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
  static _getUpdateCounts(update) {
    let count = 0;

    // irregular
    const newUpdate = Object.assign({}, update);

    if (newUpdate.domains_add || newUpdate.domains_rm) {
      delete newUpdate.domains_add;
      delete newUpdate.domains_rm;
      count++;
    }

    count += Object.values(newUpdate).filter((v) => v).length;

    return count;
  }
  static async updateOne(req, res, next) {
    const update = req.body;
    if (!req.instance.active)
      return res.status(403).json({ message: "instance is inactive" });

    // prevent multi update
    const updateCounts = Service._getUpdateCounts(update);
    if (updateCounts !== 1)
      return res.status(400).json({
        status: "error",
        message: `each time you must update one attribute, received ${updateCounts} attributes`,
      });
    if (update.domains_rm && update.domains_rm.length) {
      // add and remove
      if (update.domains_add) {
        if (update.domains_rm.some((d) => update.domains_add.includes(d)))
          return res.status(400).json({
            status: "error",
            message: "can not add and remove domain in same time",
          });
      }

      // remove not removable
      const canRmDomains = req.instance.domains
        .map((d) => d.content)
        .filter(
          (d) =>
            d !== req.instance.primary_domain &&
            d !==
              Network.getDefaultDomain({
                name: req.instance.name,
                region: req.instance.region,
              })
        );

      if (update.domains_rm.some((d) => !canRmDomains.includes(d)))
        return res.status(400).json({
          status: "error",
          message:
            "some domains that want to remove is not exist or not removable",
        });
    }

    if (update.domains_add && update.domains_add.length) {
      const otherInstances = await instanceModel.findOne({
        "domains.content": { $in: update.domains_add },
        active: true,
      });

      if (otherInstances)
        return res.status(400).json({
          status: "error",
          message: "some of your domains were register before",
        });
    }

    if (update.primary_domain) {
      if (req.instance.primary_domain === update.primary_domain)
        return res.status(400).json({ message: "primary domain is same" });
      if (
        !req.instance.domains
          .map((d) => d.content)
          .includes(update.primary_domain)
      )
        return res
          .status(400)
          .json({ message: "primary domain is not exist on domains" });
    }

    if (update.status == req.instance.status)
      return res.status(400).json({ status: "error", message: "same status" });

    const job = await jobModel.create({
      type: JobType.UPDATE,
      instance: req.instance,
      update_query: update,
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
    const region =
      body.region ??
      getEnvFromMultiChoose(getSafeReferrer(req), "defaultRegions") ??
      InstanceRegion.GERMAN;
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

    const nodeewebhub = getNodeewebhub(req);

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
      favicon: `https://${primary_domain}/favicon.ico`,
      region,
      domains: domains.map((d) => ({
        content: d,
      })),
      nodeewebhub,
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
  static async validate(req, res, next) {
    const body = req.body;

    // extra validate
    const errors = [];
    // image
    if (body.image && !(await imageService.isIn(body.image)))
      errors.push(`image ${body.image} not found`);

    // name
    if (
      body.name &&
      (await instanceModel.findOne(
        { name: slugify(body.name), active: true },
        { _id: 1 }
      ))
    )
      errors.push("name is duplicate");

    // domain
    if (
      body.domains?.length &&
      (await instanceModel.findOne(
        { content: { $in: body.domains }, active: true },
        { _id: 1 }
      ))
    )
      errors.push("domains have duplicate");

    if (errors.length)
      return res.status(400).json({ message: errors.join(", ") });

    return res.status(200).json({ message: "successfully validate body!" });
  }
}

classCatchBuilder(Service);

export default Service;

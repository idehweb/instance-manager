import crypto from "crypto";
import axios from "axios";
import { JobStatus, jobModel } from "../model/job.model.js";
import { Global } from "../global.js";
import { getEnv, getMyIp, wait } from "../utils/helpers.js";
import ExecuteManager from "../job/ExecuterManager.js";
import { InstanceStatus, instanceModel } from "../model/instance.model.js";
import { runRemoteCmdWithRegion } from "../ws/index.js";
import { Command } from "../common/Command.js";
import DockerService from "../docker/service.js";

export class Doctor {
  constructor(logger) {
    this.logger = logger;
  }

  async startInterval({
    sec = 60 * 60,
    startNow = true,
    firstDelay = 30,
  } = {}) {
    const func = async () => {
      try {
        await this.examine();
      } catch (err) {
        this.logger.log(["examine rase error", err]);
      }
    };
    setInterval(func, sec * 1000);
    if (startNow) {
      if (firstDelay) await wait(firstDelay);
      func();
    }
  }

  async examine() {
    this.logger.log("start examine...");

    // alone jobs
    await this.aloneJobsExamine();

    // instance status
    await this.instanceStatusExamine();

    this.logger.log("examine finish.");
  }

  async aloneJobsExamine() {
    this.logger.log("examine alone jobs start");

    this.logger.log("fetch alone jobs...");
    const jobs = await this.getAloneJobs();
    this.logger.log("fetch alone jobs done.");

    for (const job of jobs) {
      const instance = await instanceModel.findOne({
        _id: job.instance._id,
        active: true,
      });
      // not instance
      if (!instance) {
        this.logger.log(`instance not found for job ${job.id}`);
        // update job status
        await jobModel.updateOne(
          { _id: job._id },
          { $set: { status: JobStatus.ERROR } }
        );
        await instanceModel.updateOne(
          { _id: job.instance._id, jobs: job._id },
          { $set: { "jobs.$.status": JobStatus.ERROR } }
        );
        this.logger.log(`update job ${job.id} status`);
        continue;
      }

      // undertake
      const execId = await this.undertake(job);

      if (!execId) {
        // can not undertake job
        this.logger.log(`can not undertake for job ${job.id}`);
        continue;
      }

      this.logger.log(`undertake job:${job.id} with execId:${execId}`);

      // build and run
      ExecuteManager.buildAndRun(job, instance, null, null, execId, ["doctor"])
        .then()
        .catch();

      this.logger.log(`build and execute for job ${job._id}`);

      // wait
      await wait(10);
    }
    this.logger.log("examine alone jobs done");
  }
  async instanceStatusExamine() {
    this.logger.log("examine instance status start");

    this.logger.log(
      "fetch all active instances without any in progress jobs..."
    );
    const instances = await instanceModel.find({
      active: true,
      status: { $in: [InstanceStatus.UP, InstanceStatus.DOWN] },
      "jobs.status": { $ne: JobStatus.IN_PROGRESS },
    });
    this.logger.log(`fetch ${instances.length} instances`);

    for (const instance of instances) {
      const status = await this.getLiveServiceStatus(instance);
      if (status !== instance.status) {
        // change status
        await instanceModel.findOneAndUpdate(
          { _id: instance._id, status: instance.status },
          { status }
        );
        this.logger.log(`set ${instance.name} into ${status} status`);
      }
    }

    this.logger.log("examine instance status done");
  }

  async undertake(job) {
    const execId = crypto.randomUUID();

    const newJob = await jobModel.findOneAndUpdate(
      {
        $and: [
          {
            _id: job._id,
          },
          {
            $or: [
              {
                executer: { $exists: false },
              },
              {
                "executer.isAlive": false,
              },
            ],
          },
        ],
      },
      {
        executer: {
          id: execId,
          ip: getMyIp(true),
          host: getEnv("internal-host-name"),
          isAlive: true,
        },
      }
    );

    if (!newJob) return false;
    return execId;
  }

  async getAloneJobs() {
    const jobs = await jobModel.find({ status: JobStatus.IN_PROGRESS });
    const target = [];
    for (const job of jobs) {
      if (!(await this.checkAliveness(job))) {
        target.push(job);
        this.logger.log(`job ${job.id} isn't alive`);
        await job.updateOne({ "executer.isAlive": false });
      }
    }
    return target;
  }

  async checkAliveness(job) {
    if (!job.executer?.isAlive) return false;

    const { host, ip, id } = job.executer;

    if (host && host === getEnv("internal-host-name")) {
      // local
      return Global.executers.has(id);
    }

    const adr = host ?? ip;

    try {
      await axios.get(`http://${adr}:${Global.env.PORT}/api/v1/doctor/${id}`, {
        headers: {
          Authorization: getEnv("internal-token", { format: "string" }),
        },
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  executer = (region, cmd) => {
    return runRemoteCmdWithRegion(
      region,
      cmd instanceof Command
        ? cmd
        : new Command({ cmd, log: true, error: true, out: true }),
      this.logger
    );
  };

  async getLiveServiceStatus(instance) {
    const inspect = await DockerService.getInspect(
      instance.name,
      this.executer.bind(this, instance.region)
    );
    const activeReplicas = inspect.Mode?.Replicated?.Replicas || 0;

    if (activeReplicas === 0) return InstanceStatus.DOWN;

    return InstanceStatus.UP;
  }
}

export default Doctor;

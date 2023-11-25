import crypto from "crypto";
import axios from "axios";
import { JobStatus, jobModel } from "../model/job.model.js";
import { Global } from "../global.js";
import { getEnv, getMyIp, wait } from "../utils/helpers.js";
import ExecuteManager from "../job/ExecuterManager.js";
import { instanceModel } from "../model/instance.model.js";

export class Doctor {
  constructor(logger) {
    this.logger = logger;
  }

  async examine() {
    this.logger.log("start examine...");
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

    this.logger.log("examine finish.");
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
    try {
      await axios.get(
        `http://${job.executer.ip}:${Global.env.PORT}/api/v1/doctor/${job.executer.id}`,
        {
          headers: {
            Authorization: getEnv("internal-token", { format: "string" }),
          },
        }
      );
      return true;
    } catch (err) {
      return false;
    }
  }
}

export default Doctor;

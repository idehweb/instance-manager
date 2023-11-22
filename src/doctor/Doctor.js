import crypto from "crypto";
import axios from "axios";
import { JobStatus, jobModel } from "../model/job.model.js";
import { Global } from "../global.js";
import { getMyIp, wait } from "../utils/helpers.js";
import ExecuteManager from "../job/ExecuterManager.js";
import { instanceModel } from "../model/instance.model.js";

export class Doctor {
  constructor(logger) {
    this.logger = logger;
  }

  async examine() {
    this.logger.log("start examine");
    const jobs = await this.getAloneJobs();
    this.logger.log("fetch jobs");

    for (const job of jobs) {
      const instance = await instanceModel.findOne({
        _id: job._id,
        active: true,
      });

      // not instance
      if (!instance) break;

      // undertake
      const execId = await this.undertake(job);

      if (!execId)
        // can not undertake job
        break;

      // build and run
      ExecuteManager.buildAndRun(job, instance, null, null, execId);

      this.logger.log(`build and execute for job ${job._id}`);

      // wait
      await wait(10);
    }
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
        await job.updateOne({ "executer.isAlive": false });
      }
    }
    return target;
  }

  async checkAliveness(job) {
    if (!job.executer?.isAlive) return false;
    try {
      await axios.get(
        `http://${job.executer.ip}:${Global.env.PORT}/api/v1/doctor/${job.executer.id}`
      );
      return true;
    } catch (err) {
      return false;
    }
  }
}

export default Doctor;

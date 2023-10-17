import axios from "axios";
import crypto from "crypto";
import { JobStatus, jobModel } from "../model/job.model";
import { Global } from "../global";
import { getMyIp } from "../utils/helpers";

export default class Doctor {
  constructor() {}

  async block(job) {
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

  async getWithoutExecuterJobs() {
    const jobs = await jobModel.find({ status: JobStatus.IN_PROGRESS });
    const target = [];
    for (const job of jobs) {
      if (!(await this.checkHealthy(job))) {
        target.push(job);
        await job.updateOne({ "executer.isAlive": false });
      }
    }
  }

  async checkHealthy(job) {
    if (!job.executer?.isAlive) return false;
    try {
      await axios.get(`http://${job.executer.ip}:${Global.env.PORT}/health`);
      return true;
    } catch (err) {
      return false;
    }
  }
}

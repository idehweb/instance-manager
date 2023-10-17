import axios from "axios";
import { JobStatus, jobModel } from "../model/job.model";

export default class Doctor {
  constructor() {}

  async getWithoutExecuterJobs() {
    const jobs = await jobModel.find({ status: JobStatus.IN_PROGRESS });
    const target = [];
    for (const job of jobs) {
      if (!job.executer) target.push(job);
    }
  }

  async checkHealthy(job) {
    await axios.get(`http://${job.executer.ip}:3000`);
  }
}

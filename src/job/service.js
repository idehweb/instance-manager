import SSE from "../utils/sse.js";
import { JobStatus, jobModel } from "../model/job.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";

class Service {
  static async getAll(req, res, next) {
    const findQuery = {};
    if (req.customer) findQuery["instance.user"] = req.customer._id;

    const jobs = await jobModel
      .find(findQuery)
      .limit(req.query?.limit ?? 24)
      .skip(req.query?.skip ?? 0);
    return res.status(200).json({ status: "success", jobs });
  }
  static async getOne(req, res, next) {
    return res.status(200).json({ status: "success", job: req.job });
  }

  static async getSSE(req, res) {
    const sse = new SSE(res);

    // send live status
    sse.sendData({
      status: req.job.status,
      attempt: req.job.attempt,
      done_steps: req.job.done_steps,
      progress_step: req.job.progress_step,
    });

    if (req.job.status !== JobStatus.IN_PROGRESS) {
      sse.close();
      return;
    }
    const watch = jobModel.watch([
      { $match: { operationType: "update", "documentKey._id": req.job._id } },
    ]);
    watch.on("change", (cs) => {
      let data = cs.updateDescription?.updatedFields;
      // remove unneccery fields
      data = Object.fromEntries(
        Object.entries({
          status: data.status,
          attempt: data.attempt,
          progress_step: data.progress_step,
          done_steps: data.done_steps,
        }).filter(([, v]) => v)
      );

      if (!Object.values(data).length) return;

      if (!data.status) data.status = JobStatus.IN_PROGRESS;

      // connection lost
      const canSendData = sse.sendData(data);

      // job is done
      const doneJob = data.status && data.status !== JobStatus.IN_PROGRESS;

      if (!canSendData || doneJob) watch.close();
      if (doneJob) sse.close();
    });
  }
}

classCatchBuilder(Service);

export default Service;

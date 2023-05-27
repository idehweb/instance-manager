import mongoose, { mongo } from "mongoose";
import { Global } from "../global.js";

export const JobStatus = {
  IN_PROGRESS: "in-progress",
  SUCCESS: "success",
  ERROR: "error",
};

export const JobType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
};

export const jobSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    update_query: { type: mongoose.Schema.Types.Mixed },
    instance: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: "instances",
      },
      user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
    },
    status: { type: String, default: JobStatus.IN_PROGRESS },
    error: { type: mongoose.Schema.Types.Mixed },
    logs: { type: [String], default: undefined },
    attempt: Number,
    max_attempts: { type: Number, default: +Global.env.JOB_MAX_ATTEMPTS },
  },
  { timestamps: true }
);
export const jobModel = mongoose.model("jobs", jobSchema, "jobs");

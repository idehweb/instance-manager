import mongoose, { mongo } from "mongoose";

export const JobStatus = {
  CREATED: "created",
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
    instance: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, default: JobStatus.CREATED },
    error: { type: mongoose.Schema.Types.Mixed },
    logs: { type: [String], default: undefined },
  },
  { timestamps: true }
);
export const jobModel = mongoose.model("jobs", jobSchema, "jobs");

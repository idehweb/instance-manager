import mongoose from "mongoose";
import { createRandomName } from "../utils/helpers.js";

export const InstanceStatus = {
  JOB_CREATE: "job-create",
  UP: "up",
  DOWN: "down",
  ERROR: "error",
};

export const instanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, default: () => createRandomName(8) },
    cpu: { type: Number, required: true },
    memory: { type: Number, required: true },
    disk: { type: Number, required: true },
    replica: { type: Number, required: true },
    status: { type: String, default: InstanceStatus.JOB_CREATE },
  },
  { timestamps: true }
);
export const instanceModel = mongoose.model(
  "instances",
  instanceSchema,
  "instances"
);

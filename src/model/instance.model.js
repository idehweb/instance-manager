import mongoose from "mongoose";

export const InstanceStatus = {
  JOB_CREATE: "job-create",
  UP: "up",
  DOWN: "down",
  ERROR: "error",
  JOB_ERROR: "job-error",
  DELETED: "deleted",
  EXPIRED: "expired",
};

export const InstanceRegion = {
  IRAN: "iran",
  GERMAN: "german",
};

export const InstancePattern = {};

export const instanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, unique: true },
    old_name: String,
    cpu: { type: Number, required: true },
    memory: { type: Number, required: true },
    disk: { type: Number, required: true },
    replica: { type: Number, required: true },
    status: { type: String, default: InstanceStatus.JOB_CREATE },
    image: { type: String, default: process.env.INSTANCE_DEFAULT_IMAGE },
    site_name : {type : String , required:true},
    pattern: { type: String, required: true },
    domains: [
      {
        _id: false,
        status: String,
        content: String,
        ns: { type: [String], default: undefined },
      },
    ],
    region: { type: String, required: true },
    primary_domain: { type: String, required: true },
    active: { type: Boolean, default: true },
    jobs: { type: [mongoose.Schema.Types.ObjectId] },
    expiredAt: { type: Date, required: true },
  },
  { timestamps: true }
);
export const instanceModel = mongoose.model(
  "instances",
  instanceSchema,
  "instances"
);

import mongoose, { mongo } from "mongoose";
import { Global } from "../global.js";

export const JobSteps = {
  CDN_REGISTER: "cdn-register",
  CREATE_SERVICE: "create-service",
  COPY_STATIC: "copy-static",
  REMOVE_STATIC: "remove-static",
  RESTORE_DB: "restore-db",
  REMOVE_DB: "remove-db",
  BACKUP_DB: "backup-db",
  BACKUP_STATIC: "backup-static",
  REMOVE_SERVICE: "remove-service",
  CDN_UNREGISTER: "cdn-unregister",
  SYNC_DB: "sync-db",
  CHANGE_STATUS: "change-status",
  CHANGE_DOMAINS: "change-domains",
  CHANGE_IMAGE: "change-image",
  CHANGE_CDN_PRIMARY_DOMAIN: "change-cdn-primary-domain",
  CHANGE_SERVICE_PRIMARY_DOMAIN: "change-service-primary-domain",
};

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
    done_steps: {
      type: [String],
      default: [],
    },
    progress_step: {
      type: String,
    },
    attempt: { type: Number, default: 1 },
    max_attempts: { type: Number, default: +Global.env.JOB_MAX_ATTEMPTS },
  },
  { timestamps: true }
);
export const jobModel = mongoose.model("jobs", jobSchema, "jobs");

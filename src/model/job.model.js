import mongoose, { mongo } from "mongoose";
import { Global } from "../global.js";

export const JobSteps = {
  CDN_REGISTER: "cdn-register",
  CREATE_SERVICE: "create-service",
  CREATE_STATIC_DIRS: "create-static-dirs",
  COPY_STATIC: "copy-static",
  ADD_DOMAIN_CONFIG: "add-domain-config",
  REMOVE_DOMAIN_CONFIG: "remove-domain-config",
  ADD_DOMAIN_CERT: "add-domain-cert",
  REMOVE_DOMAIN_CERT: "remove-domain-cert",
  REMOVE_STATIC: "remove-static",
  RESTORE_DB: "restore-db",
  REMOVE_DB: "remove-db",
  BACKUP_DB: "backup-db",
  BACKUP_STATIC: "backup-static",
  REMOVE_SERVICE: "remove-service",
  CDN_UNREGISTER: "cdn-unregister",
  SYNC_DB: "sync-db",
  CHANGE_STATUS: "change-status",
  PARSE_UPDATE_QUERY: "parse-update-query",
  UPDATE_DOMAIN_CDN: "update-domain-cdn",
  ROLLBACK_UPDATE_DOMAIN_CDN: "rollback-update-domain-cdn",
  UPDATE_DOMAIN_CONFIG: "update-domain-config",
  ROLLBACK_UPDATE_DOMAIN_CONFIG: "rollback-update-domain-config",
  UPDATE_DOMAIN_CERT: "update-domain-cert",
  ROLLBACK_UPDATE_DOMAIN_CERT: "rollback-update-domain-cert",
  CHANGE_IMAGE: "change-image",
  CHANGE_SERVICE_PRIMARY_DOMAIN: "change-service-primary-domain",
  CREATE_USER_IN_DB: "create-user-in-db",
  REMOVE_USER_FROM_DB: "remove_user-from-db",
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
    executer: {
      type: {
        _id: false,
        id: { type: String, required: true },
        ip: { type: String, required: true },
        isAlive: { type: Boolean, default: true },
      },
      required: false,
    },
  },
  { timestamps: true }
);
export const jobModel = mongoose.model("jobs", jobSchema, "jobs");

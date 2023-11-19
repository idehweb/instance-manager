import mongoose, { mongo } from "mongoose";
import { Global } from "../global.js";

export const JobSteps = {
  PRE_REQUIRED: "pre-required",

  CDN_REGISTER: "cdn-register",
  ROLLBACK_CDN_REGISTER: "rollback-cdn-register",

  CREATE_SERVICE: "create-service",
  ROLLBACK_CREATE_SERVICE: "rollback-create-service",

  CREATE_STATIC_DIRS: "create-static-dirs",
  COPY_STATIC: "copy-static",
  ROLLBACK_STATIC_FILES: "rollback-static-files",

  ADD_DOMAIN_CONFIG: "add-domain-config",
  ROLLBACK_ADD_DOMAIN_CONFIG: "rollback-add-domain-config",

  REMOVE_DOMAIN_CONFIG: "remove-domain-config",
  ROLLBACK_REMOVE_DOMAIN_CONFIG: "rollback-remove-domain-config",

  ADD_DOMAIN_CERT: "add-domain-cert",
  ROLLBACK_ADD_DOMAIN_CERT: "rollback-add-domain-cert",

  REMOVE_DOMAIN_CERT: "remove-domain-cert",
  ROLLBACK_REMOVE_DOMAIN_CERT: "rollback-remove-domain-cert",

  REMOVE_STATIC: "remove-static",
  ROLLBACK_REMOVE_STATIC: "rollback-remove-static",

  RESTORE_DEMO: "restore-demo-db",
  ROLLBACK_RESTORE_DEMO: "rollback-restore-demo-db",

  REMOVE_DB: "remove-db",
  ROLLBACK_REMOVE_DB: "rollback-remove-db",

  BACKUP_DB: "backup-db",
  ROLLBACK_BACKUP_DB: "rollback-backup-db",

  BACKUP_STATIC: "backup-static",
  ROLLBACK_BACKUP_STATIC: "rollback-backup-static",

  REMOVE_SERVICE: "remove-service",
  ROLLBACK_REMOVE_SERVICE: "rollback-remove-service",

  CDN_UNREGISTER: "cdn-unregister",
  ROLLBACK_CDN_UNREGISTER: "rollback-cdn-unregister",

  SYNC_DB: "sync-db",

  CHANGE_STATUS: "change-status",
  ROLLBACK_CHANGE_STATUS: "rollback-change-status",

  UPDATE_DOMAIN_CDN: "update-domain-cdn",
  ROLLBACK_UPDATE_DOMAIN_CDN: "rollback-update-domain-cdn",

  UPDATE_SITE_NAME: "update-site-name",
  ROLLBACK_UPDATE_SITE_NAME: "rollback-update-site-name",

  UPDATE_DOMAIN_CONFIG: "update-domain-config",
  ROLLBACK_UPDATE_DOMAIN_CONFIG: "rollback-update-domain-config",

  UPDATE_SERVICE_ALIASES: "update-service-aliases",
  ROLLBACK_UPDATE_SERVICE_ALIASES: "rollback-update-service-aliases",

  UPDATE_DOMAIN_CERT: "update-domain-cert",
  ROLLBACK_UPDATE_DOMAIN_CERT: "rollback-update-domain-cert",

  CHANGE_IMAGE: "change-image",
  ROLLBACK_CHANGE_IMAGE: "rollback-change-image",

  CHANGE_SERVICE_PRIMARY_DOMAIN: "change-service-primary-domain",
  ROLLBACK_CHANGE_SERVICE_PRIMARY_DOMAIN:
    "rollback-change-service-primary-domain",

  CREATE_USER_IN_DB: "create-user-in-db",
  ROLLBACK_CREATE_USER_IN_DB: "rollback-create-user-in-db",

  REMOVE_USER_FROM_DB: "remove_user-from-db",
  ROLLBACK_REMOVE_USER_FROM_DB: "rollback-remove_user-from-db",
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
    prev_data: { type: mongoose.Schema.Types.Mixed },
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
    errs: { type: [String], default: undefined },
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
    isInCleanPhase: { type: Boolean },
  },
  { timestamps: true }
);
export const jobModel = mongoose.model("jobs", jobSchema, "jobs");

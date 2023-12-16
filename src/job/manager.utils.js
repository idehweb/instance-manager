import { JobSteps, JobType } from "../model/job.model.js";
import { getPublicPath } from "../utils/helpers.js";
import CreateExecuter from "./CreateExecuter.js";
import DeleteExecuter from "./DeleteExecuter.js";
import UpdateExecuter from "./UpdateExecuter.js";

export function getLogFilePath(executer) {
  return getPublicPath(
    `logs/${executer.instance_name}-${String(executer.job._id).slice(0, 8)}.log`
  );
}

export function convertStack(conf, ...stacks) {
  const convertedStacks = stacks.map((s) => {
    if (typeof s === "string") return { ...conf, step: s };
    return { ...conf, ...s };
  });
  return convertedStacks;
}

export function uniqueStack(...stacks) {
  const uniqueStacks = Object.values(
    stacks.reduce((tree, s) => {
      // if (tree[s.step]) return tree;
      tree[s.step] = s;
      return tree;
    }, {})
  );

  return uniqueStacks;
}

export function step2Rollback(...steps) {
  const rollbackSteps = steps
    .map((step) => {
      switch (step) {
        case JobSteps.PRE_REQUIRED:
          return JobSteps.PRE_REQUIRED;

        case JobSteps.COPY_STATIC:
        case JobSteps.CREATE_STATIC_DIRS:
          return JobSteps.ROLLBACK_STATIC_FILES;

        case JobSteps.CREATE_LINKS:
          return JobSteps.ROLLBACK_CREATE_LINKS;

        case JobSteps.CREATE_SERVICE:
          return JobSteps.ROLLBACK_CREATE_SERVICE;

        case JobSteps.CDN_REGISTER:
          return JobSteps.ROLLBACK_CDN_REGISTER;

        case JobSteps.CDN_UNREGISTER:
          return JobSteps.ROLLBACK_CDN_UNREGISTER;

        case JobSteps.RESTORE_DEMO:
          return JobSteps.ROLLBACK_RESTORE_DEMO;

        case JobSteps.CHANGE_STATUS:
          return JobSteps.ROLLBACK_CHANGE_STATUS;

        case JobSteps.BACKUP_DB:
          return JobSteps.ROLLBACK_BACKUP_DB;

        case JobSteps.BACKUP_STATIC:
          return JobSteps.ROLLBACK_BACKUP_STATIC;

        case JobSteps.REMOVE_DB:
          return JobSteps.ROLLBACK_REMOVE_DB;

        case JobSteps.REMOVE_SERVICE:
          return JobSteps.ROLLBACK_REMOVE_SERVICE;

        case JobSteps.REMOVE_STATIC:
          return JobSteps.ROLLBACK_REMOVE_STATIC;

        case JobSteps.REMOVE_LINKS:
          return JobSteps.ROLLBACK_REMOVE_LINKS;

        case JobSteps.CHANGE_IMAGE:
          return JobSteps.ROLLBACK_CHANGE_IMAGE;

        case JobSteps.CHANGE_SERVICE_PRIMARY_DOMAIN:
          return JobSteps.ROLLBACK_CHANGE_SERVICE_PRIMARY_DOMAIN;

        case JobSteps.ADD_DOMAIN_CONFIG:
          return JobSteps.ROLLBACK_ADD_DOMAIN_CONFIG;

        case JobSteps.REMOVE_DOMAIN_CONFIG:
          return JobSteps.ROLLBACK_REMOVE_DOMAIN_CONFIG;

        case JobSteps.ADD_DOMAIN_CERT:
          return JobSteps.ROLLBACK_ADD_DOMAIN_CERT;

        case JobSteps.REMOVE_DOMAIN_CERT:
          return JobSteps.ROLLBACK_REMOVE_DOMAIN_CERT;

        case JobSteps.UPDATE_DOMAIN_CDN:
          return JobSteps.ROLLBACK_UPDATE_DOMAIN_CDN;

        case JobSteps.UPDATE_DOMAIN_CERT:
          return JobSteps.ROLLBACK_UPDATE_DOMAIN_CERT;

        case JobSteps.UPDATE_DOMAIN_CONFIG:
          return JobSteps.ROLLBACK_UPDATE_DOMAIN_CONFIG;

        case JobSteps.UPDATE_SERVICE_ALIASES:
          return JobSteps.ROLLBACK_UPDATE_SERVICE_ALIASES;

        case JobSteps.UPDATE_SERVICE_LINKS:
          return JobSteps.ROLLBACK_UPDATE_SERVICE_LINKS;

        case JobSteps.CREATE_USER_IN_DB:
          return JobSteps.ROLLBACK_CREATE_USER_IN_DB;

        case JobSteps.REMOVE_USER_FROM_DB:
          return JobSteps.ROLLBACK_REMOVE_USER_FROM_DB;

        case JobSteps.UPDATE_SITE_NAME:
          return JobSteps.ROLLBACK_UPDATE_SITE_NAME;
      }
    })
    .filter((s) => s);

  // unique by oldest step strategy
  const uniqueSteps = Object.keys(
    rollbackSteps.reduce((prev, step) => {
      delete prev[step];
      prev[step] = true;
      return prev;
    }, {})
  );

  return uniqueSteps;
}

export function convertJobTypeToExecuter(type) {
  switch (type) {
    case JobType.CREATE:
      return CreateExecuter;

    case JobType.UPDATE:
      return UpdateExecuter;

    case JobType.DELETE:
      return DeleteExecuter;

    default:
      throw new Error(`unknown job type: ${type}`);
  }
}

export function convertJobStepToFunc(step, executer) {
  switch (step) {
    case JobSteps.PRE_REQUIRED:
      return executer.pre_require;

    case JobSteps.CREATE_STATIC_DIRS:
      return executer.create_static_dirs;

    case JobSteps.CREATE_LINKS:
    case JobSteps.ROLLBACK_CREATE_LINKS:
      return executer.create_links;

    case JobSteps.REMOVE_LINKS:
    case JobSteps.ROLLBACK_REMOVE_LINKS:
      return executer.rm_links;

    case JobSteps.COPY_STATIC:
    case JobSteps.ROLLBACK_STATIC_FILES:
      return executer.copy_static;

    case JobSteps.CREATE_SERVICE:
    case JobSteps.ROLLBACK_CREATE_SERVICE:
      return executer.docker_create;

    case JobSteps.CDN_REGISTER:
    case JobSteps.ROLLBACK_CDN_REGISTER:
      return executer.register_cdn;

    case JobSteps.CDN_UNREGISTER:
    case JobSteps.ROLLBACK_CDN_UNREGISTER:
      return executer.unregister_cdn;

    case JobSteps.RESTORE_DEMO:
    case JobSteps.ROLLBACK_RESTORE_DEMO:
      return executer.restore_demo;

    case JobSteps.CHANGE_STATUS:
    case JobSteps.ROLLBACK_CHANGE_STATUS:
      return executer.changeStatus;

    case JobSteps.BACKUP_DB:
    case JobSteps.ROLLBACK_BACKUP_DB:
      return executer.backup_db;

    case JobSteps.BACKUP_STATIC:
    case JobSteps.ROLLBACK_BACKUP_STATIC:
      return executer.backup_static;

    case JobSteps.REMOVE_DB:
    case JobSteps.ROLLBACK_REMOVE_DB:
      return executer.rm_db;

    case JobSteps.REMOVE_SERVICE:
    case JobSteps.ROLLBACK_REMOVE_SERVICE:
      return executer.service_remove;

    case JobSteps.REMOVE_STATIC:
    case JobSteps.ROLLBACK_REMOVE_STATIC:
      return executer.rm_static;

    case JobSteps.CHANGE_IMAGE:
    case JobSteps.ROLLBACK_CHANGE_IMAGE:
      return executer.changeImage;

    case JobSteps.CHANGE_SERVICE_PRIMARY_DOMAIN:
    case JobSteps.ROLLBACK_CHANGE_SERVICE_PRIMARY_DOMAIN:
      return executer.change_primary_domain;

    case JobSteps.ADD_DOMAIN_CONFIG:
    case JobSteps.ROLLBACK_ADD_DOMAIN_CONFIG:
      return executer.nginx_domain_config;

    case JobSteps.REMOVE_DOMAIN_CONFIG:
    case JobSteps.ROLLBACK_REMOVE_DOMAIN_CONFIG:
      return executer.rm_domain_config;

    case JobSteps.ADD_DOMAIN_CERT:
    case JobSteps.ROLLBACK_ADD_DOMAIN_CERT:
      return executer.add_domain_certs;

    case JobSteps.REMOVE_DOMAIN_CERT:
    case JobSteps.ROLLBACK_REMOVE_DOMAIN_CERT:
      return executer.rm_domain_cert;

    case JobSteps.UPDATE_DOMAIN_CDN:
    case JobSteps.ROLLBACK_UPDATE_DOMAIN_CDN:
      return executer.update_domain_cdn;

    case JobSteps.UPDATE_DOMAIN_CERT:
    case JobSteps.ROLLBACK_UPDATE_DOMAIN_CERT:
      return executer.update_domain_cert;

    case JobSteps.UPDATE_DOMAIN_CONFIG:
    case JobSteps.ROLLBACK_UPDATE_DOMAIN_CONFIG:
      return executer.update_domain_config;

    case JobSteps.UPDATE_SERVICE_ALIASES:
    case JobSteps.ROLLBACK_UPDATE_SERVICE_ALIASES:
      return executer.update_service_aliases;

    case JobSteps.UPDATE_SERVICE_LINKS:
    case JobSteps.ROLLBACK_UPDATE_SERVICE_LINKS:
      return executer.update_service_links;

    case JobSteps.CREATE_USER_IN_DB:
    case JobSteps.ROLLBACK_CREATE_USER_IN_DB:
      return executer.create_user_in_db;

    case JobSteps.REMOVE_USER_FROM_DB:
    case JobSteps.ROLLBACK_REMOVE_USER_FROM_DB:
      return executer.rm_user_from_db;

    case JobSteps.UPDATE_SITE_NAME:
    case JobSteps.ROLLBACK_UPDATE_SITE_NAME:
      return executer.update_site_name;

    case JobSteps.STATIC_PERMISSIONS:
      return executer.static_permissions;

    default:
      throw new Error(`can not convert step ${step}`);
  }
}

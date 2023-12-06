import Joi from "joi";
import {
  InstancePattern,
  InstanceRegion,
  InstanceStatus,
} from "../model/instance.model.js";
import { createRandomName } from "../utils/helpers.js";

function nameValidator(name, helpers) {
  const cond = !name || (typeof name == "string" && /^[[a-z0-9]+$/.test(name));

  if (!cond) return helpers.error("name must combine of en chars and numbers");

  return name;
}

const instanceCreateValSch = Joi.object({
  name: Joi.string()
    .optional()
    .min(3)
    .max(100)
    .lowercase()
    .custom(nameValidator)
    .default(() => createRandomName(8)),
  site_name: Joi.string().optional().min(2).max(100).default(Joi.ref("name")),
  pattern: Joi.string()
    .optional()
    .valid(...Object.values(InstancePattern)),
  cpu: Joi.number().integer().optional().min(0.1).max(2).default(2),
  max_attempts: Joi.number().integer().optional().min(1).max(3).default(3),
  memory: Joi.number().integer().optional().min(100).max(1024).default(1024),
  disk: Joi.number().integer().optional().min(-1).max(-1).default(-1),
  replica: Joi.number().integer().optional().min(1).max(2).default(1),
  image: Joi.string().optional().default(process.env.INSTANCE_DEFAULT_IMAGE),
  expiredAt: Joi.string()
    .isoDate()
    .optional()
    .default(() => new Date().toISOString()),
  primary_domain: Joi.string().domain().optional().valid(Joi.in("domains")),
  region: Joi.string()
    .valid(...Object.values(InstanceRegion))
    .optional(),
  domains: Joi.array()
    .items(Joi.string().domain())
    .optional()
    .default(() => []),
});

export const instanceValidSch = Joi.object({
  name: Joi.string()
    .optional()
    .min(3)
    .max(100)
    .lowercase()
    .custom(nameValidator),
  domains: Joi.array().items(Joi.string().domain()).optional(),
  region: Joi.string()
    .valid(...Object.values(InstanceRegion))
    .optional(),
  image: Joi.string().optional(),
  pattern: Joi.string()
    .optional()
    .valid(...Object.values(InstancePattern)),
  site_name: Joi.string().optional().min(2).max(100),
});

export const instanceUpdateSch = Joi.object({
  domains_add: Joi.array()
    .items(Joi.string().domain({ maxDomainSegments: 2 }))
    .optional(),
  domains_rm: Joi.array()
    .items(Joi.string().domain({ maxDomainSegments: 2 }))
    .optional(),
  image: Joi.string().optional(),
  site_name: Joi.string().optional().min(2).max(100),
  primary_domain: Joi.string().domain().optional(),
  status: Joi.string().valid(InstanceStatus.UP, InstanceStatus.DOWN),
});

export default instanceCreateValSch;

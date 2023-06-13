import { Global } from "../global.js";
import adminModel from "../model/admin.model.js";
import customerModel from "../model/customer.model.js";
import { instanceModel } from "../model/instance.model.js";
import { jobModel } from "../model/job.model.js";

export function hostGuard(req, res, next) {
  const knownHosts = Array.isArray(Global.env.KNOWN_HOSTS)
    ? Global.env.KNOWN_HOSTS
    : [Global.env.KNOWN_HOSTS];

  console.log(req.hostname);

  if (knownHosts.includes(req.hostname)) return next();

  return res
    .status(403)
    .json({ status: "error", message: "forbidden host", host: req.hostname });
}

export async function passGuard(req, res, next) {
  const token = req.headers.token;
  if (!token)
    return res
      .status(401)
      .json({ status: "error", message: "authentication failed" });

  const admin = await adminModel.findOne({ token });
  const customer = await customerModel.findOne({ "tokens.token": token });
  if (!admin && !customer)
    return res
      .status(401)
      .json({ status: "error", message: "authentication failed" });

  req.customer = customer;
  req.admin = admin;
  return next();
}

export function adminAccess(req, res, next) {
  if (req.admin) return next();

  return res.status(403).json({ status: "error", message: "Admin access!" });
}

export async function instanceAccess(req, res, next) {
  const instance_id = req.params.id;
  if (!instance_id) return next();

  if (req.admin) {
    req.instance = await instanceModel.findById(instance_id);
    return next();
  }

  const instance = await instanceModel.findOne({
    _id: instance_id,
    user: req.customer._id,
  });
  if (!instance)
    return res
      .status(403)
      .json({ status: "error", message: "customer only access own instances" });

  req.instance = instance;
  return next();
}

export async function jobAccess(req, res, next) {
  const job_id = req.params.id;
  if (!job_id) return next();

  if (req.admin) {
    req.job = await jobModel.findById(job_id);
    return next();
  }

  const job = await jobModel.findOne({
    _id: job_id,
    "instance.user": req.customer._id,
  });
  if (!job)
    return res
      .status(403)
      .json({ status: "error", message: "customer only access own jobs" });

  req.job = job;
  return next();
}

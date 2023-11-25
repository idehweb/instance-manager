import jwt from "jsonwebtoken";
import { Global } from "../global.js";
import adminModel from "../model/admin.model.js";
import customerModel from "../model/customer.model.js";
import { instanceModel } from "../model/instance.model.js";
import { jobModel } from "../model/job.model.js";
import axios from "axios";
import {
  addForwarded,
  axiosError2String,
  getEnv,
  getEnvFromMultiChoose,
  getMyIp,
  getSafeReferrer,
} from "../utils/helpers.js";
import { Types } from "mongoose";

export function hostGuard(req, res, next) {
  const knownHosts = Array.isArray(Global.env.KNOWN_HOSTS)
    ? Global.env.KNOWN_HOSTS
    : [Global.env.KNOWN_HOSTS];

  if (knownHosts.includes(req.hostname)) return next();

  return res
    .status(403)
    .json({ status: "error", message: "forbidden host", host: req.hostname });
}

export async function tokenGuard(req, res, next) {
  const whitePath = [...Global.whitelist_path.keys()];
  if (whitePath.some((p) => req.path.includes(p))) return next();
  try {
    const token =
      req.headers.authorization?.split("Bearer ")?.[1] ?? req.cookies?.auth;
    if (!token) return res.status(401).json({ message: "no valid token" });
    const user = jwt.decode(token, { complete: true, json: true });
    if (!user) return res.status(401).json({ message: "no valid token" });

    const userType =
      user.payload.type ?? (user.payload.role ?? "").split(":")?.[0];
    const targetUrl = getEnvFromMultiChoose(getSafeReferrer(req), "apiUrls");
    if (targetUrl === "*") {
      req.user = user.payload;
      req.user._id = req.user.id;
    } else {
      const { data } = await axios.post(
        targetUrl,
        {
          userType,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Forwarded-For": addForwarded(req, getMyIp()),
          },
        }
      );
      req.user = data.data;
    }
    req[userType] = req.user;

    req.user.id = req.user._id;
    if (req.user._id) req.user._id = new Types.ObjectId(req.user._id);
    req.authInfo = {
      from: targetUrl === "*" ? "http://anywhere.com/api/v1" : targetUrl,
    };
    return next();
  } catch (err) {
    console.error(axiosError2String(err));
    return res.status(401).json({ message: "unAuthorization , from auth api" });
  }
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
    const instance = await instanceModel.findById(instance_id);
    if (!instance)
      return res.status(404).json({ message: "not found instance" });
    req.instance = instance;
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

import jwt from "jsonwebtoken";
import { getEnv } from "../utils/helpers.js";
import { InstanceStatus, instanceModel } from "../model/instance.model.js";
import { SimpleError } from "../common/error.js";

export async function supGuard(req, res, next) {
  const token = req.get("authorization");
  try {
    const instance = await supVerifyToken(token);
    const instanceDoc = await instanceModel.findOne({
      _id: instance.id,
      status: InstanceStatus.UP,
      active: true,
    });

    if (!instanceDoc) throw new SimpleError("instance not found");
    req.instance = instanceDoc;
    return next();
  } catch (err) {
    return res
      .status(401)
      .json({ message: "received token is invalid\n" + err.message });
  }
}

export function supSignToken(id, extraData = {}) {
  const secret = getEnv("iam-supervisor-secret", { format: "string" });
  return new Promise((resolve, reject) => {
    jwt.sign({ ...extraData, id }, secret, (err, token) => {
      if (err) reject(err);
      return resolve(token);
    });
  });
}
export function supVerifyToken(token) {
  const secret = getEnv("iam-supervisor-secret", { format: "string" });
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, payload) => {
      if (err) reject(err);
      return resolve(payload);
    });
  });
}

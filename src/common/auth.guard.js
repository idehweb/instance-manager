import { Global } from "../global.js";

export function hostGuard(req, res, next) {
  const knownHosts = Array.isArray(Global.env.KNOWN_HOSTS)
    ? Global.env.KNOWN_HOSTS
    : [Global.env.KNOWN_HOSTS];

  console.log(req.hostname);
  return next();

  if (knownHosts.includes(req.hostname)) return next();

  return res
    .status(403)
    .json({ status: "error", message: "forbidden host", host: req.hostname });
}

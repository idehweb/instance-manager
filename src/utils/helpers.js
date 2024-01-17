import { customAlphabet } from "nanoid";
import { join } from "path";
import * as fs from "fs";
import { Global } from "../global.js";
import { networkInterfaces } from "os";
import { SimpleError } from "../common/error.js";
import { getIP, isConnect } from "../ws/utils.js";

export const createRandomName = customAlphabet(
  "0123456789asdfhjklmnbvcxzqwertyuiop"
);

export function getRemotePublicPath(path) {
  return join(Global.env.REMOTE_PUBLIC_PATH, path);
}

export function getPublicPath(path, remote) {
  return join(
    remote && !remote.isInLocal()
      ? Global.env.REMOTE_PUBLIC_PATH
      : Global.env.PUBLIC_PATH,
    path
  );
}

export function wait(sec) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

export function axiosError2String(error) {
  if (!error.isAxiosError) {
    return err2Str(error);
  }
  return JSON.stringify(
    {
      name: error.name,
      code: error.code,
      message: error.message,
      url: error?.request?._url || error?.config?.url,
      method: error.config?.method,
      res_data: error?.response?.data,
      req_data: error.config.data || error?.request?.data,
      res_headers: error?.response?.headers,
      req_headers: error?.config.headers,
      stack: error.stack,
    },
    null,
    "  "
  );
}

export function err2Str(error) {
  return convertToString(error);
}

export function convertToString(a, pretty = true) {
  try {
    if (a instanceof SimpleError)
      return `{ message : ${a.message} , stack : ${a.stack} }`;

    if (typeof a === "object") {
      const newA = {};
      Object.getOwnPropertyNames(a).forEach((key) => {
        newA[key] = a[key];
      });
      return !pretty ? JSON.stringify(newA) : JSON.stringify(newA, null, "  ");
    }
    return a?.toString() ?? String(a);
  } catch (err) {
    return `(convert failed because: ${err.message}) ${
      a?.toString() ?? String(a)
    }`;
  }
}

export function getNginxPublicPath(...path) {
  return join("/var/instance/static", ...path);
}

export function getInstanceStaticPath(instance) {
  return `${getRemotePublicPath(`static/${instance.pattern}`)}/*`;
}
export function getInstanceDbPath(instance) {
  return `${getRemotePublicPath(`db/${instance.pattern}`)}`;
}
export function getScripts(name) {
  return `${Global.env.SCRIPTS_PREFIX}${name}`;
}
export function getWorkerConfPath(...path) {
  return join("conf", ...path);
}
export async function isExist(path) {
  try {
    await fs.promises.access(path);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 *
 * @param {string} key
 * @param {{ format: 'array' | 'string' | 'auto',default:array|string }} param1
 * @returns
 */
export function getEnv(
  key,
  { format, default: def } = { format: "auto", default: null }
) {
  const value = Global.env[key.toUpperCase().replace(/-/g, "_")];
  const response = (() => {
    if (typeof value !== "string") return value;
    const newValue = value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v);

    switch (format) {
      case "auto":
        if (newValue.length <= 1) return value;
        else return newValue;
      case "array":
        return newValue;
      case "string":
        return value;
    }
  })();
  return response || def;
}

export function getEnvFromMultiChoose(value, from, def = "*") {
  const fromVal = typeof from === "string" ? Global[from] : from;
  return fromVal.size ? fromVal.get(value) ?? fromVal.get("*") : def;
}

export function getMyIp(canInternal = false) {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
      if (net.family === familyV4Value && (canInternal || !net.internal)) {
        return net.address;
      }
    }
  }

  return null;
}

export function addForwarded(req, ip) {
  const forwarded =
    (req.headers["x-forwarded-for"] ?? "").split(",").map((ip) => ip.trim()) ??
    [];

  // push
  if (ip) forwarded.push(ip);

  return forwarded.join(",");
}

export function normalizeRegion(region) {
  return region.toLowerCase();
}

export function getSlaveIps(region) {
  const normalRegion = normalizeRegion(region);
  if (!Global.slaveSockets[normalRegion]) return [];
  return [...new Set(Global.slaveSockets[normalRegion].values())];
}
export function getSlaveSocketOpt(region) {
  const normalRegion = normalizeRegion(region);
  if (!Global.slaveSockets[normalRegion]) return [];
  const sockets = Global.slaveSockets[normalRegion];
  const [id, socket] = sockets.entries().next().value ?? [];
  return { id, socket, ip: getIP(socket), isConnect: isConnect(socket) };
}

export function ifExist(path, cmd, endWith = ";") {
  return `if [ -e ${path} ]; then ${cmd}; fi${endWith}`;
}
export function ifNotExist(path, cmd, endWith = ";") {
  return `if [ ! -e ${path} ]; then ${cmd}; fi${endWith}`;
}

export function slugify(str = "") {
  return encodeURIComponent(str)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, (b, l, u) => `${l}-${u.toLowerCase()}`)
    .toLowerCase();
}

export function getSafeReferrer(req) {
  try {
    const hostname =
      req.headers["x-origin"] ??
      req.headers["x-referrer"] ??
      req.get("Referrer") ??
      req.hostname;
    return new URL(hostname).hostname;
  } catch (err) {
    return req.hostname;
  }
}

export function getNodeewebhub(req) {
  const { from } = req.authInfo;
  const url = new URL(from);
  return { url: url.origin, api_url: url.href.split("/auth")[0] };
}

export function regexFactory(
  str,
  { specChars, exposeSpec, excludeSpec, flags } = {}
) {
  let specialChars = specChars ?? [
    ".",
    "+",
    "*",
    "?",
    "/",
    "(",
    ")",
    "[",
    "]",
    "^",
    "$",
    "&",
    "|",
    "{",
    "}",
    "\\",
  ];

  // exclude
  specialChars.push(...(excludeSpec ?? []));

  // expose
  specialChars = specialChars.filter((c) => !(exposeSpec ?? []).includes(c));

  // unique
  specialChars = [...new Set(specialChars)];

  let pattern = "";
  for (const char of str) {
    if (specialChars.includes(char)) pattern += `\\${char}`;
    else pattern += char;
  }
  return new RegExp(pattern, flags);
}
export function log({
  chunk,
  isError = false,
  whenDifferent = false,
  labels = [],
  id,
  last_log,
  credentials = [],
  loggerTransports = [],
}) {
  const time = `[${new Date().toISOString()}]`;
  const chunkArr = Array.isArray(chunk) ? chunk : [chunk];

  let _msg = chunkArr.map((c) => convertToString(c, true)).join(" ");

  // filter credentials
  if (credentials.length) {
    _msg = _msg.replace(
      regexFactory(
        credentials
          .filter((c) => c)
          .map((c) => c.replace(/\|/g, "|"))
          .join("|"),
        {
          flags: "ig",
          exposeSpec: ["|"],
        }
      ),
      "***"
    );
  }

  // labels
  const _labels_msg = `${labels.map((l) => `[${l}]`).join(" ")}${
    labels.length ? " " : ""
  }${_msg}`;

  //   id
  const _id_labels_msg = id ? `${id} ${_labels_msg}` : _labels_msg;

  // error
  let _error_id_labels_msg = _id_labels_msg;
  let _error_labels_msg = _labels_msg;
  if (isError) {
    _error_id_labels_msg = `[error] ${_id_labels_msg}`;
    _error_labels_msg = `[error] ${_labels_msg}`;
  }

  const newLastLog = _error_id_labels_msg;
  if (last_log == _error_id_labels_msg && whenDifferent) return newLastLog;

  // time
  const _time_error_id_labels_msg = `${time} ${_error_id_labels_msg}`;
  const _time_labels_msg = `${time} ${_labels_msg}`;
  const _time_error_labels_msg = `${time} ${_error_labels_msg}`;

  for (const logger of loggerTransports) {
    logger({
      isError,
      _msg,
      _labels_msg,
      _id_labels_msg,
      _error_labels_msg,
      _error_id_labels_msg,
      _time_error_id_labels_msg,
      _time_labels_msg,
      _time_error_labels_msg,
    });
  }

  return newLastLog;
}

import { customAlphabet } from "nanoid";
import { join } from "path";
import * as fs from "fs";
import { Global } from "../global.js";

export const createRandomName = customAlphabet(
  "0123456789asdfhjklmnbvcxzqwertyuiop"
);
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
    console.log(error);
    return JSON.stringify(error, null, "  ");
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

export function getNginxPublicPath(...path) {
  return join("/var/instance/static", ...path);
}

export function getInstanceStaticPath(instance, remote) {
  return `${getPublicPath(`static/${instance.pattern}`, remote)}/*`;
}
export function getInstanceDbPath(instance, remote) {
  return `${getPublicPath(`db/${instance.pattern}`, remote)}`;
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

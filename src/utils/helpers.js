import { customAlphabet } from "nanoid";
import { join } from "path";
import { Global } from "../global.js";
export const createRandomName = customAlphabet(
  "0123456789asdfhjklmnbvcxzqwertyuiop"
);
export function getPublicPath(path, remote) {
  console.log(
    "get public path : ",
    remote,
    remote?.isInLocal(),
    remote && !remote.isInLocal(),
    Global.env.REMOTE_PUBLIC_PATH,
    Global.env.PUBLIC_PATH
  );
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
    return error;
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
  return join("/var/instanceManager", ...path);
}

export function getInstanceStaticPath(instance, remote) {
  return `${getPublicPath(`static/${instance.pattern}`, remote)}/*`;
}
export function getInstanceDbPath(instance, remote) {
  return `${getPublicPath(`db/${instance.pattern}`, remote)}`;
}

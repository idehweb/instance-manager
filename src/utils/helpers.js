import { customAlphabet } from "nanoid";
import { join } from "path";
import { Global } from "../global.js";
export const createRandomName = customAlphabet(
  "0123456789asdfhjklmnbvcxzqwertyuiop"
);
export function getPublicPath(path) {
  return join(Global.env.PUBLIC_PATH, path);
}

export function wait(sec) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

export function axiosError2String(error) {
  if (!error.isAxiosError) return JSON.stringify(error, null, "  ");
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

export function getInstanceStaticPath(instance) {
  return `${getPublicPath(`static/${instance.pattern}`)}/*`;
}
export function getInstanceDbPath(instance) {
  return `${getPublicPath(`db/${instance.pattern}`)}`;
}

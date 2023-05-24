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

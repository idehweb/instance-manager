import { Global } from "./src/global.js";
import dotenv from "dotenv";

function load() {
  const initBefore = process.env.INIT_BEFORE;
  if (initBefore) return (Global.env = process.env);

  dotenv.config({ path: "./env/.env" });
  Global.env = process.env;

  // string to array
  Global.env = Object.fromEntries(
    Object.entries(Global.env).map(([k, v]) => {
      const newValue = String(v)
        .split(",")
        .map((v) => v.trim());
      return [k, newValue.length > 1 ? newValue : v];
    })
  );
}

load();

if (!Global.env.NODE_ENV) Global.env.isLocal = true;
else {
  Global.env.isLocal = Global.env.NODE_ENV === "local";
  Global.env.isDev = Global.env.NODE_ENV === "development";
  Global.env.isPro = Global.env.NODE_ENV === "production";
}
console.log(Global.env);

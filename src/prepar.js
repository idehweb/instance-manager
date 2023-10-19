import { Global } from "./global.js";
import { getEnv } from "./utils/helpers.js";

export default async function prepare() {
  Global.apiUrls = new Map(
    getEnv("auth-api", { format: "array", default: [] }).map((v) =>
      v.split("=")
    )
  );
  console.log(Global.apiUrls);
}

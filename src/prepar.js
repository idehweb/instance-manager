import { Global } from "./global.js";
import { getEnv } from "./utils/helpers.js";

export default async function prepare() {
  Global.apiUrls = new Map(
    getEnv("auth-api", { format: "array", default: [] }).map((v) =>
      v.split("=")
    )
  );
  Global.defaultRegions = new Map(
    getEnv("default-region", { format: "array", default: [] }).map((v) =>
      v.split("=")
    )
  );

  Global.iam_supervisor_url = new Map(
    getEnv("iam-supervisor-url", { format: "array", default: [] }).map((v) =>
      v.split("=")
    )
  );
}

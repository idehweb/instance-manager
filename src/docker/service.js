import * as crypto from "crypto";

import { Global } from "../global.js";
import { Network } from "../common/network.js";
import { InstanceStatus } from "../model/instance.model.js";
export class Service {
  static async getSystemStatus() {}
  static async getServiceStatus(name) {
    return InstanceStatus.UP;
  }
  static getCreateServiceCommand({
    executer = "x-docker",
    maxRetries = 6,
    replica,
    memory,
    cpu,
    image,
    region,
    app_name,
    site_url,
    service_name,
  }) {
    const envs = {
      SHARED_PATH: "/app/shared",
      MONGO_URL: Global.env.MONGO_REMOTE_URL,
      DB_NAME: service_name,
      PORT: "3000",
      AUTH_SECRET: crypto.randomBytes(24).toString("hex"),
      LOG_TO_FILE: "true",
      APP_NAME: app_name,
      BASE_URL: site_url,
      MAX_NUM_OF_PROXY: 1,
    };

    const envArgs = Object.entries(envs)
      .filter(([k, v]) => v)
      .map(([k, v]) => `-e ${k}=${v}`)
      .join(" ");

    const mounts = {
      [`/var/instances/${service_name}/shared/`]: "/app/shared/",
      [`/var/instances/${service_name}/public/`]: "/app/public/",
      [`/var/instances/${service_name}/logs/`]: "/app/logs/",
      [`/var/instances/${service_name}/plugins/`]: "/app/plugins/",
    };

    const mountArgs = Object.entries(mounts)
      .map(([k, v]) => `--mount type=bind,source=${k},destination=${v}`)
      .join(" ");

    const network = ["nodeeweb_webnet", "nodeeweb_mongonet"];
    const networkArgs = network.map((n) => `--network ${n}`).join(" ");

    const limitation = {
      cpu,
      memory: memory === -1 ? -1 : `${memory}MB`,
    };
    const limitationArgs = Object.entries(limitation)
      .filter(([k, v]) => v !== -1)
      .map(([k, v]) => `--limit-${k}=${v}`)
      .join(" ");

    const restartPolicy =
      "--restart-condition any --restart-delay 30s --restart-max-attempts 8 --restart-window 1m30s";

    const updatePolicy = `--update-parallelism ${Math.max(
      1,
      Math.floor(replica / 2)
    )} --update-delay 30s`;

    // create docker service
    const dockerCreate =
      `docker service create --hostname ${service_name} --name ${service_name} --replicas ${replica} ${envArgs} ${limitationArgs} ${mountArgs} ${restartPolicy} ${updatePolicy} ${networkArgs} ${image}`.replace(
        /\n/g,
        " "
      );

    if (executer === "docker") return dockerCreate;
    return `x-docker --max-retries ${maxRetries} ${dockerCreate}`;
  }
  static getDeleteServiceCommand(name) {
    return `docker service rm ${name}`;
  }
  static getUpdateServiceCommand(
    name,
    configs,
    { executer = "x-docker", maxRetries = 6 } = {}
  ) {
    const cmd = `docker service update ${Object.entries(configs)
      .map(([k, v]) =>
        Array.isArray(v)
          ? `${v.map((sub_v) => `--${k} ${sub_v}`).join(" ")}`
          : `--${k} ${v}`
      )
      .join(" ")} ${name}`;

    if (executer === "docker") return cmd;
    return `x-docker --max-reties ${maxRetries} ${cmd}`;
  }
  static getAllCmd() {
    return 'docker service ls --format "{{.Name}} {{.Replicas}}"';
  }
  static async getAllServices(exec) {
    const all = await exec(this.getAllCmd());
    return all
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s);
  }
}

export default Service;

import * as crypto from "crypto";

import { Global } from "../global.js";
import { Network } from "../common/network.js";
import { InstanceStatus } from "../model/instance.model.js";
import { getEnv, getEnvFromMultiChoose } from "../utils/helpers.js";
import { supSignToken } from "../supervisor/utils.js";
import { normalizeArg } from "./utils.js";
import { Command } from "../common/Command.js";
export class Service {
  static async getSystemStatus() {}
  static async getServiceStatus(name) {
    return InstanceStatus.UP;
  }
  static async getCreateServiceCommand({
    executer = "x-docker",
    maxRetries = 6,
    replica,
    memory,
    cpu,
    image,
    app_name,
    site_url,
    dbName,
    dbURL,
    service_name,
    ownerId,
    nodeewebhub,
    server_socket,
    domains,
    ...instance
  }) {
    const credentials = [];

    const envs = {
      SHARED_PATH: "/app/shared",
      MONGO_URL: dbURL.href,
      DB_NAME: dbName,
      PORT: "3000",
      AUTH_SECRET: crypto.randomBytes(24).toString("hex"),
      LOG_TO_FILE: "true",
      APP_NAME: app_name,
      BASE_URL: site_url,
      MAX_NUM_OF_PROXY: 1,
      NODE_OPTIONS: `--max-old-space-size=${
        memory === -1 ? 10240 : memory * 1024
      }`,
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: crypto.randomBytes(24).toString("hex"),
      ADMIN_ID: ownerId,
      NODEEWEBHUB_API_BASE_URL: nodeewebhub.api_url,
      SERVER_HOST: site_url,
      SUPERVISOR_URL: getEnvFromMultiChoose(
        instance.region,
        "iam_supervisor_url"
      ),
      SUPERVISOR_TOKEN: await supSignToken(instance._id.toString(), instance),
    };

    // add credentials
    ["AUTH_SECRET", "ADMIN_PASSWORD", "SUPERVISOR_TOKEN"].map((k) =>
      credentials.push(envs[k])
    );
    credentials.push(dbURL.password);

    const envArgs = Object.entries(envs)
      .filter(([k, v]) => v)
      .map(([k, v]) => `-e "${k}=${v}"`)
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

    const network = [
      `name=nodeeweb_webnet,${domains.map((d) => `alias=${d}.nwi`).join(",")}`,
      "nodeeweb_mongonet",
    ];
    const networkArgs = network.map((n) => `--network "${n}"`).join(" ");

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

    let cmd;
    if (executer === "docker") cmd = dockerCreate;
    else cmd = `x-docker --max-retries ${maxRetries} ${dockerCreate}`;

    return new Command({ cmd, credentials });
  }
  static getDeleteServiceCommand(name) {
    return new Command({ cmd: `docker service rm ${name}` });
  }
  static _getUpdateServiceCommand(
    name,
    configs,
    { executer = "x-docker", maxRetries = 6, credentials } = {
      executer: "x-docker",
      maxRetries: 6,
    }
  ) {
    let cmd = `docker service update ${Object.entries(configs)
      .map(([k, v]) =>
        Array.isArray(v)
          ? `${v.map((sub_v) => `--${k} ${normalizeArg(sub_v)}`).join(" ")}`
          : `--${k} ${normalizeArg(v)}`
      )
      .join(" ")} ${name}`;

    if (executer !== "docker")
      cmd = `x-docker --max-reties ${maxRetries} ${cmd}`;

    return new Command({ cmd, credentials });
  }

  static async getInspect(name, executer) {
    try {
      const raw = await Service.getRawInspect(name, executer);
      return raw?.[0]?.Spec ?? {};
    } catch (err) {}
  }
  static async getRawInspect(name, executer) {
    const inspectCmd = `docker service inspect ${name} -f json`;
    const inspect = JSON.parse(
      (await executer(new Command({ cmd: inspectCmd, out: false }))).trim()
    );
    return inspect;
  }

  static serviceUpdate(
    {
      envs_add,
      envs_rm,
      mounts_add,
      mounts_rm,
      networks_add,
      networks_rm,
      configs_add,
      configs_rm,
    },
    { name, executer, maxRetries, credentials }
  ) {
    const args = {};
    if (envs_add) {
      args["env-add"] = Object.entries(envs_add)
        .filter(([k, v]) => v)
        .map(([k, v]) => `${k}=${v}`);
    }

    if (envs_rm) {
      args["env-rm"] = envs_rm.map((n) => `${n}`);
    }

    if (mounts_add) {
      args["mount-add"] = Object.entries(mounts_add).map(
        ([k, v]) => `type=bind,source=${k},destination=${v}`
      );
    }

    if (mounts_rm) {
      args["mount-rm"] = mounts_rm.map((n) => `${n}`);
    }

    if (configs_add) {
      args["config-add"] = Object.entries(configs_add)
        .filter(([k, v]) => v !== -1)
        .map(([k, v]) => `source=${k},destination=${v}`);
    }

    if (configs_rm) {
      args["config-rm"] = configs_rm.map((n) => `${n}`);
    }

    if (networks_add) {
      args["network-add"] = networks_add.map((n) => {
        if (typeof n === "string") return n;
        return Object.entries(n)
          .flatMap(([k, v]) => {
            if (Array.isArray(v)) {
              return v.map((sv) => `${k}=${sv}`);
            }
            return `${k}=${v}`;
          })
          .join(",");
      });
    }

    if (networks_rm) {
      args["network-rm"] = networks_rm.map((n) => `${n}`);
    }

    return Service._getUpdateServiceCommand(name, args, {
      executer,
      maxRetries,
      credentials,
    });
  }

  static getAllCmd() {
    return new Command({
      cmd: 'docker service ls --format "{{.Name}} {{.Replicas}}"',
      out: false,
    });
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

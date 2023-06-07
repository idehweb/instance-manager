import { Global } from "../global.js";
import { InstanceRegion } from "../model/instance.model.js";
export class Remote {
  constructor(region) {
    this.region = region;
  }
  #findIP() {
    let ip;
    switch (this.region) {
      case InstanceRegion.IRAN:
        ip = Global.env.IRAN_IP;
        break;
      case InstanceRegion.GERMAN:
        ip = Global.env.GERMAN_IP;
        break;
    }
    return ip;
  }
  isInLocal() {
    return this.#findIP() === Global.env.NODEEWEB_IP;
  }
  cpFromLocal(localPath, remotePath) {
    const ip = this.#findIP();
    if (ip === Global.env.NODEEWEB_IP)
      return `cp -r ${localPath} ${remotePath}`;

    return `scp -i ${Global.env.SSH_PRIVATE_KEY_PATH} -o "StrictHostKeyChecking no" -r ${localPath} root@${ip}:${remotePath}`;
  }
  cpFromRemote(localPath, remotePath) {
    const ip = this.#findIP();
    if (ip === Global.env.NODEEWEB_IP)
      return `cp -r ${remotePath} ${localPath}`;

    return `scp -i ${Global.env.SSH_PRIVATE_KEY_PATH} -o "StrictHostKeyChecking no" -r root@${ip}:${remotePath} ${localPath}`;
  }
  cmd(cmd) {
    const ip = this.#findIP();
    if (ip === Global.env.NODEEWEB_IP) return cmd;
    return `ssh -i ${Global.env.SSH_PRIVATE_KEY_PATH} -o "StrictHostKeyChecking no" root@${ip} "${cmd}"`;
  }
  autoDiagnostic(cmd) {
    cmd = cmd.trim();
    console.log(cmd);

    if (!this.isInLocal()) {
      cmd = cmd.replace(
        new RegExp(Global.env.MONGO_URL, "g"),
        Global.env.MONGO_REMOTE_URL
      );
    }

    // if (cmd.startsWith("cp")) {
    //   const [, localPath, remotePath] = /^cp -?r? ?(.+) (.+)$/.exec(cmd);
    //   return this.cpFromLocal(localPath, remotePath);
    // }
    if (cmd.startsWith("docker")) {
      if (!this.isInLocal()) {
        cmd =
          `docker --context ${
            Global.env[`DOCKER_${this.region.toUppercase()}_CTX`]
          }` + cmd.slice(6);
      }
      return cmd;
    }
    return this.cmd(cmd);
  }
}

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
  cpFromLocal(localPath, remotePath) {
    const ip = this.#findIP();
    if (ip === Global.env.NODEEWEB_IP)
      return `cp -r ${localPath} ${remotePath}`;

    return `scp -i ${Global.env.SSH_PRIVATE_KEY} -r ${localPath} root@${ip}:${remotePath}`;
  }
  cpFromRemote(localPath, remotePath) {
    const ip = this.#findIP();
    if (ip === Global.env.NODEEWEB_IP)
      return `cp -r ${remotePath} ${localPath}`;

    return `scp -i ${Global.env.SSH_PRIVATE_KEY} -r root@${ip}:${remotePath} ${localPath}`;
  }
  cmd(cmd) {
    const ip = this.#findIP();
    if (ip === Global.env.NODEEWEB_IP) return cmd;
    return `ssh -i ${Global.env.SSH_PRIVATE_KEY} root@${ip} ${cmd}`;
  }
  autoDiagnostic(cmd) {
    cmd = cmd.trim();
    if (cmd.startsWith("cp")) {
      const [, localPath, remotePath] = /^cp -?r? ?(.+) (.+)$/;
      return this.cpFromLocal(localPath, remotePath);
    }
    if (cmd.startsWith("docker")) {
      return cmd;
    }
    if (cmd.startsWith("mongo")) {
      cmd = cmd.replace(Global.env.MONGO_URL, Global.env.MONGO_REMOTE_URL);
    }
    return this.cmd(cmd);
  }
}

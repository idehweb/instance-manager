import * as fs from "fs";
import { getPublicPath } from "../utils/helpers.js";
import { InstanceStatus, instanceModel } from "../model/instance.model.js";
import { Global } from "../global.js";
import exec from "../utils/exec.js";
import { CronJob } from "cron";

class ExpireService {
  base_pattern = new String(
    fs.readFileSync(getPublicPath("nginx/suspend.conf"), { encoding: "utf8" })
  );

  constructor() {
    this.conf_name = `00-suspend.conf`;
    this.conf_path = Global.env.isPro
      ? `/var/nginx/sites-available/${this.conf_name}`
      : getPublicPath(`nginx/test/${this.conf_name}`);
    this.conf_ln_path = Global.env.isPro
      ? `/var/nginx/sites-enabled/${this.conf_name}`
      : getPublicPath(`nginx/test/test_ln/${this.conf_name}`);
    this.init().then();
  }

  async init() {
    // check nginx conf file
    const isExists = fs.existsSync(this.conf_path);
    if (!isExists) {
      // create file
      await this.#createDemo();
    }

    this.cronJob = new CronJob({
      cronTime: "0 0 * * *",
      onTick: this.#checkAndAct,
      start: true,
    });

    this.cronJob.start();
  }

  async #checkAndAct() {
    // get expired instances
    const expiredInstances = await instanceModel.find({
      expiredAt: { $lt: new Date() },
    });

    if (!expiredInstances.length) return;

    // 1. add expired domains to conf
    const domains = [
      ...new Set(expiredInstances.map((doc) => doc.primary_domain)),
    ];
    await this.#addDomains(...domains);

    // 2. change db status
    await instanceModel.updateMany(
      { _id: { $in: expiredInstances.map((doc) => doc._id) } },
      { $set: { status: InstanceStatus.EXPIRED } }
    );

    // 3. restart nginx
    await this.#restartNginx();
  }

  async #createDemo() {
    const my_conf = this.base_pattern
      .replace(/%INSTANCE%/g, "suspend")
      .replace(/%STATIC_HTML_ROOT_PATH%/g, getPublicPath("html"))
      .replace(/%STATIC_HTML_INDEX%/g, "index.html");

    await fs.promises.writeFile(this.conf_path, my_conf, { encoding: "utf8" });
    await fs.promises.link(this.conf_path, this.conf_ln_path);
  }

  #transferConf(conf, cb) {
    return conf
      .split("\n")
      .map((line) => {
        if (line.includes("server_name ")) {
          // server name line
          let domains = [];
          for (let word of line.split(" ")) {
            if (!word || word == "server_name") continue;
            word = word.replace(";", "");
            domains.push(word);
          }
          line = cb(domains);
        }
        return line;
      })
      .join("\n");
  }

  async #addDomains(...new_domains) {
    const conf = await fs.promises.readFile(this.conf_path, {
      encoding: "utf8",
    });

    const new_conf = this.#transferConf(conf, (domains) => {
      domains = [...new Set([...domains, ...new_domains])];
      return `    server_name ${domains.join(" ")};`;
    });

    await fs.promises.writeFile(this.conf_path, new_conf, "utf8");
  }
  async #removeDomains(...rm_domains) {
    const conf = await fs.promises.readFile(this.conf_path, {
      encoding: "utf8",
    });

    const new_conf = this.#transferConf(conf, (domains) => {
      domains = domains.filter((d) => !rm_domains.includes(d));
      return `    server_name ${domains.join(" ")};`;
    });

    await fs.promises.writeFile(this.conf_path, new_conf, "utf8");
  }

  async #restartNginx() {
    const docker_cmd = `docker service update --force nodeeweb_webproxy`;
    await exec(docker_cmd, {
      onLog(message, isError) {
        if (!isError) return console.log("#Expire Service#", message);
        console.error("#Expire Service#", message);
      },
    });
  }

  async expire(instance) {
    // 1. add nginx server name
    await this.#addDomains(instance.primary_domain);

    // 2. change db status
    await instanceModel.findByIdAndUpdate(instance._id, {
      $set: { status: InstanceStatus.EXPIRED },
    });

    // 3. restart nginx
    await this.#restartNginx();
  }
  async active(instance, expiredAt) {
    // 1. remove nginx server name
    await this.#removeDomains(instance.primary_domain);

    // 2. change db status
    await instanceModel.findByIdAndUpdate(instance._id, {
      $set: { status: InstanceStatus.UP, expiredAt },
    });

    // 3. restart nginx
    await this.#restartNginx();
  }
}

const expireService = new ExpireService();
export default expireService;

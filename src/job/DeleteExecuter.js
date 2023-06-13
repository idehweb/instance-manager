import { BaseExecuter, Global } from "../global.js";
import { Service as DockerService } from "../docker/service.js";
import network, { NetworkCDN } from "../common/network.js";
import { getPublicPath } from "../utils/helpers.js";
import { Remote } from "../utils/remote.js";
import { InstanceRegion } from "../model/instance.model.js";
import { join } from "path";
export default class DeleteExecuter extends BaseExecuter {
  constructor(job, instance, exec, log) {
    super(job, instance, exec, log);
    this.remote = new Remote(this.instance.region);
  }

  async service_remove() {
    const cmd = DockerService.getDeleteServiceCommand(this.instance_name);
    await this.exec(cmd);
  }

  async unregister_cdn() {
    this.log(
      "Removing dns records " +
        this.instance.domains.map(({ content }) => content).join(" , ")
    );
    await network.disconnectInstance(
      this.instance.region === InstanceRegion.IRAN
        ? NetworkCDN.ARVAN
        : NetworkCDN.CF,
      this.instance.primary_domain,
      this.instance.domains
    );
  }

  async backup_static() {
    const static_path = `/var/instances/${this.instance_name}`;
    const backup_path = `${getPublicPath(
      `backup/${this.instance_name}`,
      this.remote
    )}`;
    const backup_cmd = `mkdir -p ${backup_path} && zip -r ${join(
      backup_path,
      "static.zip"
    )}  ${static_path}`;
    this.log("backup instance static files");
    await this.exec(backup_cmd);
  }
  async rm_static() {
    const static_path = `/var/instances/${this.instance_name}`;
    const cmd = `rm -r ${static_path}`;
    await this.exec(cmd);
  }

  async backup_db() {
    this.log("backup instance db");
    const backup_cmd = `mongodump --db ${
      this.instance_name
    } --out ${getPublicPath(`backup/${this.instance_name}/db`, this.remote)} ${
      Global.env.MONGO_URL
    }`;
    await this.exec(backup_cmd);
  }
  async rm_db() {
    this.log("Delete instance db");
    const delete_cmd = `mongosh --quiet ${Global.env.MONGO_URL} --eval "use ${this.instance_name}" --eval "db.dropDatabase()"`;
    await this.exec(delete_cmd);
  }
}

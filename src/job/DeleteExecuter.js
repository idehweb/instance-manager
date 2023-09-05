import { Global } from "../global.js";
import { Service as DockerService } from "../docker/service.js";
import network, { Network, NetworkCDN } from "../common/network.js";
import { createRandomName, getPublicPath, ifExist } from "../utils/helpers.js";
import { Remote } from "../utils/remote.js";
import {
  InstanceRegion,
  InstanceStatus,
  instanceModel,
} from "../model/instance.model.js";
import { join } from "path";
import { BaseExecuter } from "./BaseExecuter.js";
import Nginx from "../common/nginx.js";
export default class DeleteExecuter extends BaseExecuter {
  constructor(job, instance, log_file) {
    super(job, instance, log_file);
  }

  async service_remove() {
    const listServices = await DockerService.getAllServices(this.exec);
    const myService = listServices.find((s) => s.includes(this.instance_name));

    if (!myService) return this.log("service removed before");

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
      {
        defaultDomain: Network.getDefaultDomain({
          name: this.instance.name,
          region: this.instance.region,
        }),
        server_ip: this.instance.server_ip,
        logger: { log: this.log },
        domains: this.instance.domains.map(({ content }) => content),
      }
    );
  }

  async backup_static() {
    const static_path = `/var/instances/${this.instance_name}`;
    const backup_path = `${getPublicPath(
      `backup/${this.instance_name}`,
      this.remote
    )}`;
    const backup_cmd = `mkdir -p ${backup_path} && zip ${
      Global.env.isPro ? "-q" : ""
    } -r ${join(backup_path, "static.zip")}  ${static_path}`;
    this.log("backup instance static files");
    await this.exec(ifExist(static_path, backup_cmd));
  }
  async rm_static() {
    const static_path = `/var/instances/${this.instance_name}`;
    const cmd = `rm -r ${static_path}`;
    await this.exec(ifExist(static_path, cmd));
  }

  async backup_db() {
    this.log("backup instance db");
    const backup_cmd = `mongodump --db ${
      this.instance_name
    } --out ${getPublicPath(`backup/${this.instance_name}/db`, this.remote)} ${
      Global.env.isPro ? "--quiet" : ""
    } ${Global.env.MONGO_URL}`;
    await this.exec(backup_cmd);
  }
  async rm_db() {
    this.log("Delete instance db");
    const delete_cmd = `mongosh --quiet ${Global.env.MONGO_URL} --eval "use ${this.instance_name}" --eval "db.dropDatabase()"`;
    await this.exec(delete_cmd);
  }

  async rm_domain_cert() {
    if (this.instance.domains.length === 1) return;

    const nginx = new Nginx(this.exec);

    const defaultDomain = Network.getDefaultDomain({
      name: this.instance.name,
      region: this.instance.region,
    });

    const domains = this.instance.domains
      .map(({ content }) => content)
      .filter((d) => d !== defaultDomain);

    await nginx.rmDomainsCert(domains);
    this.log(`remove certs for domains: ${domains.join(" ")}`);
  }
  async rm_domain_config() {
    if (this.instance.domains.length === 1) return;

    const nginx = new Nginx(this.exec);

    const defaultDomain = Network.getDefaultDomain({
      name: this.instance.name,
      region: this.instance.region,
    });

    const domains = this.instance.domains
      .map(({ content }) => content)
      .filter((d) => d !== defaultDomain);

    await nginx.rmDomainsConf(domains);
    this.log(`remove nginx config for domains: ${domains.join(" ")}`);
  }

  async sync_db(isError = false) {
    if (isError) return this.instance;

    const newInsDoc = await instanceModel.findByIdAndUpdate(
      this.instance._id,
      {
        status: InstanceStatus.DELETED,
      },
      { new: true }
    );

    // set instance
    this.instance = newInsDoc._doc;
    return this.instance;
  }
}

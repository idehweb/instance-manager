import { Global } from "../global.js";
import { Service as DockerService } from "../docker/service.js";
import network, { Network, NetworkCDN } from "../common/network.js";
import { getPublicPath, ifExist } from "../utils/helpers.js";
import {
  InstanceRegion,
  InstanceStatus,
  instanceModel,
} from "../model/instance.model.js";
import { join } from "path";
import { BaseExecuter } from "./BaseExecuter.js";
import Nginx from "../common/nginx.js";
import DBCmd from "../db/index.js";
import { JobStatus } from "../model/job.model.js";
import { nameToDir } from "./utils.js";
export default class DeleteExecuter extends BaseExecuter {
  constructor(job, instance, log_file, logger) {
    super(job, instance, log_file, logger);
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
    const static_path = nameToDir(this.instance_name);
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
    const static_path = nameToDir(this.instance_name);
    const cmd = `rm -r ${static_path}`;
    await this.exec(ifExist(static_path, cmd));
  }

  async rm_links() {
    const targets = this.instance.domains
      .map((d) => d.content)
      .map((d) => nameToDir(d));
    await this.exec(
      targets
        .map((target, i, arr) =>
          ifExist(target, `rm -r ${target}`, i < arr.length - 1 ? "&&" : ";")
        )
        .join(" ")
    );
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
    const cmd_with_mongosh = `mongosh --quiet ${Global.env.MONGO_URL} --eval "use ${this.instance_name}" --eval "db.dropDatabase()"`;
    const cmd_with_x_mongo = `x-mongo drop-db ${this.instance_name}`;
    await this.exec(cmd_with_x_mongo);
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

  async rm_user_from_db() {
    await this.exec(DBCmd.deleteUser({ db: this.instance.db, user: "owner" }));
    this.log("rm user from db");
  }

  async sync_db(isError = false) {
    let set_body;
    if (isError) {
      set_body = {
        "jobs.$.status": JobStatus.ERROR,
      };
    } else {
      set_body = {
        status: InstanceStatus.DELETED,
        "jobs.$.status": JobStatus.SUCCESS,
      };
    }

    const newInsDoc = await instanceModel.findOneAndUpdate(
      { _id: this.instance._id, "jobs._id": this.job._id },
      set_body,
      { new: true }
    );

    // set instance
    this.instance = newInsDoc._doc;

    // super
    const superRes = await super.sync_db(isError);

    return { ...superRes, instance: this.instance };
  }
}

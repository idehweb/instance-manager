import * as fs from "fs";
import { Service as DockerService } from "../docker/service.js";
import {
  InstanceRegion,
  InstanceStatus,
  instanceModel,
} from "../model/instance.model.js";
import network, { Network, NetworkCDN } from "../common/network.js";
import { BaseExecuter } from "./BaseExecuter.js";
import {
  getNginxPublicPath,
  getScripts,
  getWorkerConfPath,
  isExist,
} from "../utils/helpers.js";
export default class UpdateExecuter extends BaseExecuter {
  constructor(job, instance, log_file) {
    super(job, instance, log_file);
  }

  async changeStatus() {
    const docker_cmd = DockerService.getUpdateServiceCommand(
      this.instance_name,
      {
        replicas:
          this.job.update_query.status === InstanceStatus.UP
            ? this.instance.replica
            : 0,
      }
    );
    await this.exec(docker_cmd);
  }

  async changeDomains() {
    let { domains_rm, domains_add } = { ...this.job.update_query };
    domains_rm = domains_rm
      ? [
          ...new Set(
            domains_rm.filter(
              (d) =>
                d !== this.instance.primary_domain &&
                this.instance.domains.includes(d)
            )
          ),
        ]
      : [];
    domains_add = domains_add ? [...new Set(domains_add)] : [];

    let new_domains = this.instance.domains ?? [];
    if (domains_add.length)
      this.log(`Creating new domains: ${domains_add.join(" , ")}`);
    if (domains_rm.length)
      this.log(`Removing domains: ${domains_add.join(" , ")}`);

    new_domains.push(
      await network.changeCustomDomains(
        this.instance.region === InstanceRegion.IRAN
          ? NetworkCDN.ARVAN
          : NetworkCDN.CF,
        {
          primary_domain: this.instance.primary_domain,
          logger: { log: this.log },
          content: this.instance.server_ip,
          port: 80,
          domains_add,
          domains_rm,
        }
      )
    );
    new_domains = new_domains.filter(
      ({ content }) => !domains_rm.includes(content)
    );

    new_domains = Object.values(
      new_domains.reduce((prev, curr) => {
        prev[curr.content] = curr;
        return prev;
      }, {})
    );
    this.instance.new_domains = new_domains;
  }

  async changeImage() {}

  async createCertificate() {
    const primary_domain = this.job.update_query.primary_domain;
    const certPath = getWorkerConfPath("nginx", "site_certs", primary_domain);

    try {
      await this.exec(`${getScripts("exist")} ${certPath}`);
      // cert exists before
      return;
    } catch (err) {}

    // remove record
    await network.rmRecord(this.instance.region, primary_domain, { name: "@" });

    // add record
    await network.addRecord(this.instance.region, primary_domain, {
      type: "A",
      name: "@",
      content: Network.getIP(this.instance.region),
      isProxy: false,
    });

    // run certbot : domain , result path , root path
    await this.exec(
      `${getScripts(
        "certbot"
      )} ${primary_domain} ${certPath} ${getNginxPublicPath(".")}`
    );
  }
  async changeCDNPrimaryDomain() {}
  async changeDockerPrimaryDomain() {
    const primary_domain = this.job.update_query.primary_domain;
    const instance_cmd = DockerService.getUpdateServiceCommand(
      this.instance_name,
      {
        "env-add": [
          `BASE_URL=https://${primary_domain}`,
          `SHOP_URL=https://${primary_domain}/`,
        ],
      }
    );

    await this.exec(
      `${getScripts("instance-nginx-conf")} ${primary_domain} ${
        this.instance_name
      } ${getWorkerConfPath("nginx", "sites-available")}`
    );

    await this.exec(instance_cmd);
  }
  async changeProxyPrimaryDomain() {}
  async sync_db(isError = false) {
    const set_body = {};

    set_body.status = isError
      ? InstanceStatus.JOB_ERROR
      : this.job.update_query.status;
    set_body.domains = this.instance.new_domains;
    set_body.image = this.job.update_query.image;
    set_body.primary_domain = this.job.update_query.primary_domain;

    const newInsDoc = await instanceModel.findByIdAndUpdate(
      this.instance._id,
      {
        $set: set_body,
      },
      { new: true }
    );

    // set instance
    this.instance = newInsDoc._doc;
    return this.instance;
  }
}

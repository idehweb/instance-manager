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

  async changeStatus() {
    const docker_cmd = DockerService._getUpdateServiceCommand(
      this.instance_name,
      {
        replicas:
          this.job.update_query.status === InstanceStatus.UP
            ? this.instance.replica
            : 0,
      },
      {
        executer: "x-docker",
        maxRetries: 6,
      }
    );
    await this.exec(docker_cmd);
  }

  async parse_update_query() {
    const query = { ...this.job.update_query };

    const myDomains = this.instance.domains.map(({ content }) => content);

    query.domains_rm = query.domains_rm
      ? [
          ...new Set(
            query.domains_rm.filter(
              (d) => d !== this.instance.primary_domain && myDomains.includes(d)
            )
          ),
        ]
      : [];

    query.domains_add = query.domains_add
      ? [...new Set(query.domains_add.filter((d) => !myDomains.includes(d)))]
      : [];

    this.job.parsed_update_query = query;
  }
  async update_domain_cdn() {
    const { domains_rm = [], domains_add = [] } = this.job.parsed_update_query;

    if (!domains_add.length && !domains_rm.length) return;

    let new_domains = this.instance.domains ? [...this.instance.domains] : [];

    if (domains_add.length)
      this.log(`Going to create new domains: ${domains_add.join(" , ")}`);
    if (domains_rm.length)
      this.log(`Going to remove domains: ${domains_rm.join(" , ")}`);

    new_domains.push(
      ...(await network.changeCustomDomains(
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
      ))
    );
    new_domains = new_domains.filter(
      ({ content }) => !domains_rm.includes(content)
    );

    this.instance.new_domains = new_domains;
  }
  async update_domain_cert() {
    const { domains_rm = [], domains_add = [] } = this.job.parsed_update_query;

    if (!domains_add.length && !domains_rm.length) return;

    if (domains_add.length) {
      this.log(`Going to add certs for domains: ${domains_add.join(" , ")}`);
      await this.exec(`x-cert add ${domains_add.map((d) => `-d ${d}`)}`);
    }
    if (domains_rm.length) {
      this.log(`Going to remove certs for domains: ${domains_rm.join(" , ")}`);
      await this.exec(`x-cert rm ${domains_rm.map((d) => `-d ${d}`)}`);
    }
  }
  async update_domain_config() {
    const { domains_rm = [], domains_add = [] } = this.job.parsed_update_query;

    if (!domains_add.length && !domains_rm.length) return;

    if (domains_add.length) {
      this.log(`Going to add config for domains: ${domains_add.join(" , ")}`);
      await this.exec(
        `x-nginx add ${domains_add.map((d) => `-d ${d}`)} -n ${
          this.instance_name
        }`
      );
    }
    if (domains_rm.length) {
      this.log(`Going to remove config for domains: ${domains_rm.join(" , ")}`);
      await this.exec(`x-nginx rm ${domains_rm.map((d) => `-d ${d}`)}`);
    }
  }

  async change_primary_domain() {
    const primary_domain = this.job.update_query.primary_domain;
    const site_url = `https://${primary_domain}`;
    const instance_cmd = DockerService.serviceUpdate(
      {
        envs_add: {
          BASE_URL: site_url,
          SERVER_HOST: site_url,
        },
      },
      {
        name: this.instance_name,
        executer: "x-docker",
        maxRetries: 6,
      }
    );
    await this.exec(instance_cmd);
  }

  async update_site_name() {
    const site_name = this.job.update_query.site_name;

    const dockerCmd = DockerService.serviceUpdate(
      {
        envs_add: {
          APP_NAME: site_name,
        },
      },
      { name: this.instance_name }
    );
    await this.exec(dockerCmd);
  }

  async sync_db(isError = false) {
    let set_body;

    if (isError) {
      set_body = { status: InstanceStatus.JOB_ERROR };
    } else {
      set_body = {
        status: this.job.update_query.status,
        domains: this.instance.new_domains,
        image: this.job.update_query.image,
        primary_domain: this.job.update_query.primary_domain,
      };
      if (set_body.primary_domain) {
        const favName =
          this.instance.favicon?.replace(/https?:\/\/[^/]+/, "") ??
          "/favicon.ico";
        set_body.favicon = `https://${set_body.primary_domain}${favName}`;
      }
    }

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

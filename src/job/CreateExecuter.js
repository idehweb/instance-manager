import {
  axiosError2String,
  getInstanceDbPath,
  getInstanceStaticPath,
  wait,
} from "../utils/helpers.js";
import { Service as DockerService } from "../docker/service.js";
import network, { Network, NetworkCDN } from "../common/network.js";
import { Global } from "../global.js";
import { BaseExecuter } from "./BaseExecuter.js";
import Nginx from "../common/nginx.js";
import { instanceModel } from "../model/instance.model.js";

export default class CreateExecuter extends BaseExecuter {
  constructor(job, instance, log_file) {
    super(job, instance, log_file);
  }

  async create_static_dirs() {
    // create public
    const createFolders = `mkdir -p /var/instances/${this.instance_name} && mkdir -p /var/instances/${this.instance_name}/shared && mkdir -p /var/instances/${this.instance_name}/public`;
    await this.exec(createFolders);
  }

  async copy_static() {
    if (!this.instance.pattern) return;

    // copy static files
    const copyStatics = `cp -r ${getInstanceStaticPath(
      this.instance,
      this.remote
    )} /var/instances/${this.instance_name}/public`;
    await this.exec(copyStatics);
  }
  async docker_create() {
    // check docker services
    const listServices = await DockerService.getAllServices(this.exec);
    const myService = listServices.find((s = "") => {
      return s.includes(this.instance_name);
    });

    // create docker service
    const dockerCreateCmd = DockerService.getCreateServiceCommand(
      this.instance_name,
      this.instance.name,
      {
        replica: this.instance.replica,
        memory: this.instance.memory,
        image: this.instance.image,
        cpu: this.instance.cpu,
        region: this.instance.region,
        site_name: this.instance.site_name,
      }
    );
    // create if not exist
    if (myService) {
      if (myService.split(" ")[1].startsWith("0")) {
        // must remove service
        const dockerRm = `docker service rm ${this.instance_name}`;
        await this.exec(dockerRm);

        // create new one
        await wait(0.5);
        await this.exec(dockerCreateCmd);
      } else {
        // exists service
        this.log("Service created before");
      }
    } else {
      await this.exec(dockerCreateCmd);
    }
  }

  async domain_certs() {
    if (this.instance.domains.length <= 1) return;

    const nginx = new Nginx(this.exec);

    const defaultDomain = Network.getDefaultDomain({
      name: this.instance.name,
      region: this.instance.region,
    });

    const domains = this.instance.domains
      .map(({ content }) => content)
      .filter((d) => d !== defaultDomain);

    await nginx.addDomainsCert(domains);
    this.log(`add certs for domains: ${domains.join(" ")}`);
  }

  async nginx_domain_config() {
    if (this.instance.domains.length <= 1) return;

    const nginx = new Nginx(this.exec);

    const defaultDomain = Network.getDefaultDomain({
      name: this.instance.name,
      region: this.instance.region,
    });

    const domains = this.instance.domains
      .map(({ content }) => content)
      .filter((d) => d !== defaultDomain);

    await nginx.addDomainsConf(domains, this.instance_name);
    this.log(`add nginx config for domains: ${domains.join(" ")}`);
  }
  async register_cdn() {
    const ips = [...Global.ips[this.instance.region]];
    const server_ip = ips[0];
    const defaultDomain = Network.getDefaultDomain({
      name: this.instance.name,
      region: this.instance.region,
    });

    // ns record
    try {
      this.log("Connect Instance Networks");
      this.instance.domains_result = await network.connectInstance(
        Network.region2CDN(this.instance.region),
        {
          defaultDomain,
          domains: this.instance.domains.map(({ content }) => content),
          logger: { log: this.log },
          content: server_ip,
        }
      );
    } catch (err) {
      this.log("Axios Error in DNS:\n" + axiosError2String(err));
      throw err;
    }
    this.instance.server_ip = server_ip;
  }
  async restore_demo() {
    if (!this.instance.pattern) return;

    this.log(`initial db base on : ${this.instance.pattern}`);
    const cmd = `mongorestore --db ${this.instance_name} ${
      Global.env.MONGO_REMOTE_URL
    } ${getInstanceDbPath(this.instance, this.remote)}`;
    await this.exec(cmd);
  }

  async sync_db(isError = false) {
    let set_body = {},
      addFields_body;

    if (isError) {
      addFields_body = {
        status: InstanceStatus.JOB_ERROR,
        name: { $concat: ["$name", `-errored-${createRandomName(8)}`] },
        old_name: "$name",
        active: false,
      };
      set_body = null;
    } else {
      set_body.status = InstanceStatus.UP;
      set_body.server_ip = this.instance.server_ip;

      // add custom domain
      if (this.instance.domains_result)
        set_body.domains = this.instance.domains_result;
    }

    const newInsDoc = await instanceModel.findByIdAndUpdate(
      this.instance._id,
      set_body
        ? {
            $set: set_body,
          }
        : addFields_body
        ? [
            {
              $addFields: addFields_body,
            },
          ]
        : {},
      { new: true }
    );

    // set instance
    this.instance = newInsDoc._doc;
    return this.instance;
  }
}

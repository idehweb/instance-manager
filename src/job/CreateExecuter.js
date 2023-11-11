import crypto from "crypto";
import {
  axiosError2String,
  getInstanceDbPath,
  getInstanceStaticPath,
  getSlaveIps,
  getSlaveSocketOpt,
  wait,
} from "../utils/helpers.js";
import { Service as DockerService } from "../docker/service.js";
import network, { Network, NetworkCDN } from "../common/network.js";
import { Global } from "../global.js";
import { BaseExecuter } from "./BaseExecuter.js";
import Nginx from "../common/nginx.js";
import { InstanceStatus, instanceModel } from "../model/instance.model.js";
import DBCmd from "../db/index.js";
import { SimpleError } from "../common/error.js";

export default class CreateExecuter extends BaseExecuter {
  constructor(job, instance, log_file) {
    super(job, instance, log_file);
  }

  async create_static_dirs() {
    // create public
    const staticDirs = ["shared", "public", "logs", "plugins"].map(
      (f) => `/var/instances/${this.instance_name}/${f}`
    );
    const createFolders = `mkdir -p ${staticDirs.join(" ")}`;
    await this.exec(createFolders);
  }

  async copy_static() {
    if (!this.instance.pattern) return;

    // copy static files
    const copyStatics = `cp -r ${getInstanceStaticPath(
      this.instance
    )} /var/instances/${this.instance_name}/public`;
    await this.exec(copyStatics);
  }
  async docker_create() {
    // db uri
    let dbUri = this.dbUri;
    if (!dbUri) {
      this.log("try to get db uri by create new user");
      dbUri = await this.create_user_in_db();
    }

    // check docker services
    const listServices = await DockerService.getAllServices(this.exec);
    const myService = listServices.find((s = "") => {
      return s.includes(this.instance_name);
    });

    // create docker service
    const dockerCreateCmd = await DockerService.getCreateServiceCommand({
      ...this.instance,
      app_name: this.instance.site_name,
      service_name: this.instance_name,
      dbName: this.instance.db,
      dbUri,
      site_url: `https://${this.instance.primary_domain}`,
      executer: "x-docker",
      maxRetries: 6,
      ownerId: this.instance.user.toString(),
    });
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
    const server_ip = this.instance.server_ip;

    if (!server_ip)
      throw new SimpleError(
        `there is not any active slave for ${this.instance.server_ip}`
      );

    const defaultDomain = Network.getDefaultDomain({
      name: this.instance.name,
      region: this.instance.region,
    });
    this.log(["get default domain", defaultDomain]);

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
      this.log(
        "Axios Error in DNS:\n" +
          `Configs : ${JSON.stringify(
            {
              cdn: Network.region2CDN(this.instance.region),

              defaultDomain,
              domains: this.instance.domains.map(({ content }) => content),
              logger: { log: this.log },
              content: server_ip,
            },
            null,
            "  "
          )}\nAxios:` +
          axiosError2String(err),
        false,
        true
      );
      throw err;
    }
  }
  async restore_demo() {
    if (!this.instance.pattern) return;

    this.log(`initial db base on : ${this.instance.pattern}`);
    const cmd = `mongorestore --db ${this.instance_name} --drop ${
      Global.env.isPro ? "--quiet" : ""
    } ${Global.env.MONGO_REMOTE_URL} ${getInstanceDbPath(this.instance)}`;
    await this.exec(cmd);
  }

  async create_user_in_db() {
    this.log("try to create user in db");
    const dbUri = (
      await this.exec(
        DBCmd.addUser({
          user: "owner",
          pass: crypto.randomBytes(24).toString("hex"),
          db: this.instance.db,
        })
      )
    ).trim();
    this.dbUri = dbUri;
    return dbUri;
  }

  async sync_db(isError = false) {
    let set_body = {};

    if (isError) {
      set_body = {
        status: InstanceStatus.JOB_ERROR,
      };
    } else {
      set_body.status = InstanceStatus.UP;
      set_body.server_ip = this.instance.server_ip;

      // add custom domain
      if (this.instance.domains_result)
        set_body.domains = this.instance.domains_result;
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

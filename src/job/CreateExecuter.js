import {
  axiosError2String,
  getInstanceDbPath,
  getInstanceStaticPath,
  wait,
} from "../utils/helpers.js";
import { Service as DockerService } from "../docker/service.js";
import network, { NetworkCDN } from "../common/network.js";
import { Global } from "../global.js";
import { InstanceRegion } from "../model/instance.model.js";
import { BaseExecuter } from "./BaseExecuter.js";

export default class CreateExecuter extends BaseExecuter {
  constructor(job, instance, log_file) {
    super(job, instance, log_file);
  }
  async copy_static() {
    // create public
    const createFolders = `mkdir -p /var/instances/${this.instance_name} && mkdir -p /var/instances/${this.instance_name}/shared && mkdir -p /var/instances/${this.instance_name}/public`;
    await this.exec(createFolders);

    // copy static files
    const copyStatics = `cp -r ${getInstanceStaticPath(
      this.instance,
      this.remote
    )} /var/instances/${this.instance_name}/public`;
    await this.exec(copyStatics);
  }
  async docker_create() {
    // check docker services
    const dockerServiceLs = `docker service ls --format "{{.Name}} {{.Replicas}}"`;
    const listServices = (await this.exec(dockerServiceLs)).split("\n");
    const myService = listServices.find((s) => s.includes(this.instance_name));

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
  async register_cdn() {
    // ns record
    try {
      this.log("Connect Instance Networks");
      this.domainsResult = await network.connectInstance(
        this.instance.region === InstanceRegion.IRAN
          ? NetworkCDN.ARVAN
          : NetworkCDN.CF,
        this.instance.primary_domain,
        this.instance.domains
      );
    } catch (err) {
      this.log("Axios Error in DNS:\n" + axiosError2String(err));
      throw err;
    }
  }
  async restore_demo() {
    this.log(`initial db base on : ${this.instance.pattern}`);
    const cmd = `mongorestore --db ${this.instance_name} ${
      Global.env.MONGO_URL
    } ${getInstanceDbPath(this.instance, this.remote)}`;
    await this.exec(cmd);
  }
}

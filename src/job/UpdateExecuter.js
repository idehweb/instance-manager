import { BaseExecuter } from "../global.js";
import { Service as DockerService } from "../docker/service.js";
import { InstanceRegion, InstanceStatus } from "../model/instance.model.js";
import network, { NetworkCDN } from "../common/network.js";
export default class UpdateExecuter extends BaseExecuter {
  constructor(job, instance, exec, log) {
    super(job, instance, exec, log);
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
        this.instance.primary_domain,
        domains_add,
        domains_rm
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
}

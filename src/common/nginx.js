export class Nginx {
  #exec;
  constructor(exec) {
    this.#exec = exec;
  }
  #domainsArg(domains) {
    return domains.map((d) => `-d ${d}`).join(" ");
  }
  async addDomainsCert(domains) {
    domains = this.#domainsArg(domains);
    await this.#exec(`x-cert add ${domains}`);
  }
  async addDomainsConf(domains, name) {
    domains = this.#domainsArg(domains);
    await this.#exec(`x-nginx add ${domains} -n ${name}`);
  }
  async rmDomainsCert(domains) {
    domains = this.#domainsArg(domains);
    await this.#exec(`x-cert rm ${domains}`);
  }
  async rmDomainsConf(domains) {
    domains = this.#domainsArg(domains);
    await this.#exec(`x-nginx rm ${domains}`);
  }
}

export default Nginx;

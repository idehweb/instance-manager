export class Nginx {
  #exec;
  constructor(exec) {
    this.#exec = exec;
  }
  async addDomainsConf(domains, name) {
    domains = domains.map((d) => `-d ${d}`).join(" ");
    await this.#exec(`x-cert add ${domains}`);
    await this.#exec(`x-nginx add ${domains} -n ${name}`);
  }
  async rmDomainsConf(domains) {
    domains = domains.map((d) => `-d ${d}`).join(" ");
    await this.#exec(`x-cert rm ${domains}`);
    await this.#exec(`x-nginx rm ${domains}`);
  }
}

export default Nginx;

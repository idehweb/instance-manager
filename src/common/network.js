import { Global } from "../global.js";
import { InstanceRegion } from "../model/instance.model.js";
import Arvan from "../utils/arvan.js";
import Cloudflare from "../utils/cf.js";

export const NetworkCDN = {
  CF: "cloudflare",
  ARVAN: "arvan",
};

export class Network {
  #cf = new Cloudflare();
  #arvan = new Arvan();
  static getPrimaryDomain({ name, region }) {
    if (region === InstanceRegion.IRAN)
      return `${name}.${Global.env.ARVAN_DOMAIN}`;
    if (region === InstanceRegion.GERMAN)
      return `${name}.${Global.env.CF_DOMAIN}`;
  }
  #getCDN(cdn_name) {
    return cdn_name === NetworkCDN.CF ? this.#cf : this.#arvan;
  }
  #getSubMain(primary_domain) {
    const [, subD, domain] = /^(.*)\.([^.]+\.[^.]+)$/.exec(primary_domain);
    return { subdomain: subD, domain };
  }

  async connectInstance(cdn_name, primary_domain, domains = []) {
    const cdn = this.#getCDN(cdn_name);
    const { subdomain, domain } = this.#getSubMain(primary_domain);

    // 1. create A record
    await cdn.addRecord(domain, { name: subdomain, type: "A", isProxy: true });

    // 2. register domains
    domains = await Promise.all(
      domains
        .map(({ content }) => content)
        .filter((d) => d !== primary_domain)
        .map(async (d) => ({
          content: d,
          ns: await cdn.registerDomain(d),
        }))
    );

    // 3. connect custom domain into primary domain
    await Promise.all(
      domains.map(async ({ content }) =>
        cdn.addRecord(content, {
          content: primary_domain,
          type: "CNAME",
          isProxy: false,
          name: "@",
        })
      )
    );

    return [{ content: primary_domain }, ...domains];
  }
  async changeCustomDomains(
    cdn_name,
    primary_domain,
    domains_add = [],
    domains_rm = []
  ) {
    const cdn = this.#getCDN(cdn_name);
    domains_add = domains_add.filter((d) => d !== primary_domain);
    domains_rm = domains_rm.filter((d) => d !== primary_domain);

    // 1. add domains
    domains_add = await Promise.all(
      domains_add.map(async (d) => {
        const newD = {
          content: d,
          ns: await cdn.registerDomain(d),
        };
        await cdn.addRecord(d, {
          content: primary_domain,
          type: "CNAME",
          isProxy: false,
          name: "@",
        });
        return newD;
      })
    );

    // 2. rm domains
    await Promise.all(
      domains_rm.map(async (d) => {
        await cdn.removeDomain(d);
      })
    );

    return domains_add;
  }
  async disconnectInstance(cdn_name, primary_domain, domains = []) {
    const cdn = this.#getCDN(cdn_name);
    const { subdomain, domain } = this.#getSubMain(primary_domain);

    await this.changeCustomDomains(
      cdn_name,
      primary_domain,
      [],
      domains.map(({ content }) => content)
    );
    await cdn.removeRecord(domain, subdomain);
  }
}

const network = new Network();
export default network;

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
  static region2CDN(region) {
    switch (region) {
      case InstanceRegion.IRAN:
        return NetworkCDN.ARVAN;

      case InstanceRegion.GERMAN:
        return NetworkCDN.CF;

      default:
        return NetworkCDN.ARVAN;
    }
  }
  static getDefaultDomain({ name, region }) {
    if (region === InstanceRegion.IRAN)
      return `${name}.${Global.env.ARVAN_DOMAIN}`;
    if (region === InstanceRegion.GERMAN)
      return `${name}.${Global.env.CF_DOMAIN}`;
  }
  static getIP(region) {
    if (region === InstanceRegion.IRAN) return Global.env.ARVAN_DOMAIN;
    return Global.env.CF_DOMAIN;
  }
  #getCDN(cdn_name) {
    if (cdn_name === NetworkCDN.CF || cdn_name === InstanceRegion.GERMAN)
      return this.#cf;
    return this.#arvan;
  }
  #getSubMain(defaultDomain) {
    const [, subD, domain] = /^(.*)\.([^.]+\.[^.]+)$/.exec(defaultDomain);
    return { subdomain: subD, domain };
  }
  /**
   *
   * @param {string} cdn_name
   * port : number;
   * content: string;
   * logger:any;
   * domains: string[];
   * defaultDomain: string;
   *
   * @returns
   */
  async connectInstance(
    cdn_name,
    { port = 80, content, logger, domains = [], defaultDomain }
  ) {
    const cdn = this.#getCDN(cdn_name);
    const { subdomain, domain } = this.#getSubMain(defaultDomain);

    // 1. create A record
    await cdn.addRecord(domain, {
      name: subdomain,
      type: "A",
      isProxy: true,
      port,
      content,
    });

    logger.log(`add ${defaultDomain} record`);

    // 2. register domains
    let needRegisterDomains = domains.filter((d) => d !== defaultDomain);
    console.log({ domains, defaultDomain, needRegisterDomains });

    if (needRegisterDomains.length) {
      needRegisterDomains = await Promise.all(
        needRegisterDomains.map(async (d) => ({
          content: d,
          ns: await cdn.registerDomain(d),
        }))
      );

      logger.log(`register all domains in ${cdn_name}`);

      // 3. add A record into domains
      await Promise.all(
        needRegisterDomains.map(async ({ content: domain }) =>
          cdn.addRecord(domain, {
            isProxy: true,
            name: "@",
            type: "A",
            content,
            port,
          })
        )
      );

      logger.log(
        `add A record in ${needRegisterDomains
          .map(({ content }) => content)
          .join(" , ")}`
      );
    }

    return [{ content: defaultDomain }, ...needRegisterDomains];
  }
  /**
   *
   * @param {string} cdn_name
   *
   * domains_add: string[];
   * domains_rm: string[];
   *
   */
  async changeCustomDomains(
    cdn_name,
    {
      port = 80,
      content,
      logger,
      domains_add = [],
      domains_rm = [],
      primary_domain,
    }
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
          content,
          type: "A",
          isProxy: true,
          port,
          name: "@",
        });
        return newD;
      })
    );

    if (domains_add.length)
      logger.log(
        `add domains and A record , domains: ${domains_add
          .map(({ content }) => content)
          .join(" , ")}`
      );

    // 2. rm domains
    await Promise.all(
      domains_rm.map(async (d) => {
        await cdn.removeDomain(d);
      })
    );

    if (domains_rm.length)
      logger.log(`remove domains , domains: ${domains_rm.join(" , ")}`);

    return domains_add;
  }

  /**
   *
   * @param {string} cdn_name
   * domains: string[];
   */
  async disconnectInstance(cdn_name, { domains = [], defaultDomain, logger }) {
    const cdn = this.#getCDN(cdn_name);
    const { subdomain, domain } = this.#getSubMain(defaultDomain);

    await this.changeCustomDomains(cdn_name, {
      logger,
      domains_rm: domains,
      primary_domain: "",
    });

    await cdn.removeRecord(domain, subdomain);
    logger.log(`remove ${defaultDomain} record`);
  }

  async changePrimaryDomain(cdn_name) {}

  async addRecord(cdn_name, domain, { type, content, isProxy, name, secure }) {
    const cdn = this.#getCDN(cdn_name);
    await cdn.addRecord(domain, {
      name,
      type,
      isProxy,
      content,
      port: secure ? 443 : 80,
    });
  }

  async rmRecord(cdn_name, domain, { type, content, name }) {
    const cdn = this.#getCDN(cdn_name);
    await cdn.removeRecord(domain, {
      name,
      type,
      content,
    });
  }

  async createCert(cdn_name) {}
}

const network = new Network();
export default network;

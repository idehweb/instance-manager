import axios from "axios";
import { Global } from "../global.js";

const api = axios.create({
  baseURL: "https://napi.arvancloud.ir/cdn/4.0",
  headers: { Authorization: Global.env.ARVAN_TOKEN },
});

export default class Arvan {
  async #query(configs) {
    const response = await api(configs);
    return response.data;
  }
  async domain2ID(domain) {
    const domains = await this.getDomains();
    const d = domains.find(({ domain: d }) => d == domain);
    return d?.id;
  }
  async isDomainExistBefore(domain) {
    try {
      await this.#query({ method: "get", url: `/domains/${domain}` });
      return true;
    } catch (err) {
      if (err.response?.status === 404) return false;
      throw err;
    }
  }
  sameName(record, name, domain) {
    return (
      record.name === name ||
      (name === "@" && record.name === domain) ||
      record.name === `${name}.${domain}`
    );
  }
  sameContent(record, content) {
    const value = record.value ?? [];
    const ips = value.map(({ ip }) => ip);
    const hosts = value.map(({ host }) => host);

    return ips.includes(content) || hosts.includes(content);
  }
  async getRecords(domain) {
    return (
      await this.#query({
        url: `/domains/${domain}/dns-records`,
        method: "get",
        params: { per_page: 100 },
      })
    ).data;
  }
  async addRecord(
    domain,
    { content = Global.env.IRAN_IP, name, type, isProxy, port = 443 }
  ) {
    type = type.toLowerCase();
    if (name == "@" && type == "cname") type = "aname";
    const records = await this.getRecords(domain);

    if (
      records.find(
        (r) =>
          this.sameName(r, name, domain) &&
          r.type === type &&
          this.sameContent(r, content)
      )
    )
      return;

    await this.#query({
      url: `/domains/${domain}/dns-records`,
      method: "post",
      data: {
        name,
        type,
        value:
          type == "a"
            ? [{ ip: content, port: isProxy ? port : undefined }]
            : { [type === "aname" ? "location" : "host"]: content },
        cloud: isProxy,
        upstream_https:
          type === "a" && isProxy
            ? port === 443
              ? "https"
              : "http"
            : undefined,
      },
    });
  }
  async getDomains() {
    return (await this.#query({ method: "get", url: "/domains" })).data;
  }
  async registerDomain(domain) {
    const domains = await this.getDomains();
    const myDomain = domains.find((d) => d.domain === domain);
    if (myDomain) return myDomain.ns_keys;

    const result = await this.#query({
      url: "/domains/dns-service",
      method: "post",
      data: {
        domain,
        domain_type: "full",
      },
    });
    return result.data.ns_keys;
  }
  async removeRecord(domain, { name, type, content }) {
    type = type?.toLowerCase();
    const records = await this.getRecords(domain);
    const myRecord = records.find(
      (r) =>
        this.sameName(r, name, domain) &&
        (!type || type === r.type) &&
        (!content || this.sameContent(r, content))
    );

    if (!myRecord) return;
    await this.#query({
      method: "delete",
      url: `/domains/${domain}/dns-records/${myRecord.id}`,
    });
  }
  async removeDomain(domain) {
    const id = await this.domain2ID(domain);
    if (!id) return;
    await this.#query({
      method: "delete",
      url: `/domains/${domain}`,
      params: { id },
    });
  }
}

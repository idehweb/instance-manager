import CF from "cloudflare";
import { Global } from "../global.js";

export const CF_ZONE_STATUS = {
  IN_PROGRESS: "in-progress",
  EXISTS_BEFORE: "exists-before",
  ACTIVE_BEFORE: "active-before",
  CREATE: "create",
};

const api = new CF({
  email: Global.env.CF_EMAIL,
  token: Global.env.CF_TOKEN,
});

export default class Cloudflare {
  #map = new Map();
  async #domain2ZoneId(domain) {
    if (this.#map.has(domain)) return this.#map.get(domain);
    const zoneId = (await this.getDomains()).find(
      (zone) => zone.domain === domain
    )?.id;
    if (zoneId) this.#map.set(domain, zoneId);
    return zoneId;
  }

  async isDomainExistBefore(domain) {
    const myZone = await this.#domain2ZoneId(domain);
    return myZone ? true : false;
  }

  async getRecords(domain) {
    const list = await api.dnsRecords.browse(await this.#domain2ZoneId(domain));
    return list.result;
  }

  async addRecord(
    domain,
    { content = Global.env.GERMAN_IP, name, type, isProxy }
  ) {
    type = type.toUppercase();
    const zoneId = await this.#domain2ZoneId(domain);
    const records = await this.getRecords(domain);
    if (
      records.find(
        (r) =>
          (r.name === name || (name === "@" && r.name === domain)) &&
          r.type === type
      )
    )
      return;
    return api.dnsRecords.add(zoneId, {
      type,
      proxied: isProxy,
      name,
      content,
    });
  }

  async getDomains() {
    return (await api.zones.browse()).result;
  }

  async registerDomain(domain) {
    const zones = await this.getDomains();
    const myZone = zones.find((zone) => zone.domain === domain);
    // if system add domain before
    if (myZone) return myZone.name_servers;

    // add domain
    const response = await api.zones.add({
      name: domain,
      action: { id: Global.env.CF_ACCOUNT_ID },
      jump_start: true,
      type: "full",
    });
    const name_servers = response.result.name_servers;
    return name_servers;
  }

  async removeRecord(domain, record_name) {
    const records = await this.getRecords(domain);
    await api.dnsRecords.del(
      await this.#domain2ZoneId(domain),
      records.find((r) => r.name === record_name).id
    );
  }
  async removeDomain(domain) {
    await api.zones.del(await this.#domain2ZoneId(domain));
    this.#map.delete(domain);
  }
}

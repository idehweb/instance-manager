import Cloudflare from "cloudflare";
import { Global } from "../global.js";

export const CF_ZONE_STATUS = {
  IN_PROGRESS: "in-progress",
  EXISTS_BEFORE: "exists-before",
  ACTIVE_BEFORE: "active-before",
  CREATE: "create",
};

const cf = new Cloudflare({
  email: Global.env.CF_EMAIL,
  token: Global.env.CF_TOKEN,
});

export async function nsList(id = Global.env.CF_ZONE_ID, map) {
  const list = await cf.dnsRecords.browse(id);
  return list.result.map(map ?? ((record) => record.name));
}
export async function zoneList() {
  return (await cf.zones.browse()).result;
}
export function nsCreate(
  name,
  { type, id, proxied, content } = {
    type: "A",
    id: Global.env.CF_ZONE_ID,
    proxied: true,
    content: Global.env.CF_IP,
  }
) {
  return cf.dnsRecords.add(id, {
    type,
    proxied,
    name,
    content,
  });
}
export async function nsCreateAndCNAME(source, dist) {
  const zones = await zoneList();
  const myZone = zones.find((zone) => zone.name === source);

  // if system add domain before
  if (myZone) {
    let status, name_servers;
    if (myZone.status === "active") status = CF_ZONE_STATUS.ACTIVE_BEFORE;
    else {
      status = CF_ZONE_STATUS.EXISTS_BEFORE;
      name_servers = myZone.name_servers;
    }
    // not create record if zone active before
    if (status !== CF_ZONE_STATUS.ACTIVE_BEFORE) await addRecord(myZone.id);

    return { status, ns: name_servers };
  }

  // add domain
  const response = await cf.zones.add({
    name: source,
    action: { id: Global.env.CF_ACCOUNT_ID },
    jump_start: true,
    type: "full",
  });
  const name_servers = response.result.name_servers;
  const zone_id = response.result.id;
  const status = CF_ZONE_STATUS.CREATE;
  await addRecord(zone_id);
  return { status, ns: name_servers };

  async function addRecord(id) {
    const records = await nsList(id);
    if (records.includes(source)) {
      return;
    } else {
      await nsCreate(source, {
        type: "CNAME",
        id,
        proxied: false,
        content: dist,
      });
    }
  }

  // const name_servers = response.result.name_servers;
}
export async function nsRemove(primary_domain, domains) {
  primary_domain = primary_domain.replace(".nodeeweb.com", "");
  domains = domains
    .filter(
      ({ content, status }) =>
        content !== primary_domain && status !== CF_ZONE_STATUS.IN_PROGRESS
    )
    .map(({ content }) => content);

  // 1. remove A record in nodeeweb zone
  const record = (await nsList(undefined, (record) => record)).find(
    ({ name }) => name === primary_domain
  );
  if (record) await cf.dnsRecords.del(Global.env.CF_ZONE_ID, record.id);

  // 2. remove custom domain zones
  if (domains.length) {
    const zones = (await zoneList()).filter(({ name }) =>
      domains.includes(name)
    );
    await Promise.all(zones.map(({ id }) => cf.zones.del(id)));
  }
}

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
  const zones = await cf.zones.browse();
  const myZone = zones.result.find((zone) => zone.name === source);

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

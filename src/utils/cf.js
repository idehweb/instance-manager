import Cloudflare from "cloudflare";
import { Global } from "../global.js";

const cf = new Cloudflare({
  email: Global.env.CF_EMAIL,
  token: Global.env.CF_TOKEN,
});

export async function nsList() {
  const list = await cf.dnsRecords.browse(Global.env.CF_ZONE_ID);
  return list.result.map((record) =>
    record.name.slice(0, -record.zone_name.length)
  );
}
export function nsCreate(name) {
  return cf.dnsRecords.add(Global.env.CF_ZONE_ID, {
    type: "A",
    proxied: true,
    name,
    content: Global.env.CF_IP,
  });
}

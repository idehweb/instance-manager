import { Global } from "../global.js";
import { Network } from "../common/network.js";
export class Service {
  static async getSystemStatus() {}
  static async getServiceStatus(name) {}
  static getCreateServiceCommand(
    dockerServiceName,
    subDomainName,
    { replica, memory, cpu, image, region,site_name }
  ) {
    // create docker service
    const dockerCreate =
      `docker service create --hostname ${dockerServiceName} --name ${dockerServiceName} -e PUBLIC_PATH=/app/public -e SHARED_PATH=/app/shared -e mongodbConnectionUrl="${
        Global.env.MONGO_URL
      }" -e dbName=${dockerServiceName} -e SITE_NAME=${site_name} -e SERVER_PORT=3000 -e BASE_URL="https://${Network.getPrimaryDomain(
        { name: subDomainName, region }
      )}" -e SHOP_URL="https://${Network.getPrimaryDomain({
        name: subDomainName,
        region,
      })}/" --mount type=bind,source=/var/instances/${dockerServiceName}/shared/,destination=/app/shared/  --mount type=bind,source=/var/instances/${dockerServiceName}/public/,destination=/app/public/  --mount type=bind,source=/var/instances/${dockerServiceName}/public/public_media/,destination=/app/public_media/  --mount type=bind,source=/var/instances/${dockerServiceName}/public/admin/,destination=/app/admin/ --mount type=bind,source=/var/instances/${dockerServiceName}/public/plugins/,destination=/app/plugins/  --mount type=bind,source=/var/instances/${dockerServiceName}/public/theme/,destination=/app/theme/ --network nodeeweb_webnet --network nodeeweb_mongonet --replicas ${replica} ${
        cpu === -1 ? "" : `--limit-cpu=${cpu}`
      } ${
        memory === -1 ? "" : `--limit-memory=${memory}MB`
      } --restart-condition on-failure --restart-delay 30s --restart-max-attempts 8 --restart-window 1m30s --update-parallelism ${Math.max(
        1,
        Math.floor(replica / 2)
      )} --update-delay 30s ${image}`.replace(/\n/g, " ");

    return dockerCreate;
  }
  static getDeleteServiceCommand(name) {
    return `docker service rm ${name}`;
  }
  static getUpdateServiceCommand(name, configs) {
    return `docker service update ${Object.entries(configs)
      .map(([k, v]) => `--${k} ${v}`)
      .join(" ")} ${name}`;
  }
}

export default Service;

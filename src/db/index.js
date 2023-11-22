import { Command } from "../common/Command.js";
import { Global } from "../global.js";
import { getPublicPath } from "../utils/helpers.js";

const DBCmd = {
  addUser({ user, pass, db }) {
    return new Command({
      cmd: `x-mongo create-user --user ${user} --pass ${pass} --db ${db} --role dbOwner`,
      credentials: [pass, "dbOwner"],
    });
  },
  getConnectionUri({ user, pass, db }) {
    return new Command({
      cmd: `x-mongo get-uri --user ${user} --pass ${pass} --db ${db}`,
      credentials: [pass],
    });
  },
  deleteUser({ user, db }) {
    return new Command({
      cmd: `x-mongo delete-user --user ${user} --db ${db}`,
    });
  },
  dropDB(name) {
    const cmd_with_x_mongo = `x-mongo drop-db ${name}`;
    return new Command({ cmd: cmd_with_x_mongo });
  },
  backupDB(name, path) {
    const backup_cmd = `mongodump --db ${name} --out ${
      path ?? getPublicPath(`backup/${name}/db`)
    } ${Global.env.isPro ? "--quiet" : ""} ${Global.env.MONGO_URL}`;

    return new Command({
      cmd: backup_cmd,
      credentials: [Global.env.MONGO_URL],
    });
  },
};

export default DBCmd;

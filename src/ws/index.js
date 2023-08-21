import { Global } from "../global.js";
import { InstanceRegion } from "../model/instance.model.js";
import { authWithToken } from "./auth.js";

export default function registerWs(io) {
  io.use(authWithToken);

  io.on("connection", (socket) => {
    console.log(socket.id, "connected");
    socket.join(InstanceRegion.IRAN);
  });

  io.on("disconnect", (socket) => {
    console.log(socket.id, "disconnect");
    const rooms = [...socket.rooms].slice(1);
    for (const room of rooms) {
      socket.leave(room);
    }
  });

  io.on("error", (err) => {
    console.log("error", err);
  });
}

export async function runRemoteCmd(cmd, logger = console.log) {
  logger("run remote command", cmd);
  Global.io.of();
}

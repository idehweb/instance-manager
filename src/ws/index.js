import { setTimeout } from "timers/promises";
import { Global } from "../global.js";
import { authWithToken } from "./auth.js";
import { DisconnectError } from "./error.js";

export default function registerWs(io) {
  io.use(authWithToken);

  io.on("connection", (socket) => {
    console.log(socket.id, "connected");
    socket.join(socket.instance.region);
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

export async function runRemoteCmd(region, cmd, logger = console) {
  logger.log("run remote command", cmd);
  const sockets = await Global.io.in(region).fetchSockets();
  const targetSocket = sockets?.[0];
  if (!targetSocket)
    throw new Error(`there is not any connected socket for ${region} region`);

  const cmdId = crypto.randomUUID();
  targetSocket.emit("command", { id: cmdId, cmd });

  return await new Promise((resolve, reject) => {
    const onLog = (data) => {
      if (data.id !== cmdId) return;
      if (data.log) logger.log(data.log);
      if (data.error) logger.error(data.error);
    };
    const onResponse = (data) => {
      if (data.id !== cmdId) return;

      // remove listeners
      targetSocket.removeListener("command", onResponse);
      targetSocket.removeListener("log", onLog);

      // send response
      const { code, error } = data;
      if (code === 0) resolve();
      if (code !== 0) reject(error ?? code);
    };

    targetSocket.on("command", onResponse);
    targetSocket.on("log", onLog);

    // disconnect
    targetSocket.on("disconnect", async () => {
      await setTimeout(5 * 60 * 1000);
      reject(new DisconnectError("client disconnect"));
    });
  });
}

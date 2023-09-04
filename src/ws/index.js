import * as crypto from "crypto";
import { setTimeout } from "timers/promises";
import { Global } from "../global.js";
import { authWithToken } from "./auth.js";
import { DisconnectError } from "./error.js";

const confMap = new Map();

function getIP(socket) {
  const forwardIp =
    socket.handshake.headers["x-forwarded-for"]?.split(",")?.[0]?.trim() ?? "";
  const currentIp = socket.handshake.address.split(":").pop();

  if (forwardIp) return forwardIp;
  return currentIp;
}

function addIP(socket) {
  if (!Global.ips[socket.instance.region])
    Global.ips[socket.instance.region] = new Set();
  Global.ips[socket.instance.region].add(getIP(socket));
}
function rmIP(socket) {
  Global.ips[socket.instance.region].delete(getIP(socket));
}

export default function registerWs(io) {
  io.use(authWithToken);

  io.once("connection", (socket) => {
    console.log(socket.id, "connected");
    socket.join(socket.instance.region);

    // add ip to global
    addIP(socket);

    // increase limit
    socket.setMaxListeners(Number.POSITIVE_INFINITY);

    socket.on("log", onLog);
    socket.on("command", onCommand.bind(null, socket));
    socket.on("disconnect", disconnectGlobal.bind(null, socket));
  });

  io.once("error", (err) => {
    console.log("error", err);
  });
}

function onLog(data) {
  const { id, log, error } = data;
  const conf = confMap.get(id);
  if (!conf) return;

  if (log) conf.logger.log(log);
  if (error) conf.logger.error(error);
}

function onCommand(socket, data) {
  const { code, error, id, response } = data;
  const conf = confMap.get(id);
  if (!conf) return;

  // send response
  if (code === 0) conf.resolve(response);
  if (code !== 0) conf.reject(error ?? code);

  // remove timer
  socket.removeListener("disconnect", conf.timer);

  // remove conf
  confMap.delete(id);
}

function disconnectGlobal(socket) {
  // rm ip
  console.log(socket.id, "disconnect");
  rmIP(socket);
}

async function onDisconnect(id, reject) {
  await setTimeout(5 * 60 * 1000);
  reject(new DisconnectError("client disconnect"));

  // remove conf
  confMap.delete(id);
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
    const timer = onDisconnect.bind(null, cmdId, reject);
    confMap.set(cmdId, { logger, resolve, reject, timer });
    targetSocket.on("disconnect", timer);
  });
}

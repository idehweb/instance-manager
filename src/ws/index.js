import * as crypto from "crypto";
import { setTimeout } from "timers/promises";
import { Global } from "../global.js";
import { authWithToken } from "./auth.js";
import { DisconnectError } from "./error.js";
import { SimpleError } from "../common/error.js";
import { normalizeRegion } from "../utils/helpers.js";
import { getIP, getRegion, isConnect } from "./utils.js";
import { Command } from "../common/Command.js";

const confMap = new Map();

function addSocket(socket) {
  const region = normalizeRegion(getRegion(socket));

  // first init
  if (!Global.slaveSockets[region]) Global.slaveSockets[region] = new Map();

  // add to map
  Global.slaveSockets[region].set(socket.id, socket);
}
function rmSocket(socket) {
  const region = normalizeRegion(getRegion(socket));

  // not found or not init
  if (!Global.slaveSockets[region]?.has(socket.id)) return;

  Global.slaveSockets[region].delete(socket.id);
}

export default function registerWs(io) {
  io.use(authWithToken);

  io.on("connection", (socket) => {
    console.log(
      `socket ${socket.id} from ${getRegion(socket)} by ip ${getIP(
        socket
      )} connected`
    );
    socket.join(getRegion(socket));

    // add ip to global
    addSocket(socket);

    // increase limit
    socket.setMaxListeners(Number.POSITIVE_INFINITY);

    socket.on("log", onLog);
    socket.on("command", onCommand.bind(null, socket));
    socket.on("disconnect", disconnectGlobal.bind(null, socket));
  });

  io.on("error", (err) => {
    console.log("error", err);
  });
}

function onLog(data) {
  const { id, log, error } = data;
  const conf = confMap.get(id);
  if (!conf) return;

  if (log) conf.logger.log(true, log);
  if (error) conf.logger.error(true, error);
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
  rmSocket(socket);
}

async function onDisconnect(id, reject) {
  await setTimeout(5 * 60 * 1000);
  reject(new DisconnectError("client disconnect"));

  // remove conf
  confMap.delete(id);
}

export async function runRemoteCmdWithRegion(region, cmd, logger = console) {
  const sockets = await Global.io.in(region).fetchSockets();
  const targetSocket = sockets?.[0];
  if (!targetSocket)
    throw new SimpleError(
      `there is not any connected socket for ${region} region`
    );

  await runRemoteCmd(targetSocket, cmd, logger);
}

export async function runRemoteCmdWithId(id, cmd, logger) {
  const targetSocket = Global.io.sockets.sockets.get(id);
  if (!targetSocket)
    throw new SimpleError(`there is not any connected socket with id ${id}`);

  await runRemoteCmd(targetSocket, cmd, logger);
}

export async function runRemoteCmd(targetSocket, cmd, logger) {
  if (!(cmd instanceof Command)) cmd = new Command({ cmd });

  if (!isConnect(targetSocket))
    throw new SimpleError("not received any connected target socket");

  logger.log(
    false,
    `remote command in ${getRegion(targetSocket)}:${getIP(targetSocket)}`,
    cmd.cmd
  );

  const cmdId = crypto.randomUUID();
  targetSocket.emit("command", { id: cmdId, cmd });

  return await new Promise((resolve, reject) => {
    const timer = onDisconnect.bind(null, cmdId, reject);
    confMap.set(cmdId, { logger, resolve, reject, timer });
    targetSocket.on("disconnect", timer);
  });
}

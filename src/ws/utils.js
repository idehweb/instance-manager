export function getIP(socket) {
  const customIp = socket.handshake.headers["x-my-ip"];
  const forwardIp =
    socket.handshake.headers["x-forwarded-for"]?.split(",")?.[0]?.trim() ?? "";
  const currentIp = socket.handshake.address.split(":").pop();

  return customIp || forwardIp || currentIp;
}

export function getRegion(socket) {
  return socket?.instance?.region;
}
export function isConnect(socket) {
  return socket?.connected;
}

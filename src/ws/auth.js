import { Global } from "../global.js";
import { UnAuthError } from "./error.js";
import jwt from "jsonwebtoken";

export function verifySocket(socket) {
  return new Promise((resolve, reject) => {
    const token = socket.handshake?.auth?.token;
    if (!token) return reject(new UnAuthError("token is invalid"));
    jwt.verify(token, Global.env.SLAVE_INSTANCE_SECRET, (err, data) => {
      if (err) return reject(err);
      socket.instance = data;
      return resolve(data);
    });
  });
}

export async function authWithToken(socket, next) {
  try {
    await verifySocket(socket);
  } catch (err) {
    return next(err);
  }
  return next();
}

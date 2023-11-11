import "./loadEnv.js";
import { Global } from "./src/global.js";
import { createTerminus } from "@godaddy/terminus";
import mongoose from "mongoose";
import "./src/model/nodeeweb.db.js";
import app from "./app.js";
import { Server } from "socket.io";
import registerWs from "./src/ws/index.js";
import prepare from "./src/prepar.js";
import { SimpleError } from "./src/common/error.js";

const server = app.listen(Global.env.PORT, () => {
  console.log(`Server Listening at http://127.0.0.1:${Global.env.PORT}`);
});

const io = new Server(server, {
  path: "/ws",
  cookie: true,
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
  allowUpgrades: true,
});
Global.io = io;
registerWs(io);

mongoose
  .connect(Global.env.MONGO_URL, { dbName: Global.env.MONGO_DB })
  .then((db) => {
    Global.db = db;
    console.log("DB connected");
  })
  .catch((err) => {
    console.log("DB connection error");
    throw err;
  });

// prepare
prepare();

process.on("uncaughtException", (err) => {
  console.log("#uncaughtException:", err);
  shutdown();
});
process.on("unhandledRejection", (err) => {
  console.log("#unhandledRejection:", err);
  shutdown();
});
function shutdown(code = 1) {
  return new Promise((resolve) => {
    io.close((err) => {
      server.close(async () => {
        try {
          await Promise.all(mongoose.connections.map((c) => c.close()));
        } catch (err) {}
        if (code !== null) process.exit(code);
        resolve();
      });
    });
  });
}
async function onSignal() {
  await shutdown(null);
}
async function onHealthcheck() {
  const status = mongoose.connections.every((c) => c.readyState === 1);
  if (!status) throw new SimpleError("DB not connect yet!");
}

createTerminus(server, {
  healthChecks: { "/health": onHealthcheck },
  onSignal,
  signals: ["SIGINT", "SIGTERM"],
  useExit0: true,
});

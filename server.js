import "./loadEnv.js";
import app from "./app.js";
import { Global } from "./src/global.js";
import { createTerminus } from "@godaddy/terminus";
import mongoose from "mongoose";
import "./src/model/nodeeweb.db.js";

const server = app.listen(Global.env.PORT, () => {
  console.log(`Server Listening at http://127.0.0.1:${Global.env.PORT}`);
});

mongoose
  .connect(Global.env.MONGO_URL, { dbName: Global.env.MONGO_DB })
  .then(() => {
    console.log("DB connected");
  })
  .catch((err) => {
    console.log("DB connection error");
    throw err;
  });

process.on("uncaughtException", (err) => {
  console.log("#uncaughtException:", err);
  shutdown();
});
process.on("unhandledRejection", (err) => {
  console.log("#unhandledRejection:", err);
  shutdown();
});
function shutdown() {
  server.close(async () => {
    try {
      await onSignal();
    } catch (err) {}
    process.exit(1);
  });
}
async function onSignal() {
  await Promise.all(mongoose.connections.map((c) => c.close()));
}
async function onHealthcheck() {
  const status = mongoose.connections.every((c) => c.readyState === 1);
  if (!status) throw new Error("DB not connect yet!");
}

createTerminus(server, {
  healthChecks: { "/health": onHealthcheck },
  onSignal,
  signals: ["SIGINT", "SIGTERM"],
  useExit0: true,
});

// process.on("SIGINT", shutdown);
// process.on("SIGTERM", shutdown);

// process.once("uncaughtException", (err) => {
//   console.error("uncaughtException", err);
// });
// process.once("unhandledRejection", (err) => {
//   console.error("unhandledRejection", err);
// });

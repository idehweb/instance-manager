import mongoose from "mongoose";
import { Global } from "../global.js";

Global.nodeeweb_db = mongoose.createConnection(Global.env.MONGO_URL, {
  dbName: Global.env.NODEEWEB_DB,
});

Global.nodeeweb_db.on("connected", () => {
  console.log("DB connected to Nodeeweb");
});
Global.nodeeweb_db.on("error", (err) => {
  console.log("DB connection to Nodeeweb error");
  throw err;
});

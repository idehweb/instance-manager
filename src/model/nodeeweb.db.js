import mongoose from "mongoose";
import { Global } from "../global.js";

mongoose
  .connect(Global.env.MONGO_URL, { dbName: Global.env.NODEEWEB_DB })
  .then(() => {
    console.log("DB connected to Nodeeweb");
  })
  .catch((err) => {
    console.log("DB connection to Nodeeweb error");
    throw err;
  });

Global.nodeeweb_db = mongoose.connections.find(
  (connection) => connection.name == Global.env.NODEEWEB_DB
);

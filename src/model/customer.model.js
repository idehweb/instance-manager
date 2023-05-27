import mongoose from "mongoose";
import { Global } from "../global.js";

const customerSchema = new mongoose.Schema({
  tokens: [{ token: String, os: String }],
});

const customerModel = Global.nodeeweb_db.model("Customer", customerSchema);
export default customerModel;

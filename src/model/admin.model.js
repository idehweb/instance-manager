import mongoose from "mongoose";
import { Global } from "../global.js";

const adminSchema = new mongoose.Schema({
  token: {
    type: String,
    required: false,
  },
});
const adminModel = Global.nodeeweb_db.model("Admin", adminSchema);
export default adminModel;

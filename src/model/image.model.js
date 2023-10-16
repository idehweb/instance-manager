import mongoose from "mongoose";
import { Global } from "../global.js";

const imageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

imageSchema.index({ createdAt: -1 }, { name: "timestamp" });

const imageModel = Global.nodeeweb_db.model("Image", imageSchema);
export default imageModel;

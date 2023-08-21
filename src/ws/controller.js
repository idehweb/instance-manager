import express from "express";
import { runRemoteCmd } from "./index.js";
import { InstanceRegion } from "../model/instance.model.js";

const wsRouter = express.Router();

wsRouter.post("/ws-cmd", async (req, res, next) => {
  try {
    await runRemoteCmd(InstanceRegion.IRAN, "mkdir hello");
  } catch (err) {
    return next(err);
  }
  res.send();
});

export default wsRouter;

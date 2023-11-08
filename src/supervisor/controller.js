import { Router } from "express";
import { supGuard } from "./utils.js";
import { Global } from "../global.js";
import Service from "./service.js";

const supervisorController = Router();

// init guard
supervisorController.use(supGuard);

// disable global guard
Global.whitelist_path.set("/api/v1/supervisor/event", true);
supervisorController.post("/event", Service.event);

export default supervisorController;

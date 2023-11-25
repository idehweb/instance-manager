import { Router } from "express";
import { authToken } from "./auth.js";
import service from "./service.js";
import { Global } from "../global.js";

const doctorRouter = Router();
Global.whitelist_path.set("/api/v1/doctor", true);
doctorRouter.get("/:id", authToken, service.getOne);

export default doctorRouter;

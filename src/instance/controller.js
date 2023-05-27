import express from "express";
import Service from "./service.js";
import { adminAccess, instanceAccess } from "../common/auth.guard.js";

const instanceRouter = express.Router();

instanceRouter.get("/", Service.getAll);
instanceRouter.get("/status", adminAccess, Service.getSystemStatus);
instanceRouter.get("/:id", instanceAccess, Service.getOne);
instanceRouter.post("/", Service.createOne);
instanceRouter.patch("/:id", instanceAccess, Service.updateOne);
instanceRouter.delete("/:id", instanceAccess, Service.deleteOne);

export default instanceRouter;

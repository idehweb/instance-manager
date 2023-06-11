import express from "express";
import Service from "./service.js";
import { jobAccess } from "../common/auth.guard.js";

const jobRouter = express.Router();

jobRouter.get("/", Service.getAll);
jobRouter.get("/:id", jobAccess, Service.getOne);
jobRouter.get("/:id/event", jobAccess, Service.getSSE);

export default jobRouter;

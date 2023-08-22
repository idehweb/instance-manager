import express from "express";
import Service from "./service.js";
import { jobAccess } from "../common/auth.guard.js";
import { catchMiddleware } from "../utils/catchAsync.js";

const jobRouter = express.Router();

jobRouter.get("/", Service.getAll);
jobRouter.get("/:id", catchMiddleware(jobAccess), Service.getOne);
jobRouter.get("/:id/event", catchMiddleware(jobAccess), Service.getSSE);

export default jobRouter;

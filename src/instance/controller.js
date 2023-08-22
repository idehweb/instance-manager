import express from "express";
import Service from "./service.js";
import { adminAccess, instanceAccess } from "../common/auth.guard.js";
import { catchMiddleware } from "../utils/catchAsync.js";

const instanceRouter = express.Router();

instanceRouter.get("/", Service.getAll);
instanceRouter.get(
  "/status",
  catchMiddleware(adminAccess),
  Service.getSystemStatus
);
instanceRouter.get("/:id", catchMiddleware(instanceAccess), Service.getOne);
instanceRouter.post("/", Service.createOne);
instanceRouter.patch(
  "/:id",
  catchMiddleware(instanceAccess),
  Service.updateOne
);
instanceRouter.delete(
  "/:id",
  catchMiddleware(instanceAccess),
  Service.deleteOne
);

export default instanceRouter;

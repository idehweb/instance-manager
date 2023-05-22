import express from "express";
import Service from "./service.js";

const instanceRouter = express.Router();

instanceRouter.get("/", Service.getAll);
instanceRouter.get("/status", Service.getSystemStatus);
instanceRouter.get("/:id", Service.getOne);
instanceRouter.post("/", Service.createOne);
instanceRouter.patch("/:id", Service.updateOne);
instanceRouter.delete("/:id", Service.deleteOne);

export default instanceRouter;

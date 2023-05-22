import express from "express";
import Service from "./service.js";

const jobRouter = express.Router();

jobRouter.get("/", Service.getAll);
jobRouter.get("/:id", Service.getOne);

export default jobRouter;

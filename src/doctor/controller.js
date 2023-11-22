import { Router } from "express";
import { authToken } from "./auth.js";
import service from "./service.js";

const doctorRouter = Router();

doctorRouter.get("/doctor/:id", authToken, service.getOne);

export default doctorRouter;

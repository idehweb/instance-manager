import express from "express";
import service from "./service.js";
import { useValidator } from "../validator/index.js";
import imageCreateValSch from "../validator/image.js";
import { catchMiddleware } from "../utils/catchAsync.js";
import { adminAccess } from "../common/auth.guard.js";

const imageRouter = express.Router();

imageRouter.get("/", service.getAll);
imageRouter.post(
  "/",
  catchMiddleware(adminAccess),
  useValidator("body", imageCreateValSch),
  service.add
);
imageRouter.delete("/:id", catchMiddleware(adminAccess), service.delete);

export default imageRouter;

import bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";
import instanceRouter from "./src/instance/controller.js";
import jobRouter from "./src/job/controller.js";
import { hostGuard } from "./src/common/auth.guard.js";
import {
  errorHandler,
  notFoundHandler,
} from "./src/common/handler.exception.js";

const app = express();

// common middleware
app.use(bodyParser.json());
app.use(morgan("dev"));

// guard
app.use(hostGuard);

// routes
app.use("/api/v1/instance", instanceRouter);
app.use("/api/v1/job", jobRouter);

// not found url
app.use(notFoundHandler);

// error handler
app.use(errorHandler);

export default app;

import bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import instanceRouter from "./src/instance/controller.js";
import jobRouter from "./src/job/controller.js";
import { hostGuard, passGuard } from "./src/common/auth.guard.js";
import {
  errorHandler,
  notFoundHandler,
} from "./src/common/handler.exception.js";
import SSE from "./src/utils/sse.js";
import wsRouter from "./src/ws/controller.js";

const app = express();

// common middleware
app.use(bodyParser.json());
app.use(morgan("dev"));
app.use(cors());

// sse test
app.get("/sse", (req, res) => {
  const sse = new SSE(res);
  const t = setInterval(() => {
    const canSend = sse.sendData("Hello " + Math.floor(Math.random() * 10));
    if (!canSend) clearInterval(t);
  }, 1000);
});

// guard
// app.use(hostGuard);
// app.use(passGuard);

// routes
app.use("/api/v1/instance", instanceRouter);
app.use("/api/v1/job", jobRouter);
app.use("/api/v1", wsRouter);

// not found url
app.use(notFoundHandler);

// error handler
app.use(errorHandler);

export default app;

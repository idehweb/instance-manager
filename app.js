import bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import instanceRouter from "./src/instance/controller.js";
import jobRouter from "./src/job/controller.js";
import { tokenGuard } from "./src/common/auth.guard.js";
import {
  errorHandler,
  notFoundHandler,
} from "./src/common/handler.exception.js";
import SSE from "./src/utils/sse.js";
import wsRouter from "./src/ws/controller.js";
import { catchMiddleware } from "./src/utils/catchAsync.js";
import imageRouter from "./src/image/controller.js";

const app = express();

// common middleware
app.use(bodyParser.json());
app.use(morgan("dev"));
app.use(cors());

// guard
// app.use(hostGuard);
app.use(catchMiddleware(tokenGuard));

app.get("/sse/event", (req, res) => {
  const sse = new SSE(res);
  const timer = setInterval(() => {
    sse.sendData(Math.random() + "");
  }, 1000);
  req.on("close", () => {
    clearInterval(timer);
  });
});
// routes
app.use("/api/v1/instance", instanceRouter);
app.use("/api/v1/job", jobRouter);
app.use("/api/v1/image", imageRouter);
app.use("/api/v1", wsRouter);

// not found url
app.use(catchMiddleware(notFoundHandler));

// error handler
app.use(errorHandler);

export default app;

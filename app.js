import bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";

const app = express();

app.use(bodyParser.json());
app.use(morgan("dev"));

export default app;

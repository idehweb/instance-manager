import { resolve } from "path";

export default {
  entry: "./server.js",
  mode: "production",
  target: "node18",
  node: {
    __dirname: false,
    __filename: false,
  },
  output: {
    path: resolve("dist"),
    filename: "index.cjs",
    clean: true,
  },
  devtool: "source-map",
  optimization: {
    minimize: false,
  },
};

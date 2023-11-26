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
    filename: "bundle.cjs",
    clean: true,
  },
  resolve: {
    extensions: [".js"],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
    ],
  },
  externals: {
    cloudflare: "commonjs cloudflare",
  },
};

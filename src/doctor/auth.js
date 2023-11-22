import { getEnv } from "../utils/helpers.js";

export function authToken(req, res, next) {
  const token = req.get("authorization");
  const myToken = getEnv("internal-token", { format: "string" });
  if (!token || token !== myToken)
    return res.status(401).json({ message: "invalid token" });
  return next();
}

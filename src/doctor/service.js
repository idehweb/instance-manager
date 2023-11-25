import { Global } from "../global.js";
import { catchMiddleware } from "../utils/catchAsync.js";

class Service {
  getOne = catchMiddleware(async (req, res, next) => {
    const id = req.params.id;
    const hasManager = Global.jobs.has(id);
    if (hasManager)
      return res.status(200).json({ status: "success", health: "healthy" });

    return res
      .status(404)
      .json({ status: "failed", message: "not found execute manager" });
  });
}
const service = new Service();
export default service;

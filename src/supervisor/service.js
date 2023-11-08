import { instanceModel } from "../model/instance.model.js";
import { classCatchBuilder } from "../utils/catchAsync.js";

class Service {
  static async event(req, res, next) {
    // send response
    res.status(200).json({ message: "event received" });

    const { event, body } = req.body;
    const instance = req.instance;

    if (event !== "config-update" || !body?.[0]?.favicons) return;

    const [favicon] = body[0].favicons;

    await instanceModel.updateOne({ _id: instance.id }, [
      {
        $addFields: {
          favicon: { $concat: ["https://", "$primary_domain", favicon.dist] },
        },
      },
    ]);
  }
}

classCatchBuilder(Service);

export default Service;

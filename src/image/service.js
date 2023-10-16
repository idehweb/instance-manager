import imageModel from "../model/image.model.js";

class Service {
  async getAll(req, res) {
    const images = await imageModel.find().sort({ createdAt: -1 });
    return res.json({ data: images });
  }

  async add(req, res) {
    const image = await imageModel.create(req.body);
    return res.status(201).json({ data: image });
  }

  async delete(req, res) {
    try {
      await imageModel.findByIdAndDelete(req.params.id);
      return res.status(204).send();
    } catch (err) {
      return res.status(404).json({ message: "image not found" });
    }
  }

  async getLatest() {
    return await imageModel.findOne({}).sort({ createdAt: -1 });
  }

  async isIn(image) {
    const imDoc = await imageModel.findOne({ image });
    if (!imDoc) return false;
    return true;
  }
}

const service = new Service();

export default service;

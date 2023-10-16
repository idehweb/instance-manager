import Joi from "joi";

const imageCreateValSch = Joi.object({
  name: Joi.string().required(),
  image: Joi.string().required(),
});

export default imageCreateValSch;

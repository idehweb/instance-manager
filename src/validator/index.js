import Joi from "joi";

export function useValidator(key, schema) {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[key], {
      stripUnknown: true,
    });
    if (error) {
      console.error(error);
      return res.status(400).json({
        status: "error",
        message: error.message,
      });
    }

    req[`original-${key}`] = req[key];
    req[key] = value;
    return next();
  };
}

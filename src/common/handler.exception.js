export function errorHandler(error, req, res, next) {
  console.log("#Error", error);
  const isClosed = res.closed;
  if (isClosed) return;
  return res
    .status(500)
    .json({ status: "error", message: error.message, error });
}

export function notFoundHandler(req, res, next) {
  const isClosed = res.closed;
  if (isClosed) return;
  return res.status(404).json({ status: "error", message: "path not found" });
}

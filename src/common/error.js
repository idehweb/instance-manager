export class SimpleError extends Error {
  isSimple = true;
  constructor(message, stack) {
    super(message);
    if (stack) this.stack = stack;
  }
}

export class NotFoundError extends SimpleError {
  constructor(message, stack) {
    super(`#NotFoundError# ${message}`, stack);
  }
}

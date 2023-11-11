export class SimpleError extends Error {
  isSimple = true;
  constructor(message, stack) {
    super(message);
    if (stack) this.stack = stack;
  }
}

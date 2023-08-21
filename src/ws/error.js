export class UnAuthError extends Error {
  constructor(msg) {
    super(msg);
    this.code = 401;
  }
}

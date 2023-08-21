export class UnAuthError extends Error {
  constructor(msg) {
    super(msg);
    this.code = 401;
  }
}

export class DisconnectError extends Error {
  constructor(msg) {
    super(msg);
    this.code = 500;
  }
}

export class Command {
  constructor({ cmd, credentials, log, error, out }) {
    this.cmd = cmd;
    this.credentials = credentials ?? [];
    this.log = log ?? true;
    this.error = error ?? true;
    this.out = out ?? true;
  }
}

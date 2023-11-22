export class Command {
  constructor({ cmd, credentials }) {
    this.cmd = cmd;
    this.credentials = credentials ?? [];
  }
}

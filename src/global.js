export const Global = {};

export class BaseExecuter {
  constructor(job, instance, exec, log) {
    this.job = job;
    this.instance = instance;
    this.exec = exec;
    this.log = log;
  }
  get instance_name() {
    return `nwi-${this.instance.name}`;
  }
}

import { JobType } from "../model/job.model.js";
import { BaseExecuter } from "./BaseExecuter.js";
import CreateExecuter from "./CreateExecuter.js";
import DeleteExecuter from "./DeleteExecuter.js";
import UpdateExecuter from "./UpdateExecuter.js";

export default class RollbackExecuter extends BaseExecuter {
  constructor(job, instance, log_file, logger) {
    super(job, instance, log_file, logger);
    this.createExecuter = new CreateExecuter(
      job,
      instance,
      log_file,
      this.myLogger
    );
    this.deleteExecuter = new DeleteExecuter(
      job,
      instance,
      log_file,
      this.myLogger
    );
    this.updateExecuter = new UpdateExecuter(
      job,
      instance,
      log_file,
      this.myLogger
    );
  }
  async pre_require() {
    switch (this.job.type) {
      case JobType.CREATE:
        await this.deleteExecuter.pre_require();
        break;
      case JobType.DELETE:
        await this.createExecuter.pre_require();
        break;
      case JobType.UPDATE:
        await this.updateExecuter.pre_require();
        break;
    }
  }

  myLogger = (conf) => {
    this.log(
      conf.chunk,
      conf.isEnd,
      conf.isError,
      conf.whenDifferent,
      conf.labels
    );
  };

  // --- Start Create Executer --- //
  async copy_static() {
    await this.deleteExecuter.rm_static();
  }
  async docker_create() {
    await this.deleteExecuter.service_remove();
  }

  async register_cdn() {
    await this.deleteExecuter.unregister_cdn();
  }
  async create_user_in_db() {
    await this.deleteExecuter.rm_user_from_db();
  }
  async nginx_domain_config() {
    await this.deleteExecuter.rm_domain_config();
  }

  async create_links() {
    await this.deleteExecuter.rm_links();
  }

  async add_domain_certs() {
    await this.deleteExecuter.rm_domain_cert();
  }

  async restore_demo() {
    await this.deleteExecuter.rm_db();
  }
  // --- End Of Create Executer --- //

  // --- Start Update Executer --- //

  exportPrevData(key) {
    const value = this.job.prev_data[key];
    if (!value) {
      this.log(`not found previous ${key}`, false, false, false, ["warning"]);
    }

    return value;
  }

  async changeStatus() {
    const status = this.exportPrevData("status");
    if (!status) return;

    await this.updateExecuter.changeStatus({
      savePrev: false,
      status,
    });
  }
  async changeImage() {
    const image = this.exportPrevData("image");
    if (!image) return;

    await this.updateExecuter.changeImage({
      image,
      savePrev: false,
    });
  }
  async change_primary_domain() {
    const pd = this.exportPrevData("primary_domain");
    if (!pd) return;

    await this.updateExecuter.change_primary_domain({
      primary_domain: pd,
      savePrev: false,
    });
  }
  async update_domain_cdn() {
    const domains_add = this.exportPrevData("domains_add") ?? [];
    const domains_rm = this.exportPrevData("domains_rm") ?? [];
    if (!domains_add.length && !domains_rm.length) return;

    await this.updateExecuter.update_domain_cdn({
      savePrev: false,
      domains_add: domains_rm,
      domains_rm: domains_add,
    });
  }
  async update_domain_cert() {
    const domains_add = this.exportPrevData("domains_add") ?? [];
    const domains_rm = this.exportPrevData("domains_rm") ?? [];
    if (!domains_add.length && !domains_rm.length) return;

    await this.updateExecuter.update_domain_cert({
      savePrev: false,
      domains_add: domains_rm,
      domains_rm: domains_add,
    });
  }
  async update_domain_config() {
    const domains_add = this.exportPrevData("domains_add") ?? [];
    const domains_rm = this.exportPrevData("domains_rm") ?? [];
    if (!domains_add.length && !domains_rm.length) return;

    await this.updateExecuter.update_domain_config({
      savePrev: false,
      domains_add: domains_rm,
      domains_rm: domains_add,
    });
  }
  async update_service_aliases() {
    const domains_add = this.exportPrevData("domains_add") ?? [];
    const domains_rm = this.exportPrevData("domains_rm") ?? [];
    if (!domains_add.length && !domains_rm.length) return;

    await this.updateExecuter.update_service_aliases({
      savePrev: false,
      domains_add: domains_rm,
      domains_rm: domains_add,
    });
  }
  async update_service_links() {
    const domains_add = this.exportPrevData("domains_add") ?? [];
    const domains_rm = this.exportPrevData("domains_rm") ?? [];
    if (!domains_add.length && !domains_rm.length) return;

    await this.updateExecuter.update_service_links({
      savePrev: false,
      domains_add: domains_rm,
      domains_rm: domains_add,
    });
  }
  async update_site_name() {
    const site_name = this.exportPrevData("site_name");
    if (!site_name) return;

    await this.updateExecuter.update_site_name({ savePrev: false, site_name });
  }

  // --- End Of Update Executer --- //

  // --- Start Delete Executer --- //
  async backup_db() {}
  async backup_static() {}
  async rm_db() {}
  async service_remove() {}
  async rm_static() {}
  async rm_domain_config() {}
  async rm_domain_cert() {}
  async rm_user_from_db() {}
  async rm_links() {}
  async unregister_cdn() {}
  // --- End Of Delete Executer --- //
}

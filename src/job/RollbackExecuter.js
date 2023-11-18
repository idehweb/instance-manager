import { BaseExecuter } from "./BaseExecuter";
import CreateExecuter from "./CreateExecuter";
import DeleteExecuter from "./DeleteExecuter";
import UpdateExecuter from "./UpdateExecuter";

export default class RollbackExecuter extends BaseExecuter {
  constructor(job, instance, log_file) {
    super(job, instance, log_file);
    this.createExecuter = new CreateExecuter(
      job,
      instance,
      log_file,
      this.logger
    );
    this.deleteExecuter = new DeleteExecuter(
      job,
      instance,
      log_file,
      this.logger
    );
    this.updateExecuter = new UpdateExecuter(
      job,
      instance,
      log_file,
      this.logger
    );
  }

  logger = (conf) => {
    this.log(conf);
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
  //   TODO
  async nginx_domain_config() {}

  async add_domain_certs() {
    await this.deleteExecuter.rm_domain_cert();
  }

  async restore_demo() {
    await this.deleteExecuter.rm_db();
  }
  // --- End Of Create Executer --- //

  // --- Start Update Executer --- //

  async changeStatus() {
    await this.updateExecuter.changeStatus();
  }
  async changeImage() {
    await this.updateExecuter.changeImage();
  }
  async change_primary_domain() {
    await this.updateExecuter.change_primary_domain();
  }
  async update_domain_cdn() {
    await this.updateExecuter.update_domain_cdn();
  }
  async update_domain_cert() {
    await this.updateExecuter.update_domain_cert();
  }
  async update_domain_config() {
    await this.updateExecuter.update_domain_config();
  }
  async update_site_name() {
    await this.updateExecuter.update_site_name();
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
  async unregister_cdn() {}
  // --- End Of Delete Executer --- //
}

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

  async copy_static() {
    await this.deleteExecuter.rm_static();
  }
  async docker_create() {}
  async register_cdn() {}
  async unregister_cdn() {}
  async restore_demo() {}
  async changeDomains() {}
  async changeStatus() {}
  async backup_db() {}
  async backup_static() {}
  async rm_db() {}
  async service_remove() {}
  async rm_static() {}
  async changeImage() {}
  async change_primary_domain() {}
  async nginx_domain_config() {}
  async rm_domain_config() {}
  async domain_certs() {}
  async rm_domain_cert() {}
  async create_static_dirs() {}
  async update_domain_cdn() {}
  async update_domain_cert() {}
  async update_domain_config() {}
  async create_user_in_db() {}
  async rm_user_from_db() {}
  async update_site_name() {}
}

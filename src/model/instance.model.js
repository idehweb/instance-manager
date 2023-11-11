import mongoose from "mongoose";

function isActive(status) {
  return [
    InstanceStatus.UP,
    InstanceStatus.DOWN,
    InstanceStatus.ERROR,
    InstanceStatus.SUSPEND,
    InstanceStatus.JOB_CREATE,
  ].includes(status);
}

export const InstanceStatus = {
  JOB_CREATE: "job-create",
  UP: "up",
  DOWN: "down",
  ERROR: "error",
  JOB_ERROR: "job-error",
  DELETED: "deleted",
  CANCELED: "canceled",
  EXPIRED: "expired",
  SUSPEND: "suspend",
};

export const InstanceRegion = {
  IRAN: "iran",
  GERMAN: "german",
};

export const InstancePattern = {
  Demo1: "demo1",
  Demo2: "demo2",
  Demo3: "demo3",
  Demo4: "demo4",
  Demo5: "demo5",
  Demo6: "demo6",
};

export const instanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    db: { type: String, required: true },
    old_name: String,
    cpu: { type: Number, required: true },
    memory: { type: Number, required: true },
    disk: { type: Number, required: true },
    replica: { type: Number, required: true },
    status: {
      type: String,
      default: InstanceStatus.JOB_CREATE,
      required: true,
    },
    image: { type: String, default: process.env.INSTANCE_DEFAULT_IMAGE },
    favicon: { type: String },
    site_name: { type: String, required: true },
    pattern: { type: String },
    server_ip: { type: String },
    nodeewebhub: {
      url: String,
      api_url: String,
    },
    domains: {
      type: [
        {
          _id: false,
          status: String,
          content: String,
          ns: { type: [String], default: undefined },
        },
      ],
      required: true,
    },
    region: { type: String, required: true },
    primary_domain: { type: String, required: true },
    active: { type: Boolean, default: true },
    jobs: { type: [mongoose.Schema.Types.ObjectId] },
    expiredAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// name
instanceSchema.index(
  { name: 1 },
  {
    unique: true,
    name: "instance name",
    partialFilterExpression: {
      active: true,
    },
  }
);

// domains
instanceSchema.index(
  { "domains.content": 1 },
  {
    unique: true,
    name: "domain",
    partialFilterExpression: {
      active: true,
    },
  }
);

instanceSchema.static("isActive", isActive);

instanceSchema.pre(/update/i, function (next) {
  const update = this.getUpdate();
  const status = update?.$set?.status ?? update?.status;
  if (!status) return next();

  // set active field
  update.$set.active = isActive(status);

  return next();
});

export const instanceModel = mongoose.model(
  "instances",
  instanceSchema,
  "instances"
);

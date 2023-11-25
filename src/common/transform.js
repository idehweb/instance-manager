export function transform(content, code, req) {
  let result = {};
  if (code < 400) result.status = "success";
  else result.status = "error";

  // 1. merge
  result = { ...result, ...content };

  // 2. check
  if (!req.admin) {
    if (result.job) result.job = { ...result.job._doc };
    if (result.jobs) result.jobs = { ...result.jobs.map((j) => j._doc) };
    const jobs = [result.job, ...(result.jobs ?? [])].filter((j) => j);
    jobs.forEach((job) => {
      // delete job.logs;
      // delete job.errs;
      delete job.executer;
    });
  }

  return result;
}

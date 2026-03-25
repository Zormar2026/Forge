const claude = require('./claude');

const handlers = {};
let dbHelper = null;
let pollInterval = null;

function registerHandler(type, fn) {
  handlers[type] = fn;
}

function start(jobsHelper) {
  dbHelper = jobsHelper;

  registerHandler('rebuild_content', async (payload, updateProgress) => {
    updateProgress(10);
    const brand = payload.brand;
    const result = await claude.rebuildForBrand(
      payload.intelligence || null,
      brand,
      {
        funnel_stage: payload.funnel_stage,
        tone: payload.tone,
        length: payload.length,
        template: payload.template,
      }
    );
    updateProgress(90);
    if (result.success === false) throw new Error(result.error);
    updateProgress(100);
    return result;
  });

  registerHandler('research_niche', async (payload, updateProgress) => {
    updateProgress(10);
    const result = await claude.generateBrandResearch(payload.idea);
    updateProgress(90);
    if (result.success === false) throw new Error(result.error);
    updateProgress(100);
    return result;
  });

  pollInterval = setInterval(() => tick(), 2000);
}

function stop() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function tick() {
  if (!dbHelper) return;

  let pendingJobs;
  try {
    pendingJobs = dbHelper.getAll({ status: 'pending', limit: 1 });
  } catch {
    return;
  }

  if (!pendingJobs || pendingJobs.length === 0) return;
  const job = pendingJobs[0];

  try {
    dbHelper.update(job.id, { status: 'processing', started_at: new Date().toISOString() });

    const handler = handlers[job.type];
    if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);

    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : (job.payload || {});

    const updateProgress = (percent) => {
      try {
        dbHelper.update(job.id, { progress: percent });
      } catch {
        // Non-critical
      }
    };

    const result = await handler(payload, updateProgress);

    dbHelper.update(job.id, {
      status: 'complete',
      result: JSON.stringify(result),
      progress: 100,
      completed_at: new Date().toISOString()
    });
  } catch (err) {
    try {
      dbHelper.update(job.id, {
        status: 'failed',
        error: err.message || 'Unknown error',
        completed_at: new Date().toISOString()
      });
    } catch {
      // Prevent crash
    }
  }
}

module.exports = { start, stop, registerHandler };

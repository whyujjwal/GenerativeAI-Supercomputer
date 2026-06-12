import cron from 'node-cron';
import { runBrief } from '../agent/runner.js';
import * as store from './store.js';

/** @type {Map<string, import('node-cron').ScheduledTask>} */
const tasks = new Map();

/** @type {Set<string>} */
const running = new Set();

function isValidCron(expression) {
  return cron.validate(expression);
}

async function executeSchedule(schedule) {
  if (running.has(schedule.id)) {
    console.warn(`Schedule "${schedule.name}" (${schedule.id}) skipped — previous run still in progress`);
    return { skipped: true };
  }

  running.add(schedule.id);
  const startedAt = new Date().toISOString();

  try {
    const result = await runBrief({
      brief: schedule.brief,
      brain: schedule.brain,
      persona: schedule.persona,
      deliver: schedule.deliver,
    });

    const status = result.error
      ? { ok: false, error: result.error, startedAt, finishedAt: new Date().toISOString() }
      : {
          ok: true,
          text: result.text,
          assetCount: result.assets?.length || 0,
          startedAt,
          finishedAt: new Date().toISOString(),
        };

    await store.update(schedule.id, {
      lastRun: startedAt,
      lastStatus: status,
    });

    return { result, status };
  } catch (error) {
    const status = {
      ok: false,
      error: error.message || String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    await store.update(schedule.id, {
      lastRun: startedAt,
      lastStatus: status,
    });
    return { error: status.error, status };
  } finally {
    running.delete(schedule.id);
  }
}

function unregisterSchedule(id) {
  const task = tasks.get(id);
  if (task) {
    task.stop();
    tasks.delete(id);
  }
}

function registerSchedule(schedule) {
  unregisterSchedule(schedule.id);

  if (!schedule.enabled) {
    return;
  }

  if (!isValidCron(schedule.cron)) {
    console.warn(`Schedule "${schedule.name}" (${schedule.id}) has invalid cron: ${schedule.cron}`);
    return;
  }

  const task = cron.schedule(schedule.cron, () => {
    executeSchedule(schedule).catch((error) => {
      console.error(`Scheduled run failed for ${schedule.id}:`, error.message || String(error));
    });
  });

  tasks.set(schedule.id, task);
}

export async function refreshScheduler() {
  const schedules = await store.list();
  const activeIds = new Set(schedules.map((s) => s.id));

  for (const id of tasks.keys()) {
    if (!activeIds.has(id)) {
      unregisterSchedule(id);
    }
  }

  for (const schedule of schedules) {
    registerSchedule(schedule);
  }
}

export function startScheduler() {
  refreshScheduler().catch((error) => {
    console.error('Failed to start scheduler:', error.message || String(error));
  });
}

export async function runScheduleNow(id) {
  const schedule = await store.get(id);
  if (!schedule) {
    return null;
  }

  if (running.has(id)) {
    return { ok: false, error: 'Schedule is already running' };
  }

  const execution = await executeSchedule(schedule);
  const updated = await store.get(id);
  return { ok: true, schedule: updated, ...execution };
}

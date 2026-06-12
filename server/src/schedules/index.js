import nodeCron from 'node-cron';
import { Router } from 'express';
import { refreshScheduler, runScheduleNow } from './scheduler.js';
import * as store from './store.js';

const router = Router();

function isValidCron(expression) {
  return typeof expression === 'string' && nodeCron.validate(expression);
}

router.get('/', async (_req, res) => {
  try {
    const schedules = await store.list();
    return res.json(schedules);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list schedules';
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post('/', async (req, res) => {
  const { name, brief, cron } = req.body ?? {};

  if (!name || !brief || !cron) {
    return res.status(400).json({ ok: false, error: 'name, brief, and cron are required' });
  }

  if (!isValidCron(cron)) {
    return res.status(400).json({ ok: false, error: `Invalid cron expression: ${cron}` });
  }

  try {
    const schedule = await store.create(req.body);
    await refreshScheduler();
    return res.status(201).json(schedule);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create schedule';
    return res.status(500).json({ ok: false, error: message });
  }
});

router.put('/:id', async (req, res) => {
  const { cron } = req.body ?? {};
  if (cron !== undefined && !isValidCron(cron)) {
    return res.status(400).json({ ok: false, error: `Invalid cron expression: ${cron}` });
  }

  try {
    const updated = await store.update(req.params.id, req.body ?? {});
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Schedule not found' });
    }
    await refreshScheduler();
    return res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update schedule';
    return res.status(500).json({ ok: false, error: message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const removed = await store.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Schedule not found' });
    }
    await refreshScheduler();
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete schedule';
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const runOutcome = await runScheduleNow(req.params.id);
    if (!runOutcome) {
      return res.status(404).json({ ok: false, error: 'Schedule not found' });
    }

    if (!runOutcome.ok) {
      return res.status(409).json(runOutcome);
    }

    return res.json({
      ok: true,
      schedule: runOutcome.schedule,
      result: runOutcome.result ?? null,
      status: runOutcome.status ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run schedule';
    return res.status(500).json({ ok: false, error: message });
  }
});

export default router;

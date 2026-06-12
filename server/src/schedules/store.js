import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const STORE_PATH = path.join(DATA_DIR, 'schedules.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, '[]', 'utf8');
  }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(schedules) {
  await ensureStore();
  await fs.writeFile(STORE_PATH, `${JSON.stringify(schedules, null, 2)}\n`, 'utf8');
}

export async function list() {
  return readAll();
}

export async function get(id) {
  const schedules = await readAll();
  return schedules.find((s) => s.id === id) || null;
}

/**
 * @param {Object} input
 */
export async function create(input) {
  const schedules = await readAll();
  const now = new Date().toISOString();
  const schedule = {
    id: crypto.randomUUID(),
    name: input.name,
    brief: input.brief,
    cron: input.cron,
    brain: input.brain ?? null,
    persona: input.persona ?? null,
    deliver: input.deliver ?? null,
    enabled: input.enabled !== false,
    lastRun: null,
    lastStatus: null,
    createdAt: now,
  };
  schedules.push(schedule);
  await writeAll(schedules);
  return schedule;
}

/**
 * @param {string} id
 * @param {Object} patch
 */
export async function update(id, patch) {
  const schedules = await readAll();
  const index = schedules.findIndex((s) => s.id === id);
  if (index === -1) {
    return null;
  }

  const allowed = ['name', 'brief', 'cron', 'brain', 'persona', 'deliver', 'enabled', 'lastRun', 'lastStatus'];
  const updated = { ...schedules[index] };
  for (const key of allowed) {
    if (key in patch) {
      updated[key] = patch[key];
    }
  }
  schedules[index] = updated;
  await writeAll(schedules);
  return updated;
}

export async function remove(id) {
  const schedules = await readAll();
  const next = schedules.filter((s) => s.id !== id);
  if (next.length === schedules.length) {
    return false;
  }
  await writeAll(next);
  return true;
}

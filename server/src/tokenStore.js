import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import { decrypt, encrypt } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '.data');
const STORE_PATH = path.join(DATA_DIR, 'tokens.json');

const PROVIDERS = ['slack', 'google', 'notion'];

function encKey() {
  if (config.tokenEncKey) {
    return config.tokenEncKey;
  }
  if (config.isDev) {
    return '0'.repeat(64);
  }
  throw new Error('TOKEN_ENC_KEY is not configured');
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, '{}', 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeStore(data) {
  await ensureStore();
  await fs.writeFile(STORE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function get(provider) {
  const store = await readStore();
  const entry = store[provider];
  if (!entry?.ciphertext) {
    return null;
  }

  const plaintext = decrypt(entry.ciphertext, encKey());
  return JSON.parse(plaintext);
}

export async function set(provider, tokenData) {
  const store = await readStore();
  store[provider] = {
    ciphertext: encrypt(JSON.stringify(tokenData), encKey()),
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return tokenData;
}

export async function remove(provider) {
  const store = await readStore();
  if (!(provider in store)) {
    return false;
  }
  delete store[provider];
  await writeStore(store);
  return true;
}

export async function status() {
  const store = await readStore();
  return Object.fromEntries(
    PROVIDERS.map((provider) => [provider, Boolean(store[provider]?.ciphertext)]),
  );
}

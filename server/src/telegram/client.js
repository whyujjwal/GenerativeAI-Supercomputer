import config from '../config.js';

function apiBase() {
  const token = config.telegramBotToken;
  if (!token) {
    throw new Error('Telegram bot token is not configured');
  }
  return `https://api.telegram.org/bot${token}`;
}

async function callMethod(method, body) {
  const res = await fetch(`${apiBase()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const detail = data.description || res.statusText || `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed: ${detail}`);
  }

  return data;
}

/**
 * @param {number|string} chatId
 * @param {string} text
 */
export async function sendMessage(chatId, text) {
  return callMethod('sendMessage', {
    chat_id: chatId,
    text: text || '(no response)',
  });
}

/**
 * @param {number|string} chatId
 * @param {string} url
 * @param {string} [caption]
 */
export async function sendPhoto(chatId, url, caption) {
  const body = { chat_id: chatId, photo: url };
  if (caption) body.caption = caption;
  return callMethod('sendPhoto', body);
}

/**
 * @param {number|string} chatId
 * @param {string} url
 * @param {string} [caption]
 */
export async function sendVideo(chatId, url, caption) {
  const body = { chat_id: chatId, video: url };
  if (caption) body.caption = caption;
  return callMethod('sendVideo', body);
}

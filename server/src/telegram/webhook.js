import { Router } from 'express';
import { runBrief } from '../agent/runner.js';
import config from '../config.js';
import * as telegram from './client.js';

const router = Router();

function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function isImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp|avif|bmp)(\?|$)/i.test(url);
}

/**
 * @param {string} text
 */
function parseTelegramMessage(text) {
  let remaining = String(text || '').trim();
  let brain;
  let persona;

  const brainMatch = remaining.match(/^\/brain\s+(\S+)\s*/i);
  if (brainMatch) {
    brain = brainMatch[1];
    remaining = remaining.slice(brainMatch[0].length);
  }

  const personaMatch = remaining.match(/^\/persona\s+(\S+)\s*/i);
  if (personaMatch) {
    persona = personaMatch[1];
    remaining = remaining.slice(personaMatch[0].length);
  }

  return { brief: remaining.trim(), brain, persona };
}

/**
 * @param {number|string} chatId
 * @param {{ text?: string|null, assets?: string[], error?: string }} result
 */
async function replyToChat(chatId, result) {
  if (result.error) {
    await telegram.sendMessage(chatId, `Error: ${result.error}`);
    return;
  }

  const summary = result.text || 'Brief completed.';
  await telegram.sendMessage(chatId, summary);

  for (const url of result.assets || []) {
    try {
      if (isVideoUrl(url)) {
        await telegram.sendVideo(chatId, url);
      } else if (isImageUrl(url)) {
        await telegram.sendPhoto(chatId, url);
      } else {
        await telegram.sendMessage(chatId, url);
      }
    } catch (error) {
      console.warn('Failed to send Telegram asset:', error.message || String(error));
      await telegram.sendMessage(chatId, url);
    }
  }
}

/**
 * @param {Object} update
 */
async function handleUpdate(update) {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!chatId || !text) {
    return;
  }

  if (!config.telegramBotToken) {
    console.warn('Telegram webhook received message but TELEGRAM_BOT_TOKEN is not configured');
    return;
  }

  const { brief, brain, persona } = parseTelegramMessage(text);
  if (!brief) {
    await telegram.sendMessage(
      chatId,
      'Send a creative brief as plain text. Optional prefixes: /brain claude|openai|gemini and /persona <id>',
    );
    return;
  }

  const result = await runBrief({ brief, brain, persona });
  await replyToChat(chatId, result);
}

router.post('/webhook', (req, res) => {
  const secret = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (!config.telegramWebhookSecret || secret !== config.telegramWebhookSecret) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  res.status(200).json({ ok: true });

  handleUpdate(req.body).catch((error) => {
    console.error('Telegram webhook handler error:', error.message || String(error));
  });
});

export default router;

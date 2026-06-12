import config from '../src/config.js';

const webhookUrl = process.argv[2] || process.env.TELEGRAM_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('Usage: node scripts/set-telegram-webhook.js <webhook-url>');
  console.error('   or: TELEGRAM_WEBHOOK_URL=https://example.com/api/telegram/webhook node scripts/set-telegram-webhook.js');
  process.exit(1);
}

if (!config.telegramBotToken) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

if (!config.telegramWebhookSecret) {
  console.error('TELEGRAM_WEBHOOK_SECRET is not set');
  process.exit(1);
}

const apiUrl = `https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`;

const res = await fetch(apiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl.replace(/\/$/, ''),
    secret_token: config.telegramWebhookSecret,
  }),
});

const data = await res.json().catch(() => ({}));

if (!res.ok || data.ok === false) {
  console.error('setWebhook failed:', data.description || res.statusText);
  process.exit(1);
}

console.log('Webhook registered:', webhookUrl.replace(/\/$/, ''));
if (data.description) {
  console.log(data.description);
}

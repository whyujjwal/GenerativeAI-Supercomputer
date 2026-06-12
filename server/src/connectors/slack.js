import { fetchJson, normalizeError } from '../util/http.js';

export async function postMessage(tokenData, { channel, text }) {
  if (!channel || !text) {
    throw new Error('channel and text are required');
  }

  const data = await fetchJson('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  });

  if (!data.ok) {
    throw normalizeError(400, data, data.error || 'Slack API error');
  }

  return {
    channel: data.channel,
    ts: data.ts,
    message: data.message,
  };
}

export const actions = {
  postMessage,
};

import * as tokenStore from '../tokenStore.js';
import { fetchBuffer, fetchJson } from '../util/http.js';
import { getProvider } from '../oauth/providers.js';

async function refreshAccessToken(refreshToken) {
  const provider = getProvider('google');
  if (!provider?.configured) {
    throw new Error('Google OAuth is not configured');
  }

  const body = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const data = await fetchJson(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    scope: data.scope,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

export async function ensureFreshToken(tokenData) {
  const expiresAt = tokenData.expires_at;
  const needsRefresh = expiresAt && Date.now() >= expiresAt - 60_000;

  if (!needsRefresh) {
    return tokenData;
  }

  if (!tokenData.refresh_token) {
    throw new Error('Google refresh token is missing; reconnect Google');
  }

  const refreshed = await refreshAccessToken(tokenData.refresh_token);
  const updated = {
    ...tokenData,
    ...refreshed,
    refresh_token: tokenData.refresh_token,
  };

  await tokenStore.set('google', updated);
  return updated;
}

async function authHeaders(tokenData) {
  const fresh = await ensureFreshToken(tokenData);
  return {
    Authorization: `Bearer ${fresh.access_token}`,
  };
}

export async function driveUpload(tokenData, { name, mimeType, contentUrl }) {
  if (!name || !contentUrl) {
    throw new Error('name and contentUrl are required');
  }

  const content = await fetchBuffer(contentUrl);
  const resolvedMimeType = mimeType || 'application/octet-stream';
  const headers = await authHeaders(tokenData);

  const metadata = { name };
  const boundary = `boundary_${Date.now()}`;
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${resolvedMimeType}\r\n\r\n`,
    'utf8',
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const body = Buffer.concat([preamble, content, closing]);

  const data = await fetchJson(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink,
  };
}

function buildRawEmail({ to, subject, body }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];
  return lines.join('\r\n');
}

export async function gmailSend(tokenData, { to, subject, body }) {
  if (!to || !subject || body === undefined) {
    throw new Error('to, subject, and body are required');
  }

  const raw = buildRawEmail({ to, subject, body });
  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const headers = await authHeaders(tokenData);
  const data = await fetchJson('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  return {
    id: data.id,
    threadId: data.threadId,
    labelIds: data.labelIds,
  };
}

export const actions = {
  'drive.upload': driveUpload,
  'gmail.send': gmailSend,
};

import crypto from 'node:crypto';
import { Router } from 'express';
import config from '../config.js';
import * as tokenStore from '../tokenStore.js';
import { fetchJson, normalizeError } from '../util/http.js';
import { getProvider } from './providers.js';

const router = Router();

function buildAuthUrl(provider, state) {
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: 'code',
    state,
  });

  if (provider.scopes?.length) {
    params.set('scope', provider.scopes.join(' '));
  }

  if (provider.name === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  if (provider.name === 'notion') {
    params.set('owner', provider.owner ?? 'user');
  }

  return `${provider.authUrl}?${params.toString()}`;
}

async function exchangeSlackToken(provider, code) {
  const body = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code,
    redirect_uri: provider.redirectUri,
  });

  const data = await fetchJson(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!data.ok) {
    throw normalizeError(400, data, data.error || 'Slack token exchange failed');
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    scope: data.scope,
    team: data.team,
    bot_user_id: data.bot_user_id,
    authed_user: data.authed_user,
  };
}

async function exchangeGoogleToken(provider, code) {
  const body = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code,
    redirect_uri: provider.redirectUri,
    grant_type: 'authorization_code',
  });

  const data = await fetchJson(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    scope: data.scope,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

async function exchangeNotionToken(provider, code) {
  const credentials = Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString('base64');
  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: provider.redirectUri,
  };

  const data = await fetchJson(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    workspace_id: data.workspace_id,
    workspace_name: data.workspace_name,
    bot_id: data.bot_id,
    owner: data.owner,
  };
}

async function exchangeCode(providerName, provider, code) {
  switch (providerName) {
    case 'slack':
      return exchangeSlackToken(provider, code);
    case 'google':
      return exchangeGoogleToken(provider, code);
    case 'notion':
      return exchangeNotionToken(provider, code);
    default:
      throw new Error(`Unsupported provider: ${providerName}`);
  }
}

router.get('/:provider', (req, res) => {
  const provider = getProvider(req.params.provider);
  if (!provider) {
    return res.status(400).json({ ok: false, error: 'Unknown provider' });
  }

  if (!provider.configured) {
    return res.status(503).json({ ok: false, error: 'Provider OAuth is not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.oauthProvider = provider.name;

  return res.redirect(302, buildAuthUrl(provider, state));
});

router.get('/:provider/callback', async (req, res) => {
  const providerName = req.params.provider;
  const provider = getProvider(providerName);

  if (!provider) {
    return res.status(400).send('Unknown provider');
  }

  const { code, state, error } = req.query;

  if (error) {
    const message = typeof error === 'string' ? error : 'oauth_error';
    return res.redirect(`${config.appOrigin}?oauth_error=${encodeURIComponent(message)}`);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing authorization code');
  }

  if (
    typeof state !== 'string' ||
    state !== req.session.oauthState ||
    providerName !== req.session.oauthProvider
  ) {
    return res.status(400).send('Invalid OAuth state');
  }

  delete req.session.oauthState;
  delete req.session.oauthProvider;

  try {
    const tokenData = await exchangeCode(providerName, provider, code);
    await tokenStore.set(providerName, tokenData);
    return res.redirect(`${config.appOrigin}?connected=${encodeURIComponent(providerName)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed';
    return res.redirect(`${config.appOrigin}?oauth_error=${encodeURIComponent(message)}`);
  }
});

export default router;

import { Router } from 'express';
import * as tokenStore from '../tokenStore.js';
import * as google from './google.js';
import * as notion from './notion.js';
import * as slack from './slack.js';

const router = Router();

const CONNECTORS = {
  slack,
  google,
  notion,
};

router.get('/status', async (_req, res) => {
  try {
    const status = await tokenStore.status();
    return res.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read connector status';
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post('/:provider/disconnect', async (req, res) => {
  const { provider } = req.params;

  if (!CONNECTORS[provider]) {
    return res.status(400).json({ ok: false, error: 'Unknown provider' });
  }

  try {
    await tokenStore.remove(provider);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect provider';
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post('/:provider/:action', async (req, res) => {
  const { provider, action } = req.params;

  if (action === 'disconnect') {
    return res.status(400).json({ ok: false, error: 'Use POST /api/connectors/:provider/disconnect' });
  }

  const connector = CONNECTORS[provider];
  if (!connector) {
    return res.status(400).json({ ok: false, error: 'Unknown provider' });
  }

  const handler = connector.actions[action];
  if (!handler) {
    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  }

  try {
    const tokenData = await tokenStore.get(provider);
    if (!tokenData) {
      return res.status(401).json({ ok: false, error: `${provider} is not connected` });
    }

    const result = await handler(tokenData, req.body ?? {});
    return res.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connector action failed';
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    return res.status(status).json({ ok: false, error: message });
  }
});

export default router;

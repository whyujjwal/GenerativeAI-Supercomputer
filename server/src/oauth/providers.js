import config from '../config.js';

export const PROVIDER_NAMES = ['slack', 'google', 'notion'];

const OAUTH_META = {
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write'],
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/gmail.send'],
    offlineAccess: true,
  },
  notion: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    owner: 'user',
  },
};

export function getProvider(name) {
  if (!PROVIDER_NAMES.includes(name)) {
    return null;
  }

  const meta = OAUTH_META[name];
  const credentials = config.providers[name];

  return {
    name,
    ...meta,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    redirectUri: credentials.redirectUri,
    configured: Boolean(
      credentials.clientId && credentials.clientSecret && credentials.redirectUri,
    ),
  };
}

export function listProviders() {
  return PROVIDER_NAMES.map((name) => getProvider(name));
}

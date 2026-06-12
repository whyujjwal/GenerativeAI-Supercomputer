const DEFAULT_PORT = 8787;
const DEFAULT_APP_ORIGIN = 'http://localhost:5173';

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function providerConfig(prefix) {
  return {
    clientId: readEnv(`${prefix}_CLIENT_ID`),
    clientSecret: readEnv(`${prefix}_CLIENT_SECRET`),
    redirectUri: readEnv(`${prefix}_REDIRECT_URI`),
  };
}

function validate() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !readEnv('TOKEN_ENC_KEY')) {
    throw new Error('TOKEN_ENC_KEY is required in production');
  }
}

const config = {
  port: Number(readEnv('PORT') ?? DEFAULT_PORT),
  appOrigin: readEnv('APP_ORIGIN') ?? DEFAULT_APP_ORIGIN,
  tokenEncKey: readEnv('TOKEN_ENC_KEY'),
  isDev: process.env.NODE_ENV !== 'production',
  sessionSecret: readEnv('SESSION_SECRET') ?? readEnv('TOKEN_ENC_KEY') ?? 'dev-session-secret-change-me',
  providers: {
    slack: providerConfig('SLACK'),
    google: providerConfig('GOOGLE'),
    notion: providerConfig('NOTION'),
  },
};

validate();

export default config;

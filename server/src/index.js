import cookieSession from 'cookie-session';
import cors from 'cors';
import express from 'express';
import config from './config.js';
import connectorsRouter from './connectors/index.js';
import oauthRouter from './oauth/index.js';
import schedulesRouter from './schedules/index.js';
import { startScheduler } from './schedules/scheduler.js';
import telegramRouter from './telegram/webhook.js';

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (origin === config.appOrigin) {
        return callback(null, true);
      }

      if (config.isDev && origin.startsWith('file://')) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

app.use(
  cookieSession({
    name: 'gai_oauth',
    secret: config.sessionSecret,
    httpOnly: true,
    sameSite: 'lax',
    secure: !config.isDev,
    maxAge: 10 * 60 * 1000,
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/oauth', oauthRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/telegram', telegramRouter);

app.use((err, _req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ ok: false, error: 'CORS blocked' });
  }

  return res.status(500).json({ ok: false, error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Connector server listening on http://localhost:${config.port}`);
  startScheduler();
});

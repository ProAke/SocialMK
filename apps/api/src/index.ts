import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { DATA_DIR } from './db.js';
import { seedDatabase } from './seed.js';
import { attachAuth, errorHandler } from './http.js';
import { authRouter } from './routes/auth.js';
import { coreRouter } from './routes/core.js';
import { contentRouter } from './routes/content.js';
import { growthRouter } from './routes/growth.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter } from './routes/publicApi.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

seedDatabase();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'socialmk-api',
    version: '0.1.0-beta.1',
    time: new Date().toISOString(),
  });
});

app.use('/media/assets', express.static(path.join(DATA_DIR, 'assets'), { maxAge: '1h' }));

app.use('/api/auth', authRouter);
app.use('/api/v1', publicRouter);
app.use('/api', attachAuth);
app.use('/api', coreRouter);
app.use('/api', contentRouter);
app.use('/api', growthRouter);
app.use('/api', adminRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Serve the built SPA when available (production mode).
const webDist = path.resolve(here, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, HOST, () => {
  console.log(`SocialMK API listening on http://${HOST}:${PORT} (beta)`);
});

// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — server entry point
// ═══════════════════════════════════════════════════════════════════
import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';
import { fileURLToPath } from 'url';
import path    from 'path';
import fs      from 'fs';

import { initDatabase, getSettings } from './database.js';
import routes  from './routes.js';
import { startScheduler }  from './scheduler.js';
import { startAutoScrape } from './scraper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DOTENV_PATH is set by the Electron main process in packaged mode
dotenv.config({ path: process.env.DOTENV_PATH || path.join(__dirname, '..', '.env') });

const app  = express();
const PORT = process.env.PORT || 3001;

// Allow both the Vite dev server and Electron (same-origin) to call the API
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3001',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '15mb' }));

// API routes first
app.get('/api', (_req, res) => res.json({ ok: true, service: 'NewsPost Auto' }));
app.use('/api', routes);

// In production / Electron mode, serve the built Vite client
// CLIENT_DIST is set by the Electron main process so the path resolves correctly
// whether running packaged or in dev mode.
const clientDist = process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log('[Server] Serving built client from client/dist');
}

app.listen(PORT, () => {
  console.log(`NewsPost Auto server running on http://localhost:${PORT}`);
  boot();
});

async function boot() {
  const dbOk = await initDatabase();
  if (dbOk) {
    try {
      const settings = await getSettings();
      await startAutoScrape(settings.scrape_interval);
      await startScheduler();
    } catch (e) {
      console.warn('[Boot] background jobs not started:', e.message);
    }
  } else {
    console.warn('[Boot] DB not ready — background jobs paused (run server/schema.sql).');
  }
}

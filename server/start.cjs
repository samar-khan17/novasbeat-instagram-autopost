// CJS entry-point for ELECTRON_RUN_AS_NODE mode.
// Runs BEFORE ES module imports, so env vars are available when database.js
// creates the Supabase client (ES static imports are hoisted / run first).
'use strict';

// 1. Load .env early — dotenv won't overwrite vars already in process.env
const dotenv = require('dotenv');
const path   = require('path');
dotenv.config({ path: process.env.DOTENV_PATH || path.join(__dirname, '..', '.env') });

// 2. Polyfill WebSocket for Node.js < 22 (Electron 32 uses Node.js 20)
try {
  const ws = require('ws');
  if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket;
} catch (_) {}

// 3. Load the ES module server
import('./index.js').catch(function(err) {
  process.stderr.write('[FATAL] Server failed to start:\n' + (err.stack || err) + '\n');
  process.exit(1);
});

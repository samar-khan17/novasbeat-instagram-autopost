// NewsPost Auto — Electron main process
const { app, BrowserWindow, shell, dialog } = require('electron');
const path   = require('path');
const http   = require('http');
const fs     = require('fs');
const { spawn } = require('child_process');

const PORT = 3001;
let win        = null;
let serverProc = null;
let serverLog  = '';   // capture server output for error reporting

// ── Path helpers ──────────────────────────────────────────────────────────────

function serverDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, 'server');
}

function clientDist() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'client', 'dist')
    : path.join(__dirname, 'client', 'dist');
}

function resolveEnvPath() {
  const userData = app.getPath('userData');
  const userEnv  = path.join(userData, '.env');
  if (fs.existsSync(userEnv)) return userEnv;

  // .env is placed next to the exe via extraFiles (not in resources/)
  const appDir = app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
  const appEnv = path.join(appDir, '.env');

  if (fs.existsSync(appEnv)) {
    try {
      fs.mkdirSync(userData, { recursive: true });
      fs.copyFileSync(appEnv, userEnv);
      return userEnv;
    } catch { return appEnv; }
  }

  // Dev fallback
  return path.join(__dirname, '.env');
}

function logPath() {
  return path.join(app.getPath('userData'), 'server.log');
}

// ── Server ────────────────────────────────────────────────────────────────────

function startServer() {
  const dir     = serverDir();
  const script  = path.join(dir, 'start.cjs');
  const envPath = resolveEnvPath();
  const logFile = logPath();

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, `[${new Date().toISOString()}] Starting server\n`);
  fs.appendFileSync(logFile, `script: ${script}\nenv: ${envPath}\n\n`);

  serverProc = spawn(
    process.execPath,
    [script],
    {
      cwd: dir,
      windowsHide: true,
      stdio: 'pipe',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(PORT),
        DOTENV_PATH: envPath,
        CLIENT_DIST: clientDist(),
      },
    }
  );

  serverProc.stdout.on('data', (d) => {
    const line = d.toString();
    serverLog += line;
    fs.appendFileSync(logFile, line);
  });
  serverProc.stderr.on('data', (d) => {
    const line = d.toString();
    serverLog += line;
    fs.appendFileSync(logFile, '[ERR] ' + line);
  });
  serverProc.on('exit', (code) => {
    fs.appendFileSync(logFile, `\n[exit] code=${code}\n`);
  });
}

function waitForServer(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://127.0.0.1:${PORT}/api`, (res) => {
        res.resume();
        res.statusCode < 500 ? resolve() : retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) return reject(new Error('Server timed out'));
      setTimeout(attempt, 900);
    };
    attempt();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

async function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1050, minHeight: 680,
    title: 'NewsPost Auto — NovasBeat',
    backgroundColor: '#050508',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.once('ready-to-show', () => win.show());
  await win.loadURL(`http://127.0.0.1:${PORT}`);
  win.on('closed', () => { win = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
    await createWindow();
  } catch (err) {
    // Extract the most useful part of the server log (last 800 chars)
    const tail = serverLog.slice(-800).trim();
    const log  = logPath();

    dialog.showErrorBox(
      'NewsPost Auto — Startup Failed',
      `The backend server failed to start.\n\n` +
      `Error: ${err.message}\n\n` +
      (tail ? `Last server output:\n${tail}\n\n` : '') +
      `Full log saved to:\n${log}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProc) { serverProc.kill('SIGTERM'); serverProc = null; }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => { if (!win) createWindow(); });

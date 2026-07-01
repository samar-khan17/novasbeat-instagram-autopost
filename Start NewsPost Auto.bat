@echo off
title NewsPost Auto — NovasBeat
cd /d "%~dp0"

echo.
echo  ================================================
echo    NewsPost Auto  ^|  NovasBeat AI Publisher
echo  ================================================
echo.
echo  Choose how to run:
echo.
echo    [1] Desktop App  ^(Electron window — recommended^)
echo    [2] Browser Dev  ^(opens in your browser, hot-reload^)
echo    [3] Build Installer  ^(create shareable .exe^)
echo.
set /p CHOICE="  Enter 1, 2, or 3: "
echo.

if "%CHOICE%"=="3" (
  call "%~dp0BUILD-INSTALLER.bat"
  exit /b
)

REM ── Require Node.js ───────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js not found.
  echo  Install it from https://nodejs.org and try again.
  echo.
  pause & exit /b 1
)

REM Kill anything on port 3001
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001 " ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)

REM ── Install dependencies if missing ───────────────────────────────
if not exist "%~dp0server\node_modules" (
  echo  Installing server dependencies...
  cd /d "%~dp0server" & call npm install & cd /d "%~dp0"
)
if not exist "%~dp0client\node_modules" (
  echo  Installing client dependencies...
  cd /d "%~dp0client" & call npm install & cd /d "%~dp0"
)
if not exist "%~dp0node_modules" (
  echo  Installing Electron...
  call npm install
)

if "%CHOICE%"=="2" goto :BROWSER

REM ── Option 1: Electron desktop window ─────────────────────────────
:ELECTRON
if not exist "%~dp0client\dist" (
  echo  Building client for Electron ^(one-time, ~30 seconds^)...
  cd /d "%~dp0client" & call npm run build & cd /d "%~dp0"
)
echo  Launching desktop app...
echo  ^(window opens in ~5-10 seconds once the server is ready^)
echo.
npx electron .
exit

REM ── Option 2: Browser dev mode ────────────────────────────────────
:BROWSER
echo  Starting backend server...
start "NewsPost-Server" /D "%~dp0server" /MIN cmd /k "npm run dev"

echo  Starting frontend dev server...
start "NewsPost-Client" /D "%~dp0client" /MIN cmd /k "npm run dev"

echo  Waiting for servers to start...
timeout /t 12 /nobreak >nul

echo  Opening browser...
start "" "http://localhost:5173"

echo.
echo  ================================================
echo    Running in BROWSER mode
echo    App:    http://localhost:5173
echo    API:    http://localhost:3001
echo    Close the two minimized windows to stop.
echo  ================================================
timeout /t 5 /nobreak >nul
exit

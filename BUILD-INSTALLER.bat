@echo off
title NewsPost Auto — Build Windows Installer
cd /d "%~dp0"

echo.
echo  ================================================================
echo    NewsPost Auto  ^|  Building Windows Installer (.exe)
echo  ================================================================
echo.
echo  This will create a self-contained setup file in:
echo    dist-installer\NewsPost Auto Setup x.x.x.exe
echo.
echo  Anyone can install it on any Windows PC — no Node.js needed.
echo.

REM ── Pre-flight checks ─────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js is required to BUILD the installer.
  echo  Download from https://nodejs.org  ^(only needed on THIS machine^)
  echo.
  pause & exit /b 1
)

if not exist "%~dp0.env" (
  echo  WARNING: .env file not found in this folder.
  echo  The installer will still be built, but API keys won't be bundled.
  echo  Users will need to place a .env file next to the installed app.
  echo.
  pause
)

REM ── Step 1: Install server dependencies ───────────────────────────
echo  [1/4] Installing server dependencies...
cd /d "%~dp0server"
call npm install
if errorlevel 1 ( echo  ERROR: npm install failed in server & pause & exit /b 1 )
cd /d "%~dp0"

REM ── Step 2: Install client dependencies ───────────────────────────
echo.
echo  [2/4] Installing client dependencies...
cd /d "%~dp0client"
call npm install
if errorlevel 1 ( echo  ERROR: npm install failed in client & pause & exit /b 1 )

REM ── Step 3: Build the React client ────────────────────────────────
echo.
echo  [3/4] Building React frontend ^(this takes ~30 seconds^)...
call npm run build
if errorlevel 1 ( echo  ERROR: client build failed & pause & exit /b 1 )
cd /d "%~dp0"

REM ── Step 4: Install root build tools (Electron + electron-builder) ─
echo.
echo  [4/4] Installing Electron build tools...
call npm install
if errorlevel 1 ( echo  ERROR: npm install failed in root & pause & exit /b 1 )

REM ── Package the installer ─────────────────────────────────────────
echo.
echo  Packaging Windows installer — please wait (2-5 minutes)...
echo.
call npx electron-builder --win --x64
if errorlevel 1 ( echo  ERROR: electron-builder failed & pause & exit /b 1 )

echo.
echo  ================================================================
echo    SUCCESS!
echo.
echo    Your installer is in:
echo      dist-installer\
echo.
echo    Share the "NewsPost Auto Setup *.exe" file with anyone.
echo    They just double-click it — no Node.js or setup needed.
echo  ================================================================
echo.
pause

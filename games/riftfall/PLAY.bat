@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or later is needed to run the local web server.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser after the server starts.
node scripts/serve.mjs
pause

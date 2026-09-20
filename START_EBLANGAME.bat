@echo off
setlocal
cd /d "%~dp0"
title EBLANGAME HOST

echo ========================================
echo        EBLANGAME - PUBLIC HOST
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/4] Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
) else (
  echo [1/4] Dependencies found.
)

if not exist tools mkdir tools
if not exist tools\cloudflared.exe (
  echo [2/4] Downloading Cloudflare Tunnel...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'tools\cloudflared.exe' } catch { Write-Host $_; exit 1 }"
  if errorlevel 1 goto :fail
) else (
  echo [2/4] Cloudflare Tunnel found.
)

echo [3/4] Starting Eblangame...
start "EBLANGAME SERVER" cmd /k "cd /d "%~dp0" && npm run dev"

echo Waiting for local site...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; 1..40 | %% { try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 1; if($r.StatusCode -ge 200){$ok=$true;break} } catch {}; Start-Sleep -Milliseconds 500 }; if(-not $ok){exit 1}"
if errorlevel 1 (
  echo [ERROR] Site did not start on port 5173.
  echo Check the EBLANGAME SERVER window for the error.
  pause
  exit /b 1
)

echo [4/4] Creating public link...
echo.
echo IMPORTANT: send your friends the https://....trycloudflare.com link below.
echo Keep BOTH windows open while you play.
echo Close them to stop hosting.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0HOST_TUNNEL.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Public tunnel could not connect.
  pause
  exit /b 1
)
exit /b 0

:fail
echo.
echo [ERROR] Startup failed. Read the message above.
pause
exit /b 1

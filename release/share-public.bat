@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js was not found. Install Node.js 22 LTS from https://nodejs.org
  pause
  exit /b 1
)

if not exist "tools\cloudflared.exe" (
  echo.
  echo [*] Downloading cloudflared once, about 55 MB. Please wait...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path 'tools' ^| Out-Null; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'tools\cloudflared.exe'"
)
if not exist "tools\cloudflared.exe" (
  echo [!] Download failed. Check your network, or download the file manually:
  echo     https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  pause
  exit /b 1
)

echo.
echo [*] Starting the local server...
start "Christmas Experience Server" cmd /k node "%~dp0serve.mjs" --no-https
timeout /t 2 >nul

echo.
echo [*] Opening a temporary public HTTPS address.
echo     Look for the line:  https://something.trycloudflare.com
echo     That link works on any device, anywhere, with camera support.
echo     It stops working when you close this window.
echo.
"tools\cloudflared.exe" tunnel --url http://localhost:8080
pause

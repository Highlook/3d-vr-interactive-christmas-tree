@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] Node.js was not found.
  echo     Install Node.js 22 LTS from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "certs\site.pfx" (
  echo.
  echo [*] Creating a local HTTPS certificate so phones can use the camera...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-cert.ps1"
  if errorlevel 1 (
    echo [!] Certificate creation failed. The site will still run over HTTP,
    echo     but phone cameras will be blocked by the browser.
  )
)

echo.
echo [*] Starting the local server in a new window. Keep that window open.
start "Christmas Experience Server" cmd /k node "%~dp0serve.mjs"
timeout /t 2 >nul
start "" http://localhost:8080

echo.
echo [*] Read the addresses printed in the server window.
echo     For a phone, use the HTTPS address and accept the certificate warning once.
echo.
pause

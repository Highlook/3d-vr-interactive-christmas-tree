@echo off
setlocal
cd /d "%~dp0"
title Christmas Experience - Source Preview
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js LTS from https://nodejs.org
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please reinstall Node.js LTS.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing project dependencies. Please wait...
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. Check the messages above.
    pause
    exit /b 1
  )
)
echo Opening source preview. Keep this window open while using the website.
echo Save changes in src to update the browser automatically.
call npm run dev -- --port 5174 --open
echo Source preview has stopped.
pause

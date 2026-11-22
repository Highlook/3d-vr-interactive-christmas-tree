@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcut.ps1"
if errorlevel 1 (
  echo Could not create the shortcut. Check the message above.
) else (
  echo Desktop shortcut created. Double-click it to open the website.
)
pause

@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

rem Windows may hold BLOCK inbound rules for node.exe, so phones cannot reach
rem the LAN address. This script allows 8080/8443 and disables those blocks.

net session >nul 2>&1
if not errorlevel 1 goto apply

echo.
echo [*] Need administrator rights once. Click "Yes" on the Windows prompt.
echo.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:apply
echo [*] Allowing inbound TCP 8080 and 8443 for all profiles...
netsh advfirewall firewall delete rule name="Christmas LAN 8080" >nul 2>&1
netsh advfirewall firewall delete rule name="Christmas LAN 8443" >nul 2>&1
netsh advfirewall firewall add rule name="Christmas LAN 8080" dir=in action=allow protocol=TCP localport=8080 profile=any
netsh advfirewall firewall add rule name="Christmas LAN 8443" dir=in action=allow protocol=TCP localport=8443 profile=any

echo.
echo [*] Disabling Node.js inbound BLOCK rules (blocks win over allows)...
powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName 'Node.js JavaScript Runtime' -Direction Inbound -Action Block -ErrorAction SilentlyContinue | Disable-NetFirewallRule"
powershell -NoProfile -Command "Get-NetFirewallApplicationFilter -Program '*nodejs*' -ErrorAction SilentlyContinue | ForEach-Object { $r = $_ | Get-NetFirewallRule; if ($r.Direction -eq 'Inbound' -and $r.Action -eq 'Block') { $r | Disable-NetFirewallRule } }"

echo.
echo [*] Current state:
netsh advfirewall firewall show rule name="Christmas LAN 8443" | findstr /i "Rule Name Enabled Direction Action"
echo.
echo Done. Open https://LOCAL-IP:8443 on your phone (the address start.bat prints).
echo.
pause

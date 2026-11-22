$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'open-local.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$name = -join ([char[]]@(0x5723,0x8BDE,0x7C92,0x5B50,0x4F53,0x9A8C))
$link = Join-Path $desktop ($name + '.lnk')
if (Test-Path $link) { throw 'A shortcut with this name already exists; it was not overwritten.' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
$shortcut.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$shortcut.Description = 'Start and open the Christmas particle experience'
$shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32/shell32.dll') + ',13'
$shortcut.Save()
Write-Output $link
if ($shell.CreateShortcut($link).Arguments -notlike '*open-local.ps1*') { throw 'Shortcut validation failed.' }

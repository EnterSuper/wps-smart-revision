@echo off
setlocal DisableDelayedExpansion
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\install.ps1" -Action Uninstall
set "smart_exit=%errorlevel%"
echo.
pause
exit /b %smart_exit%

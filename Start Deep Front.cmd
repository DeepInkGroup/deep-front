@echo off
cd /d "%~dp0"
if not exist "static\index.html" (
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)
call npm.cmd start
pause

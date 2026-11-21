@echo off
rem MPCR EUROMAP 77 Collector - run in this window (Ctrl+C to stop). Logs also go to logs\collector.log.
title MPCR EUROMAP 77 Collector
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Run install.cmd first.
  pause
  exit /b 1
)
if not exist collector.env (
  echo collector.env is missing: run install.cmd, then fill in OPCUA_PASSWORD.
  pause
  exit /b 1
)
:run
.venv\Scripts\python -m mpcr_collector --log-file logs\collector.log %*
echo Collector stopped. Restarting in 10 seconds - close this window to quit ...
ping -n 11 127.0.0.1 >nul
goto run

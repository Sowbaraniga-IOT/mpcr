@echo off
rem MPCR EUROMAP 77 Collector: FANUC gateway (OPC UA) -> MQTT. Settings in collector.env.
title MPCR EUROMAP 77 Collector
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo First time: py -m venv .venv  and  .venv\Scripts\python -m pip install -r requirements.txt
  pause
  exit /b 1
)
if not exist collector.env (
  echo Copy collector.env.example to collector.env and fill in OPCUA_PASSWORD first.
  pause
  exit /b 1
)
:run
.venv\Scripts\python -m mpcr_collector %*
echo Collector stopped. Restarting in 10 seconds (Ctrl+C to quit)...
timeout /t 10 >nul
goto run

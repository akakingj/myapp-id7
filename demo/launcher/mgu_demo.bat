@echo off
rem MGU demo: every app of akakingj/myapp-id7 and akakingj/myapp-cluster (and MGU Styles, akakingj/myapp-cluster-high,
rem when it can be fetched) on this PC, in one browser window.
rem Each start fetches the newest code of the repositories first (into src\), then runs the demo.
rem Needs Node.js (nodejs.org, LTS) and Python 3 (python.org, "Add python.exe to PATH").
setlocal
cd /d "%~dp0"
title MGU demo

rem ---- the branches the demo shows (the test branches: what is being made now; MGU Styles: ak, with AK Cluster ID8) ----
set APPS_BRANCH=test
set CLUSTER_BRANCH=test
set STYLES_BRANCH=ak

where node 1>NUL 2>NUL
if errorlevel 1 (
  echo Node.js is not installed or not on PATH: https://nodejs.org ^(LTS^)
  pause
  exit /b 1
)
node mgu_demo_update.js
if not exist "src\myapp-id7\demo\server.js" (
  echo.
  echo The demo was not found in src\myapp-id7. Check the internet connection and run this again.
  pause
  exit /b 1
)
echo.
echo Starting the demo. Close this window to stop it.
node "src\myapp-id7\demo\server.js" --cluster "src\myapp-cluster" --data "data" %*
pause

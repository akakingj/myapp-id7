@echo off
rem MGU demo: every app of akakingj/myapp-id7 and akakingj/myapp-cluster (and MGU Styles, akakingj/myapp-cluster-high,
rem when it can be fetched) on this PC, in one browser window.
rem Each start fetches the newest code of the repositories first (into src\), then runs the demo.
rem Needs Node.js (nodejs.org, LTS) and Python 3 (python.org, "Add python.exe to PATH").
setlocal
cd /d "%~dp0"
title MGU demo

rem ---- where the code comes from: a GitHub repository, owner/name or its https://github.com/ address ----
rem      APPS_REPO: the iDrive 7 apps and the demo itself, CLUSTER_REPO: the cluster apps,
rem      STYLES_REPO: AK Cluster ID8 (optional: STYLES_REPO=none and the demo runs without it)
set APPS_REPO=akakingj/myapp-id7
set CLUSTER_REPO=akakingj/myapp-cluster
set STYLES_REPO=akakingj/myapp-cluster-high

rem ---- the branches the demo shows (the test branches: what is being made now; AK Cluster ID8: test) ----
set APPS_BRANCH=test
set CLUSTER_BRANCH=test
set STYLES_BRANCH=test

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

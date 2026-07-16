@echo off
REM Hermes Overlay - One-Click Launcher

cd /d C:\Users\jijin\hermes-overlay

if not exist "node_modules" (
    call npm install > nul 2>&1
)

if not exist "dist-electron\main\main.cjs" (
    call npm run build:all > nul 2>&1
)

SET USER_DATA_DIR=%LOCALAPPDATA%\hermes-overlay-electron
if not exist "%USER_DATA_DIR%" mkdir "%USER_DATA_DIR%"

start /B "" npx electron . --user-data-dir "%USER_DATA_DIR%" --remote-debugging-port=9223 > nul 2>&1

@echo off
setlocal enabledelayedexpansion

REM Hermes Overlay Launcher
REM This script launches the overlay with proper environment

cd /d "%~dp0"

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
)

REM Check if dist exists
if not exist dist (
    echo Building project...
    call npm run build
    if errorlevel 1 (
        echo ERROR: build failed
        pause
        exit /b 1
    )
)

REM Launch the app
echo Launching Hermes Overlay...
call npm run dev

pause

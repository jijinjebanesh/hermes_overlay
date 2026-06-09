@echo off
REM Hermes Overlay Production Launcher (with custom user-data-dir)

cd /d C:\Users\jijin\hermes-overlay
nREM Build if dist missing
if not exist "dist\main\main.js" (
    echo Building overlay...
    call npm run build
    if errorlevel 1 (
        echo Error: Build failed
        pause
        exit /b 1
    )
)
nSET NODE_ENV=production
SET USER_DATA_DIR=%LOCALAPPDATA%\hermes-overlay-electron
if not exist "%USER_DATA_DIR%" mkdir "%USER_DATA_DIR%"
nnpx electron . --user-data-dir "%USER_DATA_DIR%" --remote-debugging-port=9223

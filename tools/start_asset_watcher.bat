@echo off
REM Auto-sync portfolio data and watch ./projects for newly uploaded folders

cd /d "%~dp0"

echo.
echo ======================================
echo Portfolio Asset Watcher
echo ======================================
echo.

python sync_portfolio_assets.py --watch --watch-mode auto --interval 5

if %errorlevel% neq 0 (
    echo.
    echo Error: Could not start the asset watcher.
    echo Make sure Python is installed and in your PATH.
    echo Tip: install watchdog for instant folder detection: pip install watchdog
    echo.
    pause
)

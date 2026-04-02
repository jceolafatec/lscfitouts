@echo off
REM Auto-sync portfolio data from assets/models and assets/content

cd /d "%~dp0"

echo.
echo ======================================
echo Portfolio Asset Watcher
echo ======================================
echo.

python sync_portfolio_assets.py --watch --interval 5

if %errorlevel% neq 0 (
    echo.
    echo Error: Could not start the asset watcher.
    echo Make sure Python is installed and in your PATH.
    echo.
    pause
)

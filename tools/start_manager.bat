@echo off
REM Quick start script for Portfolio Manager PRO on Windows
REM Run this file to launch the manager

cd /d "%~dp0"

echo.
echo ======================================
echo Portfolio Manager PRO
echo ======================================
echo.

python project_manager_pro.py

if %errorlevel% neq 0 (
    echo.
    echo Error: Could not start the manager.
    echo Make sure Python is installed and in your PATH.
    echo.
    pause
)

#!/bin/bash
# Quick start script for Portfolio Manager PRO on macOS/Linux
# Run this file to launch the manager

cd "$(dirname "$0")"

echo ""
echo "======================================"
echo "Portfolio Manager PRO"
echo "======================================"
echo ""

python3 project_manager_pro.py

if [ $? -ne 0 ]; then
    echo ""
    echo "Error: Could not start the manager."
    echo "Make sure Python 3 is installed."
    echo ""
fi

#!/bin/bash
# Auto-sync portfolio data and watch ./projects for newly uploaded folders

cd "$(dirname "$0")"

echo ""
echo "======================================"
echo "Portfolio Asset Watcher"
echo "======================================"
echo ""

python3 sync_portfolio_assets.py --watch --watch-mode auto --interval 5

if [ $? -ne 0 ]; then
    echo ""
    echo "Error: Could not start the asset watcher."
    echo "Make sure Python 3 is installed."
    echo "Tip: install watchdog for instant folder detection: pip3 install watchdog"
    echo ""
fi

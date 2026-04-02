#!/bin/bash
# Auto-sync portfolio data from assets/models and assets/content

cd "$(dirname "$0")"

echo ""
echo "======================================"
echo "Portfolio Asset Watcher"
echo "======================================"
echo ""

python3 sync_portfolio_assets.py --watch --interval 5

if [ $? -ne 0 ]; then
    echo ""
    echo "Error: Could not start the asset watcher."
    echo "Make sure Python 3 is installed."
    echo ""
fi

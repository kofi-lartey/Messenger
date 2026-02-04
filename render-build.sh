#!/usr/bin/env bash
set -o errexit

echo "Installing Chromium via apt-get..."
apt-get update -qq
apt-get install -y -qq chromium-browser > /dev/null 2>&1 || \
apt-get install -y -qq chromium > /dev/null 2>&1 || \
echo "Warning: Could not install chromium via apt"

# Get chromium path
CHROMIUM_PATH=$(which chromium || which chromium-browser || echo "")
echo "Chromium installed at: $CHROMIUM_PATH"

# Export for runtime
export PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH
export USE_LOCAL_CHROME=true

echo "Installing dependencies..."
npm install --ignore-scripts

echo "Build complete!"

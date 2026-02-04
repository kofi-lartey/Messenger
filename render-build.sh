#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing dependencies..."
npm install

# Check if whatsapp-web.js has bundled chromium
if [ -d "node_modules/whatsapp-web.js/.chrome" ]; then
    echo "Found bundled Chromium in whatsapp-web.js"
    ls -la node_modules/whatsapp-web.js/.chrome/
else
    echo "No bundled Chromium found, will use puppeteer cache"
fi

echo "Build complete!"

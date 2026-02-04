#!/usr/bin/env bash
set -o errexit

# Use local Puppeteer with Chrome (free option)
export PUPPETEER_SKIP_DOWNLOAD=false
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
export USE_LOCAL_CHROME=true

echo "Installing dependencies with Puppeteer..."
npm install

echo "Build complete!"

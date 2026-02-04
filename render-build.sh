#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Setting environment to skip Chrome downloads..."
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/dev/null

echo "Cleaning old puppeteer cache..."
rm -rf .puppeteer_cache node_modules/.cache 2>/dev/null || true

echo "Installing dependencies..."
npm install

echo "Build complete!"

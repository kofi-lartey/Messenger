#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
# This line downloads Chrome specifically for the Render environment
npx puppeteer browsers install chrome
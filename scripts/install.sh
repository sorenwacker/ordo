#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# The bundle is named after build.productName in package.json; read it from
# there so a rename cannot leave this script looking for the old name.
PRODUCT_NAME="$(node -p "require('./package.json').build.productName")"
APP_NAME="$PRODUCT_NAME.app"

echo "Building $PRODUCT_NAME..."
npm run build

echo "Packaging for macOS..."
npx electron-builder --mac

# Find the built .app
DIST_APP="$PROJECT_DIR/dist/mac-arm64/$APP_NAME"

if [ ! -d "$DIST_APP" ]; then
    DIST_APP="$PROJECT_DIR/dist/mac/$APP_NAME"
fi

if [ ! -d "$DIST_APP" ]; then
    echo "Error: Could not find built app"
    exit 1
fi

echo "Installing to /Applications..."
if [ -d "/Applications/$APP_NAME" ]; then
    echo "Removing existing installation..."
    rm -rf "/Applications/$APP_NAME"
fi

cp -R "$DIST_APP" /Applications/

echo "Done! $PRODUCT_NAME installed to /Applications/$APP_NAME"
echo "You can now launch it from Applications or Spotlight."

#!/bin/bash

# Usage: ./sign_app.sh /path/to/AppName.app "Developer ID Application: Your Name (TEAMID)" /path/to/entitlements.plist

set -e

APP_PATH="$1"
IDENTITY="$2"
ENTITLEMENTS="$3"

if [[ -z "$APP_PATH" || -z "$IDENTITY" || -z "$ENTITLEMENTS" ]]; then
  echo "Usage: $0 /path/to/AppName.app \"Developer ID Application: ... (TEAMID)\" /path/to/entitlements.plist"
  exit 1
fi

echo "🔍 Signing all .dylib, .so, and Python binaries in $APP_PATH/Contents/Frameworks..."
find "$APP_PATH/Contents/Frameworks" -type f \( -name "*.dylib" -o -name "*.so" -o -name "Python" \) -exec \
  codesign --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" {} \;

echo "🔍 Signing main executable..."
MAIN_EXEC="$APP_PATH/Contents/MacOS/$(basename "$APP_PATH" .app)"
codesign --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" "$MAIN_EXEC"

echo "🔍 Signing the .app bundle..."
codesign --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" "$APP_PATH"

echo "🔍 Final deep sign pass..."
codesign --deep --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" "$APP_PATH"

echo "✅ Verifying signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "✅ Done! $APP_PATH is signed and verified."
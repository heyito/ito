#!/bin/bash

# Exit on any error
set -e
# Load environment variables from .env file
if [ ! -f ".env" ]; then
  echo "❌ .env file not found! Please create it with the following variables:"
  echo "APPLE_ID, TEAM_ID, APP_SPECIFIC_PASSWORD, EXPECTED_BUNDLE_ID, APP_NAME, ZIP_NAME, DIST_DIR"
  exit 1
fi

# Source the .env file
source .env

# Verify required environment variables
if [ -z "$APPLE_ID" ] || [ -z "$TEAM_ID" ] || [ -z "$APP_SPECIFIC_PASSWORD" ] || [ -z "$EXPECTED_BUNDLE_ID" ] || [ -z "$APP_NAME" ] || [ -z "$ZIP_NAME" ] || [ -z "$DIST_DIR" ]; then
  echo "❌ Missing required environment variables in .env file!"
  echo "Please ensure all required variables are set:"
  echo "APPLE_ID, TEAM_ID, APP_SPECIFIC_PASSWORD, EXPECTED_BUNDLE_ID, APP_NAME, ZIP_NAME, DIST_DIR"
  exit 1
fi

cd "$DIST_DIR"

echo "Debug: Checking directory structure..."
echo "Current directory: $(pwd)"
echo "Contents of current directory:"
ls -la
echo "Checking if $APP_NAME exists:"
if [ -d "$APP_NAME" ]; then
  echo "✅ $APP_NAME directory exists"
  echo "Contents of $APP_NAME:"
  ls -la "$APP_NAME"
  if [ -d "$APP_NAME/Contents" ]; then
    echo "✅ Contents directory exists"
    echo "Contents of $APP_NAME/Contents:"
    ls -la "$APP_NAME/Contents"
    if [ -f "$APP_NAME/Contents/Info.plist" ]; then
      echo "✅ Info.plist exists"
    else
      echo "❌ Info.plist not found in $APP_NAME/Contents/"
    fi
  else
    echo "❌ Contents directory not found in $APP_NAME"
  fi
else
  echo "❌ $APP_NAME directory not found"
fi

# Check bundle identifier
ACTUAL_BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP_NAME/Contents/Info.plist")
if [ "$ACTUAL_BUNDLE_ID" != "$EXPECTED_BUNDLE_ID" ]; then
  echo "❌ Bundle identifier mismatch! Expected $EXPECTED_BUNDLE_ID but found $ACTUAL_BUNDLE_ID"
  exit 1
else
  echo "✅ Bundle identifier matches: $ACTUAL_BUNDLE_ID"
fi

# Verify code signing before zipping
if ! codesign --verify --deep --strict --verbose=2 "$APP_NAME"; then
  echo "❌ Code signing verification failed! Exiting."
  exit 1
else
  echo "✅ Code signing verification passed."
fi

# Zip the app bundle
if [ ! -f "$ZIP_NAME" ]; then
    echo "Zipping $APP_NAME for notarization..."
    ditto -c -k --sequesterRsrc --keepParent "$APP_NAME" "$ZIP_NAME"
else
    echo "$ZIP_NAME already exists. Skipping zip."
fi

# Submit for notarization
echo "Submitting $ZIP_NAME for notarization..."
xcrun notarytool submit "$ZIP_NAME" \
  --apple-id "$APPLE_ID" \
  --team-id "$TEAM_ID" \
  --password "$APP_SPECIFIC_PASSWORD" \
  --wait

echo "Notarization complete. Stapling ticket to $APP_NAME..."
xcrun stapler staple "$APP_NAME"

echo "Verifying notarization..."
spctl --assess --type execute --verbose "$APP_NAME"

echo "✅ Notarization and stapling complete!"
cd ..

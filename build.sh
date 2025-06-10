#!/bin/bash

# Exit on any error
set -e

# Source the .env file
source .env

echo "🚀 Starting build process for Ito..."

# --- Check PortAudio ---
echo "🔍 Checking PortAudio installation..."
if [ ! -f "$PORTAUDIO_PATH" ]; then
    echo "❌ PortAudio not found at $PORTAUDIO_PATH"
    echo "Please install PortAudio: brew install portaudio"
    exit 1
fi
echo "✅ PortAudio found at $PORTAUDIO_PATH"

# --- Build Swift Helper ---
echo "🛠️ Building Swift helper (ito_macos_agent)..."
(cd ./src/swift_helper && swift build -c release --arch arm64 --arch x86_64)

if [ ! -f "$SWIFT_HELPER_BUILD_PATH" ]; then
    echo "❌ Swift helper build failed or not found at $SWIFT_HELPER_BUILD_PATH"
    exit 1
fi
echo "✅ Swift helper built successfully."

echo "📦 Preparing Swift helper for packaging..."
mkdir -p src/bin
cp "$SWIFT_HELPER_BUILD_PATH" src/bin/ito_macos_agent
chmod +x src/bin/ito_macos_agent

# --- Create Application Icon ---
# echo "🎨 Creating application icon..."

# # Use a high-resolution source image (e.g., 1024x1024) for best results
SOURCE_ICON="extension/public/ito-logo-1024.png" # Assuming you have a 1024x1024 version

# Create the iconset directory
mkdir -p icon.iconset

# Generate the required sizes
sips -z 16 16   "$SOURCE_ICON" --out icon.iconset/icon_16x16.png
sips -z 32 32   "$SOURCE_ICON" --out icon.iconset/icon_16x16@2x.png
sips -z 32 32   "$SOURCE_ICON" --out icon.iconset/icon_32x32.png
sips -z 64 64   "$SOURCE_ICON" --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 "$SOURCE_ICON" --out icon.iconset/icon_128x128.png
sips -z 256 256 "$SOURCE_ICON" --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 "$SOURCE_ICON" --out icon.iconset/icon_256x256.png
sips -z 512 512 "$SOURCE_ICON" --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 "$SOURCE_ICON" --out icon.iconset/icon_512x512.png
sips -z 1024 1024 "$SOURCE_ICON" --out icon.iconset/icon_512x512@2x.png

# Create the .icns file
iconutil -c icns icon.iconset

echo "✅ Application icon created successfully."

# --- Clean Previous Builds ---
echo "🧹 Cleaning previous builds..."
rm -rf dist/ build/

# --- Build App with PyInstaller ---
echo "🔨 Building application..."
pyinstaller Ito.spec --noconfirm

# --- Check Bundle ID ---
ACTUAL_BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$DIST_DIR/$APP_NAME/Contents/Info.plist")
if [ "$ACTUAL_BUNDLE_ID" != "$EXPECTED_BUNDLE_ID" ]; then
    echo "❌ Bundle identifier mismatch! Expected $EXPECTED_BUNDLE_ID but found $ACTUAL_BUNDLE_ID"
    exit 1
fi
echo "✅ Bundle identifier matches: $ACTUAL_BUNDLE_ID"

# --- Remove Invalid Object Files ---
echo "🧼 Removing leftover .o object files (to avoid code signing rejection)..."
find "$DIST_DIR/$APP_NAME" -name "*.o" -type f -delete

# --- Add Resources ---
echo "📝 Adding native messaging host script..."
mkdir -p "$DIST_DIR/$APP_NAME/Contents/Resources"
cp src/native_messaging_host.sh "$DIST_DIR/$APP_NAME/Contents/Resources/"
chmod +x "$DIST_DIR/$APP_NAME/Contents/Resources/native_messaging_host.sh"

# === CODESIGN ===
echo "🔐 Code signing application..."
CODESIGN_FLAGS=(--force --options runtime --timestamp --sign "$SIGNING_IDENTITY")

# Sign all .dylib and .so files in Frameworks
find "$DIST_DIR/$APP_NAME/Contents/Frameworks" -type f \( -name "*.dylib" -o -name "*.so" \) -exec codesign "${CODESIGN_FLAGS[@]}" {} \;

# Sign Resources (scripts, binaries)
find "$DIST_DIR/$APP_NAME/Contents/Resources" -type f -exec codesign "${CODESIGN_FLAGS[@]}" {} \;

# Sign main executable with entitlements
codesign "${CODESIGN_FLAGS[@]}" \
  --entitlements entitlements.plist \
  "$DIST_DIR/$APP_NAME/Contents/MacOS/Ito"

# Sign entire .app bundle with entitlements
codesign "${CODESIGN_FLAGS[@]}" \
  --entitlements entitlements.plist \
  "$DIST_DIR/$APP_NAME"

# Final deep sign pass
codesign --deep "${CODESIGN_FLAGS[@]}" \
  --entitlements entitlements.plist \
  "$DIST_DIR/$APP_NAME"

# Verify codesign
echo "🔍 Verifying code signing..."
codesign --verify --deep --strict --verbose=2 "$DIST_DIR/$APP_NAME"

# === NOTARIZE ===
echo "🛡️ Notarizing application..."
./notarize.sh

# === CREATE DMG ===
echo "📦 Creating DMG structure..."
mkdir -p dist/dmg-contents
rsync -a "$DIST_DIR/$APP_NAME" dist/dmg-contents/

echo "💿 Building DMG installer..."
create-dmg \
  --volname "Ito Installer" \
  --volicon "icon.icns" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 128 \
  --icon "Ito.app" 150 200 \
  --app-drop-link 450 200 \
  "dist/Ito-Installer.dmg" \
  "dist/dmg-contents/"

# --- Cleanup ---
rm -rf icon.iconset icon.icns

echo "✅ Build complete! DMG is ready at: dist/Ito-Installer.dmg"

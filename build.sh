#!/bin/bash

# Exit on any error
set -e

echo "🚀 Starting build process for Inten..."

# --- Build Swift Helper ---
echo "🛠️ Building Swift helper (inten_macos_agent)..."
# Navigate to the swift_helper directory, build, and navigate back
(cd ./src/swift_helper && swift build -c release --arch arm64 --arch x86_64)
# Define the path to the built Swift helper
SWIFT_HELPER_BUILD_PATH="./src/swift_helper/.build/apple/Products/Release/inten_macos_agent"

# Check if Swift helper was built
if [ ! -f "$SWIFT_HELPER_BUILD_PATH" ]; then
    echo "❌ Swift helper build failed or not found at $SWIFT_HELPER_BUILD_PATH"
    exit 1
fi
echo "✅ Swift helper built successfully."

# --- Prepare for PyInstaller ---
# Create a directory in src to store binaries that PyInstaller will pick up
echo "📦 Preparing Swift helper for packaging..."
mkdir -p src/bin
cp "$SWIFT_HELPER_BUILD_PATH" src/bin/inten_macos_agent
chmod +x src/bin/inten_macos_agent # Ensure it's executable
echo "Copied Swift helper to src/bin/inten_macos_agent"

# Create temporary iconset directory
echo "🎨 Creating application icon..."
mkdir -p icon.iconset
cp extension/public/inten-logo-16.png icon.iconset/icon_16x16.png
cp extension/public/inten-logo-48.png icon.iconset/icon_32x32@2x.png
cp extension/public/inten-logo-128.png icon.iconset/icon_128x128.png
# Create additional required sizes
sips -z 32 32 extension/public/inten-logo-48.png --out icon.iconset/icon_32x32.png
sips -z 256 256 extension/public/inten-logo-128.png --out icon.iconset/icon_256x256.png
sips -z 512 512 extension/public/inten-logo-128.png --out icon.iconset/icon_512x512.png

# Convert to icns using iconutil (macOS command)
iconutil -c icns icon.iconset

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/ build/

# Build the application using existing spec file
echo "🔨 Building application..."
pyinstaller Inten.spec --noconfirm

# Create directories for the installer
echo "📁 Creating installer structure..."
mkdir -p dist/dmg-contents
rsync -a "dist/Inten.app" dist/dmg-contents/

# Add native messaging host script to Resources
echo "📝 Adding native messaging host script..."
mkdir -p "dist/dmg-contents/Inten.app/Contents/Resources"
cp src/native_messaging_host.sh "dist/dmg-contents/Inten.app/Contents/Resources/"
chmod +x "dist/dmg-contents/Inten.app/Contents/Resources/native_messaging_host.sh"

# Create DMG with basic settings
echo "💿 Creating DMG installer..."
create-dmg \
  --volname "Inten Installer" \
  --volicon "icon.icns" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 128 \
  --icon "Inten.app" 150 200 \
  --app-drop-link 450 200 \
  "dist/Inten-Installer.dmg" \
  "dist/dmg-contents/"

# Cleanup temporary files
rm -rf icon.iconset icon.icns

echo "✅ Build complete! Installer created at dist/Inten-Installer.dmg"
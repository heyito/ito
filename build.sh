#!/bin/bash

# Exit on any error
set -e

echo "🚀 Starting build process for Inten..."

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
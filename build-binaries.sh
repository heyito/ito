#!/bin/bash

# Exit on error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# --- Function Definitions ---
print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

print_error() {
    echo -e "${RED}Error:${NC} $1"
}

# --- Main Script ---

# Check if rustup is installed
if ! command -v rustup &> /dev/null; then
    print_error "rustup is not installed. Please install it first: https://rustup.rs/"
    exit 1
fi

# Flag to determine if we are building for Mac
BUILD_MAC=false
if [[ " $* " == *" --mac "* ]] || [[ " $* " == *" --all "* ]]; then
  BUILD_MAC=true
fi

# Flag to determine if we are building for Windows
BUILD_WINDOWS=false
if [[ " $* " == *" --windows "* ]] || [[ " $* " == *" --all "* ]]; then
  BUILD_WINDOWS=true
fi


# Change to the key listener directory
cd native/global-key-listener
BINARY_NAME="global-key-listener"

# --- macOS Build ---
if [ "$BUILD_MAC" = true ]; then
    print_status "Adding macOS targets..."
    rustup target add x86_64-apple-darwin
    rustup target add aarch64-apple-darwin

    print_status "Building for x86_64-apple-darwin..."
    cargo build --release --target x86_64-apple-darwin

    print_status "Building for aarch64-apple-darwin..."
    cargo build --release --target aarch64-apple-darwin

    # Check if this is a universal build
    if [[ " $* " == *" --universal "* ]]; then
        print_status "Creating Universal macOS binary..."
        
        UNIVERSAL_DIR="target/universal"
        mkdir -p "$UNIVERSAL_DIR"

        # The crucial step: combine the two binaries with `lipo`
        lipo -create \
            "target/x86_64-apple-darwin/release/$BINARY_NAME" \
            "target/aarch64-apple-darwin/release/$BINARY_NAME" \
            -output "$UNIVERSAL_DIR/$BINARY_NAME"
        
        print_status "Universal binary created at $UNIVERSAL_DIR/$BINARY_NAME"
    fi
fi

# --- Windows Build ---
if [ "$BUILD_WINDOWS" = true ]; then
    print_status "Adding Windows target..."
    rustup target add x86_64-pc-windows-gnu

    print_status "Building for x86_64-pc-windows-gnu..."
    cargo build --release --target x86_64-pc-windows-gnu
fi

print_status "All builds completed successfully!"
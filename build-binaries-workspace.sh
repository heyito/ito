#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Color Definitions for pretty printing ---
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# --- Function Definitions ---
print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

print_info() {
    echo -e "${BLUE}-->${NC} $1"
}

print_error() {
    echo -e "${RED}Error:${NC} $1" >&2
}

print_skip() {
    echo -e "${YELLOW}-->${NC} $1"
}

# --- Main Script ---

print_status "Starting optimized native module build process (workspace mode)..."

# Check if rustup is installed before doing anything else
if ! command -v rustup &> /dev/null; then
    print_error "rustup is not installed. Please install it first: https://rustup.rs/"
    exit 1
fi

# Store all script arguments in an array
ARGS=("$@")

# Determine which platforms to build for
BUILD_MAC=false
if [[ " ${ARGS[*]} " == *" --mac "* ]] || [[ " ${ARGS[*]} " == *" --all "* ]]; then
  BUILD_MAC=true
fi

BUILD_WINDOWS=false
if [[ " ${ARGS[*]} " == *" --windows "* ]] || [[ " ${ARGS[*]} " == *" --all "* ]]; then
  BUILD_WINDOWS=true
fi

# If no platform flags are provided, print usage and exit.
if [ "$BUILD_MAC" = false ] && [ "$BUILD_WINDOWS" = false ]; then
    print_error "No platform specified. Use --mac, --windows, or --all."
    echo "Usage: $0 [--mac] [--windows] [--all] [--universal]"
    exit 1
fi

# Add required Rust targets
if [ "$BUILD_MAC" = true ]; then
    print_status "Adding macOS targets..."
    rustup target add x86_64-apple-darwin 2>/dev/null || true
    rustup target add aarch64-apple-darwin 2>/dev/null || true
fi
if [ "$BUILD_WINDOWS" = true ]; then
    print_status "Adding Windows target..."
    rustup target add x86_64-pc-windows-gnu 2>/dev/null || true

    # Check if we're compiling on a Windows machine
    compiling_on_windows=false
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ "$OS" == "Windows_NT" ]]; then
        compiling_on_windows=true
    fi

    if [ "$compiling_on_windows" = true ]; then
        print_info "Using GNU toolchain (requires MinGW-w64)"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v x86_64-w64-mingw32-gcc &> /dev/null; then
            print_info "Using MinGW-w64 cross-compiler for Windows builds on macOS"
        elif brew list mingw-w64 &> /dev/null 2>&1; then
            print_info "MinGW-w64 found via Homebrew, using for Windows cross-compilation"
        else
            print_error "Windows GNU target requires MinGW-w64 toolchain. Install with: brew install mingw-w64"
            exit 1
        fi
    else
        if command -v x86_64-w64-mingw32-gcc &> /dev/null; then
            print_info "Using MinGW-w64 cross-compiler for Windows builds on Linux"
        else
            print_error "Windows GNU target requires MinGW-w64 toolchain. Install with: sudo apt-get install mingw-w64"
            exit 1
        fi
    fi
fi

# Change to native directory where workspace Cargo.toml is located
cd native

# --- macOS Build ---
if [ "$BUILD_MAC" = true ]; then
    print_status "Building all macOS binaries (using workspace)..."

    # Build for Intel
    print_info "Building for x86_64-apple-darwin (Intel)..."
    cargo build --release --target x86_64-apple-darwin --workspace

    # Build for Apple Silicon
    print_info "Building for aarch64-apple-darwin (Apple Silicon)..."
    cargo build --release --target aarch64-apple-darwin --workspace

    # Create universal binaries if requested
    if [[ " ${ARGS[*]} " == *" --universal "* ]]; then
        print_info "Creating Universal macOS binaries..."

        for module in global-key-listener audio-recorder text-writer active-application selected-text-reader; do
            # Workspace builds put all binaries in native/target/, not in each module's directory
            if [ -f "target/x86_64-apple-darwin/release/$module" ] && \
               [ -f "target/aarch64-apple-darwin/release/$module" ]; then

                # But we need to put universal binaries in each module's target directory for electron-builder
                mkdir -p "$module/target/universal"

                lipo -create \
                    "target/x86_64-apple-darwin/release/$module" \
                    "target/aarch64-apple-darwin/release/$module" \
                    -output "$module/target/universal/$module"

                print_info "Universal binary created for $module"
            fi
        done
    fi

    # Copy workspace-built binaries to module directories and rename for electron-builder
    print_status "Organizing binaries for electron-builder..."
    for module in global-key-listener audio-recorder text-writer active-application selected-text-reader; do
        # Copy Intel binary
        if [ -f "target/x86_64-apple-darwin/release/$module" ]; then
            mkdir -p "$module/target/x64-apple-darwin/release"
            cp "target/x86_64-apple-darwin/release/$module" "$module/target/x64-apple-darwin/release/$module"
        fi

        # Copy ARM binary
        if [ -f "target/aarch64-apple-darwin/release/$module" ]; then
            mkdir -p "$module/target/arm64-apple-darwin/release"
            cp "target/aarch64-apple-darwin/release/$module" "$module/target/arm64-apple-darwin/release/$module"
        fi
    done
fi

# --- Windows Build ---
if [ "$BUILD_WINDOWS" = true ]; then
    print_info "Building all Windows binaries (using workspace)..."

    if [ "$compiling_on_windows" = true ]; then
        cargo +stable-x86_64-pc-windows-gnu build --release --target x86_64-pc-windows-gnu --workspace
    else
        cargo build --release --target x86_64-pc-windows-gnu --workspace
    fi
fi

cd ..

print_status "All native module builds completed successfully!"
print_info "Cargo's incremental compilation cache is preserved for faster rebuilds"
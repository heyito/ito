#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Color Definitions for pretty printing ---
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
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

# --- Build the entire native workspace ---
build_native_workspace() {
    print_status "Building native workspace..."

    # Change into the native workspace directory
    cd "native"

    # Check if we're compiling on a Windows machine
    compiling_on_windows=false
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ "$OS" == "Windows_NT" ]]; then
        compiling_on_windows=true
    fi

    # Install dependencies
    print_info "Installing dependencies for workspace..."
    cargo fetch

    # --- macOS Build ---
    if [ "$BUILD_MAC" = true ]; then
        # Determine target architecture (default to arm64)
        local mac_target="aarch64-apple-darwin"
        local arch_name="Apple Silicon (arm64)"

        if [[ " ${ARGS[*]} " == *" --x64 "* ]]; then
            mac_target="x86_64-apple-darwin"
            arch_name="Intel (x64)"
        fi

        print_info "Building macOS binaries for entire workspace ($arch_name)..."
        cargo build --release --workspace --target "$mac_target"

        # Create symlinks for electron-builder compatibility
        if [ "$mac_target" = "aarch64-apple-darwin" ]; then
            print_info "Creating symlink: arm64-apple-darwin -> aarch64-apple-darwin"
            ln -sfn aarch64-apple-darwin target/arm64-apple-darwin
        else
            print_info "Creating symlink: x64-apple-darwin -> x86_64-apple-darwin"
            ln -sfn x86_64-apple-darwin target/x64-apple-darwin
        fi

        # Build Swift packages
        print_info "Building Swift packages..."
        cd cursor-context
        if [ "$mac_target" = "aarch64-apple-darwin" ]; then
            swift build -c release --arch arm64
        else
            swift build -c release --arch x86_64
        fi
        # Copy built binary to Rust target directory and re-sign for code signing compatibility
        cp .build/release/cursor-context "../target/$mac_target/release/"
        xattr -cr "../target/$mac_target/release/cursor-context"
        codesign --force --sign - "../target/$mac_target/release/cursor-context" 2>/dev/null || true
        cd ..
    fi

    # --- Windows Build ---
    if [ "$BUILD_WINDOWS" = true ]; then
        print_info "Building Windows binary for entire workspace..."

        # Use MSVC on Windows (better AV compatibility), GNU for cross-compilation
        if [ "$compiling_on_windows" = true ]; then
            print_info "Building with MSVC toolchain on Windows..."
            cargo build --release --target x86_64-pc-windows-msvc
        else
            # Cross-compile from macOS/Linux using GNU toolchain
            print_info "Cross-compiling with GNU toolchain..."
            cargo build --release --target x86_64-pc-windows-gnu
        fi
    fi

    # Return to the project root
    cd ..
}


# --- Main Script ---

print_status "Starting native module build process..."

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
    echo "Usage: $0 [--mac] [--windows] [--all] [--x64]"
    echo ""
    echo "Options:"
    echo "  --mac       Build for macOS (defaults to arm64, use --x64 for Intel)"
    echo "  --windows   Build for Windows"
    echo "  --all       Build for all platforms"
    echo "  --x64       Build for x64/Intel instead of arm64 (macOS only)"
    exit 1
fi

# Add required Rust targets
if [ "$BUILD_MAC" = true ]; then
    # Determine which macOS target to add
    if [[ " ${ARGS[*]} " == *" --x64 "* ]]; then
        print_status "Adding macOS x64 target..."
        rustup target add x86_64-apple-darwin
    else
        print_status "Adding macOS arm64 target..."
        rustup target add aarch64-apple-darwin
    fi
fi
if [ "$BUILD_WINDOWS" = true ]; then
    print_status "Adding Windows target..."

    # Check if we're compiling on a Windows machine
    compiling_on_windows=false
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ "$OS" == "Windows_NT" ]]; then
        compiling_on_windows=true
    fi

    if [ "$compiling_on_windows" = true ]; then
        # On Windows, use MSVC toolchain (better AV compatibility)
        print_info "Using MSVC toolchain on Windows for better antivirus compatibility"
        rustup target add x86_64-pc-windows-msvc
    else
        # For cross-compilation from macOS/Linux, use GNU toolchain
        print_info "Setting up GNU toolchain for cross-compilation"
        rustup target add x86_64-pc-windows-gnu

        if [[ "$OSTYPE" == "darwin"* ]]; then
            # On macOS, check if MinGW-w64 is installed
            if command -v x86_64-w64-mingw32-gcc &> /dev/null; then
                print_info "Using MinGW-w64 cross-compiler for Windows builds on macOS"
            elif brew list mingw-w64 &> /dev/null; then
                print_info "MinGW-w64 found via Homebrew, using for Windows cross-compilation"
            else
                print_error "Windows GNU target requires MinGW-w64 toolchain. Install with: brew install mingw-w64"
                exit 1
            fi
        else
            # On Linux, check if MinGW-w64 is installed
            if command -v x86_64-w64-mingw32-gcc &> /dev/null; then
                print_info "Using MinGW-w64 cross-compiler for Windows builds on Linux"
            else
                print_error "Windows GNU target requires MinGW-w64 toolchain. Install with: sudo apt-get install mingw-w64"
                exit 1
            fi
        fi
    fi
fi


# --- Build the native workspace ---
build_native_workspace

print_status "Native workspace build completed successfully!"
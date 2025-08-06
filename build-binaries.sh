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

# --- This function builds a single Rust native module ---
build_native_module() {
    local module_name=$1
    if [ ! -d "native/$module_name" ]; then
        print_error "Directory native/$module_name not found. Skipping."
        return
    fi

    print_status "Building module: ${module_name}"
    
    # Change into the module's directory
    cd "native/$module_name"

    # Install dependencies
    print_info "Installing dependencies for $module_name..."
    cargo fetch
    cargo install --path .

    # --- macOS Build ---
    if [ "$BUILD_MAC" = true ]; then
        print_info "Building macOS binaries for $module_name..."
        
        # Build for Intel
        print_info "Building for x86_64-apple-darwin (Intel)..."
        cargo build --release --target x86_64-apple-darwin

        # Build for Apple Silicon
        print_info "Building for aarch64-apple-darwin (Apple Silicon)..."
        cargo build --release --target aarch64-apple-darwin

        # If --universal flag is passed, create a single binary for both architectures
        if [[ " ${ARGS[*]} " == *" --universal "* ]]; then
            print_info "Creating Universal macOS binary for $module_name..."
            
            local universal_dir="target/universal"
            mkdir -p "$universal_dir"

            lipo -create \
                "target/x86_64-apple-darwin/release/$module_name" \
                "target/aarch64-apple-darwin/release/$module_name" \
                -output "$universal_dir/$module_name"
            
            print_info "Universal binary created at $universal_dir/$module_name"
        fi

        print_status "Renaming Rust target directories for electron-builder..."
        # This aligns the directory names with electron-builder's {arch} variable.

        rm -rf "target/arm64-apple-darwin"
        rm -rf "target/x64-apple-darwin"
        mv "target/aarch64-apple-darwin" "target/arm64-apple-darwin"
        mv "target/x86_64-apple-darwin" "target/x64-apple-darwin"
    fi

    # --- Windows Build ---
    if [ "$BUILD_WINDOWS" = true ]; then
        print_info "Building Windows binary for $module_name..."
        cargo build --release --target x86_64-pc-windows-gnu
    fi

    # Return to the project root for the next module
    cd ../..
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
    echo "Usage: $0 [--mac] [--windows] [--all] [--universal]"
    exit 1
fi

# Add required Rust targets
if [ "$BUILD_MAC" = true ]; then
    print_status "Adding macOS targets..."
    rustup target add x86_64-apple-darwin
    rustup target add aarch64-apple-darwin
fi
if [ "$BUILD_WINDOWS" = true ]; then
    print_status "Adding Windows target..."
    rustup target add x86_64-pc-windows-gnu
fi


# --- Build all native modules ---
build_native_module "global-key-listener"
build_native_module "audio-recorder"
build_native_module "text-writer"
build_native_module "active-application"


print_status "All native module builds completed successfully!"
#!/bin/bash

# Exit on error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}Error:${NC} $1"
}

# Check if rustup is installed
if ! command -v rustup &> /dev/null; then
    print_error "rustup is not installed. Please install it first: https://rustup.rs/"
    exit 1
fi

# Add required targets
print_status "Adding required targets..."
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin
rustup target add x86_64-pc-windows-gnu


# Change to the key listener directory
cd native/global-key-listener

# Build for each target
print_status "Building for x86_64-apple-darwin..."
cargo build --release --target x86_64-apple-darwin

print_status "Building for aarch64-apple-darwin..."
cargo build --release --target aarch64-apple-darwin

print_status "Building for x86_64-pc-windows-gnu..."
cargo build --release --target x86_64-pc-windows-gnu

print_status "All builds completed successfully!" 
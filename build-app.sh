#!/bin/bash

# Exit on error
set -e

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

# Function to print info
print_info() {
    echo -e "${BLUE}==>${NC} $1"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}==>${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}Error:${NC} $1"
}

# Clear output directory
clear_output_dir() {
    print_status "Clearing output directory..."
    
    if [ -d "dist" ]; then
        print_info "Removing existing dist directory..."
        rm -rf dist
    fi
    
    print_info "Output directory cleared"
}

# Load NVM and Node.js environment
setup_node_env() {
    print_info "Setting up Node.js environment..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
}

# Load Rust environment
setup_rust_env() {
    print_info "Setting up Rust environment..."
    [ -s "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
}

# Check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v bun &> /dev/null; then
        print_error "Bun is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v rustc &> /dev/null; then
        print_error "Rust is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v cargo &> /dev/null; then
        print_error "Cargo is not installed or not in PATH"
        exit 1
    fi
    
    print_info "Node.js version: $(node --version)"
    print_info "Bun version: $(bun --version)"
    print_info "Rust version: $(rustc --version)"
    print_info "Cargo version: $(cargo --version)"
}

# Build native Rust modules
build_native_modules() {
    print_status "Building native Rust modules..."
    ./build-binaries.sh --mac --universal
    print_status "Native modules built successfully!"
}

# Build Electron application
build_electron_app() {
    print_status "Building Electron application..."
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_info "Installing dependencies..."
        bun install
    fi
    
    # Build the application using electron-vite
    print_info "Building application with Electron Vite..."
    bun run vite:build:app
    
    print_status "Electron application built successfully!"
}

# Create DMG installer
create_dmg() {
    print_status "Creating DMG installer..."
    
    # Check for notarization credentials if notarize is enabled in config
    if grep -q "notarize: true" electron-builder.yml; then
      if [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
        print_error "Notarization is enabled, but the required environment variables are not set."
        print_error "Please set APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_SPECIFIC_PASSWORD."
        exit 1
      else
        print_info "Notarization credentials found. Proceeding with notarized build."
      fi
    fi
    
    print_info "Packaging application with Electron Builder..."
    # First build the Electron app, then run electron-builder
    bun run vite:build:app
    bun run electron-builder --config electron-builder.yml --mac --universal
    
    print_status "DMG installer created successfully!"
    
    # Show output location
    if [ -d "dist" ]; then
        print_info "Build output location: $(pwd)/dist"
        ls -la dist/Ito-Installer.dmg 2>/dev/null || print_warning "Ito-Installer.dmg not found in dist directory"
    fi
}

# Main build function
main() {
    print_status "Starting Ito build process..."
    echo
    
    # Parse command line arguments
    SKIP_BINARIES=false
    for arg in "$@"; do
        case $arg in
            --skip-binaries)
                SKIP_BINARIES=true
                shift
                ;;
            *)
                # Unknown option
                ;;
        esac
    done
    
    # Clear output directory first
    clear_output_dir
    echo
    
    # In CI, the environment is set up by the workflow.
    if [ -z "$CI" ]; then
        # Setup environments
        setup_node_env
        setup_rust_env
    fi
    
    
    # Check prerequisites
    check_prerequisites
    echo
    
    # Build native modules (unless skipped)
    if [ "$SKIP_BINARIES" = false ]; then
        build_native_modules
        echo
    else
        print_info "Skipping native modules build (--skip-binaries flag passed)"
        echo
    fi
    
    # Create DMG (includes Electron build)
    create_dmg
    echo
    
    print_status "Build process completed successfully! 🎉"
    print_info "Your DMG installer is ready: dist/Ito-Installer.dmg"
}

# Run main function
main "$@" 
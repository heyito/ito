#!/bin/bash

# Exit on error
set -e

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | sed 's/#.*//' | xargs)
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
    if [ -d "$NVM_DIR" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
        \. "$NVM_DIR/nvm.sh"
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
        print_info "NVM environment loaded"
    else
        print_info "NVM not found or using system Node.js"
    fi
}

# Load Rust environment
setup_rust_env() {
    print_info "Setting up Rust environment..."
    if [ -s "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    else
        print_info "Rust environment file not found, using system Rust"
    fi
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
    local platform=$1
    print_status "Building native Rust modules for $platform..."
    
    case $platform in
        "mac")
            ./build-binaries.sh --mac --universal
            ;;
        "windows")
            ./build-binaries.sh --windows
            ;;
        "all")
            ./build-binaries.sh --all --universal
            ;;
        *)
            print_error "Invalid platform: $platform. Use 'mac', 'windows', or 'all'"
            exit 1
            ;;
    esac
    
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

# Create macOS DMG installer
create_dmg() {
    print_status "Creating macOS DMG installer..."
    
    # Check for notarization credentials if notarize is enabled in config
    if grep -q "notarize: true" electron-builder.config.js; then
      if [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
        print_error "Notarization is enabled, but the required environment variables are not set."
        print_error "Please set APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_SPECIFIC_PASSWORD."
        exit 1
      else
        print_info "Notarization credentials found. Proceeding with notarized build."
      fi
    fi
    
    print_info "Packaging application with Electron Builder..."
    bun run vite:build:app
    bun run electron-builder --config electron-builder.config.js --mac --universal --publish never
    
    print_status "macOS DMG installer created successfully!"
    
    # Show output location
    if [ -d "dist" ]; then
        print_info "Build output location: $(pwd)/dist"
        ls -la dist/Ito-Installer.dmg 2>/dev/null || print_warning "Ito-Installer.dmg not found in dist directory"
    fi
}

# Create Windows installer
create_windows_installer() {
    print_status "Creating Windows installer..."
    
    print_info "Packaging application with Electron Builder..."
    bun run vite:build:app
    
    # Set npm config to avoid symlink issues on Windows
    export npm_config_cache=$PWD/.npm-cache
    export ELECTRON_BUILDER_CACHE=$PWD/.electron-builder-cache  
    
    # Disable code signing completely
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    export CSC_LINK=""
    export CSC_KEY_PASSWORD=""
    export SKIP_SIGNING=true
    export WIN_CSC_LINK=""
    
    print_info "Using Docker for Windows build on $OSTYPE..."
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    
    # Check if Docker is running (skip in CI environments)
    if [ -z "$CI" ] && ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker."
        exit 1
    fi
    
    # Use Docker for cross-compilation with ARM64 compatibility and bun
    docker run --rm --platform linux/amd64 \
      --env CSC_IDENTITY_AUTO_DISCOVERY=false \
      --env SKIP_SIGNING=true \
      -v "$PWD":/project \
      electronuserland/builder:wine \
      bash -c "
        # Install bun with retry
        curl -fsSL https://bun.sh/install | bash || curl -fsSL https://bun.sh/install | bash
        export PATH=\"/root/.bun/bin:\$PATH\"
        
        # Verify bun installation
        bun --version

        # Change to project and debug file paths
        cd /project
        echo 'Current directory:' \$(pwd)
        echo 'Directory contents:'
        ls -la
        
        # Install dependencies (let SQLite3 use prebuilt binaries for Electron)
        export npm_config_target_platform=win32
        export npm_config_target_arch=x64
        export npm_config_runtime=electron
        export npm_config_sqlite3_binary_host_mirror=https://github.com/mapbox/node-sqlite3/releases/download
        export npm_config_electron_version=\$(node -p \"require('./package.json').devDependencies.electron.replace('^', '')\")
        bun install || bun install --force || bun install
        
        # Run electron-builder
        bunx electron-builder --config electron-builder.config.js --win --x64 --publish=never

        # Rename latest.yml to latest-windows.yml inside the container
        if [ -f dist/latest.yml ]; then
          echo 'Renaming dist/latest.yml to dist/latest-windows.yml for Windows auto-updater'
          mv dist/latest.yml dist/latest-windows.yml
        fi
      "
    
    print_status "Windows installer created successfully!"
    
    # Show output location
    if [ -d "dist" ]; then
        print_info "Build output location: $(pwd)/dist"
        ls -la dist/*.exe 2>/dev/null || print_warning "No .exe files found in dist directory"
        ls -la dist/*.nsis.7z 2>/dev/null || print_warning "No .nsis.7z files found in dist directory"
    fi
}

# Show usage information
show_usage() {
    echo "Usage: $0 [PLATFORM] [OPTIONS]"
    echo ""
    echo "PLATFORMS:"
    echo "  mac, macos          Build for macOS (default)"
    echo "  win, windows        Build for Windows"
    echo ""
    echo "OPTIONS:"
    echo "  --skip-binaries     Skip building native Rust modules"
    echo "  --help, -h          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                  # Build for macOS"
    echo "  $0 mac              # Build for macOS"
    echo "  $0 windows          # Build for Windows"
    echo "  $0 mac --skip-binaries    # Build macOS without rebuilding Rust modules"
}

# Main build function
main() {
    # Parse command line arguments
    PLATFORM="mac"  # default platform
    SKIP_BINARIES=false
    
    for arg in "$@"; do
        case $arg in
            "mac"|"macos")
                PLATFORM="mac"
                shift
                ;;
            "win"|"windows")
                PLATFORM="windows"
                shift
                ;;
            --skip-binaries)
                SKIP_BINARIES=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                # Unknown option
                print_warning "Unknown option: $arg"
                ;;
        esac
    done
    
    print_status "Starting Ito $PLATFORM build process..."
    echo
    
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
        case $PLATFORM in
            "mac")
                build_native_modules "mac"
                ;;
            "windows")
                build_native_modules "windows"
                ;;
        esac
        echo
    else
        print_info "Skipping native modules build (--skip-binaries flag passed)"
        echo
    fi
    
    # Build for the specified platform(s)
    case $PLATFORM in
        "mac")
            create_dmg
            echo
            print_status "macOS build process completed successfully! 🎉"
            print_info "Your DMG installer is ready: dist/Ito-Installer.dmg"
            ;;
        "windows")
            create_windows_installer
            echo
            print_status "Windows build process completed successfully! 🎉"
            print_info "Your Windows installer is ready in the dist/ directory"
            ;;
    esac
}

# Run main function
main "$@"
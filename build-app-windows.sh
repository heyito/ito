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
    # On Windows, NVM might not be available or might be nvm-windows
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
    # Try to source Rust environment if available
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
    print_status "Building native Rust modules for Windows..."
    ./build-binaries.sh --windows
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

# Create Windows installer
create_windows_installer() {
    print_status "Creating Windows installer..."
    
    print_info "Packaging application with Electron Builder..."
    # First build the Electron app, then run electron-builder
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
    
    print_info "Using Docker for Windows build..."
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop for Mac."
        exit 1
    fi
    
    # Use Docker for cross-compilation with ARM64 compatibility and bun
    docker run --rm --platform linux/amd64 \
        --env CSC_IDENTITY_AUTO_DISCOVERY=false \
        --env SKIP_SIGNING=true \
        -v "/$PWD":/project \
        electronuserland/builder:wine \
        bash -c "
            # Install bun
            curl -fsSL https://bun.sh/install | bash
            export PATH=\"/root/.bun/bin:\$PATH\"
            
            # Change to project and debug file paths
            cd /project
            echo 'Current directory:' \$(pwd)
            echo 'Directory contents:'
            ls -la
            echo 'electron-builder.config.js exists:' \$(test -f electron-builder.config.js && echo 'YES' || echo 'NO')
            
            # Run electron-builder
            bunx electron-builder --config electron-builder.config.js --win --x64 --publish=never
        "
    
    print_status "Windows installer created successfully!"
    
    # Show output location
    if [ -d "dist" ]; then
        print_info "Build output location: $PWD/dist"
        ls -la dist/*.exe 2>/dev/null || print_warning "No .exe files found in dist directory"
        ls -la dist/*.nsis.7z 2>/dev/null || print_warning "No .nsis.7z files found in dist directory"
    fi
}

# Main build function
main() {
    print_status "Starting Ito Windows build process..."
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
    
    # Create Windows installer (includes Electron build)
    create_windows_installer
    echo
    
    print_status "Build process completed successfully! 🎉"
    
    # Show what was created
    if [ -d "dist" ]; then
        print_info "Windows build artifacts created:"
        find dist -name "*.exe" -o -name "*.nsis.7z" -o -name "*.yml" -o -name "*.zip" -o -name "*.blockmap" | sort
    fi
}

# Run main function
main "$@"
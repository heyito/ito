#!/bin/bash

# Set up logging
LOG_FILE="/tmp/inten_native_messaging_host.log"
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

log "Starting native messaging host script"

# Determine the directory of the current script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log "Script directory: $SCRIPT_DIR"

# Navigate to the parent directory (project root)
cd "$SCRIPT_DIR/.." || { log "ERROR: Failed to change to project root directory"; exit 1; }
log "Changed to directory: $(pwd)"

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    log "Loading .env file"
    set -a  # automatically export all variables
    source ".env"
    set +a
    log "Environment variables loaded"
else
    log "No .env file found"
fi

# Check if DEV mode is enabled
if [ "$DEV" = "true" ]; then
    log "Running in DEV mode"
    # Activate venv if needed
    if [ -d ".venv/bin" ]; then
        log "Activating virtual environment"
        source ".venv/bin/activate"
        log "Virtual environment activated"
    else
        log "No virtual environment found"
    fi

    # Run using python -m to treat src as a package
    log "Starting Python native messaging host"
    DEV=true python3 -m src.native_messaging_host --native-messaging-host
    EXIT_CODE=$?
    log "Python process exited with code: $EXIT_CODE"
else
    log "Running in production mode"
    # Ensure the path is correct for production builds
    if [ -f "/Applications/Inten.app/Contents/MacOS/Inten" ]; then
        log "Starting production Inten app"
        "/Applications/Inten.app/Contents/MacOS/Inten" --native-messaging-host
        EXIT_CODE=$?
        log "Inten app exited with code: $EXIT_CODE"
    else
        log "ERROR: Inten app not found at /Applications/Inten.app/Contents/MacOS/Inten"
        exit 1
    fi
fi

log "Native messaging host script completed"

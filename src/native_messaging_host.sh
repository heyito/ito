#!/bin/bash

# Determine the directory of the current script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate to the parent directory (project root)
cd "$SCRIPT_DIR/.." || exit

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    set -a  # automatically export all variables
    source ".env"
    set +a
fi

# Check if DEV mode is enabled
if [ "$DEV" = "true" ]; then
    # Activate venv if needed (can often be skipped if python3 links correctly)
    if [ -d "venv/bin" ]; then
       source "venv/bin/activate"
    fi
    # Run using python -m to treat src as a package
    DEV=true python3 -m src.native_messaging_host --native-messaging-host
else
    # Ensure the path is correct for production builds
    "/Applications/Inten.app/Contents/MacOS/Inten" --native-messaging-host
fi

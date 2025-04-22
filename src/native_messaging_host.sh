#!/bin/bash

# Determine the directory of the current script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate to the parent directory
cd "$SCRIPT_DIR/.."

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    set -a  # automatically export all variables
    source ".env"
    set +a
fi

# Check if DEV mode is enabled
if [ "$DEV" = "true" ]; then
    source "venv/bin/activate"
    DEV=true python3 "src/native_messaging_host.py" --native-messaging-host
else
    "/Applications/Inten.app/Contents/MacOS/Inten" --native-messaging-host
fi

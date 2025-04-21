#!/bin/bash

# Determine the directory of the current script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define the path to the .env file in the parent directory
ENV_FILE="$SCRIPT_DIR/../.env"

# Load environment variables from the .env file if it exists
if [ -f "$ENV_FILE" ]; then
  export "$(grep -v '^#' "$ENV_FILE" | xargs)"
fi

# Check if DEV mode is enabled
if [ "$DEV" = "true" ]; then
  echo "Running in development mode"
  # Run the Python script
  python3 "$SCRIPT_DIR/native_messaging_host.py" --native-messaging-host
else
  # Run the production binary
  "/Applications/Inten.app/Contents/MacOS/Inten" --native-messaging-host
fi
#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Log the launch attempt
echo "Launching native host at $(date)" >> "$SCRIPT_DIR/../native_host_launch.log"
echo "Current directory: $(pwd)" >> "$SCRIPT_DIR/../native_host_launch.log"
echo "Script directory: $SCRIPT_DIR" >> "$SCRIPT_DIR/../native_host_launch.log"
echo "Python path: $(which python3)" >> "$SCRIPT_DIR/../native_host_launch.log"
echo "Python version: $(python3 --version)" >> "$SCRIPT_DIR/../native_host_launch.log"

# Launch the Python script
exec python3 "$SCRIPT_DIR/native_messaging_host.py" 2>> "$SCRIPT_DIR/../native_host_launch.log" 
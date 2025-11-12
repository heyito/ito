#!/bin/bash

# Wait for MinIO to be ready
echo "Waiting for MinIO to start..."
sleep 5

# Install mc (MinIO client) if not already installed
if ! command -v mc &> /dev/null; then
    echo "Installing MinIO client..."
    
    # Try macOS installation first
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install minio/stable/mc 2>/dev/null || {
            echo "Failed to install via brew. Please install MinIO client manually:"
            echo "  macOS: brew install minio/stable/mc"
            echo "  Or download from: https://dl.min.io/client/mc/release/darwin-amd64/mc"
            exit 1
        }
    else
        echo "Please install MinIO client manually:"
        echo "  macOS: brew install minio/stable/mc"
        echo "  Linux: wget https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x mc && sudo mv mc /usr/local/bin/"
        echo "  Windows (PowerShell): Invoke-WebRequest -Uri \"https://dl.min.io/client/mc/release/windows-amd64/mc.exe\" -OutFile \"mc.exe\""
        echo "           Then add mc.exe to your PATH or run from current directory"
        echo "  Windows (Command Prompt): curl -o mc.exe https://dl.min.io/client/mc/release/windows-amd64/mc.exe"
        echo ""
        echo "Alternative: Use Docker to run mc commands:"
        echo "  docker run --rm -it --entrypoint=/bin/sh minio/mc -c \"mc alias set local http://host.docker.internal:9000 minioadmin minioadmin && mc mb local/ito-audio-storage\""
        exit 1
    fi
fi

# Configure mc to connect to local MinIO
mc alias set local http://localhost:9000 "${S3_ACCESS_KEY_ID:-minioadmin}" "${S3_SECRET_ACCESS_KEY:-minioadmin}"

# Create blob storage bucket if it doesn't exist
BLOB_BUCKET=${BLOB_STORAGE_BUCKET:-ito-blob-storage}
if mc ls local/"${BLOB_BUCKET}" 2>/dev/null; then
    echo "Bucket ${BLOB_BUCKET} already exists"
else
    echo "Creating bucket ${BLOB_BUCKET}..."
    mc mb local/"${BLOB_BUCKET}"
    echo "Bucket created successfully"
fi

# Set bucket policy to allow read/write
mc anonymous set download local/"${BLOB_BUCKET}" 2>/dev/null || true

# Create timing storage bucket if it doesn't exist
TIMING_BUCKET=${TIMING_BUCKET:-ito-timing-storage}
if mc ls "local/${TIMING_BUCKET}" 2>/dev/null; then
    echo "Bucket ${TIMING_BUCKET} already exists"
else
    echo "Creating bucket ${TIMING_BUCKET}..."
    mc mb "local/${TIMING_BUCKET}"
    echo "Bucket created successfully"
fi

# Set bucket policy to allow read/write
mc anonymous set download "local/${TIMING_BUCKET}" 2>/dev/null || true

echo "MinIO setup complete!"
echo "MinIO Console: http://localhost:9001"
echo "S3 Endpoint: http://localhost:9000"
echo "Buckets:"
echo "  - ${BLOB_BUCKET} (blob storage)"
echo "  - ${TIMING_BUCKET} (timing data)"
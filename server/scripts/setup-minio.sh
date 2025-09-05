#!/bin/bash

# Wait for MinIO to be ready
echo "Waiting for MinIO to start..."
sleep 5

# Install mc (MinIO client) if not already installed
if ! command -v mc &> /dev/null; then
    echo "Installing MinIO client..."
    brew install minio/stable/mc 2>/dev/null || {
        echo "Please install MinIO client manually:"
        echo "  macOS: brew install minio/stable/mc"
        echo "  Linux: wget https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x mc"
        exit 1
    }
fi

# Configure mc to connect to local MinIO
mc alias set local http://localhost:9000 ${S3_ACCESS_KEY_ID:-minioadmin} ${S3_SECRET_ACCESS_KEY:-minioadmin}

# Create bucket if it doesn't exist
BUCKET_NAME=${BLOB_STORAGE_BUCKET:-ito-blob-storage}
if mc ls local/${BUCKET_NAME} 2>/dev/null; then
    echo "Bucket ${BUCKET_NAME} already exists"
else
    echo "Creating bucket ${BUCKET_NAME}..."
    mc mb local/${BUCKET_NAME}
    echo "Bucket created successfully"
fi

# Set bucket policy to allow read/write
mc anonymous set download local/${BUCKET_NAME} 2>/dev/null || true

echo "MinIO setup complete!"
echo "MinIO Console: http://localhost:9001"
echo "S3 Endpoint: http://localhost:9000"
echo "Bucket: ${BUCKET_NAME}"
#!/bin/sh

# MinIO initialization script
# Sets up the MinIO client and creates required buckets

# Wait for MinIO to be ready
sleep 3

# Configure MinIO client alias
mc alias set local http://minio:9000 minioadmin minioadmin

# Create card-images bucket if it doesn't exist
mc mb --ignore-existing local/card-images

# Set bucket to public (allow download)
mc anonymous set download local/card-images

# Exit cleanly
exit 0

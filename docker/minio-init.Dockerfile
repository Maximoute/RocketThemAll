# Dockerfile for MinIO initialization
FROM minio/mc:latest

# Copy initialization script
COPY docker/minio-init.sh /minio-init.sh

# Make script executable
RUN chmod +x /minio-init.sh

# Run the initialization script
ENTRYPOINT ["/minio-init.sh"]

# Dockerfile
# Bun 1.1.45 is the latest stable version that doesn't cause http connection issues
# for uploads of large audio files. Change this carefully, and test uploads of
# audio files > 1.5 MB to be sure there are no regressions.
FROM oven/bun:1.1.45-alpine AS base

WORKDIR /

# Copy package files
COPY package.json bun.lockb ./
RUN bun install

# Copy source code
COPY . .

# Make sure migration script is executable
RUN chmod +x scripts/migrate.sh

# Generate proto types during the build
RUN bun run proto:gen:server

# Build the typescript code using Bun's native TypeScript support
RUN bun build src/index.ts --outdir dist --target node

# Expose the gRPC port
EXPOSE 3000


# Run the gRPC server with Bun
CMD ["bun", "run", "start"]

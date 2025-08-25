# Dockerfile
FROM oven/bun:1-alpine AS base

WORKDIR /

# Copy package files
COPY package.json bun.lock ./
RUN bun install

# Copy source code
COPY . .

# Make sure migration script is executable
RUN chmod +x scripts/migrate.sh

# Generate proto types during the build
RUN bun run proto:gen:server

# Build the typescript code using Bun's native TypeScript support
RUN bun build src/index.ts --outdir dist --target bun

# Expose the gRPC port
EXPOSE 3000


# Run the gRPC server with Bun
CMD ["bun", "run", "start"]

# Dockerfile
FROM oven/bun:1-alpine AS base

WORKDIR /

# Copy package files
COPY package.json bun.lockb ./
RUN bun install

# Copy source code
COPY . .

# Generate proto types during the build
RUN bun run proto:gen:server

# Build the typescript code using Bun's native TypeScript support
RUN bun build src/index.ts --outdir dist --target node

# Expose the gRPC port
EXPOSE 3000

# Expose the health check port
EXPOSE 3001

# Run the gRPC server with Bun
CMD ["bun", "run", "start"]

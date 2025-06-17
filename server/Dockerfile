# Dockerfile
FROM node:22-alpine AS base

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install
COPY . .

# New step: Generate proto types during the build
RUN yarn proto:gen
# Build the typescript code
RUN yarn build

# Expose the gRPC port
EXPOSE 3000

# Run the gRPC server, not the express one
CMD ["node", "dist/server.js"]

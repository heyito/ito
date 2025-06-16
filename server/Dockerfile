# Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# Runtime
FROM node:22-alpine AS runner
RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
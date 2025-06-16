# Dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

EXPOSE 3000
CMD ["node", "dist/index.js"]
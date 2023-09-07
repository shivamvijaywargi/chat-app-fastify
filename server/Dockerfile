# stage 1 - Build the base
FROM node:20-alpine AS base

WORKDIR /app

COPY src ./src 

COPY package*.json ./

COPY tsconfig*.json ./

RUN npm install

# stage 2 - Build the app
FROM base AS build

WORKDIR /app

RUN npm run build

# stage 3 - Production
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only-production

COPY --from=build /app/build ./

CMD [ "node", "main.js" ]
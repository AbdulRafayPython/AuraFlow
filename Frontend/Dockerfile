# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# nginx (below) proxies /api, /socket.io and /uploads to the API container, so
# the bundle talks to its own origin instead of a hard-coded backend URL.
ENV VITE_SAME_ORIGIN=true
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

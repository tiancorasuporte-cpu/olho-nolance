FROM oven/bun:1.2 AS build

WORKDIR /app

ARG VITE_API_URL=http://localhost:8000
ARG VITE_MEDIA_URL=http://localhost:8001
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MEDIA_URL=$VITE_MEDIA_URL

COPY package.json ./
RUN bun install

COPY . .
RUN bun run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

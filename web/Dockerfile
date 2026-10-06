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

FROM oven/bun:1.2-slim

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.ts .
COPY package.json .

EXPOSE 8080
CMD ["bun", "run", "server.ts"]

# syntax=docker/dockerfile:1.7
# Single image: Hono API (bun:sqlite) + the built PWA.
FROM oven/bun:1.4-debian AS web
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

FROM oven/bun:1.4-debian AS server
WORKDIR /app/server
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4-slim AS runtime
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data WEB_DIR=../web/dist
WORKDIR /app/server
COPY --from=server /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY --from=web /app/web/dist /app/web/dist
RUN mkdir -p /data && chown -R bun:bun /data
USER bun
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "src/index.ts"]

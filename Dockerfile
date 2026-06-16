FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV CI=true
RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build
RUN pnpm --filter @u-build/server --prod deploy /prod/server

FROM base AS server-runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV HORUS_WEB_DIST_DIR=apps/web/dist
COPY --from=build /prod/server /app
COPY --from=build /app/apps/web/dist /app/apps/web/dist
COPY skills/agents /app/skills/agents
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const host=process.env.HORUS_HEALTHCHECK_HOST||require('node:os').hostname();const port=process.env.PORT||'3000';fetch('http://'+host+':'+port+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node dist/infrastructure/database/migrateCli.js && node dist/main.js"]

FROM nginx:1.27-alpine AS web-runtime
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD host="${HORUS_HEALTHCHECK_HOST:-$(hostname)}"; wget -qO- "http://${host}:${NGINX_PORT:-8080}/" >/dev/null || exit 1

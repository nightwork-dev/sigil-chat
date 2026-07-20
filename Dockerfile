# syntax=docker/dockerfile:1.7
#
# One reviewed source revision builds each private service image. Runtime
# targets deliberately start production commands only; no watcher, Portless,
# or development server is present in the launch path.
FROM node:24-bookworm-slim AS dependencies

RUN corepack enable && corepack prepare pnpm@9.0.6 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmr[c] ./
COPY patches ./patches
COPY vendor ./vendor
COPY apps/agent/package.json apps/agent/package.json
COPY apps/gonk/package.json apps/gonk/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM dependencies AS source
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.0.6 --activate && chmod -R a+rX /opt/corepack
COPY . .

FROM source AS web-build
# These are server-side private-network origins baked into Nitro's route
# proxy; browser traffic remains same-origin through Caddy.
ENV EVE_ORIGIN=http://eve:3001
ENV GONK_MCP_URL=http://gonk:8808/mcp
RUN pnpm --filter web build

FROM source AS eve-build
ENV GONK_MCP_URL=http://gonk:8808/mcp
RUN pnpm --filter sigil-chat-agent build

FROM source AS migrate
ENV NODE_ENV=production
RUN groupadd --gid 10001 sigil && useradd --uid 10001 --gid 10001 --create-home sigil \
  && mkdir -p /var/lib/sigil-web && chown -R sigil:sigil /var/lib/sigil-web /app
USER 10001:10001
WORKDIR /app
ENTRYPOINT ["node", "scripts/load-secret-env.mjs", "BETTER_AUTH_SECRET", "--"]
CMD ["pnpm", "--filter", "web", "auth:migrate"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --gid 10001 sigil && useradd --uid 10001 --gid 10001 --create-home sigil \
  && mkdir -p /var/lib/sigil-web && chown -R sigil:sigil /var/lib/sigil-web
COPY --from=source --chown=sigil:sigil /app /app
COPY --from=web-build --chown=sigil:sigil /app/apps/web/.output ./apps/web/.output
USER 10001:10001
EXPOSE 3000
ENTRYPOINT ["node", "scripts/load-secret-env.mjs", "BETTER_AUTH_SECRET", "GONK_MCP_KEY", "--"]
CMD ["node", "apps/web/.output/server/index.mjs"]

FROM source AS eve
ENV NODE_ENV=production
RUN npm install --global @openai/codex@0.144.6 \
  && groupadd --gid 10002 sigil && useradd --uid 10002 --gid 10002 --create-home sigil \
  && mkdir -p /var/lib/sigil-eve /app/apps/agent/.eve \
  && chown -R sigil:sigil /var/lib/sigil-eve /app
COPY --from=eve-build --chown=sigil:sigil /app/apps/agent/.output /app/apps/agent/.output
USER 10002:10002
WORKDIR /app
EXPOSE 3001
ENTRYPOINT ["node", "scripts/load-secret-env.mjs", "GONK_MCP_KEY", "--"]
CMD ["pnpm", "--filter", "sigil-chat-agent", "start", "--", "--host", "0.0.0.0"]

FROM source AS gonk
ENV NODE_ENV=production
RUN groupadd --gid 10003 sigil && useradd --uid 10003 --gid 10003 --create-home sigil \
  && mkdir -p /var/lib/sigil-gonk \
  && chown -R sigil:sigil /var/lib/sigil-gonk /app
USER 10003:10003
WORKDIR /app
EXPOSE 8808
ENTRYPOINT ["node", "scripts/load-secret-env.mjs", "GONK_MCP_KEY", "--"]
CMD ["pnpm", "--filter", "sigil-chat-gonk", "start"]

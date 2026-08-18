# syntax=docker/dockerfile:1.7

FROM node:26.7.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY . .

RUN --mount=type=cache,id=skillup-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm shared:build && pnpm --filter @skillup/web build

FROM node:26.7.0-bookworm-slim AS runtime

ARG RELEASE_SHA=unknown
LABEL org.opencontainers.image.source="https://github.com/SkillStep/skillup-platform" \
      org.opencontainers.image.revision="${RELEASE_SHA}" \
      org.opencontainers.image.title="skillup-web"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port=process.env.PORT||3000;fetch('http://127.0.0.1:'+port+'/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]

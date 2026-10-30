# syntax=docker/dockerfile:1
# SocialMK — single-image build (API + SPA served from the same origin)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    SOCIALMK_DATA_DIR=/data
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]

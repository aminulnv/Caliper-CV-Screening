# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
# Set NPM_STRICT_SSL=false at build time if corporate VPN TLS inspection breaks npm in Docker
ARG NPM_STRICT_SSL=true
RUN if [ "$NPM_STRICT_SSL" = "false" ]; then npm config set strict-ssl false; fi
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ARG NPM_STRICT_SSL=true
RUN if [ "$NPM_STRICT_SSL" = "false" ]; then npm config set strict-ssl false; fi
RUN addgroup -S caliper && adduser -S caliper -G caliper
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrate.js ./
COPY migrate-*.sql ./
USER caliper
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

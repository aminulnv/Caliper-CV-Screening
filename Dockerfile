# syntax=docker/dockerfile:1
# Frontend: Vite build + nginx (SPA)

FROM node:20-alpine AS build
WORKDIR /app
ARG NPM_STRICT_SSL=true
RUN if [ "$NPM_STRICT_SSL" = "false" ]; then npm config set strict-ssl false; fi
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src

ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_CLIENT_ID
ARG VITE_COGNITO_DOMAIN
ARG VITE_API_URL=http://localhost:3001

ENV VITE_COGNITO_USER_POOL_ID=$VITE_COGNITO_USER_POOL_ID \
    VITE_COGNITO_CLIENT_ID=$VITE_COGNITO_CLIENT_ID \
    VITE_COGNITO_DOMAIN=$VITE_COGNITO_DOMAIN \
    VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine AS production
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]

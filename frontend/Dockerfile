FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Required for production builds: Vite inlines `import.meta.env.VITE_*` at build time.
# Compose passes `VITE_API_BASE_URL=/api` so the browser uses same-origin `/api` → nginx → api-gateway.
# Without this, the bundle defaults to http://127.0.0.1:8000 and recruiter/auth calls fail with "Network error".
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

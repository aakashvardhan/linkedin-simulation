FROM node:20-alpine

# curl is required for the Docker health check in docker-compose.yml
# health check calls: curl -f http://localhost:8004/health
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files first — Docker caches this layer.
# npm ci only re-runs when package.json or package-lock.json changes,
# not on every source code change. Saves ~30 seconds per build.
COPY package*.json ./
RUN npm install --omit=dev

# Copy source after dependencies
COPY . .

EXPOSE 8004

# Use node directly, not npm — passes SIGTERM correctly to our shutdown handler
CMD ["node", "server.js"]
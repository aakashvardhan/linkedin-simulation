FROM node:20-alpine

# curl is required for the Docker health check in docker-compose.yml
RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8006

CMD ["node", "server.js"]
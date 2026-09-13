FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build
FROM node:22-alpine
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server.mjs package.json ./
COPY --chown=node:node src/config.js ./src/config.js
USER node
ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
CMD ["node","server.mjs"]

FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json build.cjs server.cjs index.html styles.css app.js ./
RUN node build.cjs
ENV NODE_ENV=production
ENV PORT=4173
USER node
EXPOSE 4173
CMD ["node", "server.cjs"]

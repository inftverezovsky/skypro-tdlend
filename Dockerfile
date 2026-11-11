FROM node:26.7.0-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3187 DB_PATH=/app/data/tdlend.sqlite
VOLUME ["/app/data"]
EXPOSE 3187
CMD ["node", "server.mjs"]

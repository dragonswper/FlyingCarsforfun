FROM node:22-bookworm-slim
WORKDIR /game
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node dist ./dist
USER node
ENV NODE_ENV=production BIND_ADDRESS=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "server/index.mjs"]

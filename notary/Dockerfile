# Build context: isolated bundle/repository root containing notary/.
# Create a separate Notary application; never replace the shared Worobi Family nginx app.
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 PUBLIC_DIR=/app/public
WORKDIR /app
COPY notary/package.json notary/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node notary/server ./server
COPY --chown=node:node notary/index.html notary/privacy.html notary/support.html ./public/
COPY --chown=node:node notary/assets ./public/assets
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]

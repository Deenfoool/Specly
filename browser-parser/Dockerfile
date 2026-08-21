FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY browser-parser/package.json browser-parser/package-lock.json ./browser-parser/
RUN cd browser-parser && npm ci --omit=dev

COPY browser-parser/server.js ./browser-parser/server.js
COPY server ./server

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "browser-parser/server.js"]

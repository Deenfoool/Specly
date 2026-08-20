FROM mcr.microsoft.com/playwright:v1.62.0-noble

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY browser-parser/package.json browser-parser/package-lock.json ./browser-parser/
RUN cd browser-parser && npm ci --omit=dev

COPY browser-parser/server.js ./browser-parser/server.js
COPY server ./server

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "browser-parser/server.js"]

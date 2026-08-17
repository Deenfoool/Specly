FROM mcr.microsoft.com/playwright:v1.62.0-noble

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY browser-parser/package.json ./browser-parser/package.json
RUN cd browser-parser && npm install --omit=dev

COPY browser-parser/server.js ./browser-parser/server.js
COPY server ./server

EXPOSE 8080

CMD ["node", "browser-parser/server.js"]

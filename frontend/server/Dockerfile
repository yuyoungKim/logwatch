FROM node:20-alpine

RUN addgroup -g 1001 appgroup \
 && adduser  -u 1001 -G appgroup -H -D appuser

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "index.js"]

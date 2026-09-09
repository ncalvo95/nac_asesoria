# Imagen basada en Debian (glibc), no Alpine: better-sqlite3 es un modulo
# nativo y sus binarios prebuilt apuntan a glibc - en Alpine (musl) suele
# forzar una compilacion desde cero, lenta en una Raspberry Pi.

FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# VITE_BASE_PATH: subpath donde se sirve la app (ver README - Deployment).
# Default "/" para que un build sin este arg siga sirviendo desde la raiz.
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
RUN mkdir -p data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/app.db
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]

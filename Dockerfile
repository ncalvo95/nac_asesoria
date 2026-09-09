# Build del frontend (React + Vite)
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
# Subpath bajo el que cuelga la app (ej. "/nac_asesoria"), horneado en los
# assets del build -- ver frontend/vite.config.js y src/base-path.js. Vacio
# por defecto: build normal, en la raiz. Se pasa como build arg desde
# docker-compose.yml (variable BASE_PATH del .env de la raiz del repo).
# Mismo patron que Loot Ledger (Dockerfile / client/vite.config.js), para
# convivir en la misma Pi con la misma convencion.
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Instalacion de dependencias del backend (compila better-sqlite3 para la
# arquitectura destino). Se incluyen herramientas de build por si no hay
# binario prebuilt para el arch/version de Node exactos en la Raspberry Pi -
# mismo motivo y mismo fix que ya vale para Loot Ledger en el mismo hardware.
FROM node:22-bookworm-slim AS server-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Imagen final: un unico proceso Node sirviendo API + estaticos (liviano
# para Raspberry Pi 3B)
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=3000
ENV DB_PATH=/app/data/app.db
EXPOSE 3000

CMD ["node", "src/server.js"]

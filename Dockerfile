# ============================================
    # Dockerfile - colabor-ai-core (Multi-stage)
    # ============================================
    
    # --- Stage 1: Build ---
    FROM node:23-alpine AS builder
    
    WORKDIR /app
    
    # Instalar Python para execucao de scripts Python
    RUN apk add --no-cache python3 py3-pip
    
    COPY package.json package-lock.json ./
    RUN npm ci
    
    COPY . .
    RUN npm run build
    
    # --- Stage 2: Production ---
    FROM node:23-alpine AS production
    
    WORKDIR /app
    
    # Instalar Python para execucao de scripts Python
    RUN apk add --no-cache python3 py3-pip
    
    ENV NODE_ENV=production
    
    COPY package.json package-lock.json ./
    RUN npm ci --omit=dev
    
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/src ./src
    COPY --from=builder /app/core ./core
    COPY --from=builder /app/tsconfig.json ./
    
    EXPOSE 4000
    
    # Comando padrao: iniciar o orquestrador via CLI
    CMD ["node", "dist/core/orchestrator/main.js"]
    
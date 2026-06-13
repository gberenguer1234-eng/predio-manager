FROM node:20-alpine
WORKDIR /app

# Instala dependências primeiro (cache de camadas)
COPY package*.json ./
RUN npm ci --production

# Copia o restante do código
COPY . .

# Pasta de uploads dentro do volume persistente em produção
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]

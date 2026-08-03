FROM node:18.12.1-bullseye

WORKDIR /app

# Dependências necessárias para o canvas
RUN apt-get update && apt-get install -y \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    build-essential \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci

COPY . .

CMD ["node", "index.js"]

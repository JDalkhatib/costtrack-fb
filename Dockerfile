FROM node:20-slim

# Install poppler for PDF parsing (pdftoppm)
RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci

# Copy all source files
COPY . .

# Build client (Vite) and server (esbuild)
RUN npm run build

# Prune dev dependencies after build
RUN npm prune --omit=dev

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/index.cjs"]

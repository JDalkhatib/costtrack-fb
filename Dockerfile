FROM node:20-slim

# Install poppler for PDF parsing (pdftoppm)
RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built dist and source needed at runtime
COPY dist/ ./dist/
COPY .env ./.env

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/index.cjs"]

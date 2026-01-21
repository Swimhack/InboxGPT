# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and scripts for postinstall
COPY package*.json ./
COPY scripts ./scripts
COPY .env.example ./

# Install all dependencies (including building native modules)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
COPY scripts ./scripts
COPY .env.example ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove build dependencies to reduce image size
RUN apk del python3 make g++

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./

# Copy public directory if it exists (with placeholder)
COPY --from=builder /app/public ./public

# Create data directory
RUN mkdir -p /app/data

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]

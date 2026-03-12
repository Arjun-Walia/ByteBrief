################################################################################
# ByteBrief Backend - Production Dockerfile
# Multi-stage build for optimized production image
################################################################################

# Stage 1: Base dependencies
FROM node:20-alpine AS base

# Install security updates
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

################################################################################
# Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies (including dev)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript (server only)
RUN npx tsc

################################################################################
# Stage 3: Production
FROM node:20-alpine AS production

# Labels for image metadata
LABEL maintainer="ByteBrief Team"
LABEL version="1.0.0"
LABEL description="ByteBrief Tech News API"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies from base
COPY --from=base --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "dist/app.js"]

# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Security audit
RUN npm audit

# Runtime stage
FROM node:20-alpine AS runtime

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm install --production && \
    npm cache clean --force

# Set proper permissions
RUN chown -R appuser:appgroup /app

# Use non-root user
USER appuser

# Set security options
# These will be applied when running with --security-opt
LABEL securityoptions="no-new-privileges:true"

# Add healthcheck - check if process is running
HEALTHCHECK --interval=5m --timeout=30s --start-period=1m --retries=3 \
  CMD ps aux | grep "node dist/index.js" | grep -v grep > /dev/null || exit 1

# Run application
CMD ["node", "dist/index.js"]

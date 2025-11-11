# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for SQL Server connection
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    unixodbc \
    unixodbc-dev \
    freetds \
    freetds-dev

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs

# Expose API port only
EXPOSE 10000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000
ENV DB_MAIN_SERVER=203.150.191.149,28914
ENV DB_MAIN_DATABASE=CFS_Gongcha_Main
ENV DB_MAIN_USER=gongcha

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:10000/health || exit 1

# Start the API server
CMD ["npm", "start"]
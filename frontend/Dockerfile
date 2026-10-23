# Stage 1: Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependency definition files
COPY package.json package-lock.json ./

# Install dependencies strictly according to package-lock.json
RUN npm ci

# Copy source code
COPY . .

# Set Vite environment variable to use relative /api proxy path
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Build static bundle for production
RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy built assets from builder stage
COPY --from=builder /app/dist .

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

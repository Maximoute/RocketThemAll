# Multi-stage Dockerfile for Web service (Next.js)
FROM node:20-alpine AS dependencies

WORKDIR /workspace

# Copy package files
COPY package.json package-lock.json ./
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Install dependencies
RUN npm ci

# Build stage - compile Next.js
FROM dependencies AS builder

WORKDIR /workspace

# Generate Prisma client
RUN npm run prisma:generate

# Build Next.js app
RUN npm run build -w @rta/web

# Development stage - for docker-compose development
FROM node:20-alpine AS development

WORKDIR /workspace

# Install tsx globally for hot-reload development
RUN npm install -g tsx

# Copy from dependencies stage
COPY --from=dependencies /workspace /workspace

# Set development environment
ENV NODE_ENV=development
EXPOSE 3000

# Start the Web app in development mode
CMD ["npm", "run", "-w", "@rta/web", "dev"]

# Production stage - lean runtime
FROM node:20-alpine AS production

WORKDIR /workspace

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built artifacts from builder
COPY --from=builder /workspace/apps/web/.next ./apps/web/.next
COPY --from=builder /workspace/apps/web/public ./apps/web/public
COPY --from=builder /workspace/apps/web/package.json ./apps/web/
COPY --from=builder /workspace/packages/database/dist ./packages/database/dist
COPY --from=builder /workspace/packages/database/node_modules/.prisma ./packages/database/node_modules/.prisma

# Set production environment
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "-w", "@rta/web", "start"]

# Multi-stage Dockerfile for API service
FROM node:20-alpine AS dependencies

WORKDIR /workspace

# Copy package files
COPY package.json package-lock.json ./
COPY libs/database ./libs/database
COPY libs/services ./libs/services
COPY libs/shared ./libs/shared
COPY libs/importers ./libs/importers
COPY services/api ./services/api

# Install dependencies
RUN npm ci

# Build stage - compile TypeScript
FROM dependencies AS builder

WORKDIR /workspace

# Generate Prisma client
RUN npm run prisma:generate

# Build API
RUN npm run build -w @rta/api

# Development stage - for docker-compose development
FROM node:20-alpine AS development

WORKDIR /workspace

# Install tsx globally for hot-reload development
RUN npm install -g tsx

# Copy from dependencies stage
COPY --from=dependencies /workspace /workspace

# Set development environment
ENV NODE_ENV=development

# Start the API in development mode
CMD ["npm", "run", "-w", "@rta/api", "dev"]

# Production stage - lean runtime
FROM node:20-alpine AS production

WORKDIR /workspace

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built artifacts from builder
COPY --from=builder /workspace/services/api/dist ./services/api/dist
COPY --from=builder /workspace/libs/database/dist ./libs/database/dist
COPY --from=builder /workspace/libs/services/dist ./libs/services/dist
COPY --from=builder /workspace/libs/shared/dist ./libs/shared/dist
COPY --from=builder /workspace/libs/importers/dist ./libs/importers/dist
COPY --from=builder /workspace/libs/database/node_modules/.prisma ./libs/database/node_modules/.prisma

# Set production environment
ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "services/api/dist/server.js"]

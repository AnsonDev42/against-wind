FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY ui/package*.json ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install

# Copy UI source code
COPY ui/ .

# Expose port
EXPOSE 3000

# Default command
CMD ["pnpm", "dev"]

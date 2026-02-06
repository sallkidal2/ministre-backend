FROM oven/bun:1

WORKDIR /app

# Set Railway environment
ENV RAILWAY_ENVIRONMENT=production

# Copy production package.json (without Vibecode dependencies)
COPY package.railway.json ./package.json
COPY bun.lock* ./

# Install dependencies (without frozen lockfile since package.json is modified)
RUN bun install

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN bunx prisma generate

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]

FROM python:3.13-slim

WORKDIR /app

# Install system dependencies and uv
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install uv

# Copy root pyproject.toml and uv.lock first for better caching
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

# Copy the entire project structure
COPY . .

# Set working directory to api folder
WORKDIR /app/api

# Expose port
EXPOSE 8000

# Default command (can be overridden in docker-compose)
CMD ["uv", "run", "uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

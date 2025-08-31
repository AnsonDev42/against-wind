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
RUN uv sync --only-dev --frozen

COPY api/ ./api/
# Copy any additional required files at root level


# Expose port
EXPOSE 8000

# Default command (can be overridden in docker-compose)
CMD ["uv", "run", "uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

#!/bin/bash
set -e

echo "🚴‍♂️ Against Wind - Development Setup"
echo "======================================"

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is required but not installed"
    exit 1
fi

if ! command -v uv &> /dev/null; then
    echo "❌ uv is required but not installed"
    echo "Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Setup environment
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your configuration (especially NEXT_PUBLIC_MAPBOX_TOKEN)"
else
    echo "✅ .env file already exists"
fi

# Install API dependencies
echo "Installing API dependencies..."
uv sync

# Install UI dependencies
echo "Installing UI dependencies..."
cd ui
if command -v pnpm &> /dev/null; then
#    npm install pnpm
    pnpm install

else
    echo "⚠️ pnpm not found, skipping UI dependency installation"
fi
cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your configuration"
echo "2. Run: docker-compose up -d"
echo "3. Open http://localhost:3000"
echo ""
echo "For manual development:"
echo "- API: uv run uvicorn api.app.main:app --reload"
echo "- UI: cd ui && pnpm run dev"
echo "- Worker: uv run python -m api.app.worker.worker"

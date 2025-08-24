#!/bin/bash
set -e

echo "🧪 Running Against Wind Tests"
echo "============================="

# API Tests
echo "Running API tests..."
cd api
if uv run pytest --version &> /dev/null; then
    uv run pytest tests/ -v
else
    echo "⚠️  pytest not available, skipping API tests"
fi
cd ..

# UI Tests (when implemented)
echo "UI tests not yet implemented"

echo "✅ Tests completed"

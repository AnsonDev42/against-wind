# Against Wind
A comprehensive wind analysis platform for cycling routes. Upload your GPX files and get detailed wind condition analysis to plan your rides better.

## Architecture

This is a mono-repo containing:

- **`api/`** - FastAPI backend with wind analysis engine
- **`ui/`** - Next.js frontend with interactive map visualization
- **`api.dockerfile`** - Docker configuration for API service
- **`ui.dockerfile`** - Docker configuration for UI service

Key technologies include Python, FastAPI, Next.js, React, PostgreSQL, Redis, and Docker.

##  Getting Started

This project can be run entirely with Docker or in a hybrid mode with the UI/API running locally.

### Prerequisites

- Docker and Docker Compose
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- Node.js 18+ and [pnpm](https://pnpm.io/) (for UI development)

### 1. Initial Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/AnsonDev42/against-wind
    cd against-wind
    ```

2.  **Run the setup script** (recommended):
    ```bash
    chmod +x scripts/dev-setup.sh
    ./scripts/dev-setup.sh
    ```
    This will:
    - Check prerequisites
    - Create `.env` from template
    - Install API dependencies with `uv`
    - Install UI dependencies with `npm`

3.  **Manual setup** (alternative):
    ```bash
    cp .env.example .env
    uv sync
    cd ui && pnpm install && cd ..
    ```

### 2. Running with Docker (Recommended)

This is the simplest way to get all services running.

1.  **Build and Start Services**:
    ```bash
    docker-compose up --build -d
    ```

2.  **Access the Application**:
    -   **UI**: [http://localhost:3000](http://localhost:3000)
    -   **API**: [http://localhost:8000/docs](http://localhost:8000/docs)
    -   **MinIO Console**: [http://localhost:9001](http://localhost:9001)

### 3. Local Development (Hybrid Mode)

Run the UI and API on your local machine for faster development, while keeping stateful services (Postgres, Redis, MinIO) in Docker.

1.  **Start Background Services**:
    ```bash
    docker-compose up -d postgres redis minio
    ```

2.  **Run the Backend (API)**:
    In a new terminal, install dependencies and run the server from the root directory.
    ```bash
    uv sync
    uv run alembic upgrade head # Apply database migrations
    uv run uvicorn api.app.main:app --reload
    ```

3.  **Run the Frontend (UI)**:
    In another terminal, navigate to the `ui` directory and use `pnpm` to install dependencies and start the development server.
    ```bash
    cd ui
    pnpm install
    pnpm dev
    ```

## Development

### Database Migrations

When you change a database model in the API, you'll need to generate a new migration.

```bash
# From the root directory
cd api && uv run alembic revision --autogenerate -m "Your description of the change"
cd api && uv run alembic upgrade head
```

### Running Tests

```bash
# Backend tests (from root directory)
uv run pytest api/tests/

# Frontend tests (from ui/ directory)
cd ui && pnpm test
```

## 📄 License

TBD

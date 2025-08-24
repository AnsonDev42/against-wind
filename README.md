# Against Wind 🚴‍♂️💨

A comprehensive wind analysis platform for cycling routes. Upload your GPX files and get detailed wind condition analysis to plan your rides better.

## 🏗️ Architecture

This is a mono-repo containing:

- **`api/`** - FastAPI backend with wind analysis engine
- **`ui/`** - Next.js frontend with interactive map visualization

Key technologies include Python, FastAPI, Next.js, React, PostgreSQL, Redis, and Docker.

## 🚀 Getting Started

This project can be run entirely with Docker or in a hybrid mode with the UI/API running locally.

### Prerequisites

- Docker and Docker Compose
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- Node.js 18+ and [pnpm](https://pnpm.io/) (for UI development)

### 1. Initial Setup

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd against-wind
    ```

2.  **Configure Environment**:
    Copy the example environment file. You may need to update it with your own keys, such as a Mapbox token for map rendering.
    ```bash
    cp .env.example .env
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
    In a new terminal, navigate to the `api` directory and use `uv` to install dependencies and run the server.
    ```bash
    cd api
    uv sync
    uv run alembic upgrade head # Apply database migrations
    uv run uvicorn app.main:app --reload
    ```

3.  **Run the Frontend (UI)**:
    In another terminal, navigate to the `ui` directory and use `pnpm` to install dependencies and start the development server.
    ```bash
    cd ui
    pnpm install
    pnpm dev
    ```

## 🛠️ Development

### Docker Commands

Here are the most common Docker commands for managing the application:

-   **Start all services**: `docker-compose up -d`
-   **Stop all services**: `docker-compose down`
-   **Rebuild and restart all services**: `docker-compose up --build -d`
-   **View logs for all services**: `docker-compose logs -f`
-   **View logs for a specific service**: `docker-compose logs -f <service_name>` (e.g., `api` or `ui`)
-   **Check running services**: `docker-compose ps`
-   **Run a one-off command**: `docker-compose run --rm <service_name> <command>` (e.g., to run migrations: `docker-compose run --rm api uv run alembic upgrade head`)

### Database Migrations

When you change a database model in the API, you'll need to generate a new migration.

```bash
# From the api/ directory
uv run alembic revision --autogenerate -m "Your description of the change"
uv run alembic upgrade head
```

### Running Tests

```bash
# Backend tests (from api/ directory)
uv run pytest

# Frontend tests (from ui/ directory)
pnpm test
```

## 🤝 Contributing

1.  Fork the repository
2.  Create a feature branch
3.  Make your changes and add tests
4.  Submit a pull request

## 📄 License

[Add your license here]
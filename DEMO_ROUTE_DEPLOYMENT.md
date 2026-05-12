# Demo Route Deployment Notes

## How Demo Route Works

The demo route is auto-loaded by the backend when the frontend requests `route_id = "demo-glossop-sheffield"`.

### Backend Auto-Loading

When any endpoint receives a request for the demo route ID:
- `/api/v1/routes/demo-glossop-sheffield/metadata`
- `/api/v1/routes/demo-glossop-sheffield/coordinates`
- `/api/v1/analyze?route_id=demo-glossop-sheffield`

The backend automatically:
1. Checks in-memory cache
2. If not cached, loads the demo GPX from filesystem
3. Processes it into route points
4. Stores in memory and database with the fixed ID

### Required Files for Deployment

**Backend must include:**
```
api/tests/gpx_samples/glossop-sheffield-without-imestamp.gpx
```

This file must be bundled with the backend deployment so it can be auto-loaded.

### Deployment Configuration

For **Deno Deploy** or similar platforms:
- Ensure `api/tests/` directory is included in deployment
- Or copy the demo GPX to a more standard location like `api/data/demo-route.gpx`

### Frontend

The frontend simply:
1. Sets `routeId = 'demo-glossop-sheffield'` 
2. Calls backend API endpoints with this ID
3. Backend handles the auto-loading transparently

No frontend upload needed! The backend serves demo data directly.

### Local vs Production

- **Local**: Works automatically (files exist in repo)
- **Production**: Requires demo GPX file to be bundled with backend deployment

If the GPX file is missing in production, users will see "Route not found" errors when trying to use the demo.




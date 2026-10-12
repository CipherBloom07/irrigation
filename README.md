# Irrigation Dashboard

A small full-stack dashboard for monitoring irrigation schemes, climate conditions, telemetry, and operational intelligence across Zimbabwean irrigation sites.

## Project structure

- `client/` — Vite + React frontend
- `server/` — Express API server
- `README.md` — project overview and usage

## Tech stack

### Frontend
- React
- Vite
- Tailwind CSS
- Leaflet + react-leaflet
- Lucide React

### Backend
- Node.js
- Express
- PostgreSQL via `pg`
- dotenv

## Prerequisites

- Node.js 18+
- npm
- PostgreSQL database (optional if using fallback mock data)

## Setup

### 1) Install frontend dependencies

```bash
cd client
npm install
```

### 2) Install backend dependencies

```bash
cd server
npm install
```

## Run the app

### Start the backend API

```bash
cd server
npm start
```

The server runs on:

```text
http://localhost:5000
```

### Start the frontend

```bash
cd client
npm run dev
```

The app is usually served at:

```text
http://localhost:5173
```

### Run locally over trusted HTTPS (Windows)

Install [mkcert](https://github.com/FiloSottile/mkcert), then from the project root run:

```powershell
.\scripts\setup-local-https.ps1
```

The setup script installs mkcert's local development CA in the current user's trust store and creates a localhost certificate under `server/certs/`. That directory is excluded from version control. Start the API and frontend in separate terminals with `npm run dev` from `server/` and `client/`, then open `https://localhost:5173`. The frontend uses the matching HTTPS API through its `/api` proxy. Do not use these development certificates in production.

## Production build

### Frontend build

```bash
cd client
npm run build
```

### Preview built frontend

```bash
cd client
npm run preview
```

## API endpoints

### Schemes
- `GET /api/schemes`
- `POST /api/schemes`
- `PUT /api/schemes/:id`
- `DELETE /api/schemes/:id`

### Administrator access
- `GET /api/admin/status`
- `POST /api/admin/setup` (one-time, operator bootstrap token required)
- `POST /api/admin/login`
- `POST /api/admin/logout`

### Telemetry
- `GET /api/telemetry`

## Notes

- The backend includes fallback sample data when the database is unreachable. New schemes are saved to `server/data/schemes.json` in that mode, so they survive API restarts. Set `SCHEME_STORE_PATH` to move the local store; local-only schemes are imported into PostgreSQL on startup when a database becomes available.
- The frontend is configured to proxy `/api` requests to the backend on `localhost:5000`.
- If you want to use a real PostgreSQL database, configure `DATABASE_URL` in the server environment.
- Copy `server/.env.example` to `server/.env` and configure provider URLs and credentials on the server only. Feed URLs must use HTTPS; never put API tokens in client code or commit them.
- Telemetry and weather feeds should return JSON fields such as `soil_moisture`, `water_flow`, `temperature`, `rainfall`, and `evapotranspiration`. Monthly chart series must contain 12 non-negative numeric values. Missing, out-of-range, or malformed readings use the labeled survey baseline.
- A public Copernicus Sentinel-2 catalogue is synchronized without credentials and shown as global imagery metadata only; it is not filtered to scheme locations and does not populate scheme coordinates. For site-specific GIS overlays, configure `SATELLITE_GIS_API_URL` with a provider returning scheme records matched by `code`, `id`, or `name`.
- The public GMB announcements API is shown as dated official notices. Its producer-price notices may contain images rather than machine-readable prices; the portal does not extract or infer numeric market prices from them. Configure `AGRONOMY_API_URL` with a structured, authorized scheme/market feed for per-scheme prices and details.
- Zimbabwe cereal-yield observations are fetched from the World Bank Open Data API and shown as dated national historical context on the Agronomy page, not as live scheme telemetry. A reliable public FAOSTAT API response could not be verified; configure a documented endpoint through `FAO_API_URL` when available.
- Live irrigation sensors still require the actual site gateway/provider endpoint and credentials (`TELEMETRY_API_URL` and `TELEMETRY_API_TOKEN`). Public satellite and climate products are not represented as sensor readings.
- Visible dashboards refresh scheme records every minute so administrator changes from other sessions appear promptly. Configured external feeds are cached for up to five minutes to limit provider requests; manual refresh forces a fresh source sync. Hidden browser tabs pause polling and force a refresh when visible again.
- For production, set `CORS_ORIGINS` to the exact HTTPS origins serving the dashboard, provide a secure PostgreSQL `DATABASE_URL`, store secrets in the deployment's secret manager, and terminate HTTPS at a trusted reverse proxy. Set `TRUST_PROXY=1` only when a trusted proxy overwrites forwarded headers.
- Scheme writes require an administrator session. On first startup, set a strong `ADMIN_BOOTSTRAP_TOKEN` in the server environment; sign in through **Admin sign in** to create the first administrator, then remove the bootstrap token from the runtime environment. Admin passwords are scrypt-hashed, sessions are stored as token hashes in PostgreSQL, and writes require a CSRF token. The public scheme registry remains read-only.
- Signed-in administrators can create schemes, view registry records, edit existing records, and delete records from the Scheme Data Registry. These operations are enforced by the API, not just hidden in the frontend.
- The Irrigation Portal Assistant answers questions using the scheme records, weather, telemetry source status, and page information already loaded by the dashboard. It does not call an external AI service or invent a response when the portal has no supporting information. Its transparent agency marks are under `client/public/images/`.

## Common troubleshooting

### Vite command not found

Use the local project binary explicitly or through `npx`:

```bash
cd client
npx vite build
```

### API not responding

Check that the backend is running:

```bash
cd server
npm start
```

### Database connection issues

The server is designed to fall back to mock scheme data when PostgreSQL is unavailable, but real persistence requires a valid database URL.

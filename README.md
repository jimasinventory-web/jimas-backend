# JIMAS Computers — Backend API

Express 5 + PostgreSQL API for the JIMAS Computers Inventory & POS system.

## What changed in this version (1.1.0)

- **Secrets moved to environment variables.** The database URL and JWT secret are no longer hardcoded. The server now refuses to start (with a clear message) if `DATABASE_URL` is missing.
- **Added the missing `start` script** so `npm start` works on Render.
- **Security:** CORS allowlist (`ALLOWED_ORIGINS`), basic security headers, request-body size limit, and brute-force login rate limiting.
- **Reliability:** connection-pool tuning, a pool error handler (a DB hiccup no longer crashes the app), a `/health` endpoint, and proper 404 / global error handlers.
- **New feature:** `GET /stock/low?threshold=3` returns products at or below a stock threshold (used by the dashboard's Low Stock card).
- **Removed** the insecure public `/hash/:password` endpoint.
- **Added** `schema.sql` (full database structure), `.env.example`, `.gitignore`, and `render.yaml`.

## Run locally

```bash
npm install
cp .env.example .env      # then edit .env with your real values
npm start                 # or: npm run dev  (auto-restarts on changes)
```

Visit http://localhost:3000/health — you should see `"database": "Connected"`.

## Environment variables

| Variable          | Required | Notes                                                        |
|-------------------|----------|--------------------------------------------------------------|
| `DATABASE_URL`    | Yes      | Full PostgreSQL connection string.                           |
| `JWT_SECRET`      | Yes*     | Long random string. Generate with the command in `.env.example`. |
| `ALLOWED_ORIGINS` | No       | Comma-separated frontend URLs. Blank = allow all (testing).  |
| `PORT`            | No       | Render sets this automatically.                              |

\* The app runs without `JWT_SECRET` but logs a warning and uses an insecure default — always set it in production.

## Create the database

Run the schema against your PostgreSQL database once:

```bash
psql "<YOUR_DATABASE_URL>" -f schema.sql
```

Then create your first admin (see the instructions at the bottom of `schema.sql`).

## Deploy to Render

1. Push this folder to your GitHub repo (see the deploy guide that came with these files).
2. On Render, your Web Service should use:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/health`
3. Set the environment variables above under **Environment**.

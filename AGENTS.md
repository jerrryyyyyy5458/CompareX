# CompareX

CompareX is a live price-comparison web app for Indian e-commerce marketplaces
(Amazon India, Flipkart, Myntra, AJIO, Croma, Vijay Sales, Nykaa). A user
searches for a product; the Flask backend concurrently queries/scrapes the
marketplaces in real time and returns a side-by-side price comparison, streaming
per-marketplace progress to the UI via Server-Sent Events. It also supports JWT
user registration/login backed by SQLite.

The repo has two parts:
- `backend/` — Python/Flask API (app factory, blueprints, scrapers).
- `frontend/` — static vanilla HTML/CSS/JS (ES modules, no build step, no `package.json`).

## Cursor Cloud specific instructions

### Services

| Service | Dir | Start command | Port |
| --- | --- | --- | --- |
| Backend Flask API | `backend/` | `cd backend && . .venv/bin/activate && PYTHONPATH=/workspace/backend python /workspace/frontend/pages/app.py` | 5000 |
| Frontend static site | `frontend/` | `cd frontend && python3 -m http.server 5500 --bind 127.0.0.1` | 5500 |

Verify backend: `curl http://127.0.0.1:5000/health` → `{"status":"ok",...}`.

### Non-obvious gotchas

- **The backend entry point is misplaced.** The Flask app factory + dev entry
  (`create_app()` / `app.run(...port=5000)`) lives in `frontend/pages/app.py`,
  but all of its imports (`config`, `database.database`, `routes.*`,
  `services.*`) resolve against `backend/`. So run it from `backend/` with
  `PYTHONPATH=/workspace/backend` pointing at the `frontend/pages/app.py` script
  (see the table above). Do not run it from `frontend/pages/`.
- **CORS is pinned to port 5500.** The backend only allows origins
  `http://127.0.0.1:5500` / `http://localhost:5500` by default. Serve the
  frontend on 5500, or override with the `CORS_ORIGINS` env var.
- **Frontend must be served over HTTP**, not `file://` — it uses ES module
  imports. The frontend calls the API at `http://127.0.0.1:5000` (override via
  `window.COMPAREX_API_URL`).
- **Database is embedded SQLite**, auto-created at startup (`backend/comparex.db`
  via `db.create_all()`). No separate DB process. Only stores user accounts;
  product data is always fetched live and never persisted. PostgreSQL is
  optional via `DATABASE_URL`.
- **Live search needs outbound internet + Playwright Chromium.** Flipkart and
  Croma use Playwright; Amazon uses requests-with-Playwright-fallback; the rest
  use plain HTTP/JSON. Individual marketplace failures are handled gracefully
  (reported per-marketplace in the `errors` list), so a few "temporarily
  unavailable" stores are normal and not a setup failure.
- Config env vars (all optional, have defaults): `DATABASE_URL`,
  `JWT_SECRET_KEY`, `CORS_ORIGINS`.
- **System package `python3.12-venv`** is required to create the backend
  virtualenv (`apt install python3.12-venv`). It is not managed by the update
  script; if venv creation ever fails on a fresh VM, install it first.
- There are no automated tests, linters configured, or CI in the repo, despite
  `.gitignore` referencing `.pytest_cache`/`.ruff_cache`.

# CropBazaar – Your Crop, Right Mandi, Right Time

An agricultural market intelligence hackathon project with a React dashboard and a modular FastAPI backend. Compare mandis, inspect historical prices, forecast 1–7 observations ahead, calculate net returns, identify costs and risks, manage farmer profiles, and ask an assistant.

## Start the servers

From the repository root, with Python 3.11+ and Node 20.19+ or 22.12+:

```bash
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
# macOS: XGBoost also requires `brew install libomp`
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open http://localhost:5173. OpenAPI docs: http://localhost:8000/docs. Health: http://localhost:8000/api/health. The root URL is the landing page; `/dashboard` opens the farmer workspace.

For a production frontend preview, run `npm run build` then `npm run preview` from `frontend/`; open http://localhost:4173.

## Environment

The backend reads the root `.env`. The frontend reads `frontend/.env.local`; set `VITE_API_URL=http://localhost:8000/api` there if overriding the default. No secret belongs in a `VITE_` variable, because Vite bundles these values into the browser.

- `DATABASE_URL`: defaults to local SQLite; use `postgresql+psycopg://user:password@host/database` for PostgreSQL. SQLAlchemy creates the `farmers` table at startup. Existing unrelated tables are preserved.
- `CORS_ORIGINS`: comma-separated exact allowed origins. Defaults cover localhost and 127.0.0.1 on ports 5173 and 4173. Add the exact deployed Vercel URL here.
- `CORS_ORIGIN_REGEX`: optional regex for **your project's** preview origins. Scope it to your project/team; a template is in `.env.example`. Cross-origin credentials are disabled; GET/POST/PUT preflights are supported.
- `MARKET_DATA_MODE=demo`: uses the bundled, explicitly synthetic history. `historical_csv` instead requires `HISTORY_CSV_PATH` and optionally `HISTORY_SOURCE`. The CSV must contain date, crop, mandi, price columns, positive finite prices, ISO dates and unique date/crop/mandi rows. Operator-supplied histories are never labeled live or freshness-verified.
- `DATA_GOV_API_KEY` and `DATA_GOV_RESOURCE_ID`: enable a raw AGMARKNET/data.gov.in snapshot. Arrival dates remain visible and freshness is not verified; these snapshots do not train the forecast automatically.
- `GROQ_API_KEY`, `GROQ_MODEL`: enable the conversational assistant. Without a key, `/api/chat` returns explicitly labeled `offline` guidance.

## JSON contracts and units

Every successful endpoint returns `{ "data": ..., "meta": { "request_id": "...", "price_unit": "INR/quintal", "quantity_unit": "quintal" } }`. HTTP responses also include `X-Request-ID`.

Errors use appropriate HTTP status codes and `{ "error": { "code": "...", "message": "...", "details": [...] }, "meta": ... }`. Validation details contain field names and messages, not submitted inputs. Internal errors and provider credentials are not exposed. The interactive OpenAPI docs contain all request/response schemas.

Price inputs/outputs are INR per quintal. Quantities are quintals. Transport rate is INR/quintal/km; loading is INR/quintal; storage is INR/quintal/day; market charges are a percentage of gross revenue; spoilage is a daily quantity-loss percentage.

### Shared harvest request

Comparison, risk, recommendation and farmer creation/update accept the same validated profile:

```json
{
  "name": "My farm",
  "crop": "Onion",
  "quantity": 20,
  "state": "Maharashtra",
  "district": "Pune",
  "mandis": [
    {"name": "Pune", "distance": 25},
    {"name": "Nashik", "distance": 185},
    {"name": "Mumbai", "distance": 150}
  ],
  "transport_rate": 3,
  "loading_charges": 20,
  "market_charges": 1,
  "spoilage_percent": 1,
  "storage_rate": 8,
  "horizon": 7,
  "urgency": "Flexible",
  "language": "English"
}
```

The numbers above are illustrative inputs, not observed/live data. Profiles require 3–8 distinct mandis. Unknown mandis return an explicit unavailable quote, never an invented price. `urgency` is `Flexible`, `Within 3 days`, or `Sell today`. Supported crops are Onion, Tomato and Wheat. The first shortlisted mandi is the current-market baseline for sell versus switch.

| Endpoint | Contract |
| --- | --- |
| `GET /api/health` | Database connectivity, service status, market mode, live-provider configuration |
| `GET /api/crops` | Supported crop catalogue |
| `GET /api/states` | Indian state catalogue plus Other |
| `GET /api/mandis` | Mandi catalogue; optional state/district filters; city-area coordinates |
| `GET /api/prices/history` | Optional crop/mandi/start_date/end_date; offset ≥0, limit 1–5000; records, total, provenance |
| `POST /api/forecast` | `{crop, mandis: ["Pune", ...], horizon: 1..7}`; prices, forecast bounds, MAE, observation dates, provenance |
| `POST /api/compare-mandis` | Shared harvest; quote and all eligible-day returns for each mandi |
| `POST /api/profit` | `{price, quantity, distance, day, transport_rate, loading_charges, market_charges, spoilage_percent, storage_rate}`; full revenue/cost ledger and net return |
| `POST /api/risk` | Shared harvest; rule-based risk indicators and warnings; weather is separate |
| `POST /api/recommend` | Shared harvest; best mandi/eligible day, sell/wait/switch action, reasons and alternatives |
| `GET /api/farmers/{id}` | Persisted farmer profile by UUID; 404 for missing ID |
| `POST /api/farmers` | Shared harvest; creates a UUID profile, HTTP 201 |
| `PUT /api/farmers/{id}` | Full profile replacement; ID and creation timestamp preserved |
| `POST /api/chat` | `{message, language, context?: sharedHarvest}`; `offline` or `groq` answer |
| `POST /api/scenario` | `{baseline: sharedHarvest, changes?: completeAlternateHarvest}`; baseline and alternate analyses with estimated net-return delta |
| `GET /api/weather` | Open-Meteo daily data with validated lat/lon; explicit provider failure on unavailable weather |
| `GET /api/market/live` | Raw provider snapshot with original arrival dates; explicit 503 without credentials |

`/api/compare` and `/api/assistant` remain deprecated aliases using the same v2 envelopes. Older clients expecting unwrapped prototype responses must update.

## Calculations and forecast integrity

Remaining quantity = initial quantity × (1 − daily spoilage / 100)^day. Gross revenue = price × remaining quantity. Net return subtracts freight, loading, market fees and storage. Money is calculated using Decimal and rounded to paise; the returned ledger sums to the returned net. Spoilage is not deducted twice. Freight/loading/storage use initial quantity; market fees use revenue after spoilage. Profit accepts caller-supplied prices and does not claim they are live.

XGBoost uses seven price lags, chronological 14-observation holdout MAE and recursive forecasts. At least 45 observations are required. Validated dataset loads and predictions are cached. Each forecast starts after that mandi's last observed date. The bundled data has 120 synthetic daily observations per crop/mandi, dated 1 June–28 September 2026; it cannot establish a current trading forecast. Metadata marks synthetic/imported history and staleness. Error bands are illustrative, not calibrated probabilities.

Recommendations maximize net return among available quotes and eligible days. Ties prefer the earlier option and first shortlisted market. Missing quotes produce an empty recommendation. Risk levels are transparent rules: daily spoilage ≥3%, freight >20% of gross, or storage rate >INR20/quintal/day is elevated. Weather is separate and does not adjust price predictions. Buyer availability, grade, insurance and unentered fees are not modeled.

Source options for future data ingestion: [AGMARKNET](https://agmarknet.gov.in/), [CEDA](https://ceda.ashoka.edu.in/), and [data.gov.in](https://www.data.gov.in/). CEDA ingestion and automatic live historical normalization are not implemented.

## Architecture and frontend integration

- `backend/app/main.py`: application factory, lifespan, request IDs, CORS and logging.
- `config.py`, `db.py`, `dependencies.py`, `errors.py`: settings, SQLAlchemy sessions, injected dependencies and centralized errors.
- `schemas.py`: strict Pydantic requests and typed response envelopes.
- `routers/`: system, market, decisions, farmers and external-provider routes.
- `services/`: history/model, financial decisions, provider adapters and farmer persistence. Route handlers contain no model or financial logic.
- `frontend/src/api.js`: centralized Axios client, 20-second timeouts, cancellation, envelope handling, all endpoint methods and explicit demo fallback.
- `frontend/src/context/FarmContext.jsx`: server scenario results supply shared comparisons, forecasts, recommendations and risk; API catalogues populate inputs. Saved farmer IDs are restored through GET; save creates/updates through POST/PUT.
- `frontend/src/pages/FarmerPages.jsx`: debounced `/api/profit` calculation; backend profile saves and AI explanations.

React uses `/api/scenario` to obtain a consistent aggregate analysis, `/api/prices/history` for historical charts, `/api/profit` for calculator edits, farmer CRUD for KisanTwin, and `/api/chat` for Kisan Vaani. When the API is unavailable, market/profit results can fall back to explicitly labeled synthetic/browser calculations. Client validation errors do not trigger fallback. Failed profile persistence is labeled local-only. Weather and AI failures show errors rather than fabricated provider responses.

Pages: `/` landing; `/dashboard`, `/history`, `/forecast`, `/mandis`, `/recommendation`, `/profit`, `/risks`, `/profile`, `/explanation`. React Router, Tailwind, Recharts and Lucide provide responsive navigation, charts, accessible forms and loading/error/empty states. Preferred language is sent to the assistant; dashboard labels remain English. City map points are not verified mandi gates.

Farmer CRUD is an unauthenticated hackathon prototype, not an ownership-controlled account system. Profile data lives in the configured database; this version uses startup schema creation rather than migrations. Authentication, ownership controls and migrations are required for a production account service.

## Verification

```bash
source .venv/bin/activate
python -m pytest tests -q
cd frontend
npm run build
# With both servers running and Google Chrome installed:
npm run test:e2e
```

API tests use isolated temporary SQLite databases and injected mock provider clients. They cover every required endpoint, schema errors, financial math, forecast provenance, missing quotes/history, urgency, scenarios, farmer CRUD, provider failures and CORS. Browser tests cover both backend-unavailable fallback and actual connected history/scenario/profit/profile/chat flows, as well as mobile navigation and profile restoration.

## Deployment

Vercel: root `frontend`, build `npm run build`, output `dist`, set `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`. Included `vercel.json` supports client routes.

Render: repository root, build `pip install -r backend/requirements.txt`, start `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`. Set PostgreSQL `DATABASE_URL` using `postgresql+psycopg://`, exact Vercel `CORS_ORIGINS`, and provider keys through environment secrets. SQLite is the local fallback and is not durable on an ephemeral deployment. No external deployment has been performed.

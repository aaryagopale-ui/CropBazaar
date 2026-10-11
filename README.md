# CropBazaar

CropBazaar is a hackathon project scaffold with independent frontend, backend, and ML workspaces.

## Project structure

```text
frontend/   React, Vite, and Tailwind CSS
backend/    FastAPI application
data/       Local datasets (kept out of Git)
ml/         Python ML workspace
```

## Frontend

Requires Node.js and npm.

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local development URL when the server starts.

## Backend

Requires Python 3.10 or newer.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

On Windows, activate the environment with `.venv\Scripts\activate`. The API docs are available at `http://127.0.0.1:8000/docs`.

## ML workspace

Requires Python 3.10 or newer. Install its dependencies separately from the backend:

```bash
cd ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows, activate the environment with `.venv\Scripts\activate`.

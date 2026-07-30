# LAD

LAD is a learning and academic management platform for institutions, trainers, and students. It includes a Flask API, PostgreSQL-backed academic data model, and a React/Vite dashboard.

## Repository layout

- `backend/` — Flask application, SQLAlchemy models, migrations, and tests
- `dashboard/` — React + TypeScript frontend
- `API_ENDPOINTS.md` — API endpoint reference
- `start.sh` — starts the backend and frontend development servers together

## Requirements

- Python 3.11+ (or the version used by the project virtual environment)
- Node.js and npm
- PostgreSQL

## Configuration

Create the backend environment file from the example and update the database and secret values:

```bash
cp backend/.env.example backend/.env
```

At minimum, configure `DATABASE_URL` and `SECRET_KEY`. SMTP and SMS settings are optional.

## Install

```bash
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt

cd dashboard
npm install
cd ..
```

Create the configured PostgreSQL database, then apply the existing migrations:

```bash
cd backend
FLASK_APP=app venv/bin/flask db upgrade
cd ..
```

## Start development servers

From the repository root:

```bash
./start.sh
```

The API is served at `http://127.0.0.1:5000` and the dashboard at `http://localhost:5173`. Press `Ctrl+C` to stop both services.

To run either service separately:

```bash
# Backend
cd backend
FLASK_APP=app venv/bin/flask run

# Frontend (in another terminal)
cd dashboard
npm run dev
```

## Tests and checks

```bash
cd backend
venv/bin/pytest

cd ../dashboard
npm run typecheck
npm run build
```

## API documentation

See [API_ENDPOINTS.md](API_ENDPOINTS.md) for authentication, student, subject, score, enrollment, and module endpoints.


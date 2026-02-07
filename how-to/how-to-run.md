# How to Run EZTRACK

This guide explains how to run the EZTRACK backend and frontend development servers.

## Prerequisites

- Python 3.12+ with virtualenv
- Node.js 18+ with npm
- PostgreSQL database running

## Backend

```bash
cd backend

# Activate virtual environment
source venv/bin/activate

# Install dependencies (if needed)
pip install -r requirements.txt

# Run the server
python main.py
```

The backend will run at: **http://localhost:8001**

### Environment Variables

Create a `.env` file in `backend/` with:
```
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
JWT_SECRET_KEY=your-secret-key
```

## Frontend

```bash
cd frontend

# Install dependencies (if needed)
npm install

# Run development server
npm run dev
```

The frontend will run at: **http://localhost:3000**

## Running Both Together

Open two terminal windows:

**Terminal 1 (Backend):**
```bash
cd /home/shub/Desktop/EZTRACK/backend
source venv/bin/activate
python main.py
```

**Terminal 2 (Frontend):**
```bash
cd /home/shub/Desktop/EZTRACK/frontend
npm run dev
```

## Production Build

For frontend production build:
```bash
cd frontend
npm run build
npm start
```

## Default Login Credentials

| Field | Value |
|-------|-------|
| Username | `gym` |
| Password | `gym` |

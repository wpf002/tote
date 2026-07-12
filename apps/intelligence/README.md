# Tote Intelligence (FastAPI)

Phase 7 service: receipt drafting, cash-flow forecasting, and horse ROI. The
money-shaped logic is pure Python (integer cents) with thin FastAPI/Postgres
wrappers, so the core is fully unit-tested without a database.

## Endpoints

- `GET /health`
- `POST /ocr/receipt` — `{ "text": "<receipt text>" }` → draft vendor bill
  (`vendor`, `amount_cents`, `category`, `date`, `confidence`). A real OCR engine
  (Tesseract / cloud vision) feeds the text; the money extraction stays here and
  deterministic.
- `GET /forecast/cashflow?org=&entity=&days=90` — 90-day projection of known
  upcoming costs (training, stakes) against the opening cash balance.
- `GET /analytics/horse-roi?org=&entity=` — per-horse expense vs. earnings,
  cost-per-start, cost-per-win, ROI (worst first).

## Develop

```bash
cd apps/intelligence
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest                                  # pure logic + API tests (no DB needed)
DATABASE_URL=postgresql://tote:tote@localhost:55432/tote uvicorn app.main:app --reload --port 8000
```

The forecast/analytics endpoints read the same Postgres the ledger writes.

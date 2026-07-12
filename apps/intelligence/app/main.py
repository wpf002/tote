"""Tote intelligence FastAPI service.

Endpoints:
  GET  /health
  POST /ocr/receipt          -> draft vendor bill from receipt text
  GET  /forecast/cashflow    -> 90-day cash-flow projection per legal entity
  GET  /analytics/horse-roi  -> per-horse cost/earnings ROI
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .receipt import parse_receipt

app = FastAPI(title="Tote Intelligence", version="0.1.0")


class ReceiptIn(BaseModel):
    text: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "intelligence"}


@app.post("/ocr/receipt")
def ocr_receipt(body: ReceiptIn) -> dict:
    """Turn receipt text into a draft vendor bill (category/amount/vendor/date)."""
    return parse_receipt(body.text).to_dict()


@app.get("/forecast/cashflow")
def forecast_cashflow(org: str, entity: str, days: int = 90, start: Optional[str] = None) -> dict:
    from .db import fetch_forecast

    try:
        start_date = datetime.fromisoformat(start).date() if start else date.today()
        points, summary = fetch_forecast(org, entity, days, start_date)
    except Exception as exc:  # noqa: BLE001 - surface DB/config errors to the caller
        raise HTTPException(status_code=500, detail=str(exc))
    return {
        "summary": summary,
        "points": [
            {"date": p.on.isoformat(), "balance_cents": p.balance_cents, "delta_cents": p.delta_cents}
            for p in points
        ],
    }


@app.get("/analytics/horse-roi")
def horse_roi_endpoint(org: str, entity: str) -> dict:
    from .db import fetch_horse_roi

    try:
        rows = fetch_horse_roi(org, entity)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))
    return {"horses": [r.to_dict() for r in rows]}

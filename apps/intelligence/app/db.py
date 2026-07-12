"""Postgres access for forecasting and analytics.

Reads the same database the ledger writes. Kept thin: it gathers inputs, the
pure modules do the math. psycopg is imported lazily so the pure logic (and its
tests) never require a database or the driver.
"""

from __future__ import annotations

import os
from datetime import date, timedelta

from .forecast import CashItem
from .analytics import HorseInput


def _dsn() -> str:
    url = os.environ.get("DATABASE_URL", "")
    # libpq rejects Prisma's ?schema= param; drop the query string.
    return url.split("?", 1)[0]


def _connect():
    import psycopg  # lazy

    return psycopg.connect(_dsn())


def opening_cash(cur, org_id: str, legal_entity_id: str) -> int:
    cur.execute(
        """
        SELECT COALESCE(SUM(debit - credit), 0)
        FROM journal_lines
        WHERE "orgId" = %s AND "legalEntityId" = %s AND "accountKind" = 'CASH'
        """,
        (org_id, legal_entity_id),
    )
    return int(cur.fetchone()[0])


def build_forecast_items(cur, org_id: str, start: date, days: int) -> list[CashItem]:
    items: list[CashItem] = []

    # Known recurring cost: daily training rate across all horses in service.
    cur.execute(
        """
        SELECT COALESCE(SUM("dailyRateCents"), 0)
        FROM training_rates
        WHERE "orgId" = %s AND "from" <= %s AND ("to" IS NULL OR "to" > %s)
        """,
        (org_id, start, start),
    )
    daily_training = int(cur.fetchone()[0])
    if daily_training:
        for i in range(days):
            items.append(CashItem(on=start + timedelta(days=i), label="Training", amount_cents=daily_training))

    # Known one-off costs: unpaid stakes installments due in the horizon.
    end = start + timedelta(days=days)
    cur.execute(
        """
        SELECT sp."dueDate", sp.label, sp."amountCents"
        FROM stakes_payments sp
        JOIN stakes_schedules ss ON ss.id = sp."scheduleId"
        WHERE ss."orgId" = %s AND sp.paid = false AND sp."dueDate" >= %s AND sp."dueDate" < %s
        """,
        (org_id, start, end),
    )
    for due, label, amount in cur.fetchall():
        items.append(CashItem(on=due.date() if hasattr(due, "date") else due,
                              label=f"Stakes: {label}", amount_cents=int(amount)))

    return items


def build_horse_roi_inputs(cur, org_id: str, legal_entity_id: str) -> list[HorseInput]:
    cur.execute(
        """
        SELECT h.id, h.name,
               COALESCE(SUM(CASE WHEN jl."accountKind" = 'OPERATING_EXPENSE'
                                 THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
               COALESCE(SUM(CASE WHEN jl."accountKind" IN ('OPERATING_INCOME','OWNER_PURSE_PAYABLE','PURSE_REVENUE')
                                 THEN jl.credit - jl.debit ELSE 0 END), 0) AS income
        FROM horses h
        LEFT JOIN journal_lines jl
          ON jl."horseId" = h.id AND jl."legalEntityId" = %s
        WHERE h."orgId" = %s
        GROUP BY h.id, h.name
        ORDER BY h.name
        """,
        (legal_entity_id, org_id),
    )
    rows = cur.fetchall()

    # Starts ~ number of purses recorded for the horse; wins unavailable without
    # finish positions, so reported as 0 until race-result depth carries them.
    cur.execute(
        'SELECT "horseId", COUNT(*) FROM purses WHERE "orgId" = %s GROUP BY "horseId"',
        (org_id,),
    )
    starts = {hid: int(c) for hid, c in cur.fetchall()}

    return [
        HorseInput(horse_id=hid, name=name, expense_cents=int(exp), income_cents=int(inc),
                   starts=starts.get(hid, 0), wins=0)
        for hid, name, exp, inc in rows
    ]


def fetch_forecast(org_id: str, legal_entity_id: str, days: int, start: date):
    from .forecast import project_cashflow, summarize

    with _connect() as conn, conn.cursor() as cur:
        opening = opening_cash(cur, org_id, legal_entity_id)
        items = build_forecast_items(cur, org_id, start, days)
    points = project_cashflow(opening, items, start, days)
    return points, summarize(points)


def fetch_horse_roi(org_id: str, legal_entity_id: str):
    from .analytics import horse_roi

    with _connect() as conn, conn.cursor() as cur:
        inputs = build_horse_roi_inputs(cur, org_id, legal_entity_id)
    return horse_roi(inputs)

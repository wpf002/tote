"""Cash-flow forecasting.

`project_cashflow` is pure: given an opening balance and a list of dated cash
items (outflows positive, expected inflows negative), it produces a running
daily balance over the horizon. Money is integer cents throughout. The DB layer
builds the items from *known* upcoming obligations (training, stakes, insurance)
and a naive purse expectation; a Prophet model can later refine the stochastic
inflow side without changing this projector.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable


@dataclass
class CashItem:
    on: date
    label: str
    amount_cents: int  # >0 outflow (cost), <0 inflow (expected receipt)


@dataclass
class ForecastPoint:
    on: date
    balance_cents: int
    delta_cents: int


def project_cashflow(
    opening_balance_cents: int,
    items: Iterable[CashItem],
    start: date,
    days: int,
) -> list[ForecastPoint]:
    end = start + timedelta(days=days)
    per_day: dict[date, int] = {}
    for item in items:
        if start <= item.on < end:
            # outflow reduces cash; inflow increases it
            per_day[item.on] = per_day.get(item.on, 0) - item.amount_cents

    points: list[ForecastPoint] = []
    balance = opening_balance_cents
    for i in range(days):
        d = start + timedelta(days=i)
        delta = per_day.get(d, 0)
        balance += delta
        points.append(ForecastPoint(on=d, balance_cents=balance, delta_cents=delta))
    return points


def summarize(points: list[ForecastPoint]) -> dict:
    if not points:
        return {"opening": 0, "closing": 0, "low": 0, "low_date": None, "total_out": 0, "total_in": 0}
    total_out = sum(p.delta_cents for p in points if p.delta_cents < 0)
    total_in = sum(p.delta_cents for p in points if p.delta_cents > 0)
    low = min(points, key=lambda p: p.balance_cents)
    return {
        "opening": points[0].balance_cents - points[0].delta_cents,
        "closing": points[-1].balance_cents,
        "low": low.balance_cents,
        "low_date": low.on.isoformat(),
        "total_out": -total_out,   # report as positive magnitude
        "total_in": total_in,
    }

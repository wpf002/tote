from datetime import date

from app.forecast import CashItem, project_cashflow, summarize


def test_running_balance_and_summary():
    start = date(2026, 7, 1)
    items = [
        CashItem(on=date(2026, 7, 2), label="Training", amount_cents=10000),   # -$100
        CashItem(on=date(2026, 7, 3), label="Stakes", amount_cents=60000),     # -$600
        CashItem(on=date(2026, 7, 4), label="Purse", amount_cents=-500000),    # +$5000 expected
    ]
    points = project_cashflow(opening_balance_cents=100000, items=items, start=start, days=5)
    assert len(points) == 5
    # Day 0 no change; day 1 -100; day 2 -600; day 3 +5000
    assert [p.balance_cents for p in points] == [100000, 90000, 30000, 530000, 530000]

    s = summarize(points)
    assert s["opening"] == 100000
    assert s["closing"] == 530000
    assert s["low"] == 30000
    assert s["low_date"] == "2026-07-03"
    assert s["total_out"] == 70000   # 100 + 600
    assert s["total_in"] == 500000


def test_items_outside_horizon_ignored():
    start = date(2026, 7, 1)
    items = [CashItem(on=date(2026, 8, 1), label="late", amount_cents=99999)]
    points = project_cashflow(0, items, start, 5)
    assert all(p.delta_cents == 0 for p in points)

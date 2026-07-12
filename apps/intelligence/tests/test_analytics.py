from app.analytics import HorseInput, horse_roi


def test_roi_metrics_and_worst_first_ordering():
    inputs = [
        HorseInput("h1", "Winner", expense_cents=100000, income_cents=250000, starts=5, wins=2),
        HorseInput("h2", "Money Pit", expense_cents=200000, income_cents=50000, starts=4, wins=0),
    ]
    rows = horse_roi(inputs)
    # Worst ROI first
    assert rows[0].horse_id == "h2"
    assert rows[0].roi_pct == -75.0
    assert rows[0].cost_per_start_cents == 50000
    assert rows[0].cost_per_win_cents is None  # no wins

    winner = rows[1]
    assert winner.net_cents == 150000
    assert winner.cost_per_win_cents == 50000  # 100000 / 2
    assert winner.roi_pct == 150.0


def test_zero_expense_has_no_roi():
    rows = horse_roi([HorseInput("h", "Freebie", 0, 1000, 1, 1)])
    assert rows[0].roi_pct is None
    assert rows[0].cost_per_start_cents == 0

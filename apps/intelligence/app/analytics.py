"""Owner / horse ROI analytics — pure computation over ledger-derived inputs."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class HorseInput:
    horse_id: str
    name: str
    expense_cents: int
    income_cents: int
    starts: int
    wins: int


@dataclass
class HorseRoi:
    horse_id: str
    name: str
    expense_cents: int
    income_cents: int
    net_cents: int
    starts: int
    wins: int
    cost_per_start_cents: Optional[int]
    cost_per_win_cents: Optional[int]
    roi_pct: Optional[float]  # income / expense - 1, as a percentage

    def to_dict(self) -> dict:
        return asdict(self)


def horse_roi(inputs: list[HorseInput]) -> list[HorseRoi]:
    out: list[HorseRoi] = []
    for h in inputs:
        net = h.income_cents - h.expense_cents
        cps = h.expense_cents // h.starts if h.starts else None
        cpw = h.expense_cents // h.wins if h.wins else None
        roi = round((h.income_cents / h.expense_cents - 1) * 100, 1) if h.expense_cents else None
        out.append(HorseRoi(
            horse_id=h.horse_id, name=h.name, expense_cents=h.expense_cents,
            income_cents=h.income_cents, net_cents=net, starts=h.starts, wins=h.wins,
            cost_per_start_cents=cps, cost_per_win_cents=cpw, roi_pct=roi))
    # Worst ROI first — the horses to scrutinize.
    out.sort(key=lambda r: (r.roi_pct if r.roi_pct is not None else 1e9))
    return out

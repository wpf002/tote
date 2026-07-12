"""Receipt → draft vendor bill.

The pure parser here turns receipt *text* into a structured draft (vendor,
amount in integer cents, category guess, date). A real OCR engine (Tesseract or
a cloud vision API) would produce the text; feeding it here keeps the money
extraction deterministic and testable, and money stays integer cents — no float
in the financial path (invariant #1).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Optional

CATEGORY_KEYWORDS = {
    "Veterinary": ["vet", "veterinary", "exam", "lameness", "vaccin", "float",
                   "x-ray", "xray", "radiograph", "clinic", "equine hospital"],
    "Farrier": ["farrier", "shoe", "shoeing", "trim", "plate", "hoof"],
    "Feed & Bedding": ["feed", "hay", "grain", "bedding", "shavings", "straw"],
    "Transport": ["transport", "ship", "shipping", "haul", "van", "freight"],
    "Training": ["training", "board", "day rate", "day-rate"],
}

_MONEY = re.compile(r"\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)")
_TOTAL_HINTS = ("total", "amount due", "balance due", "grand total", "amount")

_DATE_PATTERNS = [
    re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),                         # 2026-06-01
    re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b"),                     # 06/01/2026
    re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{2})\b"),                     # 6/1/26
]
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_MONTH_DATE = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b",
    re.IGNORECASE)


@dataclass
class ReceiptDraft:
    vendor: Optional[str]
    amount_cents: Optional[int]
    category: Optional[str]
    date: Optional[str]
    confidence: float

    def to_dict(self) -> dict:
        return asdict(self)


def _to_cents(raw: str) -> int:
    raw = raw.replace(",", "").strip()
    if "." in raw:
        whole, frac = raw.split(".", 1)
        frac = (frac + "00")[:2]
        return int(whole or "0") * 100 + int(frac)
    return int(raw) * 100


def extract_amount(text: str) -> Optional[int]:
    """Prefer a money value on a 'total'/'amount due' line; else the largest."""
    best_hinted: Optional[int] = None
    all_values: list[int] = []
    for line in text.splitlines():
        low = line.lower()
        values = [_to_cents(m.group(1)) for m in _MONEY.finditer(line)]
        all_values.extend(values)
        if values and any(h in low for h in _TOTAL_HINTS):
            # the last money value on a total line is usually the total
            best_hinted = max(best_hinted or 0, values[-1])
    if best_hinted:
        return best_hinted
    return max(all_values) if all_values else None


def extract_date(text: str) -> Optional[str]:
    for pat in _DATE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        if pat.pattern.startswith(r"\b(\d{4})"):
            y, mo, d = m.group(1), m.group(2), m.group(3)
        else:
            mo, d, y = m.group(1), m.group(2), m.group(3)
            if len(y) == 2:
                y = "20" + y
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    m = _MONTH_DATE.search(text)
    if m:
        mo = _MONTHS[m.group(1)[:3].lower()]
        return f"{int(m.group(3)):04d}-{mo:02d}-{int(m.group(2)):02d}"
    return None


def _score(low: str, tokens: set[str], keyword: str) -> int:
    # Multi-word keywords match as a phrase; single words match whole tokens
    # (or a token that starts with the keyword, e.g. "vaccin" -> "vaccination")
    # so we never catch "van" inside "relevant".
    if " " in keyword or "-" in keyword:
        return low.count(keyword)
    return sum(1 for t in tokens if t == keyword or t.startswith(keyword))


def guess_category(text: str) -> Optional[str]:
    low = text.lower()
    tokens = set(re.findall(r"[a-z]+", low))
    best, best_score = None, 0
    for category, words in CATEGORY_KEYWORDS.items():
        score = sum(_score(low, tokens, w) for w in words)
        if score > best_score:
            best, best_score = category, score
    return best


def parse_receipt(text: str) -> ReceiptDraft:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    vendor = lines[0] if lines else None
    amount = extract_amount(text)
    category = guess_category(text)
    date = extract_date(text)

    hits = sum(x is not None for x in (vendor, amount, category, date))
    confidence = round(hits / 4.0, 2)
    return ReceiptDraft(vendor=vendor, amount_cents=amount, category=category,
                        date=date, confidence=confidence)

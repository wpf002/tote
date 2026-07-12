from app.receipt import parse_receipt, extract_amount, extract_date, guess_category


VET_RECEIPT = """Ridgeline Equine Vet
123 Paddock Lane
Invoice Date: 06/09/2026

Lameness exam                 350.00
Radiographs (4 views)         600.00
Flunixin                       50.00
Subtotal                     1000.00
Tax                             0.00
Total Amount Due            $1,250.00
"""


def test_parses_vendor_amount_category_date():
    draft = parse_receipt(VET_RECEIPT)
    assert draft.vendor == "Ridgeline Equine Vet"
    assert draft.amount_cents == 125000  # $1,250.00 -> integer cents
    assert draft.category == "Veterinary"
    assert draft.date == "2026-06-09"
    assert draft.confidence == 1.0


def test_amount_prefers_total_line_over_line_items():
    assert extract_amount("Trim 180.00\nBalance Due 180.00") == 18000
    # no total hint -> largest value
    assert extract_amount("A 20.00\nB 45.50") == 4550


def test_dates_multiple_formats():
    assert extract_date("date 2026-06-01") == "2026-06-01"
    assert extract_date("6/1/26") == "2026-06-01"
    assert extract_date("Jun 1, 2026") == "2026-06-01"
    assert extract_date("no date here") is None


def test_category_keyword_match():
    assert guess_category("Full set of shoes and a trim") == "Farrier"
    assert guess_category("hay and shavings delivery") == "Feed & Bedding"
    assert guess_category("nothing relevant") is None


def test_low_confidence_on_sparse_text():
    draft = parse_receipt("just a vendor name")
    assert draft.amount_cents is None
    assert draft.confidence < 1.0

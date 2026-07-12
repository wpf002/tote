from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_ocr_receipt_endpoint():
    r = client.post("/ocr/receipt", json={"text": "Iron & Anvil Farrier\nDate 06/05/2026\nFull set 180.00\nTotal 180.00"})
    assert r.status_code == 200
    body = r.json()
    assert body["vendor"] == "Iron & Anvil Farrier"
    assert body["amount_cents"] == 18000
    assert body["category"] == "Farrier"
    assert body["date"] == "2026-06-05"

"""API tests for the AEC Python backend."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["service"] == "aec-python-api"


def test_seeded_incidents_are_labelled_samples(client):
    incidents = client.get("/api/incidents").json()
    assert incidents
    assert all(item["is_sample"] == 1 for item in incidents)
    assert all(item["reference"].startswith("SAMPLE-") for item in incidents)


def test_incident_report_gets_reference_and_phone_validation(client):
    payload = {
        "category": "critical",
        "title": "Smoke from a shop on Bole Road",
        "description": "Test report",
        "location_name": "Bole, Addis Ababa",
        "severity": "high",
        "reporter_phone": "+251 91 234 5678",
    }
    created = client.post("/api/incidents", json=payload)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["reference"].startswith("AEC-INC-")
    assert body["is_sample"] == 0
    assert "611" in body["next_step"]

    bad = client.post("/api/incidents", json={**payload, "reporter_phone": "abc"})
    assert bad.status_code == 422


def test_rental_quote_and_availability(client):
    vehicles = client.get("/api/emergency/vehicles").json()
    assert vehicles
    vehicle = next(v for v in vehicles if v["available"])
    driver_fee = 1200 if not vehicle["driver_included"] else 0

    response = client.post(
        "/api/emergency/rentals",
        json={
            "vehicle_id": vehicle["id"],
            "full_name": "Test Family",
            "phone": "+251 91 111 2222",
            "pickup_location": "Bole, Addis Ababa",
            "pickup_date": "2026-11-02",
            "days": 2,
            "needs_driver": True,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["reference"].startswith("AEC-CAR-")
    assert body["total_etb"] == (vehicle["price_per_day_etb"] + driver_fee) * 2
    assert body["dispatch"]["estimate_only"] is True
    assert "Nothing has been dispatched yet" in body["message"]


def test_rental_rejects_unavailable_vehicle(client):
    vehicles = client.get("/api/emergency/vehicles").json()
    unavailable = next(v for v in vehicles if not v["available"])
    response = client.post(
        "/api/emergency/rentals",
        json={
            "vehicle_id": unavailable["id"],
            "full_name": "Test Family",
            "phone": "+251 91 111 2222",
            "pickup_location": "Hawassa",
            "pickup_date": "2026-11-02",
            "days": 1,
        },
    )
    assert response.status_code == 409


def test_prescription_medicine_requires_reference(client):
    medications = client.get("/api/emergency/medications").json()
    rx = next(m for m in medications if m["prescription_required"] and m["in_stock"])
    payload = {
        "pharmacy_id": 1,
        "full_name": "Test Patient",
        "phone": "+251 91 333 4444",
        "city": "Addis Ababa",
        "address": "House 12, Bole sub-city",
        "items": [{"medication_id": rx["id"], "quantity": 1}],
        "priority": "urgent",
    }
    blocked = client.post("/api/emergency/deliveries", json=payload)
    assert blocked.status_code == 422
    assert "prescription" in blocked.text.lower()

    accepted = client.post("/api/emergency/deliveries", json={**payload, "prescription_ref": "RX-2026-8891"})
    assert accepted.status_code == 201, accepted.text
    body = accepted.json()
    assert body["reference"].startswith("AEC-MED-")
    assert body["items"][0]["name"] == rx["name"]
    assert body["delivery_fee_etb"] == 0  # urgent orders waive the fee
    assert "No courier has been dispatched" in body["message"]


def test_missing_person_requires_consent_and_hides_phone(client):
    payload = {
        "full_name": "Test Person",
        "age": 30,
        "gender": "female",
        "last_seen_location": "Merkato, Addis Ababa",
        "last_seen_at": "2026-10-30T18:00:00Z",
        "description": "Wearing a blue jacket and carrying a brown bag.",
        "contact_name": "Test Relative",
        "contact_phone": "+251 91 555 6666",
        "consent": True,
    }
    assert client.post("/api/missing-persons", json={**payload, "consent": False}).status_code == 422
    created = client.post("/api/missing-persons", json=payload)
    assert created.status_code == 201, created.text

    listing = client.get("/api/missing-persons").json()
    assert listing
    assert all("contact_phone" not in item for item in listing)


def test_admin_endpoints_require_token(client):
    assert client.get("/api/emergency/rentals").status_code == 401
    authorized = client.get("/api/emergency/rentals", headers={"X-AEC-Admin-Token": "aec-demo-admin"})
    assert authorized.status_code == 200


@pytest.mark.parametrize(
    ("message", "expected_intent"),
    [
        ("There is a fire in my building", "fire"),
        ("I need a car to take my mother to hospital", "rental"),
        ("Can you deliver insulin tonight?", "medication"),
        ("A power line fell on my street", "infrastructure"),
        ("How do I report a missing child?", "missing"),
    ],
)
def test_assistant_intents(client, message, expected_intent):
    response = client.post("/api/assistant/chat", json={"message": message, "language": "en"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["intent"] == expected_intent
    assert body["suggestions"]
    assert "611" in body["disclaimer"]


def test_assistant_amharic_and_fallback(client):
    amharic = client.post("/api/assistant/chat", json={"message": "እሳት አለ", "language": "am"}).json()
    assert amharic["intent"] == "fire"
    assert "611" in amharic["reply"]

    fallback = client.post("/api/assistant/chat", json={"message": "hello there", "language": "en"}).json()
    assert fallback["intent"] == "fallback"


def test_stats_shape(client):
    stats = client.get("/api/stats").json()
    for key in ("active_incidents", "resolved_incidents", "sos_activations", "rental_requests"):
        assert key in stats

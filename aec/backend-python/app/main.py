"""AEC (AuraStay Emergency Portal Center) - Python API.

Public, fictional-only civic demo. The Java dispatch service is optional:
without it the API still returns an honest, clearly-labelled planning estimate.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .assistant import DISCLAIMER_AM, DISCLAIMER_EN, greeting, llm_answer, local_answer, starters
from .config import ADMIN_TOKEN, CORS_ORIGINS, EMERGENCY_NUMBER, JAVA_DISPATCH_URL, OPENAI_API_KEY
from .db import db, init_db, now_iso, reference, rows_to_dicts
from .schemas import (
    AssistantRequest,
    DeliveryCreate,
    IncidentCreate,
    MissingPersonCreate,
    NewsCreate,
    RentalCreate,
    SosCreate,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AEC API",
    description="AuraStay Emergency Portal Center - public demo API",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


def require_admin(x_aec_admin_token: str | None = Header(default=None)) -> None:
    if not x_aec_admin_token or x_aec_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Admin token required")


# --------------------------------------------------------------------------- #
# Health and stats
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "aec-python-api",
        "version": __version__,
        "emergency_number": EMERGENCY_NUMBER,
        "java_dispatch": "configured" if JAVA_DISPATCH_URL else "local-fallback",
    }


@app.get("/api/stats")
def stats() -> dict[str, Any]:
    with db() as conn:
        active = conn.execute("SELECT COUNT(*) FROM incidents WHERE status != 'Resolved'").fetchone()[0]
        resolved = conn.execute("SELECT COUNT(*) FROM incidents WHERE status = 'Resolved'").fetchone()[0]
        sos = conn.execute("SELECT COUNT(*) FROM sos_events").fetchone()[0]
        rentals = conn.execute("SELECT COUNT(*) FROM rental_requests").fetchone()[0]
        deliveries = conn.execute("SELECT COUNT(*) FROM delivery_requests").fetchone()[0]
        missing = conn.execute("SELECT COUNT(*) FROM missing_persons WHERE status = 'Active'").fetchone()[0]
        agencies = conn.execute("SELECT COUNT(DISTINCT agency) FROM incidents").fetchone()[0]
        vehicles_available = conn.execute("SELECT COUNT(*) FROM vehicles WHERE available = 1").fetchone()[0]
        pharmacies = conn.execute("SELECT COUNT(*) FROM pharmacies").fetchone()[0]
        cities = conn.execute("SELECT COUNT(DISTINCT city) FROM vehicles").fetchone()[0]
    return {
        "active_incidents": active,
        "resolved_incidents": resolved,
        "sos_activations": sos,
        "rental_requests": rentals,
        "delivery_requests": deliveries,
        "active_missing_reports": missing,
        "connected_agencies": max(agencies, 6),
        "vehicles_available": vehicles_available,
        "pharmacies": pharmacies,
        "vehicle_cities": cities,
        "label": "Demo figures generated from this server's own sample records",
    }


# --------------------------------------------------------------------------- #
# Incidents and SOS
# --------------------------------------------------------------------------- #
@app.get("/api/incidents")
def list_incidents(
    category: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict]:
    query = "SELECT * FROM incidents WHERE 1=1"
    params: list[Any] = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with db() as conn:
        return rows_to_dicts(conn.execute(query, params).fetchall())


@app.post("/api/incidents", status_code=201)
def create_incident(payload: IncidentCreate) -> dict:
    ref = reference("AEC-INC")
    with db() as conn:
        cursor = conn.execute(
            """INSERT INTO incidents
               (reference, category, title, description, location_name, lat, lng, severity, status,
                reporter_name, reporter_phone, agency, is_sample, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)""",
            (
                ref,
                payload.category,
                payload.title,
                payload.description,
                payload.location_name,
                payload.lat,
                payload.lng,
                payload.severity,
                "Reported",
                payload.reporter_name,
                payload.reporter_phone,
                "AEC Response Center",
                now_iso(),
            ),
        )
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {
        **dict(row),
        "message": "Report received by the AEC demo response center.",
        "next_step": f"Call {EMERGENCY_NUMBER} if anyone is in danger right now.",
    }


@app.patch("/api/incidents/{incident_id}/status", dependencies=[Depends(require_admin)])
def update_incident_status(incident_id: int, status: str = Query(min_length=2, max_length=40)) -> dict:
    with db() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        conn.execute("UPDATE incidents SET status = ? WHERE id = ?", (status, incident_id))
        updated = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return dict(updated)


@app.post("/api/sos", status_code=201)
def create_sos(payload: SosCreate) -> dict:
    ref = reference("AEC-SOS")
    with db() as conn:
        conn.execute(
            """INSERT INTO sos_events (reference, lat, lng, location_name, message, status, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (ref, payload.lat, payload.lng, payload.location_name, payload.message, "Received", now_iso()),
        )
    return {
        "reference": ref,
        "status": "Received",
        "message": (
            "Your alert was recorded by this demo server. It does not contact a real dispatcher. "
            f"Call {EMERGENCY_NUMBER} now if you are in danger."
        ),
        "is_demo": True,
    }


# --------------------------------------------------------------------------- #
# Emergency services: car rental + medication delivery
# --------------------------------------------------------------------------- #
def dispatch_plan(kind: str, city: str, priority: str = "standard") -> dict[str, Any]:
    """Ask the Java service for a dispatch plan, or compute a labelled estimate."""
    if JAVA_DISPATCH_URL:
        try:
            with httpx.Client(timeout=2.5) as client:
                response = client.post(
                    f"{JAVA_DISPATCH_URL}/dispatch",
                    json={"kind": kind, "city": city, "priority": priority},
                )
                response.raise_for_status()
                plan = response.json()
                plan["engine"] = "java-dispatch-service"
                return plan
        except Exception:
            pass

    base = 20 if priority == "urgent" else 35
    jitter = (sum(ord(c) for c in city) % 20) + (0 if kind == "medication" else 10)
    return {
        "kind": kind,
        "city": city,
        "priority": priority,
        "unit": "AEC Partner Unit",
        "eta_minutes": {"min": base + jitter // 2, "max": base + jitter + 25},
        "estimate_only": True,
        "note": (
            "Planning estimate from local sample data. No vehicle or courier has been dispatched. "
            "A partner calls to confirm."
        ),
        "engine": "python-local-fallback",
    }


@app.get("/api/emergency/vehicles")
def list_vehicles(city: str | None = Query(default=None)) -> list[dict]:
    query = "SELECT * FROM vehicles WHERE 1=1"
    params: list[Any] = []
    if city:
        query += " AND lower(city) = lower(?)"
        params.append(city)
    query += " ORDER BY available DESC, price_per_day_etb ASC"
    with db() as conn:
        vehicles = rows_to_dicts(conn.execute(query, params).fetchall())
    for vehicle in vehicles:
        vehicle["driver_included"] = bool(vehicle["driver_included"])
        vehicle["available"] = bool(vehicle["available"])
        vehicle["driver_fee_per_day_etb"] = 1200 if not vehicle["driver_included"] else 0
    return vehicles


@app.get("/api/emergency/vehicles/cities")
def vehicle_cities() -> list[str]:
    with db() as conn:
        return [row[0] for row in conn.execute("SELECT DISTINCT city FROM vehicles ORDER BY city").fetchall()]


@app.post("/api/emergency/rentals", status_code=201)
def create_rental(payload: RentalCreate) -> dict:
    with db() as conn:
        vehicle = conn.execute("SELECT * FROM vehicles WHERE id = ?", (payload.vehicle_id,)).fetchone()
        if vehicle is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        if not vehicle["available"]:
            raise HTTPException(status_code=409, detail="This vehicle is currently unavailable")
        driver_fee = 0 if vehicle["driver_included"] else (1200 if payload.needs_driver else 0)
        total = (vehicle["price_per_day_etb"] + driver_fee) * payload.days
        ref = reference("AEC-CAR")
        cursor = conn.execute(
            """INSERT INTO rental_requests
               (reference, vehicle_id, vehicle_name, full_name, phone, pickup_location, pickup_lat,
                pickup_lng, pickup_date, days, needs_driver, notes, payment_method,
                payment_reference, status, total_etb, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                ref,
                vehicle["id"],
                vehicle["name"],
                payload.full_name,
                payload.phone,
                payload.pickup_location,
                payload.pickup_lat,
                payload.pickup_lng,
                payload.pickup_date,
                payload.days,
                int(payload.needs_driver or vehicle["driver_included"]),
                payload.notes,
                payload.payment_method,
                payload.payment_reference,
                "Requested",
                total,
                now_iso(),
            ),
        )
        request = conn.execute("SELECT * FROM rental_requests WHERE id = ?", (cursor.lastrowid,)).fetchone()
    plan = dispatch_plan("rental", vehicle["city"])
    return {
        **dict(request),
        "total_etb": total,
        "dispatch": plan,
        "message": (
            "Car-rental request recorded with the chosen payment method. The partner will call to "
            "confirm availability and the pickup time. No money is moved in this demo. Nothing has "
            "been dispatched yet."
        ),
    }


@app.get("/api/emergency/medications")
def list_medications(q: str | None = Query(default=None), category: str | None = Query(default=None)) -> list[dict]:
    query = "SELECT * FROM medications WHERE 1=1"
    params: list[Any] = []
    if q:
        query += " AND lower(name) LIKE ?"
        params.append(f"%{q.lower()}%")
    if category:
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY prescription_required ASC, name ASC"
    with db() as conn:
        rows = rows_to_dicts(conn.execute(query, params).fetchall())
    for row in rows:
        row["prescription_required"] = bool(row["prescription_required"])
        row["in_stock"] = bool(row["in_stock"])
    return rows


@app.get("/api/emergency/pharmacies")
def list_pharmacies(city: str | None = Query(default=None)) -> list[dict]:
    query = "SELECT * FROM pharmacies WHERE 1=1"
    params: list[Any] = []
    if city:
        query += " AND lower(city) = lower(?)"
        params.append(city)
    query += " ORDER BY open_24h DESC, name ASC"
    with db() as conn:
        rows = rows_to_dicts(conn.execute(query, params).fetchall())
    for row in rows:
        row["open_24h"] = bool(row["open_24h"])
        row["partner"] = bool(row["partner"])
    return rows


@app.post("/api/emergency/deliveries", status_code=201)
def create_delivery(payload: DeliveryCreate) -> dict:
    with db() as conn:
        pharmacy = conn.execute("SELECT * FROM pharmacies WHERE id = ?", (payload.pharmacy_id,)).fetchone()
        if pharmacy is None:
            raise HTTPException(status_code=404, detail="Pharmacy not found")

        items: list[dict[str, Any]] = []
        total = 0
        prescription_needed: list[str] = []
        for item in payload.items:
            medication = conn.execute("SELECT * FROM medications WHERE id = ?", (item.medication_id,)).fetchone()
            if medication is None:
                raise HTTPException(status_code=404, detail=f"Medication {item.medication_id} not found")
            if not medication["in_stock"]:
                raise HTTPException(
                    status_code=409,
                    detail=f"{medication['name']} is out of stock at the partner pharmacy",
                )
            line_total = medication["price_etb"] * item.quantity
            total += line_total
            if medication["prescription_required"]:
                prescription_needed.append(medication["name"])
            items.append(
                {
                    "medication_id": medication["id"],
                    "name": medication["name"],
                    "strength": medication["strength"],
                    "quantity": item.quantity,
                    "unit_price_etb": medication["price_etb"],
                    "line_total_etb": line_total,
                    "prescription_required": bool(medication["prescription_required"]),
                }
            )

        if prescription_needed and not payload.prescription_ref.strip():
            raise HTTPException(
                status_code=422,
                detail=(
                    "A prescription reference is required for: "
                    + ", ".join(prescription_needed)
                    + ". A pharmacist verifies it before dispensing."
                ),
            )

        delivery_fee = 0 if payload.priority == "urgent" else 120
        total += delivery_fee
        ref = reference("AEC-MED")
        cursor = conn.execute(
            """INSERT INTO delivery_requests
               (reference, pharmacy_id, pharmacy_name, full_name, phone, city, address, lat, lng,
                items_json, prescription_ref, priority, payment_method, payment_reference,
                status, total_etb, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                ref,
                pharmacy["id"],
                pharmacy["name"],
                payload.full_name,
                payload.phone,
                payload.city,
                payload.address,
                payload.lat,
                payload.lng,
                json.dumps(items, ensure_ascii=False),
                payload.prescription_ref,
                payload.priority,
                payload.payment_method,
                payload.payment_reference,
                "Awaiting pharmacist review",
                total,
                now_iso(),
            ),
        )
        request = conn.execute("SELECT * FROM delivery_requests WHERE id = ?", (cursor.lastrowid,)).fetchone()

    plan = dispatch_plan("medication", payload.city, payload.priority)
    result = dict(request)
    result["items"] = items
    result["delivery_fee_etb"] = delivery_fee
    result["dispatch"] = plan
    result["message"] = (
        "Delivery request recorded and queued for pharmacist review. The chosen payment method is "
        "recorded for the demo checkout; no money is moved here. No courier has been dispatched yet."
    )
    return result


@app.get("/api/emergency/rentals", dependencies=[Depends(require_admin)])
def list_rentals() -> list[dict]:
    with db() as conn:
        return rows_to_dicts(conn.execute("SELECT * FROM rental_requests ORDER BY created_at DESC").fetchall())


@app.get("/api/emergency/deliveries", dependencies=[Depends(require_admin)])
def list_deliveries() -> list[dict]:
    with db() as conn:
        rows = rows_to_dicts(conn.execute("SELECT * FROM delivery_requests ORDER BY created_at DESC").fetchall())
    for row in rows:
        row["items"] = json.loads(row["items_json"])
        row.pop("items_json", None)
    return rows


# --------------------------------------------------------------------------- #
# Missing persons and news
# --------------------------------------------------------------------------- #
@app.get("/api/missing-persons")
def list_missing_persons(status: str | None = Query(default=None)) -> list[dict]:
    query = "SELECT * FROM missing_persons"
    params: list[Any] = []
    if status:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    with db() as conn:
        rows = rows_to_dicts(conn.execute(query, params).fetchall())
    for row in rows:
        row["consent"] = bool(row["consent"])
        row["is_sample"] = bool(row["is_sample"])
        row.pop("contact_phone", None)  # never expose the contact number publicly
    return rows


@app.post("/api/missing-persons", status_code=201)
def create_missing_person(payload: MissingPersonCreate) -> dict:
    ref = reference("AEC-MP")
    with db() as conn:
        conn.execute(
            """INSERT INTO missing_persons
               (reference, full_name, age, gender, last_seen_location, last_seen_lat, last_seen_lng,
                last_seen_at, photo_data, description, contact_name, contact_phone, consent, status,
                is_sample, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)""",
            (
                ref,
                payload.full_name,
                payload.age,
                payload.gender,
                payload.last_seen_location,
                payload.last_seen_lat,
                payload.last_seen_lng,
                payload.last_seen_at,
                payload.photo_data,
                payload.description,
                payload.contact_name,
                payload.contact_phone,
                1,
                "Active",
                now_iso(),
            ),
        )
    return {
        "reference": ref,
        "status": "Active",
        "message": (
            "Report submitted with family consent. No account or sign-in is required. The contact "
            "number is stored privately and is not shown publicly. Call 611 and the police as well "
            "if the person may be in immediate danger."
        ),
    }


@app.get("/api/news")
def list_news(category: str | None = Query(default=None), limit: int = Query(default=30, ge=1, le=100)) -> list[dict]:
    query = "SELECT * FROM news"
    params: list[Any] = []
    if category:
        query += " WHERE category = ?"
        params.append(category)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with db() as conn:
        rows = rows_to_dicts(conn.execute(query, params).fetchall())
    for row in rows:
        row["is_sample"] = bool(row["is_sample"])
    return rows


@app.post("/api/news", status_code=201, dependencies=[Depends(require_admin)])
def create_news(payload: NewsCreate) -> dict:
    with db() as conn:
        cursor = conn.execute(
            """INSERT INTO news (title, summary, body, category, author, is_sample, created_at)
               VALUES (?,?,?,?,?,0,?)""",
            (payload.title, payload.summary, payload.body, payload.category, payload.author, now_iso()),
        )
        row = conn.execute("SELECT * FROM news WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return dict(row)


# --------------------------------------------------------------------------- #
# Admin aggregate
# --------------------------------------------------------------------------- #
@app.get("/api/admin/requests", dependencies=[Depends(require_admin)])
def admin_requests() -> dict:
    with db() as conn:
        rentals = rows_to_dicts(conn.execute("SELECT * FROM rental_requests ORDER BY created_at DESC").fetchall())
        deliveries = rows_to_dicts(conn.execute("SELECT * FROM delivery_requests ORDER BY created_at DESC").fetchall())
        sos = rows_to_dicts(conn.execute("SELECT * FROM sos_events ORDER BY created_at DESC").fetchall())
    for row in deliveries:
        row["items"] = json.loads(row["items_json"])
        row.pop("items_json", None)
    return {"rentals": rentals, "deliveries": deliveries, "sos": sos}


# --------------------------------------------------------------------------- #
# ASAYECH assistant
# --------------------------------------------------------------------------- #
@app.get("/api/assistant/health")
def assistant_health() -> dict[str, Any]:
    return {
        "assistant": "ASAYECH",
        "language": ["en", "am"],
        "mode": "language-model-with-reviewed-guidance" if OPENAI_API_KEY else "reviewed-knowledge-base",
        "starters": starters("en"),
    }


@app.get("/api/assistant/starters")
def assistant_starters(language: str = Query(default="en", pattern="^(en|am)$")) -> dict[str, Any]:
    return {
        "assistant": "ASAYECH",
        "greeting": greeting(language),
        "starters": starters(language),
        "disclaimer": DISCLAIMER_EN if language == "en" else DISCLAIMER_AM,
    }


@app.post("/api/assistant/chat")
async def assistant_chat(payload: AssistantRequest) -> dict[str, Any]:
    answer = local_answer(payload.message, payload.language)
    history = [{"role": turn.role, "content": turn.content} for turn in payload.history]

    rephrased = await llm_answer(payload.message, payload.language, history)
    if rephrased:
        answer["reply"] = rephrased
        answer["source"] = "language-model"

    with db() as conn:
        conn.executemany(
            """INSERT INTO assistant_messages (session_id, role, content, created_at) VALUES (?,?,?,?)""",
            [
                (payload.session_id, "user", payload.message, now_iso()),
                (payload.session_id, "assistant", answer["reply"], now_iso()),
            ],
        )
    return answer

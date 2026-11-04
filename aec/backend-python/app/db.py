"""SQLite storage for the AEC portal.

The demo is intentionally single-file SQLite: it starts instantly, keeps all
data on the submitting device/server, and is easy to replace with PostgreSQL
later. Every seeded record is fictional and labelled as a sample.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location_name TEXT NOT NULL,
    lat REAL,
    lng REAL,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'Reported',
    reporter_name TEXT,
    reporter_phone TEXT,
    agency TEXT NOT NULL DEFAULT 'AEC Response Center',
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sos_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    lat REAL,
    lng REAL,
    location_name TEXT NOT NULL DEFAULT 'Location not shared',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Received',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    seats INTEGER NOT NULL,
    price_per_day_etb INTEGER NOT NULL,
    driver_included INTEGER NOT NULL DEFAULT 0,
    transmission TEXT NOT NULL DEFAULT 'Manual',
    fuel TEXT NOT NULL DEFAULT 'Petrol',
    city TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 1,
    partner TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rental_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    vehicle_id INTEGER NOT NULL,
    vehicle_name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    pickup_location TEXT NOT NULL,
    pickup_lat REAL,
    pickup_lng REAL,
    pickup_date TEXT NOT NULL,
    days INTEGER NOT NULL,
    needs_driver INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT 'telebirr',
    payment_reference TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Requested',
    total_etb INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    strength TEXT NOT NULL DEFAULT '',
    form TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    price_etb INTEGER NOT NULL DEFAULT 0,
    prescription_required INTEGER NOT NULL DEFAULT 0,
    in_stock INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pharmacies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    phone TEXT NOT NULL,
    open_24h INTEGER NOT NULL DEFAULT 1,
    partner INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS delivery_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    pharmacy_id INTEGER,
    pharmacy_name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL,
    lng REAL,
    items_json TEXT NOT NULL,
    prescription_ref TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'standard',
    payment_method TEXT NOT NULL DEFAULT 'telebirr',
    payment_reference TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Requested',
    total_etb INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS missing_persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    age INTEGER,
    gender TEXT NOT NULL DEFAULT 'unknown',
    last_seen_location TEXT NOT NULL,
    last_seen_lat REAL,
    last_seen_lng REAL,
    last_seen_at TEXT NOT NULL,
    photo_data TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    consent INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Preparedness',
    author TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def rows_to_dicts(rows) -> list[dict]:
    return [dict(row) for row in rows]


# Columns added after the first release. SQLite can add them in place, so an
# existing demo database keeps its records instead of being recreated.
MIGRATIONS: dict[str, dict[str, str]] = {
    "rental_requests": {
        "pickup_lat": "REAL",
        "pickup_lng": "REAL",
        "payment_method": "TEXT NOT NULL DEFAULT 'telebirr'",
        "payment_reference": "TEXT NOT NULL DEFAULT ''",
    },
    "delivery_requests": {
        "lat": "REAL",
        "lng": "REAL",
        "payment_method": "TEXT NOT NULL DEFAULT 'telebirr'",
        "payment_reference": "TEXT NOT NULL DEFAULT ''",
    },
    "missing_persons": {
        "last_seen_lat": "REAL",
        "last_seen_lng": "REAL",
        "photo_data": "TEXT NOT NULL DEFAULT ''",
    },
}


def migrate_db(conn: sqlite3.Connection) -> None:
    for table, columns in MIGRATIONS.items():
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        for name, definition in columns.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def init_db(seed: bool = True) -> None:
    with db() as conn:
        conn.executescript(SCHEMA)
        migrate_db(conn)
        if seed and conn.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0] == 0:
            seed_demo_data(conn)


def reference(prefix: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%y%m%d%H%M%S")
    suffix = f"{int(datetime.now().timestamp() * 1000) % 1000:03d}"
    return f"{prefix}-{stamp}-{suffix}"


def seed_demo_data(conn: sqlite3.Connection) -> None:
    """Insert clearly-labelled fictional demo content."""
    now = datetime.now(timezone.utc)

    vehicles = [
        ("Toyota Corolla", "Sedan", 5, 4200, 1, "Automatic", "Petrol", "Addis Ababa", 1, "AEC Mobility Partner (demo)"),
        ("Suzuki Dzire", "Sedan", 4, 3600, 1, "Manual", "Petrol", "Addis Ababa", 1, "AEC Mobility Partner (demo)"),
        ("Toyota Hiace", "Van", 12, 7800, 1, "Manual", "Diesel", "Addis Ababa", 1, "AEC Mobility Partner (demo)"),
        ("Hyundai Starex", "Van", 9, 6900, 1, "Automatic", "Diesel", "Adama", 1, "AEC Mobility Partner (demo)"),
        ("Toyota Land Cruiser", "4x4", 7, 11500, 1, "Automatic", "Diesel", "Bahir Dar", 1, "AEC Mobility Partner (demo)"),
        ("Isuzu NPR Cargo", "Cargo", 2, 8400, 1, "Manual", "Diesel", "Addis Ababa", 1, "AEC Logistics Partner (demo)"),
        ("Bajaj RE Auto", "Auto rickshaw", 3, 1800, 1, "Manual", "Petrol", "Hawassa", 0, "AEC Mobility Partner (demo)"),
        ("Toyota Vitz", "Hatchback", 4, 3100, 0, "Automatic", "Petrol", "Mekelle", 1, "AEC Mobility Partner (demo)"),
    ]
    conn.executemany(
        """INSERT INTO vehicles
           (name, class, seats, price_per_day_etb, driver_included, transmission, fuel, city, available, partner)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        vehicles,
    )

    medications = [
        ("Paracetamol", "500 mg", "Tablet", "Pain & fever", 45, 0, 1),
        ("Oral Rehydration Salts (ORS)", "20.5 g", "Sachet", "Dehydration", 30, 0, 1),
        ("Amoxicillin", "500 mg", "Capsule", "Antibiotic", 180, 1, 1),
        ("Metformin", "500 mg", "Tablet", "Diabetes", 120, 1, 1),
        ("Insulin glargine", "100 IU/mL", "Injection pen", "Diabetes", 1450, 1, 1),
        ("Salbutamol inhaler", "100 mcg", "Inhaler", "Asthma", 620, 1, 1),
        ("Ceftriaxone", "1 g", "Injection", "Antibiotic", 390, 1, 0),
        ("Enalapril", "10 mg", "Tablet", "Blood pressure", 160, 1, 1),
        ("Artemether/Lumefantrine", "20/120 mg", "Tablet", "Malaria", 240, 1, 1),
        ("Hydrocortisone cream", "1%", "Cream", "Skin & burns", 150, 0, 1),
        ("Tetanus toxoid", "0.5 mL", "Injection", "Vaccine", 310, 1, 0),
        ("Glucose 5%", "500 mL", "IV bag", "Emergency care", 210, 1, 1),
    ]
    conn.executemany(
        """INSERT INTO medications
           (name, strength, form, category, price_etb, prescription_required, in_stock)
           VALUES (?,?,?,?,?,?,?)""",
        medications,
    )

    pharmacies = [
        ("AEC Partner Pharmacy - Bole", "Addis Ababa", "+251 11 555 0101", 1, 1),
        ("AEC Partner Pharmacy - Kirkos", "Addis Ababa", "+251 11 555 0102", 1, 1),
        ("AEC Partner Pharmacy - Adama", "Adama", "+251 22 111 0103", 0, 1),
        ("AEC Partner Pharmacy - Hawassa", "Hawassa", "+251 46 220 0104", 1, 1),
        ("AEC Partner Pharmacy - Bahir Dar", "Bahir Dar", "+251 58 220 0105", 0, 1),
    ]
    conn.executemany(
        """INSERT INTO pharmacies (name, city, phone, open_24h, partner) VALUES (?,?,?,?,?)""",
        pharmacies,
    )

    incidents = [
        (
            "Downed power line blocking Bole Road",
            "infrastructure",
            "A fallen distribution line is resting on a fence near Bole Medhanialem. Traffic is being redirected.",
            "Bole, Addis Ababa",
            9.0108,
            38.7613,
            "high",
            "Dispatched",
            "EEPCO Utility Crew",
        ),
        (
            "Kitchen fire contained in Kirkos apartment",
            "critical",
            "Smoke reported from a third-floor kitchen. Building evacuated, no injuries reported.",
            "Kirkos, Addis Ababa",
            9.0055,
            38.7486,
            "critical",
            "Resolved",
            "Fire & Rescue",
        ),
        (
            "Water main burst on Adama ring road",
            "infrastructure",
            "A 300 mm main is leaking across two lanes. Utility crew has isolated the section.",
            "Adama",
            8.5410,
            39.2689,
            "medium",
            "In progress",
            "Water & Sewerage",
        ),
        (
            "Street lights out along Hawassa lakeside",
            "community",
            "Six consecutive street lights are dark on the lakeside walkway, affecting evening foot traffic.",
            "Hawassa",
            7.0621,
            38.4760,
            "low",
            "Reported",
            "City Maintenance",
        ),
        (
            "Flooded underpass near Bahir Dar bus station",
            "infrastructure",
            "Standing water roughly 40 cm deep after heavy rain. Drivers advised to use the northern route.",
            "Bahir Dar",
            11.5936,
            37.3908,
            "high",
            "Dispatched",
            "Roads Authority",
        ),
        (
            "Medical evacuation request from Gondar",
            "critical",
            "Clinic requests urgent transfer support for two patients. Ambulance coordination in progress.",
            "Gondar",
            12.6030,
            37.4521,
            "critical",
            "In progress",
            "Emergency Medical Service",
        ),
    ]
    for idx, (title, category, description, place, lat, lng, severity, status, agency) in enumerate(incidents):
        conn.execute(
            """INSERT INTO incidents
               (reference, category, title, description, location_name, lat, lng, severity, status, agency, is_sample, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,1,?)""",
            (
                f"SAMPLE-INC-{idx + 1:03d}",
                category,
                title,
                description,
                place,
                lat,
                lng,
                severity,
                status,
                agency,
                (now - timedelta(minutes=37 * (idx + 1))).replace(microsecond=0).isoformat(),
            ),
        )

    news = [
        (
            "How to prepare a household emergency go-bag",
            "A 15-minute checklist that keeps documents, water, and medication ready before a crisis.",
            "Preparedness guidance from the AEC editorial desk. Keep photocopies of IDs, a three-day water supply, "
            "a phone power bank, and a written list of prescriptions in a waterproof bag. Review the bag every "
            "three months and replace expired items. This is general guidance, not a live incident notice.",
            "Preparedness",
            "AEC Editorial Desk",
        ),
        (
            "What to do in the first 60 seconds of a fire",
            "Alert, evacuate, and call 611 - in that order. Never re-enter a burning building.",
            "Raise the alarm so neighbours can act, leave through the nearest safe exit, and call 611 once you are "
            "outside. Close doors behind you to slow the spread of smoke. If smoke fills the corridor, stay low and "
            "use a second route. This article is general safety education and does not describe a specific incident.",
            "Safety",
            "AEC Editorial Desk",
        ),
        (
            "Recognising heat exhaustion during long power cuts",
            "Hydration, shade, and when to move from home care to a clinic visit.",
            "Heat exhaustion brings heavy sweating, weakness, and dizziness. Move to a shaded, ventilated room, sip "
            "water with oral rehydration salts, and cool the skin with a damp cloth. Seek urgent care if the person "
            "becomes confused, stops sweating, or loses consciousness.",
            "Health",
            "AEC Editorial Desk",
        ),
        (
            "Reporting a missing person: what families should bring",
            "A recent photo, last-seen details, and a phone number that answers day or night.",
            "Bring the most recent photo available, a description of clothing, any medical conditions, and the exact "
            "place and time the person was last seen. AEC publishes only consented reports. Reports are never "
            "invented for demonstration purposes.",
            "Missing persons",
            "AEC Editorial Desk",
        ),
        (
            "Bole road closure: fictional demo notice",
            "Sample notice used to demonstrate the news feed layout. Not a real closure.",
            "This is a sample AEC notice created to show how verified partner updates appear in the feed. It does "
            "not describe a real road closure. In a live deployment, only authenticated agency partners can publish "
            "operational notices, and affiliations are self-reported.",
            "Traffic",
            "AEC Demo Desk",
        ),
    ]
    for idx, (title, summary, body, category, author) in enumerate(news):
        conn.execute(
            """INSERT INTO news (title, summary, body, category, author, is_sample, created_at)
               VALUES (?,?,?,?,?,1,?)""",
            (title, summary, body, category, author, (now - timedelta(hours=6 * (idx + 1))).replace(microsecond=0).isoformat()),
        )

    conn.execute(
        """INSERT INTO missing_persons
           (reference, full_name, age, gender, last_seen_location, last_seen_at, description,
            contact_name, contact_phone, consent, status, is_sample, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)""",
        (
            "SAMPLE-MP-001",
            "Sample Report (fictional)",
            27,
            "female",
            "Merkato, Addis Ababa",
            (now - timedelta(days=1)).replace(microsecond=0).isoformat(),
            "This is a fictional sample record that demonstrates the layout of a consented missing-person "
            "report. It is not a real person and must never be circulated as one.",
            "AEC Demo Desk",
            "+251 11 555 0199",
            1,
            "Active",
            now.replace(microsecond=0).isoformat(),
        ),
    )

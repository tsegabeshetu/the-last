# AEC Java dispatch service

Dependency-free Java 17+ service that reserves a partner vehicle or pharmacy
courier for an AEC request and returns an honest **planning estimate**.

It never contacts a real driver, courier, pharmacy, or emergency service, and it
never persists anything: the fleet is in-memory and resets on restart.

## Why Java here

The Python API owns public data (incidents, reports, requests). The Java service
owns the partner-fleet reservation step, so the two backends mirror a real split
between a public portal and an operations dispatcher.

## Build and run

Requires a JDK 17 or newer (`javac` and `java` on PATH).

```powershell
.\build.ps1
.\run.ps1
```

The service listens on `http://127.0.0.1:8081` (override with `AEC_JAVA_PORT`).

Then point the Python API at it:

```powershell
$env:AEC_JAVA_DISPATCH_URL = "http://127.0.0.1:8081"
```

Without that variable the Python API returns its own clearly-labelled estimate
and the app keeps working.

## Endpoints

| Method | Path                        | Purpose                                  |
| ------ | --------------------------- | ---------------------------------------- |
| GET    | `/health`                   | Service status and fleet summary         |
| GET    | `/fleet`                    | Partner units with availability          |
| GET    | `/assignments`              | Recent reservations (in-memory, max 200) |
| POST   | `/dispatch`                 | Reserve a unit and return a plan         |
| POST   | `/fleet/{unitId}/release`   | Free a reserved unit                     |

```jsonc
// POST /dispatch
{ "kind": "rental", "city": "Addis Ababa", "priority": "urgent", "reference": "AEC-CAR-123" }
```

```jsonc
// response
{
  "kind": "rental",
  "city": "Addis Ababa",
  "unit": "Toyota Corolla - with driver",
  "unit_id": "CAR-ADD-01",
  "eta_minutes": { "min": 14, "max": 32 },
  "estimate_only": true,
  "status": "reserved",
  "engine": "java-dispatch-service",
  "note": "Partner unit reserved for planning only. A human coordinator calls to confirm..."
}
```

When every unit in the city is busy the response is `status: "queued"` with
`eta_minutes: null`. The app displays that honestly instead of inventing a time.

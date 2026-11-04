package aec.dispatch;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Deterministic partner-fleet dispatcher.
 *
 * This service only produces a *plan*: it reserves a partner unit in memory and
 * returns a planning estimate. It never contacts a real driver, courier, or
 * emergency service, and every response says so.
 */
public final class DispatchService {

    private final List<Unit> units = new ArrayList<>();
    private final List<Map<String, Object>> assignments = new ArrayList<>();
    private final AtomicInteger sequence = new AtomicInteger(1000);

    public DispatchService() {
        units.add(new Unit("CAR-ADD-01", "Addis Ababa", "rental", "Toyota Corolla - with driver", "+251 11 555 0201"));
        units.add(new Unit("CAR-ADD-02", "Addis Ababa", "rental", "Toyota Hiace - 12 seats", "+251 11 555 0202"));
        units.add(new Unit("CAR-ADD-03", "Addis Ababa", "rental", "Isuzu NPR cargo van", "+251 11 555 0203"));
        units.add(new Unit("CAR-ADA-01", "Adama", "rental", "Hyundai Starex - 9 seats", "+251 22 111 0204"));
        units.add(new Unit("CAR-HAW-01", "Hawassa", "rental", "Suzuki Dzire - with driver", "+251 46 220 0205"));
        units.add(new Unit("CAR-BDR-01", "Bahir Dar", "rental", "Toyota Land Cruiser 4x4", "+251 58 220 0206"));
        units.add(new Unit("CAR-MEK-01", "Mekelle", "rental", "Toyota Vitz - self drive", "+251 34 440 0207"));

        units.add(new Unit("MED-ADD-01", "Addis Ababa", "medication", "Bole pharmacy courier", "+251 11 555 0301"));
        units.add(new Unit("MED-ADD-02", "Addis Ababa", "medication", "Kirkos pharmacy courier", "+251 11 555 0302"));
        units.add(new Unit("MED-ADA-01", "Adama", "medication", "Adama pharmacy courier", "+251 22 111 0303"));
        units.add(new Unit("MED-HAW-01", "Hawassa", "medication", "Hawassa pharmacy courier", "+251 46 220 0304"));
        units.add(new Unit("MED-BDR-01", "Bahir Dar", "medication", "Bahir Dar pharmacy courier", "+251 58 220 0305"));
    }

    public synchronized Map<String, Object> dispatch(String kind, String city, String priority, String reference) {
        String normalisedCity = city == null ? "" : city.trim();
        String normalisedKind = "medication".equalsIgnoreCase(kind) ? "medication" : "rental";
        String normalisedPriority = "urgent".equalsIgnoreCase(priority) ? "urgent" : "standard";
        String requestRef = (reference == null || reference.isBlank())
                ? "JAVA-" + sequence.incrementAndGet()
                : reference.trim();

        Unit chosen = null;
        for (Unit unit : units) {
            if (unit.isAvailable()
                    && unit.kind.equals(normalisedKind)
                    && unit.city.equalsIgnoreCase(normalisedCity)) {
                chosen = unit;
                break;
            }
        }

        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("kind", normalisedKind);
        plan.put("city", normalisedCity);
        plan.put("priority", normalisedPriority);
        plan.put("reference", requestRef);
        plan.put("estimate_only", true);
        plan.put("engine", "java-dispatch-service");

        if (chosen == null) {
            plan.put("unit", "queued");
            plan.put("unit_id", null);
            plan.put("eta_minutes", null);
            plan.put("status", "queued");
            plan.put("note", "No partner unit is free in this city right now. The request is queued and "
                    + "a coordinator must confirm a unit. This is not a confirmed dispatch.");
            record(requestRef, normalisedKind, normalisedCity, normalisedPriority, "queued", null, null);
            return plan;
        }

        int base = normalisedPriority.equals("urgent") ? 12 : 30;
        int spread = normalisedPriority.equals("urgent") ? 18 : 45;
        int min = base + Math.abs(normalisedCity.hashCode() % 8);
        int max = min + spread;

        chosen.assign(requestRef);
        plan.put("unit", chosen.label);
        plan.put("unit_id", chosen.id);
        plan.put("eta_minutes", Json.eta(min, max));
        plan.put("status", "reserved");
        plan.put("note", "Partner unit reserved for planning only. A human coordinator calls to confirm "
                + "the vehicle or courier, the price, and the time. No real dispatch has happened.");
        record(requestRef, normalisedKind, normalisedCity, normalisedPriority, "reserved", chosen.id,
                Json.eta(min, max));
        return plan;
    }

    private void record(String reference, String kind, String city, String priority, String status,
                        String unitId, Map<String, Object> eta) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("reference", reference);
        entry.put("kind", kind);
        entry.put("city", city);
        entry.put("priority", priority);
        entry.put("status", status);
        entry.put("unit_id", unitId);
        entry.put("eta_minutes", eta);
        entry.put("created_at", Instant.now().toString());
        assignments.add(0, entry);
        if (assignments.size() > 200) {
            assignments.remove(assignments.size() - 1);
        }
    }

    public synchronized List<Map<String, Object>> fleet() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Unit unit : units) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", unit.id);
            row.put("city", unit.city);
            row.put("kind", unit.kind);
            row.put("label", unit.label);
            row.put("contact", unit.contact);
            row.put("available", unit.isAvailable());
            row.put("assignment", unit.getAssignment());
            result.add(row);
        }
        return result;
    }

    public synchronized List<Map<String, Object>> assignments() {
        return new ArrayList<>(assignments);
    }

    public synchronized boolean release(String unitId) {
        for (Unit unit : units) {
            if (unit.id.equalsIgnoreCase(unitId)) {
                unit.release();
                return true;
            }
        }
        return false;
    }

    public synchronized Map<String, Object> summary() {
        long free = units.stream().filter(Unit::isAvailable).count();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("units_total", units.size());
        summary.put("units_available", free);
        summary.put("cities", units.stream().map(u -> u.city).distinct().sorted().toList());
        summary.put("disclaimer", "In-memory demo fleet. Resets when the service restarts.");
        return summary;
    }
}

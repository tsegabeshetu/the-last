package aec.dispatch;

/** A partner vehicle or courier unit that can be assigned to an emergency request. */
public final class Unit {

    public final String id;
    public final String city;
    public final String kind; // "rental" or "medication"
    public final String label;
    public final String contact;

    private boolean available = true;
    private String assignment = "";

    public Unit(String id, String city, String kind, String label, String contact) {
        this.id = id;
        this.city = city;
        this.kind = kind;
        this.label = label;
        this.contact = contact;
    }

    public boolean isAvailable() {
        return available;
    }

    public String getAssignment() {
        return assignment;
    }

    public void assign(String reference) {
        this.available = false;
        this.assignment = reference;
    }

    public void release() {
        this.available = true;
        this.assignment = "";
    }
}

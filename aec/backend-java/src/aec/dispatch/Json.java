package aec.dispatch;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Minimal JSON helpers. The dispatch service deliberately has zero third-party
 * dependencies so it compiles with a bare JDK: `javac` and nothing else.
 */
public final class Json {

    private Json() {
    }

    public static String write(Object value) {
        StringBuilder out = new StringBuilder();
        writeValue(out, value);
        return out.toString();
    }

    @SuppressWarnings("unchecked")
    private static void writeValue(StringBuilder out, Object value) {
        if (value == null) {
            out.append("null");
        } else if (value instanceof String text) {
            writeString(out, text);
        } else if (value instanceof Number || value instanceof Boolean) {
            out.append(value);
        } else if (value instanceof Map<?, ?> map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) {
                    out.append(',');
                }
                first = false;
                writeString(out, String.valueOf(entry.getKey()));
                out.append(':');
                writeValue(out, entry.getValue());
            }
            out.append('}');
        } else if (value instanceof Iterable<?> list) {
            out.append('[');
            boolean first = true;
            for (Object item : list) {
                if (!first) {
                    out.append(',');
                }
                first = false;
                writeValue(out, item);
            }
            out.append(']');
        } else {
            writeString(out, String.valueOf(value));
        }
    }

    private static void writeString(StringBuilder out, String text) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        out.append('"');
    }

    /** Parses a flat JSON object of string/number values, which is all this service needs. */
    public static Map<String, String> parseFlat(String body) {
        Map<String, String> result = new LinkedHashMap<>();
        if (body == null) {
            return result;
        }
        int index = 0;
        int length = body.length();
        while (index < length) {
            int keyStart = body.indexOf('"', index);
            if (keyStart < 0) {
                break;
            }
            int keyEnd = body.indexOf('"', keyStart + 1);
            if (keyEnd < 0) {
                break;
            }
            String key = body.substring(keyStart + 1, keyEnd);
            int colon = body.indexOf(':', keyEnd);
            if (colon < 0) {
                break;
            }
            int valueStart = colon + 1;
            while (valueStart < length && Character.isWhitespace(body.charAt(valueStart))) {
                valueStart++;
            }
            if (valueStart >= length) {
                break;
            }
            if (body.charAt(valueStart) == '"') {
                int valueEnd = body.indexOf('"', valueStart + 1);
                if (valueEnd < 0) {
                    break;
                }
                result.put(key, body.substring(valueStart + 1, valueEnd));
                index = valueEnd + 1;
            } else {
                int valueEnd = valueStart;
                while (valueEnd < length && ",}".indexOf(body.charAt(valueEnd)) < 0) {
                    valueEnd++;
                }
                result.put(key, body.substring(valueStart, valueEnd).trim());
                index = valueEnd;
            }
        }
        return result;
    }

    public static Map<String, Object> object(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            map.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return map;
    }

    public static Map<String, Object> eta(int min, int max) {
        return object("min", min, "max", max);
    }
}

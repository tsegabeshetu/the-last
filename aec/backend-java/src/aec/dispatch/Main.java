package aec.dispatch;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * AEC Java dispatch service.
 *
 * Zero dependencies: compile with `javac` and run with `java`. It exposes the
 * partner-fleet planning endpoints the Python API calls when
 * AEC_JAVA_DISPATCH_URL is configured.
 */
public final class Main {

    private static final int MAX_BODY_BYTES = 8 * 1024;

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("AEC_JAVA_PORT", "8081"));
        DispatchService service = new DispatchService();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/", exchange -> handle(exchange, service));
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.printf("AEC Java dispatch service listening on http://127.0.0.1:%d%n", port);
        System.out.println("Demo fleet only - no real dispatch, no persistence.");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(1)));
    }

    private static void handle(HttpExchange exchange, DispatchService service) throws IOException {
        addCors(exchange);
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        if ("OPTIONS".equalsIgnoreCase(method)) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        try {
            if ("GET".equals(method) && ("/health".equals(path) || "/".equals(path))) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("status", "ok");
                body.put("service", "aec-java-dispatch");
                body.put("time", Instant.now().toString());
                body.put("fleet", service.summary());
                send(exchange, 200, Json.write(body));
                return;
            }

            if ("GET".equals(method) && "/fleet".equals(path)) {
                send(exchange, 200, Json.write(service.fleet()));
                return;
            }

            if ("GET".equals(method) && "/assignments".equals(path)) {
                send(exchange, 200, Json.write(service.assignments()));
                return;
            }

            if ("POST".equals(method) && "/dispatch".equals(path)) {
                Map<String, String> request = Json.parseFlat(readBody(exchange));
                String kind = request.getOrDefault("kind", "rental");
                String city = request.getOrDefault("city", "");
                String priority = request.getOrDefault("priority", "standard");
                if (city.isBlank()) {
                    send(exchange, 400, Json.write(Json.object("error", "city is required")));
                    return;
                }
                Map<String, Object> plan = service.dispatch(kind, city, priority, request.get("reference"));
                send(exchange, 200, Json.write(plan));
                return;
            }

            if ("POST".equals(method) && path.startsWith("/fleet/") && path.endsWith("/release")) {
                String unitId = path.substring("/fleet/".length(), path.length() - "/release".length());
                boolean released = service.release(unitId);
                send(exchange, released ? 200 : 404,
                        Json.write(Json.object("released", released, "unit_id", unitId)));
                return;
            }

            send(exchange, 404, Json.write(Json.object("error", "not found", "path", path)));
        } catch (IllegalArgumentException error) {
            send(exchange, 400, Json.write(Json.object("error", error.getMessage())));
        } catch (Exception error) {
            send(exchange, 500, Json.write(Json.object("error", "internal error")));
        }
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        try (InputStream input = exchange.getRequestBody()) {
            byte[] bytes = input.readNBytes(MAX_BODY_BYTES + 1);
            if (bytes.length > MAX_BODY_BYTES) {
                throw new IllegalArgumentException("request body too large");
            }
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }

    private static void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private static void send(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private Main() {
    }
}

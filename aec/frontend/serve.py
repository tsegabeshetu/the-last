"""Static file server for the AEC frontend.

Python's stock http.server sends Last-Modified headers, so browsers happily
reuse stale ES modules after you edit a file. This server always answers with
Cache-Control: no-store, which keeps local development predictable.

Usage:
    python serve.py            # http://127.0.0.1:5173
    python serve.py 8080       # custom port
"""

from __future__ import annotations

import functools
import http.server
import os
import socketserver
import sys

HOST = "127.0.0.1"
DEFAULT_PORT = 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # quieter console
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> int:
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Port must be a number, got {sys.argv[1]!r}", file=sys.stderr)
            return 2

    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((HOST, port), handler) as httpd:
        print(f"AEC frontend: http://{HOST}:{port}/index.html")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

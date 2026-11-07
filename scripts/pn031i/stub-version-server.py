#!/usr/bin/env python3
"""scripts/pn031i/stub-version-server.py — سرور /api/version ساختگی برای تستهای reset-guard (PN-031-I)
استفاده: python3 stub-version-server.py <gitSha-full> <seconds-alive> [port-file]
خروجی خط اول: شمارهٔ پورت انتخابی (ephemeral) — و در صورت ارائه، در port-file هم می‌نویسد
"""
import http.server
import json
import sys
import threading
import time

SHA = sys.argv[1] if len(sys.argv) > 1 else "0" * 40
ALIVE = float(sys.argv[2]) if len(sys.argv) > 2 else 60
PORT_FILE = sys.argv[3] if len(sys.argv) > 3 else None


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({
            "buildId": SHA[:7] + "-stub",
            "gitSha": SHA[:7],
            "fingerprint": {"gitSha": SHA},
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
print(srv.server_address[1], flush=True)
if PORT_FILE:
    with open(PORT_FILE, "w", encoding="utf-8") as f:
        f.write(str(srv.server_address[1]))
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(ALIVE)

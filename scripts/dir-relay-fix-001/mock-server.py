#!/usr/bin/env python3
"""DIR-RELAY-FIX-001 — سرور ساختگی برای تست دودویی اسکریپت رلهٔ ترموکس.

هر خط فایل سناریو = یک پاسخ poll (به‌ترتیب مصرف):
  502|html        → 502 + بدنهٔ HTML (صفحهٔ خطای پروکسی)
  503|html        → 503 + HTML
  401|html        → 401 + HTML
  403|html        → 403 + HTML (بدون قرارداد JSON)
  403|json-unknown→ 403 + JSON قرارداد سرور {"ok":false,"error":"unknown device"}
  403|json-stale  → 403 + JSON {"ok":false,"error":"stale request",serverTime=+1h}
  204|            → 204 خالی (poll موفق بدون آیتم)
پس از اتمام خطوط: همیشه 204 (حلقهٔ سالم بی‌نهایت).

مسیرهای کمکی: HEAD/GET /api/health → 200 (همگام‌سازی ساعت) ·
GET /api/version → {"buildId":"t","gitSha":"t"} (نبض نسخه بی‌هشدار).
"""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SCENARIO_FILE = sys.argv[1]
PORT = int(sys.argv[2])

with open(SCENARIO_FILE) as f:
    STEPS = [line.strip() for line in f if line.strip()]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _respond(self, code, body=b"", ctype="text/html"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self._respond(200)

    def do_GET(self):
        if self.path.startswith("/api/version"):
            self._respond(200, json.dumps({"buildId": "t", "gitSha": "t"}).encode(), "application/json")
        else:
            self._respond(200)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            self.rfile.read(length)
        if not self.path.startswith("/api/mobile-relay/poll"):
            self._respond(200, b'{"ok":true}', "application/json")
            return
        step = STEPS.pop(0) if STEPS else "204|"
        status, _, kind = step.partition("|")
        status = int(status)
        if status == 204:
            self._respond(204)
        elif kind == "json-unknown":
            body = json.dumps({"ok": False, "error": "unknown device", "serverTime": time.time() * 1000}).encode()
            self._respond(403, body, "application/json")
        elif kind == "json-stale":
            body = json.dumps({"ok": False, "error": "stale request", "serverTime": time.time() * 1000 + 3_600_000}).encode()
            self._respond(403, body, "application/json")
        else:
            self._respond(status, b"<html><body>Bad Gateway (mock)</body></html>", "text/html")


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

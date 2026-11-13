#!/usr/bin/env python3
"""DIR-RELAY-UNLIMITED-001 — سرور ساختگی برای تست دودویی اسکریپت رلهٔ نسل N.

هر خط فایل سناریو = یک پاسخ poll (به‌ترتیب مصرف):
  502|html         → 502 + HTML (قطعی موقت دروازه)
  503|html         → 503 + HTML
  429|html         → 429 + HTML (فشار روی دروازه)
  401|html         → 401 + HTML (رد احراز دروازه)
  403|html         → 403 + HTML (بدون قرارداد JSON — WAF)
  403|json-unknown → 403 + {"ok":false,"error":"unknown device"}
  403|json-revoked → 403 + {"ok":false,"error":"device revoked"}
  403|json-stale   → 403 + {"ok":false,"error":"stale request",serverTime=+1h}
  204|             → 204 خالی (poll موفق بدون آیتم)
  items|N          → 200 + N آیتم با امضای عمداً نامعتبر («bad signature» سمت
                     اسکریپت → نتیجهٔ خطا ثبت می‌شود، هیچ تماس بیرونی نمی‌شود)
پس از اتمام خطوط: همیشه 204.

مسیرهای کمکی: HEAD/GET /api/health → 200 (همگام‌سازی ساعت) ·
GET /api/version → {"buildId":"t","gitSha":"t"} (نبض نسخه بی‌هشدار) ·
POST /api/mobile-relay/result → 200 {"ok":true} + ثبت در results.jsonl.
"""
import sys
import time
import json
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCENARIO_FILE = sys.argv[1]
PORT = int(sys.argv[2])
RESULTS_FILE = sys.argv[3] if len(sys.argv) > 3 else ""

with open(SCENARIO_FILE) as f:
    STEPS = [line.strip() for line in f if line.strip()]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

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

    def _record_result(self, raw):
        if not RESULTS_FILE:
            return
        line = json.dumps(
            {
                "kind": "result",
                "headers": {k.lower(): v for k, v in self.headers.items()},
                "body_b64": base64.b64encode(raw).decode("ascii"),
            }
        )
        with open(RESULTS_FILE, "a") as f:
            f.write(line + "\n")

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("date", self.date_time_string())
        self.send_header("content-length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/version"):
            self._respond(200, json.dumps({"buildId": "t", "gitSha": "t"}).encode(), "application/json")
        else:
            self._respond(200)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if self.path.startswith("/api/mobile-relay/result"):
            self._record_result(raw)
            self._respond(200, json.dumps({"ok": True}).encode(), "application/json")
            return
        if not self.path.startswith("/api/mobile-relay/poll"):
            self._respond(200, b'{"ok":true}', "application/json")
            return
        step = STEPS.pop(0) if STEPS else "204|"
        if step.startswith("items"):
            # 200 + N آیتم با امضای عمداً نامعتبر — قبل از parse عدد وضعیت
            n = int(step.split("|")[1]) if "|" in step else 2
            items = []
            for i in range(n):
                items.append(
                    {
                        "id": "smoke-item-%03d" % (i + 1),
                        "method": "GET",
                        "url": "https://arus-api.melketabriz.ir/api/apm/test",
                        "headers": {},
                        "body": "",
                        "sig": "deadbeef",  # عمداً نامعتبر → «bad signature» بدون تماس بیرونی
                        "ts": 1700000000000,
                    }
                )
            payload = json.dumps({"ok": True, "items": items, "request": items[0]}, separators=(",", ":")).encode()
            self._respond(200, payload, "application/json")
            return
        status, _, kind = step.partition("|")
        status = int(status)
        if status == 204:
            self._respond(204)
        elif kind == "json-unknown":
            body = json.dumps({"ok": False, "error": "unknown device", "serverTime": time.time() * 1000}).encode()
            self._respond(403, body, "application/json")
        elif kind == "json-revoked":
            body = json.dumps({"ok": False, "error": "device revoked", "serverTime": time.time() * 1000}).encode()
            self._respond(403, body, "application/json")
        elif kind == "json-stale":
            body = json.dumps({"ok": False, "error": "stale request", "serverTime": time.time() * 1000 + 3_600_000}).encode()
            self._respond(403, body, "application/json")
        else:
            self._respond(status, b"<html><body>Gateway Error (mock)</body></html>", "text/html")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("listening %d" % srv.server_address[1], flush=True)
    srv.serve_forever()

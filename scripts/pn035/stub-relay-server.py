#!/usr/bin/env python3
"""سرور آزمایشی PN-035 — stub برای تست integration اسکریپت رله نسل J.

استفاده: python3 stub-relay-server.py <port:0=random> <state.json> <records.jsonl> <device_secret>

state.json (در هر درخواست خوانده می‌شود — تست بین فازها آن را بازمی‌نویسد):
  {
    "poll_items": 0,                  # تعداد آیتم دسته در پاسخ poll (۰ = 204 خالی)
    "result_mode": "accept"           # accept | garbage | reject
  }

records.jsonl — هر خط یک JSON:
  { "kind": "poll"|"result", "path", "headers": {کوچک‌شده}, "body_b64": <بایت خام سیم> }

آیتم‌ها با قرارداد کامل امضای سرور (RELAY\\nid\\nmethod\\nurl\\nsha256(body)\\nts)
با device_secret امضا می‌شوند تا مسیر وارسی دوجهتهٔ اسکریپت واقعاً اجرا شود.
مقصد آیتم‌ها میزبان‌های NXDOMAIN داخل دامنهٔ melketabriz.ir است تا whitelist
میزبان عبور کند اما هیچ تماس واقعی به سرورهای ملک تبریز انجام نشود.
"""
import sys
import json
import hmac
import hashlib
import base64
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1])
STATE_FILE = sys.argv[2]
RECORDS = sys.argv[3]
DEVICE_SECRET = sys.argv[4]


def item_sig(item, ts):
    body = item.get("body") or ""
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    msg = "RELAY\n{}\n{}\n{}\n{}\n{}".format(item["id"], item["method"], item["url"], digest, str(ts))
    return hmac.new(DEVICE_SECRET.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"poll_items": 0, "result_mode": "accept"}


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _rec(self, kind):
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length else b""
        line = json.dumps(
            {
                "kind": kind,
                "path": self.path,
                "headers": {k.lower(): v for k, v in self.headers.items()},
                "body_b64": base64.b64encode(raw).decode("ascii"),
            },
            ensure_ascii=False,
        )
        with open(RECORDS, "a") as f:
            f.write(line + "\n")

    def _send(self, code, body: bytes, ctype="application/json"):
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            self._send(200, b"ok")
        elif self.path == "/api/version":
            self._send(200, json.dumps({"buildId": "testsha", "gitSha": "testsha"}).encode())
        else:
            self._send(404, b"{}")

    def do_HEAD(self):
        # sync_clock — تاریخ سرور برای همگام‌سازی ساعت اسکریپت
        self.send_response(200)
        self.send_header("date", self.date_time_string())
        self.send_header("content-length", "0")
        self.end_headers()

    def do_POST(self):
        state = load_state()
        if self.path == "/api/mobile-relay/poll":
            self._rec("poll")
            n = int(state.get("poll_items", 0))
            if n <= 0:
                self.send_response(204)
                self.send_header("content-length", "0")
                self.end_headers()
                return
            # serve-once — پس از نخستین دستهٔ غیرخالی، صف خالی می‌شود
            # (تست بین فازها state را دوباره می‌نویسد؛ بازتولید رفتار واقعی سرور
            #  که آیتم dispatched را دوباره نمی‌دهد)
            state["poll_items"] = 0
            with open(STATE_FILE, "w") as f:
                json.dump(state, f)
            ts = 1700000000000
            items = []
            for i in range(n):
                is_post = (i % 2) == 1
                item = {
                    "id": "jobitem-{:03d}".format(i + 1),
                    "method": "POST" if is_post else "GET",
                    "url": "https://pn035-unit-{:03d}.melketabriz.ir/api/apm/test".format(i + 1),
                    "headers": {"content-type": "application/json"},
                    "body": json.dumps({"i": i}, separators=(",", ":")) if is_post else None,
                }
                items.append(
                    {
                        "id": item["id"],
                        "method": item["method"],
                        "url": item["url"],
                        "headers": item["headers"],
                        "body": item["body"] or "",
                        "sig": item_sig(item, ts),
                        "ts": ts,
                    }
                )
            payload = {"ok": True, "items": items, "request": dict(items[0])}
            self._send(200, json.dumps(payload, separators=(",", ":")).encode())
        elif self.path == "/api/mobile-relay/result":
            self._rec("result")
            mode = state.get("result_mode", "accept")
            if mode == "garbage":
                # شبیه‌سازی پاسخ HTML دروازه (502) — غیرJSON → خطای گذرا → retry
                self._send(502, b"<html>Bad Gateway (stub)</html>", ctype="text/html")
            elif mode == "reject":
                # رد قطعی JSON — triage: بدون retry و بدون ذخیرهٔ محلی
                self._send(409, json.dumps({"ok": False, "error": "not your item"}).encode())
            else:
                self._send(200, json.dumps({"ok": True, "accepted": 1, "total": 1, "results": [{"id": "x", "ok": True, "status": 200}]}).encode())
        else:
            self._send(404, b"{}")

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
print("listening {}".format(srv.server_address[1]), flush=True)
srv.serve_forever()

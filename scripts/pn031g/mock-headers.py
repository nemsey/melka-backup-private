#!/usr/bin/env python3
# PN-031-G — سرور آزمایشی محلی: هدرهای هر درخواست را به فایل JSONL ضبط می‌کند و
# ۲۰۴ برمی‌گرداند (عین پاسخ poll با صف خالی). پورت ۰ = پورت آزاد خودکار؛
# پورت واقعی در خط اول stdout چاپ می‌شود.
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 0
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/pn031g-mock-records.jsonl"


class Handler(BaseHTTPRequestHandler):
    def _record(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8", "replace") if length else ""
        with open(OUT, "a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        "method": self.command,
                        "path": self.path,
                        "headers": {k.lower(): v for k, v in self.headers.items()},
                        "body": body,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    def do_POST(self):
        self._record()
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        self._record()
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


srv = HTTPServer(("127.0.0.1", PORT), Handler)
print(srv.server_address[1], flush=True)
srv.serve_forever()

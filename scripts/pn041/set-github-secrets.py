#!/usr/bin/env python3
"""
set-github-secrets.py — PN-041 · فاز ۴ (شورا-ن۰۶۷)
------------------------------------------------------------
ثبت secretهای Workflow پشتیبان روزانه در GitHub (admin API):
  MELKA_LIVE_URL    — نشانی عمومی سرور زنده
  MELKA_OWNER_TOKEN — Bearer مالک (= MASTER_ACCESS_CODE)
  MIN_RECORDS       — کف انتظار آگهی‌ها (قانون دادهٔ مقدس در ابر)

رمزنگاری: libsodium sealed box با کلید عمومی Actions مخزن (قرارداد رسمی GitHub).
خروجی: exit 0 + چاپ وضعیت هر secret. هرگز مقدار در خروجی چاپ نمی‌شود.
"""
import json
import sys
import urllib.request
from pathlib import Path
from nacl import encoding, public

REPO_API = "https://api.github.com/repos/nemsey/melka-backup-private"
CRED = Path("/home/z/my-project/upload/.mirror/credentials.env")


def token() -> str:
    for line in CRED.read_text().splitlines():
        if line.startswith("MIRROR_URL_AUTHED="):
            url = line.split("=", 1)[1].strip()
            # https://user:token@github.com/...
            return url.split(":", 2)[-1].split("@", 1)[0]
    raise SystemExit("MIRROR_URL_AUTHED در credentials.env یافت نشد")


def api(method: str, url: str, data: bytes | None = None, ctype: str = "application/json"):
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Authorization", f"token {token()}")
    if data is not None:
        req.add_header("Content-Type", ctype)
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            return r.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def main() -> int:
    # ۱) کلید عمومی Actions مخزن
    status, pk = api("GET", f"{REPO_API}/actions/secrets/public-key")
    if status != 200:
        print(f"خطا در کلید عمومی: {status} {pk}")
        return 1
    pk_obj = public.PublicKey(pk["key"].encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pk_obj)

    # ۲) مقادیر از env.platform.json (منبع حقیقت محلی)
    envp = json.loads(Path("/home/z/my-project/env.platform.json").read_text())
    live_url = envp.get("MELK_PUBLIC_BASE_URL", "")
    owner_token = envp.get("MASTER_ACCESS_CODE", "")
    min_records = "27000"

    secrets = {
        "MELKA_LIVE_URL": live_url,
        "MELKA_OWNER_TOKEN": owner_token,
        "MIN_RECORDS": min_records,
    }
    results = {}
    for name, value in secrets.items():
        if not value:
            print(f"↷ {name}: مقدار محلی خالی — پرش")
            results[name] = "skipped-empty"
            continue
        enc = sealed.encrypt(value.encode("utf-8"))
        body = json.dumps({
            "encrypted_value": encoding.Base64Encoder.encode(enc).decode("ascii"),
            "key_id": pk["key_id"],
        }).encode()
        status, resp = api("PUT", f"{REPO_API}/actions/secrets/{name}", body)
        ok = status in (201, 204)
        state = "set" if ok else str(resp)[:100]
        print(f"{'✓' if ok else '✗'} {name}: HTTP {status} {state}")
        results[name] = "set" if ok else f"fail-{status}"
    Path("/home/z/my-project/download/pn041/github-secrets.json").write_text(
        json.dumps({"at": __import__("datetime").datetime.utcnow().isoformat() + "Z", "results": results}, indent=2, ensure_ascii=False)
    )
    return 0 if all(v in ("set", "skipped-empty") for v in results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())

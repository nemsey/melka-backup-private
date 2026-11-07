#!/usr/bin/env bash
# restore-env-pn031b.sh — بازیابی env.platform.json پس از بازنشانی هشتم (PN-031-B)
# منبع: بستهٔ بقای chainIndex=30 (upload/.survival/PN-031-20261012/env.platform.json)
#        + MELK_PUBLIC_BASE_URL (از boot-secrets موجود — جلسهٔ ۰۳۸)
# سپس: نوشتن همهٔ کلیدهای BOOT_SECRET_KEYS تازه در هر دو escrow متنی
#       (db/.runtime + upload/.runtime) — نوشتن env.escrow.enc با بوت بعدی انجام می‌شود
set -euo pipefail
cd /home/z/my-project

python3 - <<'PYEOF'
import json, os

# ۱) منبع بقای ۳۰
surv = json.load(open("upload/.survival/PN-031-20261012/env.platform.json"))

# ۲) نشانی عمومی از boot-secrets زنده (جلسهٔ ۰۳۸)
boot = json.load(open("db/.runtime/boot-secrets.json"))
pub = boot.get("MELK_PUBLIC_BASE_URL", "")
assert pub.startswith("https://"), "MELK_PUBLIC_BASE_URL غایب از boot-secrets!"

# ۳) ترکیب — بقای ۳۰ + نشانی عمومی
env = dict(surv)
env["MELK_PUBLIC_BASE_URL"] = pub
env["_pn031b"] = (
    "PN-031-B (شورا-ن۰۳۹): بازنشانی هشتم env را زد — بازیابی از بستهٔ بقای chainIndex=30 "
    "+ چهار کلید عملیاتی (MELK_PROXY_SECRET · MELK_ARM_PROXY_URL · MELK_ARM_RELAY_MODE · "
    "MELK_ARM_OFFLINE) جزو BOOT_SECRET_KEYS/escrow سه‌لایه شدند تا در بازنشانی‌های بعدی "
    "خودکار بازگردند."
)

# ۴) نوشتن env.platform.json (اتمیک)
tmp = "env.platform.json.tmp"
with open(tmp, "w") as f:
    json.dump(env, f, ensure_ascii=False, indent=2)
    f.write("\n")
os.replace(tmp, "env.platform.json")
os.chmod("env.platform.json", 0o600)

# ۵) همگام‌سازی هر دو escrow متنی با کلیدهای تازه (db + upload)
escrow_keys = {
    "MELK_TOKEN_KEY": env.get("MELK_TOKEN_KEY", ""),
    "MASTER_ACCESS_CODE": env.get("MASTER_ACCESS_CODE", ""),
    "OWNER_PERSONNEL_CODES": env.get("OWNER_PERSONNEL_CODES", ""),
    "MELK_PUBLIC_BASE_URL": pub,
    "MELK_PROXY_SECRET": env.get("MELK_PROXY_SECRET", ""),
    "MELK_ARM_PROXY_URL": env.get("MELK_ARM_PROXY_URL", ""),
    "MELK_ARM_RELAY_MODE": env.get("MELK_ARM_RELAY_MODE", ""),
    "MELK_ARM_OFFLINE": env.get("MELK_ARM_OFFLINE", ""),
}
note = "PN-011/012 escrow (سه‌مکانی) — فقط دیسک محلی؛ gitignored؛ هرگز وارد git/بستهٔ بقا نمی‌شود."
import datetime
for path in ("db/.runtime/boot-secrets.json", "upload/.runtime/boot-secrets.json"):
    d = {}
    try:
        d = json.load(open(path))
    except Exception:
        pass
    d.update({k: v for k, v in escrow_keys.items() if v})
    d["_note"] = note
    d["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    t = path + ".tmp"
    with open(t, "w") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    os.replace(t, path)
    os.chmod(path, 0o600)

# گزارش (بدون چاپ مقادیر)
restored = [k for k in ("MELK_PROXY_SECRET", "MELK_ARM_PROXY_URL", "MELK_ARM_RELAY_MODE", "MELK_ARM_OFFLINE") if env.get(k)]
print("env.platform.json restored:", sorted(restored), "+ MELK_PUBLIC_BASE_URL")
print("escrow synced: db/.runtime + upload/.runtime")
PYEOF

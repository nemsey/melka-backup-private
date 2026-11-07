#!/usr/bin/env python3
"""PN-071 — بازیابی کلیدهای گم‌شدهٔ escrow از نسخهٔ pre-reset گیت (506dce5).

ریشهٔ حادثه: ریست ۱۳:۱۰ upload/ (tmpfs) را زد + env.platform.json نیمه‌بازسازی شد؛
بازذخیرهٔ escrow فقط با ۴ کلید اصلی، نسخهٔ کامل را روی نوشت. این اسکریپت
نسخهٔ رمزنگاری‌شدهٔ pre-reset را از گیت برمی‌دارد، با کد مستر رمزگشایی می‌کند
و کلیدهای غایب را به env.platform.json بازمی‌گرداند (فقط کلید غایب — هرگز بازنویسی).
"""
import base64, hashlib, json, subprocess, sys
from pathlib import Path

REPO = Path("/home/z/my-project")
GIT_REV = "506dce5"  # آخرین کامیت pre-reset (PN-070-ح)

def git_show(rev: str, p: str) -> bytes:
    return subprocess.run(["git", "-C", str(REPO), "show", f"{rev}:{p}"],
                          capture_output=True, check=True).stdout

# ۱) meta + enc قدیمی از گیت
meta = json.loads(git_show(GIT_REV, "env.escrow.meta.json"))
enc_b64 = git_show(GIT_REV, "env.escrow.enc").decode().strip()
salt = base64.b64decode(meta["kdf"]["saltB64"] if "saltB64" in meta["kdf"] else meta["saltB64"])

# ۲) کد مستر از env زنده (بدون چاپ)
env_local = (REPO / ".env.local").read_text()
mc = None
for line in env_local.splitlines():
    if line.strip().startswith("MASTER_ACCESS_CODE="):
        mc = line.split("=", 1)[1].strip().strip('"').strip("'")
        break
if not mc:
    sys.exit("FATAL: MASTER_ACCESS_CODE not found in .env.local")

# ۳) scrypt + aes-256-gcm (رمزگشایی معکیس با writeEncryptedEscrow)
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = hashlib.scrypt(mc.encode(), salt=salt, dklen=32, n=32768, r=8, p=1,
                         maxmem=128 * 1024 * 1024)
    blob = base64.b64decode(enc_b64)
    iv, tag, ct = blob[:12], blob[12:28], blob[28:]
    plaintext = AESGCM(key).decrypt(iv, ct + tag, None)
except Exception as e:
    sys.exit(f"FATAL: decrypt failed: {e}")

old = json.loads(plaintext)
print("OLD ESCROW KEYS (names only):", sorted(old.keys()))

# ۴) تزریق «فقط کلید غایب» به env.platform.json
envp_path = REPO / "env.platform.json"
envp = json.loads(envp_path.read_text())
RESTORE_KEYS = ["MELK_PUBLIC_BASE_URL", "MELK_PROXY_SECRET", "MELK_ARM_RELAY_MODE",
                "MELK_ARM_OFFLINE", "MELK_ARM_CIRCUIT_DISABLED", "MELK_RELAY_ALT_URL"]
added = []
for k in RESTORE_KEYS:
    if k in old and old[k] and k not in envp:
        envp[k] = old[k]
        added.append(k)
envp_path.write_text(json.dumps(envp, indent=2, ensure_ascii=False) + "\n")
print("INJECTED into env.platform.json:", added or "(none — all present)")

# ۵) شاهد (بدون مقدار راز)
for k in RESTORE_KEYS:
    v = envp.get(k)
    if v is None:
        print(f"  {k}: MISSING")
    else:
        print(f"  {k}: present ({len(str(v))} chars, fp={hashlib.sha256(str(v).encode()).hexdigest()[:8]})")

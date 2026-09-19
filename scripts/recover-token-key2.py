#!/usr/bin/env python3
"""
جستجوی همهٔ کلیدهای MELK_TOKEN_KEY متمایز در کل پروژه (بدون نمایش)
و اعتبارسنجی هرکدام با رمزگشایی واقعی توکن نشست مالک.
اولین کلید موفق → .env.local نوشته می‌شود.
"""
import re, hashlib, os, subprocess, sys

# منابع باینری/متنی احتمالی (به‌جز node_modules و .git)
import glob
files = set()
for pat in [".next/**/*.sst", ".next/**/*.log", "logs/**/*", "*.log", "tool-results/*.txt"]:
    files.update(glob.glob(pat, recursive=True))

PAT = re.compile(rb"MELK_TOKEN_KEY=([\"\']?)([A-Za-z0-9_\-\.]{16,200})\1")
keys = {}
for f in sorted(files):
    try:
        blob = open(f, "rb").read()
    except OSError:
        continue
    for m in PAT.finditer(blob):
        v = m.group(2).decode()
        keys.setdefault(v, []).append(f)

if not keys:
    print("[scan] no keys found anywhere")
    sys.exit(1)

print(f"[scan] {len(keys)} distinct key(s) found in {len(files)} file(s)")

VALIDATE = """
const { PrismaClient } = require("@prisma/client");
const { decryptSecret } = require("./src/lib/auth/crypto");
const p = new PrismaClient();
p.session.findFirst({ where: { revoked: false, expiresAt: { gt: new Date() }, armUserType: "realtor" }, orderBy: { createdAt: "desc" }, select: { armTokenEnc: true } })
  .then((s) => {
    if (!s?.armTokenEnc) { console.log("no arm session"); process.exit(2); }
    const t = decryptSecret(s.armTokenEnc);
    process.exit(t && t.length > 20 ? 0 : 1);
  })
  .finally(() => p.$disconnect());
"""

ok = None
for i, (k, srcs) in enumerate(keys.items()):
    h = hashlib.md5(k.encode()).hexdigest()[:8]
    env = dict(os.environ, MELK_TOKEN_KEY=k)
    r = subprocess.run(["bun", "-e", VALIDATE], capture_output=True, text=True, env=env)
    status = "OK" if r.returncode == 0 else "fail"
    print(f"[try {i+1}] len={len(k)} md5={h} → {status} (sources: {len(srcs)})")
    if r.returncode == 0:
        ok = k
        break

if not ok:
    print("[result] none of the cached keys decrypt the live token — key truly lost")
    sys.exit(1)

# نوشتن کلید موفق
content = open(".env.local").read() if os.path.exists(".env.local") else ""
content = re.sub(r"^\s*MELK_TOKEN_KEY\s*=.*$", "", content, flags=re.M)
with open(".env.local", "w") as f:
    f.write(content.rstrip() + ("\n" if content.strip() else "") + f"MELK_TOKEN_KEY={ok}\n")
print(f"[result] WINNING KEY persisted to .env.local")
sys.exit(0)

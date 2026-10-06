#!/usr/bin/env python3
"""
بازیابی MELK_TOKEN_KEY از کش turbopack دیمونِ قبلی (بدون نمایش مقدار).
خروجی: .env.local (gitignore شده) + گزارش فقط شامل طول و هش ۸ کاراکتری اول.
اعتبارسنجی: رمزگشایی موفق armTokenEnc نشست فعال مالک (AES-256-GCM auth tag).
"""
import re, hashlib, os, glob, subprocess, sys

CANDIDATES = glob.glob(".next/dev/cache/turbopack/**/*.sst", recursive=True)
PAT = re.compile(rb"MELK_TOKEN_KEY=([A-Za-z0-9_\-\.]{16,200})")

found = None
for f in CANDIDATES:
    try:
        blob = open(f, "rb").read()
    except OSError:
        continue
    for m in PAT.finditer(blob):
        v = m.group(1).decode()
        # نخستین مقدار معتبر
        found = v
        break
    if found:
        print(f"[recover] source: {f}")
        break

if not found:
    print("[recover] NOT FOUND in turbopack cache")
    sys.exit(1)

h = hashlib.md5(found.encode()).hexdigest()[:8]
print(f"[recover] key length={len(found)} md5prefix={h} (value not shown)")

# نوشتن .env.local فقط اگر MELK_TOKEN_KEY ندارد (هرگز بازنویسی نکن)
env_local = ".env.local"
content = open(env_local).read() if os.path.exists(env_local) else ""
if re.search(r"^\s*MELK_TOKEN_KEY\s*=", content, re.M):
    print("[recover] .env.local already has MELK_TOKEN_KEY — no write")
else:
    with open(env_local, "a") as f:
        if content and not content.endswith("\n"):
            f.write("\n")
        f.write(f"MELK_TOKEN_KEY={found}\n")
    print("[recover] .env.local written")

# اعتبارسنجی با رمزگشایی واقعی توکن نشست مالک (بدون چاپ توکن)
val = subprocess.run(
    ["bun", "-e", """
const { PrismaClient } = require("@prisma/client");
const { decryptSecret } = require("./src/lib/auth/crypto");
const p = new PrismaClient();
p.session.findFirst({ where: { revoked: false, expiresAt: { gt: new Date() }, armUserType: "realtor" }, orderBy: { createdAt: "desc" }, select: { armTokenEnc: true } })
  .then((s) => {
    if (!s?.armTokenEnc) { console.log("VALIDATE: no arm session"); process.exit(1); }
    const t = decryptSecret(s.armTokenEnc);
    console.log("VALIDATE:", t && t.length > 20 ? `DECRYPT_OK len=${t.length}` : "DECRYPT_FAIL");
    process.exit(t && t.length > 20 ? 0 : 1);
  })
  .finally(() => p.$disconnect());
"""],
    capture_output=True, text=True,
)
print(val.stdout.strip() or val.stderr.strip()[:200])
sys.exit(val.returncode)

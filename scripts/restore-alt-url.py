#!/usr/bin/env python3
"""بازیابی MELK_RELAY_ALT_URL (D-5 گارد PN-041-R) پس از گم‌شدن در ریست‌ها.
مقدار مرجع: از خود گارد audit-auth-resilience (بخش د-۵) — URL عمومی publish پلتفرم.
لایه‌ها: env.platform.json (منبع گارد و اپ) + دو escrow بوت + .env.local
"""
import json

ALT_URL = "https://c1vdh8442240-d.space-z.ai"
KEY = "MELK_RELAY_ALT_URL"

def upsert_json(path):
    try:
        with open(path) as f:
            d = json.load(f)
    except FileNotFoundError:
        print(f"  رد شد (موجود نیست): {path}")
        return
    if d.get(KEY) == ALT_URL:
        print(f"  از قبل درست: {path}")
        return
    d[KEY] = ALT_URL
    with open(path, "w") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  ✓ اضافه شد: {path}")

print("── بازیابی ALT_URL در لایه‌های env ──")
upsert_json("env.platform.json")
upsert_json("db/.runtime/boot-secrets.json")
upsert_json("upload/.runtime/boot-secrets.json")

print("── .env.local ──")
env_path = ".env.local"
try:
    with open(env_path) as f:
        content = f.read()
except FileNotFoundError:
    content = ""
if KEY in content:
    print("  از قبل موجود")
else:
    if content and not content.endswith("\n"):
        content += "\n"
    content += f"\n# D-5 بازیابی‌شده از گارد PN-041-R (URL publish پایدار)\n{KEY}=\"{ALT_URL}\"\n"
    with open(env_path, "w") as f:
        f.write(content)
    print("  ✓ اضافه شد")

print("── راستی‌آزمایی ──")
with open("env.platform.json") as f:
    d = json.load(f)
print(f"  env.platform.json[{KEY}] = {d.get(KEY)}")

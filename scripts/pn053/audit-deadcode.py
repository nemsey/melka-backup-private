#!/usr/bin/env python3
"""
PN-053 · گام ۱ — حسن فراژرف: کد مرده + پکیج‌های بلااستفاده + اسکریپت‌های یتیم
خروجی: download/PN-053/audit-deadcode.json + خلاصه در stdout
روش: بستار ارجاعی — ریشه‌های زنده (واچ‌داگ/بیلد/تست/رستاخیز/ورکر) → همهٔ
ارجاعات گذرا → هرچیز خارج از بستار = نامزد حذف.
"""
import os, re, json, subprocess

ROOT = "/home/z/my-project"
OUT = os.path.join(ROOT, "download/PN-053/audit-deadcode.json")

# ── ۱) ریشه‌های زندهٔ قطعی (زنجیرهٔ حیات — هرگز حذف نمی‌شوند) ──
ALIVE_ROOTS = [
    # PN-054 (دستور ۲): رجیستری ابزارهای دستی = ریشهٔ رسمی —
    # هر اسکریپتی که نامش در این فایل بیاید، از حذف‌های آینده مصون است.
    "scripts/CLI-REGISTRY.md",
    "scripts/prod-watchdog.sh", "scripts/start-prod.sh", "scripts/start-prod-daemon.py",
    "scripts/build-with-parking.sh", "scripts/park-deliver.sh", "scripts/fingerprint.ts",
    "scripts/log-rotate.sh", "scripts/ci.sh", "resurrect-ultimate.sh",
    "scripts/refresh-sync-tar.sh", "scripts/verify-deploy-freshness.sh",
    "scripts/verify-preview-version.sh", "scripts/perf-budget.sh", "scripts/regression-guard.sh",
    "scripts/resilient-test-runner.sh", "scripts/audit-disk-space.sh",
    "scripts/runtime/worker.ts", "scripts/pn005-rebuild-graphs.ts",
    # معماری PN-054 (دستور ۱): بدون قطعی
    "scripts/pn054/socket-master.py", "scripts/pn054/listen-patch.cjs",
    "scripts/pn054/deploy-zero-dt.sh", "scripts/pn054/test-zero-dt.sh",
    "scripts/pn054/trim-node-modules.sh", "scripts/pn054/closure.sh",
]
# پوشه‌های حیاتی به‌طور کامل زنده‌اند
ALIVE_DIRS = ["scripts/recovery", "scripts/mirror", "scripts/runtime", "scripts/pn012",
              "scripts/pn041", "scripts/pn048", "scripts/pn008", "scripts/pn053",
              "scripts/pn054", "scripts/pn078", "scripts/feature-factory"]

SCAN_DIRS = ["src", "tests", "scripts"]

def list_files(d, exts):
    out = []
    for base, _, files in os.walk(os.path.join(ROOT, d)):
        if "node_modules" in base or ".next" in base:
            continue
        for f in files:
            if f.endswith(exts):
                out.append(os.path.join(base, f))
    return out

EXTS = (".ts", ".tsx", ".js", ".mjs", ".py", ".sh", ".json", ".md", ".yml", ".yaml", ".toml")
# ریشه‌ها: کد اپ (src) + آزمون‌ها (tests) + کانفیگ‌های ریشه — نه کل scripts/
root_configs = [os.path.join(ROOT, f) for f in ("postcss.config.mjs", "eslint.config.mjs", "next.config.ts",
    "capacitor.config.ts", "tailwind.config.ts", "components.json", "tsconfig.json", "bunfig.toml",
    "package.json", "AGENTS.md", "start.sh", "Caddyfile") if os.path.isfile(os.path.join(ROOT, f))]
src_files = list_files("src", EXTS) + list_files("tests", EXTS)
extra_roots = (list_files(".zscripts", EXTS) + list_files(".github", EXTS)
               + root_configs
               + [os.path.join(ROOT, p) for p in ALIVE_ROOTS])

roots = set(src_files) | set(extra_roots)

def basename_refs(path):
    """نام فایل بدون پسوند و با پسوند — دو کلید ارجاع"""
    b = os.path.basename(path)
    return {b, os.path.splitext(b)[0], path.replace(ROOT + "/", "")}

def rel(path):
    return path.replace(ROOT + "/", "")

# بستار ارجاعی: هر فایل زنده متنش را می‌خوانیم و نام فایل‌های دیگر را در آن می‌جوییم
all_scripts = list_files("scripts", (".ts", ".py", ".sh", ".mjs"))
script_names = {}
for s in all_scripts:
    for k in basename_refs(s):
        script_names.setdefault(k, []).append(s)

alive = set()
queue = [r for r in roots if os.path.isfile(r)]
while queue:
    f = queue.pop()
    if f in alive or not os.path.isfile(f):
        continue
    alive.add(f)
    try:
        text = open(f, encoding="utf-8", errors="ignore").read()
    except Exception:
        continue
    for key, targets in script_names.items():
        if len(key) < 4:  # کلیدهای خیلی کوتاه نویز دارند
            continue
        if key in text:
            for t in targets:
                if t not in alive:
                    queue.append(t)

# اسکریپت‌های زندهٔ پوشه‌ای
for d in ALIVE_DIRS:
    dpath = os.path.join(ROOT, d)
    if os.path.isdir(dpath):
        for base, _, files in os.walk(dpath):
            for f in files:
                alive.add(os.path.join(base, f))

dead_scripts = [s for s in all_scripts if s not in alive]
dead_scripts.sort()

# ── ۲) پکیج‌های بلااستفاده ──
pkg = json.load(open(os.path.join(ROOT, "package.json")))
deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
used = {}
corpus = root_configs + root_configs  # کانفیگ‌ها دوبار نمی‌خواهیم — فقط برای corpus پایین
scan_corpus = []
for d in ("src", "tests", "scripts", ".zscripts"):
    scan_corpus += list_files(d, (".ts", ".tsx", ".js", ".mjs", ".py"))
corpus_text = {}
for f in scan_corpus + root_configs:
    try:
        corpus_text[f] = open(f, encoding="utf-8", errors="ignore").read()
    except Exception:
        pass
for dep in deps:
    # امضای import واقعی (نه ذکر در کامنت)
    pat = re.compile(r"""(?:from\s+|require\(\s*|import\(\s*|import\s+)["'](""" + re.escape(dep) + r""")(?:/|["'])""")
    hits = [f for f, t in corpus_text.items() if pat.search(t)]
    if not hits:
        used[dep] = "UNUSED"
    else:
        used[dep] = len(hits)

# ── ۳) حجم‌ها ──
def size_of(paths):
    total = 0
    for p in paths:
        try:
            total += os.path.getsize(os.path.join(ROOT, p))
        except Exception:
            pass
    return total

result = {
    "at": "2026-11-08T07:06:00Z",
    "deadScripts": {
        "count": len(dead_scripts),
        "bytes": size_of([rel(s) for s in dead_scripts]),
        "files": [rel(s) for s in dead_scripts],
    },
    "packages": used,
    "aliveScriptCount": len([s for s in all_scripts if s in alive]),
    "totalScriptCount": len(all_scripts),
}
json.dump(result, open(OUT, "w"), indent=2, ensure_ascii=False)
print(f"اسکریپت‌های مرده: {result['deadScripts']['count']} از {result['totalScriptCount']} ({result['deadScripts']['bytes']/1024:.0f} KB)")
print("پکیج‌های UNUSED:", [k for k, v in used.items() if v == "UNUSED"])
print(f"جزئیات: {OUT}")

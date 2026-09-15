#!/usr/bin/env python3
"""
P1-01c — پاکسازی importهای بی‌استفاده پس از مهاجرت DataSource (نسخه اصلاح‌شده)
پشتیبانی از «type X» و «X as Y» در فهرست نمادها.
"""

from pathlib import Path
import re

ROOT = Path("/home/z/my-project/src/core/tiles/tiles")
PAGES = [
    "transactions/TransactionsPage.tsx",
    "experts/ExpertsPage.tsx",
    "visits/VisitsPage.tsx",
    "supply-demand/SupplyDemandPage.tsx",
    "contracts/ContractsPage.tsx",
    "finance-commission/FinancePage.tsx",
    "price-index/PriceIndexPage.tsx",
    "customer-club/CustomerClubPage.tsx",
]


def body_usage(content: str, local_name: str) -> int:
    """شمارش استفاده نماد در بدنه (خود importها حذف شده‌اند)"""
    body = re.sub(r"^import\b[^;]*?;\s*$", "", content, flags=re.MULTILINE | re.DOTALL)
    return len(re.findall(rf"\b{re.escape(local_name)}\b", body))


def parse_symbol(raw: str) -> tuple[str, str, str]:
    """«type X» → (type , X, X) | «X as Y» → ('', X, Y) | «X» → ('', X, X)"""
    raw = raw.strip()
    m = re.match(r"^type\s+(\w+)$", raw)
    if m:
        return "type ", m.group(1), m.group(1)
    m = re.match(r"^(\w+)\s+as\s+(\w+)$", raw)
    if m:
        return "", m.group(1), m.group(2)
    return "", raw, raw


for page in PAGES:
    p = ROOT / page
    c = p.read_text()
    orig = c
    changed: list[str] = []

    # importهای تک‌خطی (شامل type/as) — چندخطی دست نمی‌خورند و بعداً دستی بررسی می‌شوند
    def prune(match: re.Match) -> str:
        syms_raw = match.group(1)
        module = match.group(2)
        kept: list[str] = []
        for raw in syms_raw.split(","):
            if not raw.strip():
                continue
            prefix, _exported, local = parse_symbol(raw)
            if body_usage(c, local) > 0:
                kept.append(f"{prefix}{local}" if prefix else raw.strip())
        if not kept:
            changed.append(f"حذف کامل import از {module}")
            return ""
        if len(kept) == len([s for s in syms_raw.split(",") if s.strip()]):
            return match.group(0)  # هیچ تغییری لازم نیست
        changed.append(f"پیرایش {module}: {', '.join(kept)}")
        return f'import {{ {", ".join(kept)} }} from "{module}";\n'

    c = re.sub(r'^import \{ ([^{}\n]+) \} from "([^"]+)";\n', prune, c, flags=re.MULTILINE)

    # importهای چندخطی lucide — حذف نمادهای بی‌استفاده از فهرست (تک‌خطی یا عمودی)
    def prune_multiline(match: re.Match) -> str:
        header, syms_raw, footer = match.group(1), match.group(2), match.group(3)
        # فهرست ممکن است تک‌خطی (درون آکولاد چندخطی) یا عمودی باشد
        flat = " ".join(s.strip() for s in syms_raw.split("\n") if s.strip())
        kept: list[str] = []
        for raw in [s.strip() for s in flat.split(",") if s.strip()]:
            raw_no_comma = raw.rstrip(",")
            prefix, _exported, local = parse_symbol(raw_no_comma)
            if body_usage(c, local) > 0:
                kept.append(raw)
        if not kept:
            changed.append("حذف کامل import چندخطی")
            return ""
        mod_m = re.search(r'from "([^"]+)"', footer)
        module = mod_m.group(1) if mod_m else ""
        joined = ", ".join(kept)
        if len(joined) + len(module) + 20 <= 120:
            changed.append("پیرایش import چندخطی (تک‌خطی)")
            return f'import {{ {joined} }} from "{module}";\n'
        changed.append("پیرایش import چندخطی (عمودی)")
        return header + "\n" + ",\n".join(f"  {k}" for k in kept) + ",\n" + footer

    c = re.sub(
        r'^(import \{)\n((?:\s+[^{}\n]+,?\n)+)(\s*\} from "[^"]+";\n)',
        prune_multiline,
        c,
        flags=re.MULTILINE,
    )

    if c != orig:
        p.write_text(c)
        for ch in changed:
            print(f"  ✓ {page}: {ch}")
    else:
        print(f"  · {page}: بدون تغییر")

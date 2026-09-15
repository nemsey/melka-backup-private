#!/usr/bin/env python3
"""
جاروی هماهنگ‌سازی رنگی «فیروزه تبریز» — نسخه ۱٫۷٫۰
----------------------------------------------------
همه کاربردهای emerald-* را در کامپوننت‌های صفحه به teal-* منتقل می‌کند
تا کل اپ با پالت فیروزه‌ای جدید هماهنگ شود.

استثناها (دست‌نخورده می‌مانند):
  - ConnectionIndicators.tsx  → چراغ سبز اتصال، رنگ معنایی است (سبز=برقرار)
  - TileCard.tsx / DashboardHome.tsx / AppHeader.tsx / TileShell.tsx /
    AgentPanel.tsx / ManagementDashboardPage.tsx → قبلاً بازطراحی شده‌اند
  - فایل‌های index.ts کاشی‌ها → کلید accent («emerald») نقش معنایی دارد
    (فقط رشته‌های «emerald-» با خط تیره جایگزین می‌شوند، نه «emerald» خالی)
"""

from pathlib import Path

ROOT = Path("/home/z/my-project/src")

EXCLUDE = {
    ROOT / "components/app/ConnectionIndicators.tsx",
    ROOT / "components/app/TileCard.tsx",
    ROOT / "components/app/DashboardHome.tsx",
    ROOT / "components/app/AppHeader.tsx",
    ROOT / "components/app/TileShell.tsx",
    ROOT / "components/app/AgentPanel.tsx",
    ROOT / "core/tiles/tiles/management-dashboard/ManagementDashboardPage.tsx",
}

changed = []
for p in ROOT.rglob("*.tsx"):
    if p in EXCLUDE:
        continue
    text = p.read_text(encoding="utf-8")
    n = text.count("emerald-")
    if n == 0:
        continue
    new = text.replace("emerald-", "teal-")
    p.write_text(new, encoding="utf-8")
    rel = p.relative_to(ROOT)
    changed.append((str(rel), n))

total = sum(n for _, n in changed)
print(f"فایل‌های تغییر یافته: {len(changed)} — مجموع جایگزینی: {total}")
for rel, n in sorted(changed, key=lambda x: -x[1]):
    print(f"  {n:3d} × {rel}")

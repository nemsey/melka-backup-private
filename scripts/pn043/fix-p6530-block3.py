#!/usr/bin/env python3
"""PN-043/فاز ۵ — rewrite test ۰-۳ in p6530-architecture-guards.test.ts
(management-dashboard container assertion → tenant-dashboards container reality)."""
import re

P = "tests/p6530-architecture-guards.test.ts"
with open(P, encoding="utf-8") as f:
    lines = f.readlines()

# find the ۰-۳ test block: comment line above + test through its closing "  });"
start = next(i for i, l in enumerate(lines) if "۰-۳) داشبورد مدیریتی" in l)
# back up to the comment line above the test
if start > 0 and "P6545/گام۲" in lines[start - 1]:
    start -= 1
# forward to the end of the test block (first line that is exactly "  });" after start)
end = next(i for i in range(start, len(lines)) if lines[i].rstrip() == "  });")

new_block = '''  // PN-043/فاز ۲ (شورا-ن۰۸۷): داشبوردهای tenant — M1-M4 درون ظرف مشترک tenant-dashboards
  test("۰-۳) ظرف tenant-dashboards — چهار کاشی M1-M4 درون داشبوردهای tenant (wrapper)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    // PN-043: M1-M4 با container="tenant-dashboards" — رندر مشترک درون دو داشبورد (wrapper، نه تکرار)
    const children = tileRegistry.listChildren("tenant-dashboards", "OWNER");
    expect(children.map((t) => t.title)).toEqual(["آگهی", "درخواست", "معاملات", "کارشناسان"]);
    const roots = tileRegistry.listRoot("OWNER");
    expect(roots.map((t) => t.id)).toEqual([
      "file-finder", "smart-matching", "learning-tier", "settings", "tenant-dashboard-tabriz", "tenant-dashboard-melketun",
    ]);
    expect(roots.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });
'''

lines[start:end + 1] = [new_block]
with open(P, "w", encoding="utf-8") as f:
    f.writelines(lines)
print(f"OK — block {start}..{end} replaced with tenant-dashboards assertion")

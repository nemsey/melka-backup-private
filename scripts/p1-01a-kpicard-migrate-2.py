#!/usr/bin/env python3
"""
P1-01a (بخش ۲) — مهاجرت شش صفحه سبک آرایه‌ای به KpiCard
------------------------------------------------------
Visits / SupplyDemand / Finance / PriceIndex / Contracts / CustomerClub
"""

from pathlib import Path

ROOT = Path("/home/z/my-project/src/core/tiles/tiles")

SKELETON = '<span className="inline-block h-6 w-14 animate-pulse rounded-md bg-accent align-middle" aria-hidden />'


def add_import(content: str, import_line: str) -> str:
    if import_line in content:
        return content
    anchor = 'import { AgentPanel } from "@/components/app/AgentPanel";'
    assert anchor in content, "آنگر import ایجنت پیدا نشد"
    return content.replace(anchor, anchor + "\n" + import_line, 1)


def patch(path: Path, old: str, new: str, import_line: str = 'import { KpiCard } from "@/components/app/shared";') -> None:
    content = path.read_text()
    n = content.count(old)
    if n != 1:
        print(f"  ✗ {path.name}: الگو {n} بار (انتظار ۱)")
        return
    content = content.replace(old, new, 1)
    content = add_import(content, import_line)
    path.write_text(content)
    print(f"  ✓ {path.name}")


# ===================== بلوک مشترک Finance / CustomerClub / Contracts (text-lg + truncate + مقدار خام) =====================
BLOCK_LG = f"""        ].map((kpi) => (
          <Card key={{kpi.label}} className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <span className={{`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${{kpi.tone}}`}}>
                <kpi.icon className="w-5 h-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{{kpi.label}}</p>
                <p className="text-lg font-extrabold tabular-nums truncate">
                  {{kpi.value === undefined ? {SKELETON} : kpi.value}}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}}"""

NEW_LG = """        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
            valueClassName="text-lg font-extrabold tabular-nums truncate"
          />
        ))}"""

for name in ["finance-commission/FinancePage.tsx", "customer-club/CustomerClubPage.tsx", "contracts/ContractsPage.tsx"]:
    patch(ROOT / name, BLOCK_LG, NEW_LG)

# ===================== PriceIndex (text-lg + truncate + sub) =====================
BLOCK_PI = f"""        ].map((kpi) => (
          <Card key={{kpi.label}} className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <span className={{`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${{kpi.tone}}`}}>
                <kpi.icon className="w-5 h-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{{kpi.label}}</p>
                <p className="text-lg font-extrabold tabular-nums truncate">
                  {{kpi.value === undefined ? (
                    {SKELETON}
                  ) : (
                    kpi.value
                  )}}
                </p>
                {{kpi.value !== undefined && kpi.sub && <p className="text-[10px] text-muted-foreground">{{kpi.sub}}</p>}}
              </div>
            </CardContent>
          </Card>
        ))}}"""

NEW_PI = """        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
            valueClassName="text-lg font-extrabold tabular-nums truncate"
            sub={kpi.sub}
          />
        ))}"""

patch(ROOT / "price-index/PriceIndexPage.tsx", BLOCK_PI, NEW_PI)

# ===================== Visits (text-xl + faNumber — فرمت چندخطی) =====================
BLOCK_VI = f"""        ].map((kpi) => (
          <Card key={{kpi.label}} className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <span className={{`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${{kpi.tone}}`}}>
                <kpi.icon className="w-5 h-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{{kpi.label}}</p>
                <p className="text-xl font-extrabold tabular-nums">
                  {{kpi.value === undefined ? (
                    {SKELETON}
                  ) : (
                    faNumber(kpi.value)
                  )}}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}}"""

NEW_VI = """        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value === undefined ? undefined : faNumber(kpi.value)}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
          />
        ))}"""

patch(ROOT / "visits/VisitsPage.tsx", BLOCK_VI, NEW_VI)

# ===================== SupplyDemand (text-xl + مقدار خام — فرمت چندخطی) =====================
BLOCK_SD = f"""        ].map((kpi) => (
          <Card key={{kpi.label}} className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <span className={{`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${{kpi.tone}}`}}>
                <kpi.icon className="w-5 h-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{{kpi.label}}</p>
                <p className="text-xl font-extrabold tabular-nums">
                  {{kpi.value === undefined ? (
                    {SKELETON}
                  ) : (
                    kpi.value
                  )}}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}}"""

NEW_SD = """        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
          />
        ))}"""

patch(ROOT / "supply-demand/SupplyDemandPage.tsx", BLOCK_SD, NEW_SD)

print("تمام — شش صفحه سبک آرایه‌ای مهاجرت یافتند")

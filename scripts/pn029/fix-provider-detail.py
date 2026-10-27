#!/usr/bin/env python3
# اصلاح پرانتزهای نامتوازن جزئیات فیوز در provider.ts
import io, re

P = "/home/z/my-project/src/lib/melk-api/provider.ts"
src = io.open(P, encoding="utf-8").read()

# الگوی خراب: detail: probe.circuitLocked ? probe.circuitDetail! : (probe.offlineMode ? "..." : (dbUp ? A : B"),
pat = re.compile(
    r'detail: probe\.circuitLocked \? probe\.circuitDetail! : \(probe\.offlineMode \? "حالت آفلینی — پروب متوقف" : \(dbUp \? ("(?:[^"\\]|\\.)*") : ("(?:[^"\\]|\\.)*")\),'
)

def fix(m):
    a, b = m.group(1), m.group(2)
    return (
        'detail: probe.circuitLocked ? (probe.circuitDetail ?? "قفل فیوز فعال است — تلاش بعدی پس از پایان مهلت") '
        ': probe.offlineMode ? "حالت آفلینی — پروب متوقف (PN-029)" '
        f': dbUp ? {a} : {b},'
    )

src2, n = pat.subn(fix, src)
assert n == 4, f"expected 4 fixes, got {n}"
io.open(P, "w", encoding="utf-8").write(src2)
print(f"fixed {n} lines")

#!/usr/bin/env python3
"""Extract entity/API resource names & template-literal endpoint patterns from arm bundle."""
import re

js = open('/tmp/arm-bundle.js', encoding='utf-8', errors='replace').read()

# Template literals that look like API paths
print("=== template-literal API paths ===")
tl = set()
for m in re.finditer(r'`([a-z][a-zA-Z0-9-]*(?:/[a-zA-Z0-9${}._/-]+)+)`', js):
    p = m.group(1)
    if any(k in p for k in ['http', 'assets', '.png', '.css', '.js', 'data:image']):
        continue
    if len(p) < 80:
        tl.add(p)
for p in sorted(tl):
    print(p)

print("\n=== string concat paths (a+\"/b\") ===")
cc = set()
for m in re.finditer(r'[a-zA-Z0-9_$)\]]\s*\+\s*"/([a-zA-Z0-9/_-]{3,50})"', js):
    cc.add('/' + m.group(1))
for p in sorted(cc):
    print(p)

print("\n=== quoted strings with dash (resource names) ===")
rs = set()
for m in re.finditer(r'"([a-z][a-z]+(?:-[a-z]+){1,3})"', js):
    p = m.group(1)
    if len(p) < 30 and p not in ('content-type',):
        rs.add(p)
for p in sorted(rs):
    print(p)

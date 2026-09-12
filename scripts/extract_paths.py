#!/usr/bin/env python3
"""Extract API endpoint path strings from the arm bundle JS."""
import re

js = open('/tmp/arm-bundle.js', encoding='utf-8', errors='replace').read()

paths = set()
# path strings like "authentication/refresh-token"
for m in re.finditer(r'"([a-z][a-zA-Z0-9]+(?:/[a-zA-Z0-9${}._-]+)+)"', js):
    p = m.group(1)
    if any(k in p for k in ['api/', 'http', 'assets/', 'src/', 'node_']):
        continue
    if len(p) < 70 and not p.endswith(('.js', '.css', '.png', '.svg', '.woff2', '.jpg')):
        paths.add(p)

for p in sorted(paths):
    print(p)

#!/usr/bin/env python3
"""Find all fn("path") call patterns with API-like string args, plus queryFn bodies."""
import re

js = open('/tmp/arm-bundle.js', encoding='utf-8', errors='replace').read()

SKIP = {'Content-Type', 'application/json', 'text/plain', 'multipart/form-data',
        'application/x-www-form-urlencoded', 'Content-Disposition', 'form-data'}

print("=== fn("path") candidates ===")
res = set()
for m in re.finditer(r'([A-Za-z_$][A-Za-z0-9_$]{0,25})\("([a-z][a-zA-Z0-9]+(?:[-/][a-zA-Z0-9${}._?&=-]+){1,6})"\s*[),]', js):
    fn, p = m.group(1), m.group(2)
    if p in SKIP or any(p.startswith(k) for k in ('data:image', 'http', 'www')):
        continue
    if any(k in p for k in ('.css', '.png', '.js', '.svg', '.woff', 'rgb(', '#')):
        continue
    # keep plausible API paths only
    if re.match(r'^[a-z][a-zA-Z0-9-]+(/[a-zA-Z0-9${}._?&=-]+)+$', p):
        res.add(f'{fn}("{p}")')
for r in sorted(res):
    print(r)

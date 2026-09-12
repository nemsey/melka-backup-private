#!/usr/bin/env python3
"""Extract API base URLs and endpoints from pm bundle."""
import re

js = open('/tmp/pm-bundle.js', encoding='utf-8', errors='replace').read()

print("=== hardcoded URLs ===")
for m in re.finditer(r'https?://[a-zA-Z0-9./_-]{6,60}', js):
    u = m.group(0)
    if any(k in u for k in ('w3.org', 'schema', 'react.dev', 'github', 'npmjs', 'mozilla', 'fb.me', 'gsap', 'radix', 'clarity', 'linkedin', 'vercel', 'apache', 'localhost', 'obizim')):
        continue
    print(u)

print("\n=== axios baseURL vars ===")
for m in re.finditer(r'baseURL\s*[:=]\s*[^,;{}]{1,90}', js):
    print(m.group(0)[:100])

print("\n=== endpoint-like quoted paths ===")
paths = set()
for m in re.finditer(r'"((?:api/)?[a-z][a-zA-Z0-9]+(?:/[a-zA-Z0-9${}._?&=-]+){1,6})"', js):
    p = m.group(1)
    if any(k in p for k in ('.css', '.png', '.js', '.svg', '.woff', 'assets/', 'application/', 'text/')):
        continue
    paths.add(p)
for p in sorted(paths):
    if p.count('/') >= 1 and len(p) < 70:
        print(p)

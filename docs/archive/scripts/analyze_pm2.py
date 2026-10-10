#!/usr/bin/env python3
"""Find pm login mutation details: login, sendCode, verification flows."""
import re

js = open('/tmp/pm-bundle.js', encoding='utf-8', errors='replace').read()

# Find login page component & its API calls around "login" path strings (not routes)
print("=== login API call contexts ===")
for m in re.finditer(r'(?<![a-zA-Z])/login"', js):
    seg = js[max(0, m.start()-500):m.start()+300]
    if 'mutat' in seg or 'post' in seg.lower() or 'axios' in seg.lower() or 'data:' in seg:
        print(seg.replace('\n', ' ')[:700])
        print('...')
        print()
        break

# sendCode page
print("=== sendCode context ===")
i = js.find('"sendCode"')
print(js[i-300:i+300])

# search for 'authentication/' paths in pm
print("\n=== authentication paths ===")
for m in re.finditer(r'"(authentication/[a-zA-Z-]+)"', js):
    print(m.group(1))

# find personalCode / personnel strings
print("\n=== personnel-related ===")
for pat in ['personalCode', 'personnelCode', 'nationalCode', 'verificationCode']:
    hits = [m.start() for m in re.finditer(pat, js)]
    print(pat, len(hits))

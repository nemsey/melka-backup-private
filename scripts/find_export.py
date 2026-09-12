#!/usr/bin/env python3
"""Find export name of Qn and its call sites with literal URL strings."""
import re

js = open('/tmp/arm-bundle.js', encoding='utf-8', errors='replace').read()

# Find exports of Qn
print("=== exports containing Qn ===")
for m in re.finditer(r'Qn\s+as\s+([A-Za-z0-9_$]+)', js):
    print('Qn as', m.group(1))

# find import/export alias like {Qn as X}
for m in re.finditer(r'([A-Za-z0-9_$]+)\s+as\s+Qn\b', js):
    print(m.group(1), 'as Qn')

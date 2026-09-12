#!/usr/bin/env python3
"""Find which endpoints use the public API base (JG) in arm bundle."""
import re

js = open('/tmp/arm-bundle.js', encoding='utf-8', errors='replace').read()

# public:true option near a path string
print("=== public:true calls ===")
for m in re.finditer(r'Qn\(\s*"([^"]{3,60})"\s*,\s*\{[^}]{0,180}public\s*:\s*!0', js):
    print('PUBLIC:', m.group(1))

# broader: any {public:!0} then path within window
print("\n=== windows containing public:!0 ===")
for m in re.finditer(r'public\s*:\s*!0', js):
    seg = js[max(0, m.start()-400):m.start()+120]
    paths = re.findall(r'"([a-zA-Z][a-zA-Z0-9-]*(?:/[a-zA-Z0-9${}._-]+)+)"', seg)
    if paths:
        print('paths near public flag:', set(paths))

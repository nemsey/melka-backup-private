#!/usr/bin/env python3
"""Deeper analysis of pm bundle: auth flow + all fetch/axios calls."""
import re

js = open('/tmp/pm-bundle.js', encoding='utf-8', errors='replace').read()

# Find the axios instance / request helper with baseURL pm-api
i = js.find('pm-api.melketabriz.ir/api/')
print("=== pm-api instance context ===")
print(js[i-600:i+900])
print()

# search login-related strings
print("=== auth-related Persian strings ===")
for pat in ['رمز', 'کد پرسنلی', 'نام کاربری', 'ورود', 'پیامک']:
    for m in list(re.finditer(pat, js))[:4]:
        seg = js[max(0, m.start()-120):m.start()+120].replace('\n', ' ')
        print(f'[{pat}]', seg[:240])
        print()

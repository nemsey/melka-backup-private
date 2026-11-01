#!/usr/bin/env python3
"""Analyze the OTP login flow in the arm main bundle."""
import re

js = open('/tmp/arm-bundle.js', encoding='utf-8', errors='replace').read()

# Find login mutation usage — search around "authentication/otp"
for key in ['authentication/otp"', 'authentication/otp/login', 'authentication/login"']:
    print('#### context for', key)
    for m in re.finditer(re.escape(key), js):
        seg = js[max(0, m.start()-700):m.start()+400]
        # only print segments mentioning mutation/post
        if 'mutation' in seg or '.post' in seg or 'method' in seg:
            print(seg)
            print('...' * 20)
    print()

#!/usr/bin/env python3
s = open('tests/pn041r-auth-resilience.test.ts', encoding='utf-8').read()
BS = chr(92)
a = 'BODY="{' + BS*4 + '"wait' + BS*4 + '":100'
print("D-2 (4bs):", a in s)
b = "expect(script).toContain('" + BS*2 + '"wait' + BS*2 + '":100' + "')"
print("D-5 (2bs):", b in s)
print("G-4 100s:", "Poll طولانی: ۱۰۰ ثانیه" in s)

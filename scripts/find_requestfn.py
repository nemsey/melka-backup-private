#!/usr/bin/env python3
"""Find the request service function and its call sites with URL arguments."""
import re

js = open('/tmp/arm-bundle.js', encoding='utf-8', errors='replace').read()

# Locate the core request function (contains baseURL selection logic h4)
i = js.find('authentication/refresh-token')
# Walk back to find the function start: search for 'async' or '=>' before
start = js.rfind('=', 0, i-3000)
# Instead print a wide window before refresh-token call
print("=== REQUEST FN CONTEXT (wide) ===")
print(js[i-2500:i+800])

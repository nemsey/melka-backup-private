#!/usr/bin/env python3
"""Extract API calls with params from all arm chunks."""
import re

FILES = [
    'users-list-page-DvMNADhz.js',
    'RealtorPropertyStatisticsPage-0_UTk6Nq.js',
    'RealtorRequestStatisticsPage-6Rv9TgEr.js',
    'customer-club-page-CEcC5FrU.js',
    'realtor-interactions-page-BaAOESpk.js',
    'TradedStatisticsPage-Biq3JFyx.js',
]
BASE = '/tmp/arm-chunks/'

for f in FILES:
    js = open(BASE + f, encoding='utf-8').read()
    print('=====', f, '=====')
    for m in re.finditer(r'\w\("([a-zA-Z][a-zA-Z0-9-]*(?:/[a-zA-Z0-9${}?&=._-]+)+)"\s*,\s*\{', js):
        p = m.group(1)
        if p in ('text-input', 'getter-select-field'):
            continue
        seg = js[m.start():m.start()+400]
        pm = re.search(r'params\s*:\s*\{([^}]{0,250})\}', seg)
        mm = re.search(r'method\s*:\s*"([A-Z]+)"', seg)
        print('PATH:', p, '| method:', mm.group(1) if mm else 'GET')
        if pm:
            print('   params:', pm.group(1)[:250])
    print()

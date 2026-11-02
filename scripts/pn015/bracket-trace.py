#!/usr/bin/env python3
# Find the '[' that the corrupted ']' on line 173 pairs with
src = open('/home/z/my-project/src/instrumentation.ts', encoding='utf-8').read()
stack = []
in_str = None
escape = False
in_comment = None
i = 0
line = 1
opens = {'(': ')', '[': ']', '{': '}'}
while i < len(src):
    c = src[i]
    if c == '\n':
        line += 1
        if in_comment == 'line':
            in_comment = None
    if in_comment == 'line':
        i += 1
        continue
    if in_comment == 'block':
        if src.startswith('*/', i):
            in_comment = None
            i += 2
            continue
        i += 1
        continue
    if in_str:
        if escape:
            escape = False
        elif c == '\\':
            escape = True
        elif c == in_str:
            in_str = None
        i += 1
        continue
    if src.startswith('//', i) and in_str is None:
        in_comment = 'line'
        i += 2
        continue
    if src.startswith('/*', i) and in_str is None:
        in_comment = 'block'
        i += 2
        continue
    if c in ('"', "'", '`') and in_str is None:
        in_str = c
        i += 1
        continue
    if c in opens:
        stack.append((c, line))
    elif c in (')', ']', '}'):
        o = stack.pop() if stack else ('<empty>', -1)
        if 'ookPath' in src[max(0, i - 60):i]:
            print(f'our {c!r} at line {line} pairs with {o}')
    i += 1
print('unclosed opens (last 3):', stack[-3:])

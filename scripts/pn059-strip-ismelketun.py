#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN-059 — حذف کامل شاخه‌های isMelketun از صفحات کاشی (فاز ۱)
پارسر متوازن: هر عبارت `isMelketun ? A : B` → `B`؛ هر `{isMelketun && (...)}` → حذف؛
هر `{!isMelketun && (...)}` → محتوا. شاخهٔ تبریز (else) همیشه زنده می‌ماند.
"""
import sys

PAIRS = {"(": ")", "[": "]", "{": "}"}


def find_balanced(s: str, start: int, stops: str) -> tuple[int, int]:
    """از start (باید روی آغازگر یا کاراکتر معمولی باشد) تا نقطهٔ توقف در عمق صفر.
    بازگشت: (end_index_exclusive, depth_ok)."""
    depth = 0
    i = start
    n = len(s)
    while i < n:
        c = s[i]
        if c in PAIRS:
            depth += 1
        elif c in PAIRS.values():
            depth -= 1
            if depth == 0 and (i + 1 >= n or s[i + 1] in stops or s[i + 1] == " " or True):
                # پس از بسته‌شدن سطح صفر، ادامه می‌دهیم تا stop واقعی در عمق صفر
                pass
        elif depth == 0 and c in stops:
            return i, depth
        elif depth == 0 and c in ";":
            return i, depth
        i += 1
    return n, depth


def skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t\n\r":
        i += 1
    return i


def parse_expr_until(s: str, i: int, terminators: str) -> tuple[int, str]:
    """عبارت از i تا اولین terminator در عمق صفر ( terminator مصرف نمی‌شود )."""
    depth = 0
    start = i
    n = len(s)
    while i < n:
        c = s[i]
        if c in PAIRS:
            depth += 1
        elif c in PAIRS.values():
            depth -= 1
        elif depth == 0 and c in terminators:
            break
        i += 1
    return i, s[start:i]


def replace_isMelketun(src: str) -> str:
    out = src
    # ── حلقه تا زمانی که هیچ isMelketun باقی نماند (حداکثر ۳۰۰۰ دور) ──
    for _ in range(3000):
        idx = out.find("isMelketun")
        if idx < 0:
            break
        # زمینه: آیا با ! شروع شده؟
        bang = idx > 0 and out[idx - 1] == "!"

        # ── الگوی ternary: isMelketun ? A : B ──
        j = skip_ws(out, idx + len("isMelketun"))
        if j < len(out) and out[j] == "?":
            # A: از بعد از ?
            k = skip_ws(out, j + 1)
            end_a, a = parse_expr_until(out, k, ":")
            # B: از بعد از :
            m = skip_ws(out, end_a + 1)
            end_b, b = parse_expr_until(out, m, ",)}];\n")
            # اگر b تهی است (مثلاً newline نیامده)، دوباره تا }
            if not b.strip():
                end_b, b = parse_expr_until(out, m, "}")
            # جایگزینی کل عبارت با B
            expr_start = idx - 1 if bang else idx
            out = out[:expr_start] + b + out[end_b:]
            continue

        # ── الگوی logical: isMelketun && (...) یا !isMelketun && (...) ──
        if j < len(out) and out[j:j + 2] == "&&":
            k = skip_ws(out, j + 2)
            if k < len(out) and out[k] == "(":
                # یافتن ) متوازن
                depth = 0
                i = k
                while i < len(out):
                    if out[i] == "(":
                        depth += 1
                    elif out[i] == ")":
                        depth -= 1
                        if depth == 0:
                            break
                    i += 1
                inner = out[k + 1:i]
                expr_start = idx - 1 if bang else idx
                if bang:
                    # !isMelketun && (...) → محتوا
                    out = out[:expr_start] + "(" + inner + ")" + out[i + 1:]
                else:
                    # isMelketun && (...) → حذف کل عبارت (+ کاما/ژنریک قبلی اگر `X, ` بود — دست نمی‌زنیم)
                    out = out[:expr_start] + out[i + 1:]
                continue

        # الگوی مقایسهٔ خام: isMelketun === true و مانند آن — نباید باقی بماند
        print(f"WARN: unresolved pattern at {idx}: {out[idx-40:idx+60]!r}", file=sys.stderr)
        break
    return out


def clean_file(path: str):
    src = open(path).read()
    before = src.count("isMelketun")
    res = replace_isMelketun(src)
    after = res.count("isMelketun")
    open(path, "w").write(res)
    print(f"{path}: {before} → {after} occurrences")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        clean_file(p)

#!/usr/bin/env python3
"""
PN-006 BLOCK 2 — پیک‌سنج درختی Build
مصرف RAM کل درخت فرایند build (مجموع RSS همهٔ فرزندان) را هر ۱ ثانیه نمونه‌برداری می‌کند.
استفاده: tree-peak.py <root_pid> <out.json> [--label LABEL]
خروج: با مرگ ریشه یا سیگنال TERM/INT (نتیجه در هر حال نوشته می‌شود).
"""
import json, os, signal, sys, time, datetime

root = int(sys.argv[1])
out = sys.argv[2]
label = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--label" else ""

peak_kb, peak_n, peak_top, t0, samples = 0, 0, None, time.time(), []

STOP = {"flag": False}
def _flush(signum=None, frame=None):
    STOP["flag"] = True
signal.signal(signal.SIGTERM, _flush)
signal.signal(signal.SIGINT, _flush)


def snapshot():
    """مجموع RSS (KB) درخت فرایند از ریشه + فهرست پرحافظه‌ترین‌ها"""
    procs = {}  # pid -> (ppid, rss_kb, cmd)
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/stat") as f:
                parts = f.read().rsplit(") ", 1)[1].split()
            ppid = int(parts[1])
            with open(f"/proc/{pid}/statm") as f:
                rss_kb = int(f.read().split()[1]) * 4  # pages → KB
            try:
                with open(f"/proc/{pid}/cmdline", "rb") as f:
                    cmd = f.read().replace(b"\0", b" ").decode("utf-8", "replace")[:90]
            except Exception:
                cmd = ""
            procs[int(pid)] = (ppid, rss_kb, cmd)
        except Exception:
            continue
    # فرزندان + خود ریشه (پیمایش با والد)
    tree, stack = {root}, [root]
    while stack:
        cur = stack.pop()
        for pid, (ppid, rss, cmd) in procs.items():
            if ppid == cur and pid not in tree:
                tree.add(pid)
                stack.append(pid)
    total_kb = sum(procs[p][1] for p in tree if p in procs)
    top = sorted(((procs[p][1], p, procs[p][2]) for p in tree if p in procs), reverse=True)[:5]
    return total_kb, len(tree), top


def write_result():
    result = {
        "label": label,
        "rootPid": root,
        "peakMB": round(peak_kb / 1024, 1),
        "peakProcesses": peak_n,
        "peakTop": [{"pid": p, "rssMB": round(r / 1024, 1), "cmd": c} for r, p, c in peak_top] if peak_top else [],
        "durationSec": round(time.time() - t0, 1),
        "timeline": samples[::5],  # هر ۵ ثانیه یک نقطه برای فشرده‌سازی
        "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    with open(out, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps({"peakMB": result["peakMB"], "durationSec": result["durationSec"],
                      "peakProcesses": peak_n}), flush=True)


while not STOP["flag"]:
    try:
        os.kill(root, 0)  # ریشه زنده است؟ (زامبی هم شمرده می‌شود — خروج با سیگنال)
    except ProcessLookupError:
        break
    total_kb, n, top = snapshot()
    if total_kb > peak_kb:
        peak_kb, peak_n, peak_top = total_kb, n, top
    samples.append({"t": round(time.time() - t0, 1), "mb": round(total_kb / 1024, 1)})
    time.sleep(1)

write_result()

#!/usr/bin/env python3
"""
PN-004 Phase 0-A — سنجه‌برداری منابع (فقط خواندنی، صفر تغییر سورس)
Subcommands:
  sys   <out.json> <name>              — snapshot کامل سیستم (جدول ۲)
  http  <out.json> <name> <m> <url> [body] — سناریوی HTTP + نمونه‌برداری RSS سرور
  par   <out.json> <name> <n> <url>    — n درخواست موازی (سناریو L)
  cmd   <out.json> <name> -- <cmd...>  — اجرای فرمان + پایش درخت پروسه (G/H/I)
  alloc <out.json>                     — آزمون تخصیص تدریجی RAM تا مرز OOM
  cputest <out.json> <workers> <secs>  — آزمون بار CPU با N کارگر
"""
import json, os, subprocess, sys, threading, time, urllib.request, urllib.error

PROC = "/proc"
CLK_TCK = os.sysconf("SC_CLK_TCK")

# ---------- helpers ----------
def _read(path):
    try:
        with open(path) as f:
            return f.read()
    except Exception:
        return None

def meminfo():
    txt = _read(f"{PROC}/meminfo") or ""
    out = {}
    for line in txt.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            out[parts[0].rstrip(":")] = int(parts[1])  # kB
    return out

def free_mb():
    mi = meminfo()
    return round(mi.get("MemAvailable", 0) / 1024, 1)

def pid_comm(pid):
    c = _read(f"{PROC}/{pid}/comm")
    return c.strip() if c else None

def pid_status(pid):
    txt = _read(f"{PROC}/{pid}/status") or ""
    for line in txt.splitlines():
        if line.startswith("VmRSS:"):
            return round(int(line.split()[1]) / 1024, 1)  # MB
    return None

def find_pids(prefix):
    res = []
    for d in os.listdir(PROC):
        if d.isdigit():
            c = pid_comm(d)
            if c and c.startswith(prefix):
                res.append(int(d))
    return res

def next_server_rss():
    """مجموع RSS پروسه‌های next-server (سرور اپ)"""
    tot = 0.0
    for p in find_pids("next-server"):
        r = pid_status(str(p))
        if r:
            tot += r
    return round(tot, 1)

def all_procs():
    """جدول تمام پروسه‌ها: pid, rss_mb, comm, ppid"""
    procs = []
    for d in sorted(os.listdir(PROC)):
        if not d.isdigit():
            continue
        rss = pid_status(d)
        if rss is None:
            continue
        txt = _read(f"{PROC}/{d}/stat")
        ppid = None
        try:
            rest = txt[txt.rindex(")") + 2:].split()
            ppid = int(rest[1])
        except Exception:
            pass
        procs.append({"pid": int(d), "rss_mb": rss, "comm": (pid_comm(d) or "?")[:40], "ppid": ppid})
    return procs

def stat_cpu():
    """(busy_ticks, idle_ticks) از خط cpu در /proc/stat — idle شامل iowait حذف می‌شود"""
    for line in (_read(f"{PROC}/stat") or "").splitlines():
        if line.startswith("cpu "):
            v = [int(x) for x in line.split()[1:]]
            idle = v[3] + (v[4] if len(v) > 4 else 0)  # idle + iowait
            return sum(v) - idle, idle
    return 0, 0

NCORES = os.cpu_count() or 2

def db_openers():
    """تعداد FD های باز روی فایل‌های *.db (اتصال‌های SQLite)"""
    n = 0
    import glob
    for fd in glob.glob(f"{PROC}/[0-9]*/fd/*"):
        try:
            tgt = os.readlink(fd)
            if tgt.endswith(".db"):
                n += 1
        except Exception:
            pass
    return n

def dmesg_oom(last=12):
    try:
        out = subprocess.run(["dmesg"], capture_output=True, text=True, timeout=15)
        lines = [l for l in out.stdout.splitlines()
                 if "Out of memory" in l or "oom-killer" in l or "Killed process" in l]
        return lines[-last:]
    except Exception:
        return None

def loadavg():
    la = _read(f"{PROC}/loadavg")
    return la.strip() if la else None

def cgroup_limits():
    return {
        "cgroup_v1_mem_limit_bytes": (_read("/sys/fs/cgroup/memory/memory.limit_in_bytes") or "").strip(),
        "cgroup_v1_mem_usage_bytes": (_read("/sys/fs/cgroup/memory/memory.usage_in_bytes") or "").strip(),
        "cgroup_v1_cpu_quota_us": (_read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us") or "").strip(),
        "cgroup_v1_cpu_period_us": (_read("/sys/fs/cgroup/cpu/cpu.cfs_period_us") or "").strip(),
        "cpuset_cpus": (_read("/sys/fs/cgroup/cpuset/cpuset.cpus") or "").strip(),
        "cgroup_v2_mem_max": (_read("/sys/fs/cgroup/memory.max") or "").strip(),
    }

def base_record(name, kind):
    return {
        "scenario": name, "kind": kind,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "mem_available_before_mb": free_mb(),
        "next_server_rss_before_mb": next_server_rss(),
    }

def finish_record(rec):
    rec["mem_available_after_mb"] = free_mb()
    rec["next_server_rss_after_mb"] = next_server_rss()
    rec["db_openers_after"] = db_openers()
    return rec

def save(out, rec):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(rec, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: rec[k] for k in rec if not isinstance(rec[k], (list, dict))},
                     ensure_ascii=False))

# ---------- samplers ----------
class Sampler(threading.Thread):
    """نمونه‌بردار پس‌زمینه: RSS سرور + حافظهٔ آزاد + درخت پروسه"""
    def __init__(self, interval=0.25):
        super().__init__(daemon=True)
        self.stop_flag = threading.Event()
        self.interval = interval
        self.samples = []
        self.tree_root = None
        self.t0_total, _ = stat_cpu()

    def tree_rss(self, root):
        if not root:
            return 0.0
        procs = all_procs()
        by_ppid = {}
        for p in procs:
            by_ppid.setdefault(p["ppid"], []).append(p["pid"])
        tot, stack, seen = 0.0, [root], set()
        rss_by_pid = {p["pid"]: p["rss_mb"] for p in procs}
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            tot += rss_by_pid.get(cur, 0.0)
            stack.extend(by_ppid.get(cur, []))
        return round(tot, 1)

    def run(self):
        while not self.stop_flag.is_set():
            s = {"t": round(time.time(), 2), "srv_rss_mb": next_server_rss(), "free_mb": free_mb()}
            if self.tree_root:
                s["tree_rss_mb"] = self.tree_rss(self.tree_root)
            self.samples.append(s)
            time.sleep(self.interval)

    def stop(self):
        self.stop_flag.set()
        self.join(timeout=5)

# ---------- subcommands ----------
def cmd_sys(out, name):
    time.sleep(1)
    mi = meminfo()
    rec = base_record(name, "sys")
    rec.update({
        "meminfo_kb": {k: mi.get(k) for k in
                       ["MemTotal", "MemFree", "MemAvailable", "Buffers", "Cached",
                        "SwapTotal", "SwapFree", "Slab", "KernelStack", "PageTables"]},
        "loadavg": loadavg(),
        "proc_count": len([d for d in os.listdir(PROC) if d.isdigit()]),
        "db_openers": db_openers(),
        "cgroup": cgroup_limits(),
        "processes": all_procs(),
        "oom_lines": dmesg_oom(),
    })
    finish_record(rec)
    save(out, rec)

def cmd_http(out, name, method, url, body=None):
    rec = base_record(name, "http")
    rec["method"], rec["url"] = method, url
    sampler = Sampler()
    sampler.start()
    t0 = time.time()
    http_code, resp_bytes, err = None, 0, None
    try:
        req = urllib.request.Request(url, method=method)
        req.add_header("Content-Type", "application/json")
        data = body.encode() if body else None
        with urllib.request.urlopen(req, data=data, timeout=120) as r:
            http_code = r.status
            resp_bytes = len(r.read())
    except urllib.error.HTTPError as e:
        http_code = e.code
        try:
            resp_bytes = len(e.read())
        except Exception:
            pass
    except Exception as e:
        err = str(e)[:300]
    wall_ms = int((time.time() - t0) * 1000)
    sampler.stop()
    rec.update({
        "http_code": http_code, "resp_bytes": resp_bytes, "wall_ms": wall_ms, "error": err,
        "srv_rss_peak_mb": max((s["srv_rss_mb"] for s in sampler.samples), default=None),
        "free_min_mb": min((s["free_mb"] for s in sampler.samples), default=None),
        "samples_n": len(sampler.samples),
    })
    finish_record(rec)
    save(out, rec)

def cmd_par(out, name, n, url):
    rec = base_record(name, "parallel")
    rec["url"], rec["concurrency"] = url, n
    sampler = Sampler()
    sampler.start()
    results = [None] * n
    def worker(i):
        t0 = time.time()
        code, err = None, None
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                code = r.status
                r.read()
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception as e:
            err = str(e)[:120]
        results[i] = {"code": code, "ms": int((time.time() - t0) * 1000), "err": err}
    t0 = time.time()
    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall_ms = int((time.time() - t0) * 1000)
    sampler.stop()
    rec.update({
        "requests": results, "wall_ms": wall_ms,
        "srv_rss_peak_mb": max((s["srv_rss_mb"] for s in sampler.samples), default=None),
        "free_min_mb": min((s["free_mb"] for s in sampler.samples), default=None),
    })
    finish_record(rec)
    save(out, rec)

def cmd_cmd(out, name, argv):
    rec = base_record(name, "cmd")
    rec["command"] = argv[:6]
    sampler = Sampler()
    t0 = time.time()
    proc = subprocess.Popen(argv, cwd="/home/z/my-project",
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    sampler.tree_root = proc.pid
    sampler.start()
    try:
        so, se = proc.communicate(timeout=1800)
        stdout_tail = (so or b"").decode(errors="replace")[-1200:]
        stderr_tail = (se or b"").decode(errors="replace")[-1200:]
    except subprocess.TimeoutExpired:
        proc.kill()
        so, se = proc.communicate()
        stdout_tail = ""
        stderr_tail = "TIMEOUT-KILLED-1800s\n" + (se or b"").decode(errors="replace")[-800:]
    wall_ms = int((time.time() - t0) * 1000)
    sampler.stop()
    t1_total, _ = stat_cpu()
    dt = wall_ms / 1000
    rec.update({
        "exit_code": proc.returncode, "wall_ms": wall_ms,
        "tree_rss_peak_mb": max((s.get("tree_rss_mb", 0) for s in sampler.samples), default=0),
        "system_cpu_pct_avg": round((t1_total - sampler.t0_total) / (CLK_TCK * NCORES * max(dt, 0.001)) * 100, 1),
        "free_min_mb": min((s["free_mb"] for s in sampler.samples), default=None),
        "srv_rss_peak_mb": max((s["srv_rss_mb"] for s in sampler.samples), default=None),
        "oom_after": dmesg_oom(5),
        "stdout_tail": stdout_tail, "stderr_tail": stderr_tail,
    })
    finish_record(rec)
    save(out, rec)

def cmd_alloc(out):
    rec = {"scenario": "ram_allocation_probe", "kind": "alloc",
           "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "cgroup": cgroup_limits(),
           "meminfo_start_kb": {k: v for k, v in meminfo().items() if k in ("MemTotal", "MemAvailable")}}
    milestones = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]  # GB تجمعی
    blocks, results = [], []
    prev = 0.0
    failed_at = None
    for m in milestones:
        delta = int((m - prev) * 1024 * 1024 * 1024)
        try:
            b = bytearray(delta)
            for i in range(0, len(b), 4096):  # لمس هر صفحه = commit واقعی
                b[i] = 1
            blocks.append(b)
            prev = m
            results.append({"target_gb": m, "ok": True, "free_mb": free_mb()})
        except MemoryError:
            failed_at = m
            results.append({"target_gb": m, "ok": False, "error": "MemoryError"})
            break
        except OSError as e:
            failed_at = m
            results.append({"target_gb": m, "ok": False, "error": str(e)[:150]})
            break
    rec["steps"] = results
    rec["max_allocated_gb"] = prev
    rec["failed_at_gb"] = failed_at
    del blocks
    rec["meminfo_end_kb"] = {k: v for k, v in meminfo().items() if k in ("MemTotal", "MemAvailable")}
    rec["oom_after"] = dmesg_oom(8)
    save(out, rec)

def cmd_cputest(out, workers, seconds):
    rec = {"scenario": f"cpu_load_{workers}w", "kind": "cputest",
           "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "workers": workers, "duration_s": seconds,
           "loadavg_before": loadavg()}
    code = "x=0\nwhile True: x=(x+1)&0xffffffff\n"
    procs = [subprocess.Popen([sys.executable, "-c", code]) for _ in range(workers)]
    wpids = [p.pid for p in procs]

    def proc_ticks(pids):
        tot = 0
        for pid in pids:
            txt = _read(f"{PROC}/{pid}/stat")
            if txt:
                try:
                    rest = txt[txt.rindex(")") + 2:].split()
                    tot += int(rest[11]) + int(rest[12])
                except Exception:
                    pass
        return tot

    samples = []
    t0 = time.time()
    a_total, _ = stat_cpu()
    a_w = proc_ticks(wpids)
    while time.time() - t0 < seconds:
        time.sleep(1.0)
        b_total, _ = stat_cpu()
        b_w = proc_ticks(wpids)
        total_pct = (b_total - a_total) / (CLK_TCK * NCORES) * 100
        worker_pct = (b_w - a_w) / (CLK_TCK * NCORES) * 100
        samples.append({"total_pct": round(total_pct, 1), "workers_pct": round(worker_pct, 1),
                         "other_pct": round(total_pct - worker_pct, 1)})
        a_total, a_w = b_total, b_w
    for p in procs:
        p.terminate()
    time.sleep(0.5)
    for p in procs:
        if p.poll() is None:
            p.kill()
    for p in procs:
        try:
            p.wait(timeout=5)
        except Exception:
            pass
    time.sleep(1)
    tot_avg = sum(s["total_pct"] for s in samples) / max(len(samples), 1)
    w_avg = sum(s["workers_pct"] for s in samples) / max(len(samples), 1)
    rec.update({
        "cpu_total_pct_samples": samples,
        "cpu_total_pct_avg": round(tot_avg, 1),
        "cpu_workers_pct_avg": round(w_avg, 1),
        "cpu_other_pct_avg": round(tot_avg - w_avg, 1),
        "cpu_total_pct_max": max((s["total_pct"] for s in samples), default=None),
        "ncores": NCORES,
        "loadavg_after": loadavg(),
    })
    save(out, rec)

# ---------- main ----------
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    mode, out = sys.argv[1], sys.argv[2]
    if mode == "sys":
        cmd_sys(out, sys.argv[3] if len(sys.argv) > 3 else "sys")
    elif mode == "http":
        body = sys.argv[6] if len(sys.argv) > 6 else None
        cmd_http(out, sys.argv[3], sys.argv[4], sys.argv[5], body)
    elif mode == "par":
        cmd_par(out, sys.argv[3], int(sys.argv[4]), sys.argv[5])
    elif mode == "cmd":
        name = sys.argv[3]
        dash = sys.argv.index("--")
        cmd_cmd(out, name, sys.argv[dash + 1:])
    elif mode == "alloc":
        cmd_alloc(out)
    elif mode == "cputest":
        cmd_cputest(out, int(sys.argv[3]), int(sys.argv[4]))
    else:
        print("unknown mode")
        sys.exit(2)

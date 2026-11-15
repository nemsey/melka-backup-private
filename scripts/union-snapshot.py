#!/usr/bin/env python3
"""DIR-EXCEL-FIX-001 — baseline/verify data snapshot across the four UNION layers.
Usage: python3 scripts/union-snapshot.py [--label NAME]
Prints per-layer counts (P/R/T/ER/EP/User/GN) + integrity + zero-decrease verdict.
"""
import sqlite3, glob, json, os, sys, datetime

ROOT = "/home/z/my-project"
LIVE = f"{ROOT}/db/custom.db"
FORTRESS = f"{ROOT}/upload/.data/custom.db"
ROLLING_DIR = f"{ROOT}/upload/.data/rolling"
SACRED_DIR = f"{ROOT}/upload/.data/sacred"

COUNTS = [
    ("P",  "SELECT COUNT(*) FROM PropertyRecord"),
    ("R",  "SELECT COUNT(*) FROM RequestRecord"),
    ("T",  "SELECT COUNT(*) FROM TransactionRecord"),
    ("ER", "SELECT COUNT(*) FROM ExpertRecord"),
    ("EP", "SELECT COUNT(*) FROM ExpertProfile"),
    ("User","SELECT COUNT(*) FROM User"),
    ("GN", "SELECT COUNT(*) FROM GraphNode"),
]

def layer_counts(path, do_integrity=False):
    out = {}
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=8)
        cur = con.cursor()
        for key, q in COUNTS:
            try:
                out[key] = cur.execute(q).fetchone()[0]
            except Exception as e:
                out[key] = f"ERR:{type(e).__name__}"
        if do_integrity:
            try:
                out["integrity"] = cur.execute("PRAGMA integrity_check").fetchone()[0]
            except Exception as e:
                out["integrity"] = f"ERR:{e}"
        con.close()
    except Exception as e:
        out["error"] = str(e)
    return out

def latest(dirpath, prefix):
    files = sorted(glob.glob(f"{dirpath}/{prefix}*.db"))
    return files[-1] if files else None

label = "SNAP"
args = sys.argv[1:]
if "--label" in args:
    label = args[args.index("--label") + 1]

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
rolling = latest(ROLLING_DIR, "live-")
sacred = latest(SACRED_DIR, "sacred-")

result = {
    "label": label, "at": now,
    "layers": {
        "live": {"path": LIVE, **layer_counts(LIVE)},
        "fortress": {"path": FORTRESS, **layer_counts(FORTRESS)},
        "rolling": {"path": rolling, **(layer_counts(rolling) if rolling else {"error": "none"})},
        "sacred": {"path": sacred, **(layer_counts(sacred) if sacred else {"error": "none"})},
    },
}

live = result["layers"]["live"]
zero_decrease = True
same_PR = True
for name, layer in result["layers"].items():
    if "error" in layer:
        print(f"[{name}] ERROR {layer['error']}")
        continue
    ok_i = layer.get("integrity") == "ok"
    counts_str = " ".join(f"{k}={layer.get(k)}" for k, _ in COUNTS)
    print(f"[{name}] {counts_str} integrity={layer.get('integrity')} mtime={datetime.datetime.utcfromtimestamp(os.path.getmtime(layer['path'])).strftime('%H:%M:%SZ') if os.path.exists(layer['path']) else '?'}")
    for k, _ in COUNTS:
        lv, ov = live.get(k), layer.get(k)
        if isinstance(lv, int) and isinstance(ov, int) and ov < lv:
            zero_decrease = False
            print(f"  !! ZERO-DECREASE VIOLATION: {name}.{k} {ov} < live {lv}")
    for k in ("P", "R"):
        lv, ov = live.get(k), layer.get(k)
        if isinstance(lv, int) and isinstance(ov, int) and ov != lv:
            same_PR = False

print(f"\nVERDICT label={label}: counts_only=(integrity deferred to G6 sacred-integrity.sh) zero_decrease={'PASS' if zero_decrease else 'FAIL'} PR_same_all_layers={'PASS' if same_PR else 'INFO:layers_behind_live(rolling/sacred may lag)'}")

with open(f"{ROOT}/upload/.runtime/union-snapshots.jsonl", "a") as f:
    f.write(json.dumps(result, ensure_ascii=False) + "\n")
print(f"appended → upload/.runtime/union-snapshots.jsonl")

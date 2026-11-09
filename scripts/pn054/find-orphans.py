#!/usr/bin/env python3
"""Find extraneous (orphan) packages in node_modules — not in bun.lock."""
import os, re, json, sys

REPO = "/home/z/my-project"
NM = os.path.join(REPO, "node_modules")

# Parse bun.lock (text format) for all package names
lock = open(os.path.join(REPO, "bun.lock"), encoding="utf-8", errors="replace").read()
# package names appear quoted like "pkg@version" or "pkg" in various spots
locked = set(re.findall(r'"((?:@[^/"]+/)?[^/@"][^"@]*)@[^"]*"', lock))
# also bare quoted names (workspaces etc.)
locked |= set(re.findall(r'"((?:@[^/"]+/)?[^@/"]+)"\s*(?::|\|)', lock))
# npm aliases: "name@npm:real"
for extra in re.findall(r'npm:((?:@[^/"]+/)?[^@"]+)@', lock):
    locked.add(extra)

def dirsize_mb(p):
    total = 0
    for root, dirs, files in os.walk(p, onerror=lambda e: None):
        # don't follow symlinks
        dirs[:] = [d for d in dirs if not os.path.islink(os.path.join(root, d))]
        for f in files:
            fp = os.path.join(root, f)
            try:
                if not os.path.islink(fp):
                    total += os.lstat(fp).st_size
            except OSError:
                pass
    return total / (1024 * 1024)

orphans = []
for entry in sorted(os.listdir(NM)):
    if entry.startswith("."):
        continue
    base = entry
    if entry.startswith("@"):
        scope = entry
        for sub in os.listdir(os.path.join(NM, scope)):
            if sub.startswith("."):
                continue
            name = f"{scope}/{sub}"
            if name not in locked:
                orphans.append((name, os.path.join(NM, scope, sub)))
    else:
        if base not in locked:
            orphans.append((base, os.path.join(NM, base)))

print(f"locked names parsed: {len(locked)}")
print(f"orphan candidates: {len(orphans)}\n")
total = 0
for name, path in orphans:
    mb = dirsize_mb(path)
    total += mb
    print(f"{mb:8.1f}MB  {name}")
print(f"\nTOTAL orphan size: {total:.1f}MB")

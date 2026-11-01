#!/bin/bash
# اجرای مقاوم backfill درخواست‌ها — تا ۱۲ بار در صورت مرگ بی‌صدا (OOM)؛ idempotent
cd /home/z/my-project
for i in $(seq 1 12); do
  echo "[runner] attempt $i at $(date -u +%H:%M:%S)"
  bun --smol scripts/p6510-catalog-sync.ts --entity=requests && { echo "[runner] DONE"; break; }
  code=$?
  echo "[runner] exited with $code — restarting (idempotent upsert)"
  sleep 3
done

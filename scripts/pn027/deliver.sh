#!/usr/bin/env bash
# ============================================================================
# PN-027 — تحویل v3 (دروازه ۳.۴ + بخش ۴): ZIP + SHA256SUMS + قطعات بقا ×۱۲ + لینک‌ها
# ============================================================================
set -euo pipefail
cd /home/z/my-project

DL=download/pn027
STORE=deliver-store/pn027
BASE_URL=/deliver/pn027

# ۱) ZIP گزارش + شواهد
cd "$DL"
rm -f PN-027-ALL.zip
zip -q -r PN-027-ALL.zip PN-027-FINAL-REPORT.md lock-in.json fix-*.json remove-*.json speed-*.json guards.json live-probes.json data-lock.json
cd /home/z/my-project

# ۲) SHA256SUMS همهٔ اقلام تحویل
cd "$DL"
rm -f SHA256SUMS
sha256sum PN-027-FINAL-REPORT.md PN-027-ALL.zip lock-in.json fix-supervisor.json fix-pins.json fix-wcag.json fix-sessions.json remove-deps.json remove-endpoints.json archive-scripts.json speed-m1.json speed-m2.json speed-misc.json guards.json live-probes.json data-lock.json > SHA256SUMS
cd /home/z/my-project

# ۳) قطعات بقا ×۱۲ (بستهٔ ۲۶ → tar.gz → split)
rm -rf "$STORE"
mkdir -p "$STORE"
PKG=upload/.survival/PN-027-20261010
tar -czf "$STORE/PN-027-chainIndex26.tar.gz" -C upload/.survival PN-027-20261010
cd "$STORE"
split -n 12 -d -a 2 PN-027-chainIndex26.tar.gz PN-027-chainIndex26.part.
# حذف tar کامل؟ نه — قانون قطعات: هر دو فرم موجود می‌مانند (الگوی PN-025)
sha256sum PN-027-chainIndex26.tar.gz PN-027-chainIndex26.part.* > SHA256SUMS-survival.txt
cd /home/z/my-project

# ۴) کپی گزارش و شواهد به فروشگاه سرو
cp "$DL"/*.json "$DL"/PN-027-FINAL-REPORT.md "$DL"/SHA256SUMS "$DL"/PN-027-ALL.zip "$STORE/" 2>/dev/null || true

echo "── تحویل v3 آماده ──"
echo "اقلام download/pn027: $(ls $DL | wc -l)"
echo "اقلام deliver-store/pn027: $(ls $STORE | wc -l) (شامل $(ls $STORE/PN-027-chainIndex26.part.* 2>/dev/null | wc -l) قطعه)"
du -sh "$DL" "$STORE" | head -2

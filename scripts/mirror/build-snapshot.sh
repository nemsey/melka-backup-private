#!/usr/bin/env bash
# ============================================================
# سازندهٔ کامیت اسنپ‌شات بقا — شاخهٔ یتیم survival/code (P6547-cont)
# ------------------------------------------------------------
# درخت کامل HEAD منهای فایل‌های بالای سقف ۹۹MB (سقف سخت GitHub = ۱۰۰MB).
# هیچ فایلی روی دیسک لمس نمی‌شود (ایندکس موقت)؛ تاریخچهٔ main دست‌نخورده.
# همین منطق داخل mirror-daemon.sh (build_snapshot) هم هست — این نسخهٔ
# مستقل برای اجرای دستی/تک‌مرحله‌ای است.
# اجرا: bash scripts/mirror/build-snapshot.sh
# ============================================================
set -eu
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

SNAPSHOT_BRANCH="survival/code"
SIZE_LIMIT_BYTES=$((99 * 1024 * 1024))
LOG="upload/.mirror/push-log.jsonl"

log_event() {
  local kind="$1"; shift
  printf '{"at":"%s","kind":"%s",%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$kind" "$*" >> "$LOG"
}

src_sha="$(git rev-parse --short HEAD)"
tmp_index="$(mktemp)"
trap 'rm -f "$tmp_index"' EXIT
# ⚠️ همهٔ عملیات ایندکس باید روی ایندکس موقتی باشند — هرگز .git/index لمس نشود
GIT_INDEX_FILE="$tmp_index" git read-tree HEAD

# فهرست فایلهای بالای سقف از درخت HEAD — ls-tree -l: <mode> <type> <sha> <size>\t<path>
mapfile -t oversized < <(git ls-tree -r -l HEAD | awk -F'\t' -v lim="$SIZE_LIMIT_BYTES" '{
  split($1, a, " ")
  if ((a[1] == "100644" || a[1] == "100755" || a[1] == "120000") && (a[4] + 0) > lim) print $2
}')

for big in "${oversized[@]:-}"; do
  [[ -n "$big" ]] && GIT_INDEX_FILE="$tmp_index" git rm --cached -q --ignore-unmatch -- "$big" >/dev/null 2>&1 || true
done

tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"
parent="$(git rev-parse --verify --quiet "refs/heads/$SNAPSHOT_BRANCH" 2>/dev/null || true)"

if [[ -n "$parent" && "$(git rev-parse "${parent}^{tree}" 2>/dev/null)" == "$tree" ]]; then
  echo "بدون تغییر — کامیت تهی نزدم (برنچ: $SNAPSHOT_BRANCH = $(git rev-parse --short "$parent"))"
  exit 0
fi

if [[ -n "$parent" ]]; then
  commit="$(git commit-tree "$tree" -p "$parent" -m "survival snapshot $src_sha $(date -u +%Y-%m-%dT%H:%M:%SZ) — full tree minus >99MB files (db in survival packages)")"
else
  commit="$(git commit-tree "$tree" -m "survival snapshot $src_sha $(date -u +%Y-%m-%dT%H:%M:%SZ) — orphan root: full tree minus >99MB files (db in survival packages)")"
fi
git update-ref "refs/heads/$SNAPSHOT_BRANCH" "$commit"

excluded_count="${#oversized[@]}"
log_event snapshot "\"via\":\"manual\",\"branch\":\"$SNAPSHOT_BRANCH\",\"source\":\"$src_sha\",\"commit\":\"$(git rev-parse --short "$commit")\",\"excluded\":${excluded_count}"
echo "اسنپ‌شات: $(git rev-parse --short "$commit") ← source $src_sha · excluded=$excluded_count (${oversized[*]:-none})"

#!/bin/bash
# =============================================================================
# Melk Tabriz — self-healing dev-server boot
# =============================================================================
# WHY THIS EXISTS (2026-09-19, owner order "solve forever"):
#   * Platform /start.sh rewrites .env to DATABASE_URL-only on EVERY container
#     restart (that is how MELK_TOKEN_KEY / MASTER_ACCESS_CODE kept vanishing).
#   * The old dev.sh started `bun run dev` with no supervision — whenever the
#     process died (container restart, session handoff, crash) the app stayed
#     DEAD until a human restarted it, and the public link returned 500.
#   * /start.sh executes this file on every boot (custom dev script branch),
#     so this is the one hook that survives every container restart.
#
# MODES
#   dev.sh               boot entry: restore env, ensure deps/db, detach the
#                       supervisor, wait for :3000, exit 0 (never fails boot)
#   dev.sh --supervisor detached watchdog: single-instance (flock), checks
#                       port 3000 every 15s, restarts the dev server after two
#                       consecutive failed probes. Runs via setsid so it is
#                       immune to parent-shell / session termination.
#
# PERSISTENCE: this file is git-tracked; the platform archives the repo to
# /home/sync/repo.tar at pre-stop and restores it on the next boot, so the
# fix keeps working on every future box.
# =============================================================================

set -uo pipefail   # NOTE: no -e — the supervisor must survive individual failures

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# sudo -u z may leave HOME=/root (unreadable/unwritable for user z) → bun cache breaks
if [ "$HOME" = "/root" ] || [ -z "${HOME:-}" ]; then
    export HOME=/home/z
fi

PORT=3000
LOCK_FILE="/tmp/melk-tabriz-supervisor.lock"
SUPERVISOR_LOG="$PROJECT_DIR/.zscripts/supervisor.log"
DEV_LOG="$PROJECT_DIR/dev.log"
DEV_LOG_MAX_BYTES=20971520   # 20 MB cap, applied right before each restart

# --- test-only values, already in git history (fdf65dd) and documented in the
# --- worklog; NOT production secrets.
MELK_TOKEN_KEY_VALUE="test-only-key-not-a-real-secret"
MASTER_ACCESS_CODE_VALUE="41372895"
# P6.5-04-i (2026-09-20): اعلامیهٔ ۳ مالک (§۱.۱۲-پ سند طراحی) — MELK_SYNC_MODE=incremental
# روی production الزامی است ولی restore قبلی آن را پوشش نمی‌داد ⇒ پس از هر ری‌استارت کانتینر
# دیمون به حالت legacy (deleteMany+createMany) برمی‌گشت. از این به بعد بازگردانده می‌شود.
MELK_SYNC_MODE_VALUE="incremental"
# P6.5-04-i — کد پرسنلی ARM خود مالک (owner-from-expert-ui): ورود OTP با این کد ⇒ نقش OWNER
MANAGER_CODE_VALUE="410031320"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [dev.sh] $*" >> "$SUPERVISOR_LOG"; }

port_open() {
    curl -s --connect-timeout 2 --max-time 5 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null
}

env_line_missing() {  # $1 = VAR_NAME, $2 = file
    ! grep -q "^$1=" "$2" 2>/dev/null
}

restore_env() {
    # /start.sh rewrote .env to DATABASE_URL-only; re-add what the app needs.
    local changed=0
    touch .env
    if env_line_missing MELK_TOKEN_KEY .env; then
        echo "MELK_TOKEN_KEY=$MELK_TOKEN_KEY_VALUE" >> .env
        changed=1
    fi
    if env_line_missing MASTER_ACCESS_CODE .env; then
        echo "MASTER_ACCESS_CODE=$MASTER_ACCESS_CODE_VALUE" >> .env
        changed=1
    fi
    if env_line_missing DATABASE_URL .env; then
        echo "DATABASE_URL=file:/home/z/my-project/db/custom.db" >> .env
        changed=1
    fi
    if env_line_missing MELK_SYNC_MODE .env; then
        echo "MELK_SYNC_MODE=$MELK_SYNC_MODE_VALUE" >> .env
        changed=1
    fi
    if env_line_missing MANAGER_CODE .env; then
        echo "MANAGER_CODE=$MANAGER_CODE_VALUE" >> .env
        changed=1
    fi
    # .env.local is wiped by the boot restore; recreate it (Next.js picks it up
    # with higher precedence and survives .env rewrites).
    if [ ! -f .env.local ] || env_line_missing MELK_TOKEN_KEY .env.local; then
        printf 'MELK_TOKEN_KEY=%s\n' "$MELK_TOKEN_KEY_VALUE" > .env.local
        changed=1
    fi
    chmod 600 .env .env.local 2>/dev/null || true
    [ "$changed" = "1" ] && log "env restored (.env + .env.local)"
    return 0
}

ensure_deps_and_db() {
    command -v bun >/dev/null 2>&1 || { log "FATAL: bun not in PATH"; return 1; }
    bun install >> "$SUPERVISOR_LOG" 2>&1 || log "WARN: bun install returned non-zero"
    bun run db:generate >> "$SUPERVISOR_LOG" 2>&1 || log "WARN: db:generate returned non-zero"
    # Only build a fresh DB when the file is absent. Never run destructive
    # `db:push --accept-data-loss` against an existing production database at
    # boot (schema migrations are executed explicitly by the developer).
    if [ ! -f "$PROJECT_DIR/db/custom.db" ]; then
        log "db/custom.db missing — running db:push for a fresh database"
        bun run db:push >> "$SUPERVISOR_LOG" 2>&1 || log "WARN: db:push returned non-zero"
    fi
    return 0
}

kill_stale_dev() {
    pkill -f "next dev"        2>/dev/null || true
    pkill -f "next-server"     2>/dev/null || true
    pkill -f "tee dev.log"     2>/dev/null || true
    pkill -f "bun run dev"     2>/dev/null || true
    sleep 1
}

start_dev() {
    # package.json "dev" = next dev -p 3000 | tee dev.log
    # (tee owns dev.log; stdout pass-through + bun errors land in supervisor.log)
    nohup bun run dev >> "$SUPERVISOR_LOG" 2>&1 < /dev/null &
}

wait_for_port() {  # $1 = max seconds
    local waited=0
    while [ "$waited" -lt "$1" ]; do
        port_open && return 0
        sleep 3
        waited=$((waited + 3))
    done
    port_open
}

supervisor_loop() {
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        log "another supervisor instance holds the lock — exiting"
        exit 0
    fi
    log "supervisor started (pid $$)"
    echo $$ > "$PROJECT_DIR/.zscripts/supervisor.pid"

    local fails=0
    while true; do
        if port_open; then
            fails=0
        else
            fails=$((fails + 1))
            log "port $PORT not accepting (probe $fails/2)"
            if [ "$fails" -ge 2 ]; then
                fails=0
                log "restarting dev server"
                kill_stale_dev
                # cap dev.log just before a fresh run starts (old tee is dead now)
                if [ -f "$DEV_LOG" ]; then
                    local sz
                    sz=$(stat -c%s "$DEV_LOG" 2>/dev/null || echo 0)
                    [ "$sz" -gt "$DEV_LOG_MAX_BYTES" ] && : > "$DEV_LOG" && log "dev.log truncated (${sz} bytes > cap)"
                fi
                start_dev
                if wait_for_port 120; then
                    log "dev server back up on :$PORT"
                else
                    log "ERROR: dev server did not come up within 120s — will keep retrying"
                fi
            fi
        fi
        sleep 15
    done
}

# =============================== entry points ===============================

if [ "${1:-}" = "--supervisor" ]; then
    supervisor_loop
    exit 0
fi

# ---- boot entry (also safe to run manually at any time) ----
echo "[dev.sh] Melk Tabriz self-healing boot: env → deps → supervisor → :$PORT"
restore_env
ensure_deps_and_db || true

# Detach the supervisor in its own session so nothing short of a container
# restart (or an explicit pkill) can take it down with a parent shell.
setsid nohup bash "$0" --supervisor >> "$SUPERVISOR_LOG" 2>&1 < /dev/null &
disown 2>/dev/null || true

# Give the platform boot the same guarantees the old script had:
# :3000 accepting connections before we report success (max 120s).
if wait_for_port 120; then
    echo "[dev.sh] Next.js is serving on :$PORT (supervisor is watching)"
    exit 0
else
    echo "[dev.sh] WARNING: :$PORT not up in 120s — supervisor will keep retrying"
    exit 0   # never fail the platform boot; the supervisor recovers async
fi

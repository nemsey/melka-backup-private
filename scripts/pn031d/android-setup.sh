#!/usr/bin/env bash
# PN-031-D · فاز ۲ — نصب toolchain اندروید (JDK17 Azul + cmdline-tools + SDK + Gradle)
# اجرا در پیش‌زمینه (پروسهٔ پس‌زمینه بین فراخوانی‌های ابزار کشته می‌شود)
set -uo pipefail
BASE="$HOME/android"
SCRIPT_DIR="/home/z/my-project/scripts/pn031d"
STATUS="$SCRIPT_DIR/toolchain-status.json"

LOG_TAG() { echo "[$(date -u +%H:%M:%SZ)] $*"; }

# دانلود موازی تکه‌ای — برای سرورهایی که per-connection کندند
pdl() {
  # $1=url $2=outfile
  local url="$1" out="$2"
  local size
  size=$(curl -sIL "$url" | grep -i '^content-length:' | tail -1 | tr -dc '0-9')
  if [ -z "$size" ] || [ "$size" -lt 5000000 ]; then
    curl -sSL --retry 3 -o "$out" "$url" && return 0 || return 1
  fi
  local parts=6
  local chunk=$(( (size + parts - 1) / parts ))
  local pids=()
  for i in $(seq 0 $((parts - 1))); do
    local start=$(( i * chunk ))
    local end=$(( start + chunk - 1 ))
    [ $end -ge $size ] && end=$(( size - 1 ))
    [ $start -gt $end ] && continue
    curl -sSL --retry 3 -r "${start}-${end}" -o "${out}.part${i}" "$url" &
    pids+=($!)
  done
  local fail=0
  for p in "${pids[@]}"; do wait "$p" || fail=1; done
  [ $fail -eq 1 ] && { rm -f "${out}".part*; return 1; }
  cat $(ls "${out}".part* | sort -V) > "$out" 2>/dev/null || {
    cat "${out}".part0 "${out}".part1 "${out}".part2 "${out}".part3 "${out}".part4 "${out}".part5 > "$out" 2>/dev/null; }
  rm -f "${out}".part*
  local got
  got=$(stat -c %s "$out" 2>/dev/null || echo 0)
  [ "$got" = "$size" ] || { LOG_TAG "pdl: ناقص ($got/$size)"; rm -f "$out"; return 1; }
  return 0
}

mkdir -p "$BASE"
cd "$BASE"

# ---------- ۱) JDK 17 (Azul Zulu — CDN سریع) ----------
if [ ! -x "$BASE/jdk17/bin/javac" ]; then
  LOG_TAG "JDK17: دانلود Azul Zulu 17 (~190MB)..."
  if pdl "https://cdn.azul.com/zulu/bin/zulu17.52.17-ca-jdk17.0.12-linux_x64.tar.gz" jdk17.tar.gz; then
    mkdir -p "$BASE/.jdk-extract"
    tar -xzf jdk17.tar.gz -C "$BASE/.jdk-extract"
    rm -rf "$BASE/jdk17"
    mv "$BASE"/.jdk-extract/* "$BASE/jdk17"
    rm -rf "$BASE/.jdk-extract" jdk17.tar.gz
    LOG_TAG "JDK17: نصب شد $($BASE/jdk17/bin/javac -version 2>&1)"
  else
    LOG_TAG "JDK17: شکست دانلود"; exit 1
  fi
fi

export JAVA_HOME="$BASE/jdk17"
export PATH="$JAVA_HOME/bin:$PATH"

# ---------- ۲) Android cmdline-tools ----------
if [ ! -x "$BASE/sdk/cmdline-tools/latest/bin/sdkmanager" ]; then
  LOG_TAG "cmdline-tools: دانلود..."
  if pdl "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" cmdtools.zip; then
    mkdir -p "$BASE/.cmd-extract" "$BASE/sdk/cmdline-tools"
    unzip -q cmdtools.zip -d "$BASE/.cmd-extract"
    rm -rf "$BASE/sdk/cmdline-tools/latest"
    mv "$BASE/.cmd-extract/cmdline-tools" "$BASE/sdk/cmdline-tools/latest"
    rm -rf "$BASE/.cmd-extract" cmdtools.zip
    LOG_TAG "cmdline-tools: نصب شد"
  else
    LOG_TAG "cmdline-tools: شکست دانلود"; exit 1
  fi
fi

SDKMANAGER="$BASE/sdk/cmdline-tools/latest/bin/sdkmanager"

# ---------- ۳) پکیج‌های SDK ----------
if [ ! -d "$BASE/sdk/platforms/android-34" ] || [ ! -d "$BASE/sdk/build-tools/34.0.0" ]; then
  LOG_TAG "SDK: پذیرش مجوزها..."
  yes 2>/dev/null | "$SDKMANAGER" --licenses >/dev/null 2>&1
  LOG_TAG "SDK: نصب platforms;android-34 + build-tools;34.0.0..."
  if "$SDKMANAGER" "platforms;android-34" "build-tools;34.0.0" >/dev/null 2>&1; then
    LOG_TAG "SDK: پکیج‌ها نصب شدند"
  else
    LOG_TAG "SDK: شکست نصب پکیج"; exit 1
  fi
fi

# ---------- ۴) Gradle 8.9 (سرور کند per-connection → دانلود موازی) ----------
if [ ! -x "$BASE/gradle-8.9/bin/gradle" ]; then
  LOG_TAG "Gradle: دانلود 8.9 (~130MB · ۶ تکهٔ موازی)..."
  if pdl "https://services.gradle.org/distributions/gradle-8.9-bin.zip" gradle89.zip; then
    unzip -q gradle89.zip -d "$BASE"
    rm -f gradle89.zip
    LOG_TAG "Gradle: نصب شد"
  else
    LOG_TAG "Gradle: شکست دانلود"; exit 1
  fi
fi

# ---------- وضعیت نهایی ----------
cat > "$STATUS" << EOF
{
  "ok": true,
  "jdk": "$("$BASE/jdk17/bin/javac" -version 2>&1)",
  "sdk": { "platforms": "android-34", "buildTools": "34.0.0" },
  "gradle": "8.9",
  "base": "$BASE",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
LOG_TAG "TOOLCHAIN READY"

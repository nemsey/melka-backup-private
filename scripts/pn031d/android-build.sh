#!/usr/bin/env bash
# PN-031-D · فاز ۲ — بیلد APK امضاشدهٔ رلهٔ ملکا
set -uo pipefail
BASE="$HOME/android"
export JAVA_HOME="$BASE/jdk17"
export ANDROID_HOME="$BASE/sdk"
export PATH="$JAVA_HOME/bin:$PATH"
cd /home/z/my-project/melka-relay-android
"$BASE/gradle-8.9/bin/gradle" --no-daemon assembleRelease "$@"

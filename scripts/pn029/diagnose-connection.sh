#!/usr/bin/env bash
# ============================================================================
# PN-029 · مرحلهٔ ۳ — تشخیص شش‌گانه (سند شورای عالی ملکا — جلسهٔ فوق‌العاده ۰۳۳)
# فقط خواندن · صفر تغییر · صفر تلاش احراز هویت
#   آزمون ۱: DNS    — حل نام میزبانهای سامانه‌های ملک تبریز
#   آزمون ۲: TCP    — برقراری اتصال به ۴۴۳
#   آزمون ۳: TLS    - دست دادن موفق + گواهی
#   آزمون ۴: HTTP   — پاسخ نقاط عمومی فقط-خواندنی
#   آزمون ۵: IP کانتینر — IP عمومی فعلی
#   آزمون ۶: Vault  — قابل‌رمزگشایی بودن توکنهای ذخیره‌شده
# خروجی: download/pn029/diagnosis.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT="download/pn029/diagnosis.json"
RAW="download/pn029/diagnosis-raw.txt"
TS=$(date -u +%FT%TZ)

HOSTS_ARM="arus-api.melketabriz.ir"
HOSTS_PM="pm-api.melketabriz.ir"
HOSTS_GAP="gap-api.melketabriz.ir"
HOSTS_FRONT="www.melketabriz.com arm.melketabriz.ir pm.melketabriz.ir"
ALL_HOSTS="$HOSTS_ARM $HOSTS_PM $HOSTS_GAP $HOSTS_FRONT"

echo "=== PN-029 diagnosis $TS ===" | tee "$RAW"

# ─── آزمون ۱: DNS ───
echo "--- TEST 1: DNS ---" | tee -a "$RAW"
declare -A DNS_OK=() DNS_IP=() DNS_ERR=()
for h in $ALL_HOSTS; do
  out=$(nslookup "$h" 2>&1); rc=$?
  ip=$(echo "$out" | awk '/^Address/ && !/#53/ {print $2}' | tail -1)
  if [ $rc -eq 0 ] && [ -n "$ip" ]; then DNS_OK[$h]=true; DNS_IP[$h]="$ip"; else DNS_OK[$h]=false; DNS_IP[$h]=""; DNS_ERR[$h]="$(echo "$out" | tail -1)"; fi
  echo "DNS $h -> rc=$rc ip=${DNS_IP[$h]}" | tee -a "$RAW"
done

# ─── آزمون ۲: TCP:443 (با python3 — بدون وابستگی به nc) ───
echo "--- TEST 2: TCP ---" | tee -a "$RAW"
declare -A TCP_OK=() TCP_ERR=() TCP_MS=()
for h in $HOSTS_ARM $HOSTS_PM $HOSTS_GAP; do
  r=$(python3 - "$h" <<'PYEOF'
import socket, sys, time
h = sys.argv[1]
t0 = time.time()
try:
    s = socket.create_connection((h, 443), timeout=10)
    s.close()
    print(f"OK {int((time.time()-t0)*1000)}")
except Exception as e:
    print(f"FAIL {type(e).__name__}: {e}")
PYEOF
)
  if [[ "$r" == OK* ]]; then TCP_OK[$h]=true; TCP_MS[$h]="${r#OK }"; TCP_ERR[$h]=""; else TCP_OK[$h]=false; TCP_MS[$h]=""; TCP_ERR[$h]="$r"; fi
  echo "TCP $h:443 -> $r" | tee -a "$RAW"
done

# ─── آزمون ۳: TLS (curl -v — فقط handshake و گواهی) ───
echo "--- TEST 3: TLS ---" | tee -a "$RAW"
declare -A TLS_OK=() TLS_INFO=()
for h in $HOSTS_ARM $HOSTS_PM $HOSTS_GAP; do
  v=$(curl -sv --max-time 15 -o /dev/null "https://$h/" 2>&1)
  if echo "$v" | grep -q "SSL connection using"; then
    TLS_OK[$h]=true
    TLS_INFO[$h]=$(echo "$v" | grep -oE "subject: CN=[^ ]*" | head -1)
    if [ -z "${TLS_INFO[$h]}" ]; then TLS_INFO[$h]=$(echo "$v" | grep -oE "issuer: .*" | head -1); fi
  else
    TLS_OK[$h]=false
    TLS_INFO[$h]=$(echo "$v" | grep -E "error|SSL|Failed" | head -1)
  fi
  echo "TLS $h -> ok=${TLS_OK[$h]} info=${TLS_INFO[$h]}" | tee -a "$RAW"
done

# ─── آزمون ۴: HTTP (نقاط عمومی فقط-خواندنی — صفر احراز هویت) ───
echo "--- TEST 4: HTTP ---" | tee -a "$RAW"
probe_http() {
  local name="$1" url="$2"
  r=$(curl -s -o /tmp/pn029-body.txt -w "%{http_code} %{time_total} %{size_download}" --max-time 20 "$url" 2>/dev/null || echo "000 0 0")
  code=$(echo "$r" | awk '{print $1}'); t=$(echo "$r" | awk '{print $2}'); size=$(echo "$r" | awk '{print $3}')
  mongoose=$(grep -c "MongooseError" /tmp/pn029-body.txt 2>/dev/null); mongoose=${mongoose:-0}
  html502=$(head -c 200 /tmp/pn029-body.txt 2>/dev/null | grep -ciE "502 bad gateway|<html" 2>/dev/null); html502=${html502:-0}
  echo "HTTP $name [$url] -> code=$code time=${t}s size=$size mongoose=$mongoose html502=$html502" | tee -a "$RAW" >&2
  echo "$code|$t|$size|$mongoose|$html502"
}
R_APM_ROOT=$(probe_http "ARM apm root"        "https://arus-api.melketabriz.ir/api/apm/")
R_APM_ENUMS=$(probe_http "ARM public enums"  "https://arus-api.melketabriz.ir/api/public/statics/enums-persian")
R_APM_OTP0=$(probe_http "ARM otp path"       "https://arus-api.melketabriz.ir/api/apm/authentication/otp/0")
R_PM_PORTAL=$(probe_http "PM public portal"  "https://pm-api.melketabriz.ir/api/public/portalInfo")
R_GAP_ROOT=$(probe_http "GAP root"           "https://gap-api.melketabriz.ir/api/")
R_APU_LIST=$(probe_http "Public apu list"    "https://arus-api.melketabriz.ir/api/apu/properties/list?page=1&limit=1")
R_FRONT=$(probe_http "melketabriz.com"       "https://www.melketabriz.com/")
R_CTRL_DIVAR=$(probe_http "CONTROL divar (IR)"  "https://api.divar.ir/v8/postlist/w/search")
R_CTRL_GITHUB=$(probe_http "CONTROL github"     "https://api.github.com")

# ─── آزمون ۵: IP کانتینر ───
echo "--- TEST 5: CONTAINER IP ---" | tee -a "$RAW"
IP1=$(curl -s --max-time 12 https://ifconfig.me 2>/dev/null | tr -d '[:space:]')
IP2=$(curl -s --max-time 12 https://api.ipify.org 2>/dev/null | tr -d '[:space:]')
echo "IP ifconfig.me=$IP1 ipify=$IP2" | tee -a "$RAW"

# ─── آزمون ۶: Vault ───
echo "--- TEST 6: VAULT ---" | tee -a "$RAW"
VAULT=$(bun scripts/pn029/vault-status.ts 2>&1 | tail -1)
echo "VAULT: $VAULT" | tee -a "$RAW"

# ─── تجمیع JSON ───
python3 - "$OUT" "$TS" "$IP1" "$IP2" "$VAULT" \
  "${DNS_OK[arus-api.melketabriz.ir]}" "${DNS_IP[arus-api.melketabriz.ir]}" \
  "${DNS_OK[pm-api.melketabriz.ir]}" "${DNS_IP[pm-api.melketabriz.ir]}" \
  "${DNS_OK[gap-api.melketabriz.ir]}" "${DNS_IP[gap-api.melketabriz.ir]}" \
  "${TCP_OK[arus-api.melketabriz.ir]}" "${TCP_ERR[arus-api.melketabriz.ir]}" "${TCP_MS[arus-api.melketabriz.ir]}" \
  "${TCP_OK[pm-api.melketabriz.ir]}" "${TCP_ERR[pm-api.melketabriz.ir]}" "${TCP_MS[pm-api.melketabriz.ir]}" \
  "${TCP_OK[gap-api.melketabriz.ir]}" "${TCP_ERR[gap-api.melketabriz.ir]}" "${TCP_MS[gap-api.melketabriz.ir]}" \
  "${TLS_OK[arus-api.melketabriz.ir]}" "${TLS_INFO[arus-api.melketabriz.ir]}" \
  "${TLS_OK[pm-api.melketabriz.ir]}" "${TLS_INFO[pm-api.melketabriz.ir]}" \
  "${TLS_OK[gap-api.melketabriz.ir]}" "${TLS_INFO[gap-api.melketabriz.ir]}" \
  "$R_APM_ROOT" "$R_APM_ENUMS" "$R_APM_OTP0" "$R_PM_PORTAL" "$R_GAP_ROOT" "$R_APU_LIST" "$R_FRONT" "$R_CTRL_DIVAR" "$R_CTRL_GITHUB" <<'PYEOF'
import json, sys

(out, ts, ip1, ip2, vault,
 dns_a, dns_a_ip, dns_p, dns_p_ip, dns_g, dns_g_ip,
 tcp_a, tcp_a_err, tcp_a_ms, tcp_p, tcp_p_err, tcp_p_ms, tcp_g, tcp_g_err, tcp_g_ms,
 tls_a, tls_a_info, tls_p, tls_p_info, tls_g, tls_g_info,
 r_apm, r_enums, r_otp0, r_portal, r_gap, r_apu, r_front, r_divar, r_github) = sys.argv[1:]

def http(raw):
    code, t, size, mongoose, html502 = raw.split("|")
    return {"httpStatus": int(code), "timeSec": float(t), "bytes": int(size), "mongooseError": mongoose == "1", "htmlBadGateway": html502 not in ("0", "") and int(html502) > 0}

def bool(v): return v == "true"

d = {
  "phase": "PN-029 · مرحلهٔ ۳ — تشخیص شش‌گانه (فقط خواندن · صفر تغییر)",
  "ranAt": ts,
  "test1_dns": {
    "arus-api.melketabriz.ir": {"ok": bool(dns_a), "ip": dns_a_ip},
    "pm-api.melketabriz.ir": {"ok": bool(dns_p), "ip": dns_p_ip},
    "gap-api.melketabriz.ir": {"ok": bool(dns_g), "ip": dns_g_ip},
  },
  "test2_tcp_443": {
    "arus-api.melketabriz.ir": {"ok": bool(tcp_a), "error": tcp_a_err, "ms": tcp_a_ms},
    "pm-api.melketabriz.ir": {"ok": bool(tcp_p), "error": tcp_p_err, "ms": tcp_p_ms},
    "gap-api.melketabriz.ir": {"ok": bool(tcp_g), "error": tcp_g_err, "ms": tcp_g_ms},
  },
  "test3_tls": {
    "arus-api.melketabriz.ir": {"ok": bool(tls_a), "info": tls_a_info},
    "pm-api.melketabriz.ir": {"ok": bool(tls_p), "info": tls_p_info},
    "gap-api.melketabriz.ir": {"ok": bool(tls_g), "info": tls_g_info},
  },
  "test4_http_public_readonly": {
    "arm_apm_root": http(r_apm),
    "arm_public_enums": http(r_enums),
    "arm_otp_path_probe": http(r_otp0),
    "pm_public_portal": http(r_portal),
    "gap_root": http(r_gap),
    "melk_public_apu_list": http(r_apu),
    "melketabriz_front": http(r_front),
    "CONTROL_divar_iranian_third_party": http(r_divar),
    "CONTROL_github_foreign": http(r_github),
  },
  "test5_containerIp": {"ifconfig_me": ip1 or None, "api_ipify_org": ip2 or None, "agree": (ip1 == ip2 and bool(ip1))},
  "test6_vault": json.loads(vault) if vault.startswith("{") else {"parseError": vault[:200]},
}
json.dump(d, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("diagnosis.json written")
PYEOF

/**
 * listen-patch.cjs — PN-054 (دستور ۱): گوش‌دادن روی fd ارث‌برده + Health Port
 * ---------------------------------------------------------------------------
 * preload رسمی Node برای سرور standalone:
 *   node --max-old-space-size=384 --require scripts/pn054/listen-patch.cjs \
 *        .next/standalone/server.js
 *
 * کارها:
 *  ۱) اگر MELKA_LISTEN_FD ست باشد، اولین server.listen() به آن fd هدایت
 *     می‌شود (سوکتِ مشترک با socket-master → Blue/Green بدون قطعی؛ همان
 *     تکنیک PM2-cluster). فراخوان‌های بعدی (سلامت/داخلی) دست‌نخورده می‌مانند.
 *  ۲) اگر MELKA_HEALTH_PORT ست باشد، یک health-listener سبک روی 127.0.0.1
 *     باز می‌کند: {pid, rssMB, heapMB, uptimeSec} — سنجهٔ مانیتور حافظه (دستور ۳).
 *
 * سیگنال‌ها: مدیریت SIGTERM بومیِ Next (start-server) حفظ می‌شود —
 * drain درخواست‌های در حال پرواز بر عهدهٔ همان است؛ این فایل دخالت نمی‌کند.
 */
'use strict';

const http = require('http');

const LISTEN_FD = Number(process.env.MELKA_LISTEN_FD || 0);
const HEALTH_PORT = Number(process.env.MELKA_HEALTH_PORT || 0);

// ─── ۱) هدایت listen اصلی به fd ارث‌برده ───
if (LISTEN_FD > 0) {
  const origListen = http.Server.prototype.listen;
  let mainRedirected = false;

  http.Server.prototype.listen = function (...args) {
    // سرور سلامت (خود این فایل) و فراخوان‌های بعدی → دست‌نخورده
    if (this.__melka_health || mainRedirected) {
      return origListen.apply(this, args);
    }
    let cb = null;
    for (const a of args) {
      if (typeof a === 'function') { cb = a; break; }
    }
    mainRedirected = true;
    console.log(`[pn054] listen → fd=${LISTEN_FD} (سوکت مشترک socket-master — بدون قطعی)`);
    return origListen.call(this, { fd: LISTEN_FD }, cb);
  };
}

// ─── ۲) Health listener سبک روی loopback ───
if (HEALTH_PORT > 0) {
  try {
    const hs = http.createServer((req, res) => {
      if (req.url && req.url.includes('/healthz')) {
        const mu = process.memoryUsage();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          pid: process.pid,
          role: process.env.MELK_ROLE || 'web',
          rssMB: Math.round(mu.rss / 1048576),
          heapUsedMB: Math.round(mu.heapUsed / 1048576),
          heapCapMB: Number(process.env.MELKA_HEAP_CAP_MB || 0),
          uptimeSec: Math.round(process.uptime()),
          ts: new Date().toISOString(),
        }));
        return;
      }
      res.writeHead(404); res.end();
    });
    hs.__melka_health = true;
    hs.listen(HEALTH_PORT, '127.0.0.1');
  } catch (e) {
    console.warn('[pn054] health listener ناتوان:', String(e && e.message));
  }
}

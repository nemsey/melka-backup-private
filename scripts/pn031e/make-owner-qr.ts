/**
 * make-owner-qr.ts — تولید QR نصب مالک (PNG 640px) — فاز D · PN-031-E
 * متن QR = دستور نصب یک‌خطی (بدون راز — فقط کد ۳۰دقیقه‌ای bootstrap).
 * اجرا: bun scripts/pn031e/make-owner-qr.ts "<installCommand>" <outPath>
 */
import QRCode from "qrcode";
import { writeFileSync } from "node:fs";

const text = process.argv[2] ?? "";
const outPath = process.argv[3] ?? "public/deliver/pn031e/qr-install.png";

if (!text) {
  console.error("missing install command text");
  process.exit(1);
}

const png = await QRCode.toBuffer(text, {
  type: "png",
  errorCorrectionLevel: "M",
  margin: 2,
  width: 640,
  color: { dark: "#000000ff", light: "#ffffffff" },
});
writeFileSync(outPath, png);
console.log(JSON.stringify({ ok: true, path: outPath, width: 640, bytes: png.length, textPreview: text.slice(0, 80) + "…" }));

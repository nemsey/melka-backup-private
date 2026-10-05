/**
 * تست رفت و برگشت ایمپورت (PN-003 گام ۴-۲) — شاهد زنده
 * ۱) خروجی اکسل واقعی را می‌خواند
 * ۲) عنوان آگهی کد 59782 را به مقدار تستی تغییر می‌دهد + یک ردیف تازه می‌سازد
 * ۳) فایل تغییریافته را در /tmp/import-test.xlsx می‌نویسد
 */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync("/tmp/export-test.xlsx") as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];

  // سرستون‌ها
  const header = ws.getRow(1);
  const cols: Record<string, number> = {};
  header.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const t = String((cell.value as { text?: string })?.text ?? cell.value ?? "").trim();
    if (t) cols[t] = colNumber;
  });
  console.log("cols:", Object.keys(cols).length, "| کد آگهی col:", cols["کد آگهی"], "| عنوان col:", cols["عنوان"]);

  let touched = 0;
  let newRow: ExcelJS.Row | null = null;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const codeCell = row.getCell(cols["کد آگهی"]).value;
    const code = String((codeCell as { text?: string })?.text ?? codeCell ?? "").trim();
    if (code === "59782") {
      row.getCell(cols["عنوان"]).value = "عنوان تست ایمپورت PN-003";
      touched++;
    }
  });

  // ردیف تازه: آگهی ساختگی با کد 99999999
  const added = ws.addRow([]);
  added.getCell(cols["کد آگهی"]).value = "99999999";
  added.getCell(cols["عنوان"]).value = "آگهی تست ایمپورت (تازه)";
  added.getCell(cols["کارشناس"]).value = "کارشناس تست";
  added.getCell(cols["قیمت (تومان)"]).value = 1234567890;
  added.getCell(cols["متراژ"]).value = 120;
  added.getCell(cols["منطقه"]).value = "ولیعصر";

  await wb.xlsx.writeFile("/tmp/import-test.xlsx");
  console.log(`touched: ${touched} · new row added → /tmp/import-test.xlsx`);
}

void main();

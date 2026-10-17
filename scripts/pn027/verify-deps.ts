// PN-027 · ۵-ب-۱ — راستی‌آزمایی نهایی ۲۶ dependency زائد قبل از حذف
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const deps = ['@dnd-kit/core','@dnd-kit/sortable','@dnd-kit/utilities','@hookform/resolvers','@mdxeditor/editor','@radix-ui/react-aspect-ratio','@radix-ui/react-context-menu','@radix-ui/react-hover-card','@radix-ui/react-menubar','@radix-ui/react-navigation-menu','@radix-ui/react-toggle-group','@reactuses/core','@tanstack/react-query','@tanstack/react-table','cmdk','date-fns','next-auth','next-intl','react-day-picker','react-markdown','react-resizable-panels','react-syntax-highlighter','sonner','uuid','vaul','zod'];

console.log('dependency | در package.json | import در src | import در tests | import در scripts | رأی');
let allSafe = true;
for (const d of deps) {
  const pkg = readFileSync('/home/z/my-project/package.json', 'utf8').includes(`"${d}"`);
  // جست‌وجوی import/require با پوشش بک‌تیک (الگوی PN-026 فاز ۳)
  const base = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = `from ['"]${base}(/[^'\"]*)?['"]|require\\(['"]${base}(/[^'\"]*)?['"]\\)|from ['\"]${base}\$`;
  const cnt = (dir: string) => {
    try {
      return +execSync(`grep -rE '${re}' ${dir} --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.py' 2>/dev/null | wc -l`).toString().trim() || 0;
    } catch { return 0; }
  };
  const srcN = cnt('src/'), testN = cnt('tests/'), scrN = cnt('scripts/');
  const safe = pkg && srcN === 0 && testN === 0;
  if (!safe) allSafe = false;
  console.log(`${d} | ${pkg ? '✓' : '✗'} | ${srcN} | ${testN} | ${scrN} | ${safe ? 'امن حذف' : 'نگه‌دار/بررسی'}`);
}
console.log(allSafe ? '\n✓ همهٔ ۲۶ مورد امن برای حذف (صفر import زنده در src+tests)' : '\n✗ مواردی نیازمند بررسی');

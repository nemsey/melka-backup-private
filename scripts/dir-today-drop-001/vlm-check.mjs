// DIR-TODAY-DROP-001 · VLM 目检两张 KPI 截图
import ZAI from 'z-ai-web-dev-sdk';
import { readFileSync } from 'node:fs';

const files = [
  ['download/dir-today-drop-001/02-m1-kpi-today.png', 'M1'],
  ['download/dir-today-drop-001/04-m2-kpi-today.png', 'M2'],
];
const zai = await ZAI.create();
for (const [f, tag] of files) {
  const b64 = readFileSync('/home/z/my-project/' + f).toString('base64');
  const r = await zai.chat.completions.create({
    messages: [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        { type: 'text', text: 'این اسکرین‌شات یک داشبورد فارسی است. فقط پاسخ بده: ۱) آیا کارتی با برچسب «آگهی امروز» یا «درخواست امروز» دیده می‌شود؟ ۲) عدد آن چند است؟ ۳) آیا زیرنویس کوچک «از نیمه‌شب تهران» زیر آن دیده می‌شود؟ ۴) آیا خطای رندر/به‌هم‌ریختگی آشکاری در کارت‌های شاخص هست؟ پاسخ کوتاه فارسی.' },
      ]},
    ],
  });
  console.log(`=== ${tag} (${f}) ===`);
  console.log(r.choices[0].message.content.trim().slice(0, 400));
}

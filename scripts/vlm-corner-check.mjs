import ZAI from 'z-ai-web-dev-sdk';
import { readFileSync } from 'node:fs';

async function main() {
  const zai = await ZAI.create();
  const b64 = readFileSync('/home/z/my-project/download/deploy-b3b4/corner-before-auth.png').toString('base64');
  const res = await zai.chat.completions.create({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'این برش کوچکی از گوشه پایین-چپ یک اسکرین‌شات مرورگر است (بزرگ‌نمایی‌شده). دقیقاً بگو چه چیزی در آن دیده می‌شود؟ اگر نشانگر/آیکون Next.js یا ابزار توسعه‌دهنده است صریحاً بگو.' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ],
    }],
  });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });

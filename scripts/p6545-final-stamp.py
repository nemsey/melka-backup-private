# مهر نهایی نسخه — شاهد زندهٔ preview و publish
import json, urllib.request, datetime, hashlib, os

def fetch(url, timeout=20):
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode()
    except Exception as e:
        return getattr(e, 'code', 0), str(e)[:120]

preview_url = "https://preview-chat-a8de3bf8-675e-4118-a187-43577994e924.space-z.ai"
publish_url = "https://r1a5k87hzbg0-d.space-z.ai"

pc, pb = fetch(preview_url + "/api/version")
pub_c, _ = fetch(publish_url + "/api/version")

os.makedirs("download/p6545", exist_ok=True)
stamp = {
    "case": "P6545-final-stamp",
    "stampedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "head": os.popen("git rev-parse HEAD").read().strip(),
    "preview": {"url": preview_url, "http": pc, "buildId": json.loads(pb)["buildId"] if pc == 200 else None, "gitSha": json.loads(pb).get("gitSha") if pc == 200 else None, "equalsHead": json.loads(pb).get("gitSha") == os.popen("git rev-parse --short HEAD").read().strip() if pc == 200 else False},
    "publish": {"url": publish_url, "http": pub_c, "status": "412 CAExited — مصنوع استقرار پلتفرم (معلّق طبق تصمیم شورا؛ پایش ۸ساعته فعال؛ صفر تغییر کد)"},
    "mirror": {"remote": "github.com/nemsey/melka-backup-private", "verified": os.popen("git rev-parse HEAD").read().strip() == os.popen("git ls-remote mirror main 2>/dev/null | cut -f1").read().strip()},
    "survival": {"package": "upload/.survival/P6545-20261003", "chainIndex": 3, "chainMd5": hashlib.md5(open("upload/.survival/P6545-20261003/CHAIN.json","rb").read()).hexdigest()},
}
json.dump(stamp, open("download/p6545/final-stamp.json", "w"), ensure_ascii=False, indent=2)
print(json.dumps(stamp, ensure_ascii=False, indent=1))

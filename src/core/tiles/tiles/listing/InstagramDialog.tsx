"use client";

/**
 * دیالوگ «انتقال به اینستاگرام» — تولید محتوا + پیش‌نمایش + تأیید + انتشار
 * ------------------------------------------------------
 * ۱. از اطلاعات فایل آگهی، محتوای مناسب (پست/رییلز + کپشن حرفه‌ای + هشتگ) تولید می‌شود
 * ۲. کاربر پیش‌نمایش را می‌بیند، لحن را عوض می‌کند و کپشن را ویرایش می‌نماید
 * ۳. با تأیید نهایی، محتوا در حساب اینستاگرام کسب‌وکار منتشر می‌شود
 */

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Instagram, Sparkles, RefreshCcw, Send, ShieldAlert, CheckCircle2, ImageIcon, Clapperboard, ExternalLink } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";
import type { ListingRow } from "@/lib/listing/types";

interface InstagramDraft {
  ok: boolean;
  content: {
    kind: "post" | "reel";
    tone: string;
    caption: string;
    hashtags: string[];
    mediaHint: string;
    reason: string;
  };
  media: { images: string[]; videos: string[] };
  price: string | null;
  tones: { value: string; label: string }[];
  connection: { connected: boolean; username: string | null; message: string };
  published: { at: string; mediaId: string } | null;
}

interface PublishResponse {
  ok: boolean;
  mediaId: string;
  permalink: string | null;
  kind: "post" | "reel";
  message: string;
}

export function InstagramDialog({
  listing,
  open,
  onOpenChange,
  onPublished,
}: {
  listing: ListingRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPublished: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<InstagramDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<PublishResponse | null>(null);

  const load = useCallback(
    async (tone?: string) => {
      if (!listing) return;
      setLoading(tone === undefined);
      setRegenerating(tone !== undefined);
      try {
        const res = await api<InstagramDraft>(`/api/listings/${listing.id}/instagram${tone ? `?tone=${tone}` : ""}`);
        setDraft(res);
        setCaption(res.content.caption);
        setImageUrl(res.media.images[0] ?? "");
        setConfirmed(false);
      } catch (err) {
        const e = err as ApiClientError;
        toast({ title: "تولید محتوا ناموفق", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
        setRegenerating(false);
      }
    },
    [listing, toast]
  );

  useEffect(() => {
    if (open && listing) {
      setResult(null);
      void load();
    }
  }, [open, listing, load]);

  const publish = async () => {
    if (!listing || !draft) return;
    if (!confirmed) {
      toast({ title: "تأیید نهایی لازم است", description: "پیش‌نمایش را بازبینی و تیک تأیید انتشار را بزنید.", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const res = await api<PublishResponse>(`/api/listings/${listing.id}/instagram`, {
        method: "POST",
        body: {
          caption,
          kind: draft.content.kind,
          imageUrl: imageUrl || undefined,
          videoUrl: draft.media.videos[0] || undefined,
          tone: draft.content.tone,
          confirmed: true,
        },
      });
      setResult(res);
      toast({ title: "انتشار موفق", description: res.message });
      onPublished();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "انتشار ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Instagram className="w-5 h-5 text-rose-600 dark:text-rose-400" aria-hidden /> انتقال به اینستاگرام — تولید محتوا و انتشار
          </DialogTitle>
          <DialogDescription>
            از اطلاعات فایل آگهی، محتوای حرفه‌ای (پست یا رییلز) تولید می‌شود؛ پس از بازبینی و تأیید شما منتشر می‌گردد.
          </DialogDescription>
        </DialogHeader>

        {loading && <Skeleton className="h-80 w-full rounded-xl" />}

        {!loading && draft && (
          <div className="space-y-4">
            {/* وضعیت اتصال */}
            <Alert variant={draft.connection.connected ? "default" : "destructive"}>
              {draft.connection.connected ? <CheckCircle2 className="w-4 h-4" aria-hidden /> : <ShieldAlert className="w-4 h-4" aria-hidden />}
              <AlertTitle className="text-xs">
                {draft.connection.connected ? `اتصال برقرار است${draft.connection.username ? ` — «${draft.connection.username}»` : ""}` : "اتصال اینستاگرام برقرار نیست"}
              </AlertTitle>
              <AlertDescription className="text-xs leading-5">{draft.connection.message}</AlertDescription>
            </Alert>

            {/* نوع محتوا + دلیل ایجنت */}
            <section className="rounded-xl border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-bold flex items-center gap-1.5">
                  {draft.content.kind === "reel" ? (
                    <>
                      <Clapperboard className="w-4 h-4 text-rose-600 dark:text-rose-400" aria-hidden /> رییلز (ویدیو)
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 text-primary" aria-hidden /> پست تصویری
                    </>
                  )}
                </h4>
                <div className="flex items-center gap-1.5">
                  <Select
                    value={draft.content.tone}
                    onValueChange={(v) => {
                      void load(v);
                    }}
                    disabled={regenerating}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs" aria-label="لحن محتوا">
                      <SelectValue placeholder="لحن محتوا" />
                    </SelectTrigger>
                    <SelectContent>
                      {draft.tones.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => void load(draft.content.tone)}
                    disabled={regenerating}
                    aria-label="بازتولید محتوا"
                  >
                    {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="w-3.5 h-3.5" aria-hidden />}
                    بازتولید
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-5">
                <Sparkles className="w-3.5 h-3.5 inline text-amber-500" aria-hidden /> {draft.content.reason} {draft.content.mediaHint}
              </p>
              {draft.media.images[0] && (
                <div className="rounded-lg border overflow-hidden bg-muted/30 max-h-56 flex items-center justify-center">
                  { }
                  <img src={draft.media.images[0]} alt="پیش‌نمایش تصویر اصلی فایل" className="max-h-56 w-auto" loading="lazy" />
                </div>
              )}
              {draft.media.images.length > 1 && (
                <p className="text-[10px] text-muted-foreground">{draft.media.images.length} تصویر در فایل موجود است — نخستین تصویر منتشر می‌شود.</p>
              )}
              {draft.content.kind === "post" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ig-image-url" className="text-xs">
                    نشانی عمومی تصویر اصلی (قابل ویرایش — اینستاگرام باید بتواند آن را دانلود کند)
                  </Label>
                  <Input
                    id="ig-image-url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://…"
                    dir="ltr"
                    className="text-xs font-mono"
                  />
                </div>
              )}
            </section>

            {/* کپشن قابل ویرایش */}
            <section className="rounded-xl border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold">کپشن (قابل ویرایش)</h4>
                <Badge variant="secondary" className="text-[10px]">{draft.content.hashtags.length} هشتگ</Badge>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full min-h-48 text-xs leading-7 rounded-lg border bg-transparent px-3 py-2 resize-y"
                maxLength={2200}
                aria-label="کپشن اینستاگرام"
              />
              <p className="text-[10px] text-muted-foreground">{caption.length.toLocaleString("fa-IR")} / ۲٬۲۰۰ نویسه</p>
            </section>

            {/* انتشار قبلی */}
            {draft.published && !result && (
              <p className="text-[11px] text-muted-foreground leading-5">
                انتشار قبلی: {faDateTime(draft.published.at)} — شناسه رسانه <span dir="ltr" className="font-mono">{draft.published.mediaId}</span>
              </p>
            )}

            {/* نتیجه انتشار */}
            {result && (
              <Alert>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <AlertTitle className="text-xs">{result.message}</AlertTitle>
                <AlertDescription className="text-xs">
                  شناسه رسامه: <span dir="ltr" className="font-mono">{result.mediaId}</span>
                  {result.permalink && (
                    <>
                      {" — "}
                      <a href={result.permalink} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                        مشاهدهٔ انتشار <ExternalLink className="w-3 h-3" aria-hidden />
                      </a>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* تأیید نهایی */}
            {!result && (
              <label className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 accent-primary"
                  aria-label="تأیید نهایی انتشار در اینستاگرام"
                />
                <span className="text-xs leading-5">
                  پیش‌نمایش محتوا و کپشن را بازبینی کردم و انتشار آن در حساب اینستاگرام{" "}
                  {draft.connection.username ? `«${draft.connection.username}»` : "کسب‌وکار"} را تأیید می‌کنم.
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
            بستن
          </Button>
          {!result && draft && (
            <Button
              className="gap-1.5 bg-gradient-to-l from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white"
              onClick={() => void publish()}
              disabled={publishing || !draft.connection.connected || caption.trim().length < 5 || (draft.content.kind === "post" && !imageUrl.trim())}
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
              تأیید و انتشار در اینستاگرام
            </Button>
          )}
          {result && (
            <Button className="gap-1.5" onClick={() => onOpenChange(false)}>
              <CheckCircle2 className="w-4 h-4" aria-hidden /> تمام
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

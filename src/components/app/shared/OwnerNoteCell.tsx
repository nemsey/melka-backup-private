"use client";

/**
 * OwnerNoteCell — سلول ستون «یادداشت» (PN-039 · گام ۴)
 * ---------------------------------------------------------------------------
 * آخرین ستون فهرست آگهی (M1) و فهرست درخواست (M2). مالک کلیک می‌کند، یادداشت
 * می‌نویسد، ذخیره می‌زند. ذخیره = PATCH /api/owner-notes/[entity]/[id].
 * طراحی: نمایش کوتاه (truncate) + title کامل · حالت ویرایش inline با ذخیره/لغو.
 */

import { useEffect, useRef, useState } from "react";
import { StickyNote, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";

export interface OwnerNoteCellProps {
  /** شناسهٔ رکورد (propertyRecord.id | requestRecord.id) */
  id: string;
  /** مقدار فعلی یادداشت */
  value: string | null;
  /** "property" (فهرست آگهی) | "request" (فهرست درخواست) */
  entity: "property" | "request";
  /** پس از ذخیرهٔ موفق — برای به‌روزرسانی ردیف در state صفحه */
  onSaved?: (note: string | null) => void;
  /** خطای ذخیره — صفحه با toast نمایش می‌دهد */
  onError?: (message: string) => void;
}

export function OwnerNoteCell({ id, value, entity, onSaved, onError }: OwnerNoteCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? "");
      // فوکوس پس از رندر — بدون جلوهٔ اسکرول (قانون: صفر پرش صفحه در فهرست)
      const t = setTimeout(() => areaRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [editing, value]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; ownerNote: string | null }>(`/api/owner-notes/${entity}/${id}`, {
        method: "PATCH",
        body: { note: draft },
      });
      if (res.ok) {
        onSaved?.(res.ownerNote);
        setEditing(false);
      }
    } catch (err) {
      onError?.((err as { message?: string })?.message ?? "ذخیرهٔ یادداشت ناموفق بود");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-44" data-owner-note-editing={id}>
        <textarea
          ref={areaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] leading-5 resize-y"
          placeholder="یادداشت مالک…"
          aria-label="یادداشت مالک"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="default"
            className="h-6 px-2 text-[10px]"
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              void save();
            }}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : <Check className="w-3 h-3" aria-hidden />}
            ذخیره
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(false);
            }}
          >
            <X className="w-3 h-3" aria-hidden />
            لغو
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-owner-note-cell={id}
      className="group/note inline-flex max-w-48 items-start gap-1 text-right rounded-md px-1 py-0.5 hover:bg-accent/60 transition-colors"
      title={value ? `${value}\n— برای ویرایش کلیک کنید` : "ثبت یادداشت مالک"}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <StickyNote className={`w-3 h-3 mt-0.5 shrink-0 ${value ? "text-amber-500" : "text-muted-foreground/50"}`} aria-hidden />
      {value ? (
        <span className="text-[11px] leading-5 whitespace-pre-wrap line-clamp-2">{value}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground/70 group-hover/note:text-foreground">ثبت یادداشت</span>
      )}
    </button>
  );
}

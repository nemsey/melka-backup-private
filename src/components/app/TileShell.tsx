"use client";

/**
 * پوسته کاشی — قاب مشترک همه کاشی‌ها
 * دکمه بازگشت، عنوان، توضیح و پنل تنظیمات اختصاصی همان کاشی (نه تنظیمات سراسری).
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Settings2, Info } from "lucide-react";
import type { TileDefinition, TileSettingDefinition, TilePageProps } from "@/core/tiles/tile-contract";
import { useAppStore } from "@/lib/client/store";
import { faNumber, faDigits } from "@/lib/format";

function SettingControl({ def, value, onChange }: { def: TileSettingDefinition; value: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  switch (def.type) {
    case "switch":
      return (
        <div className="flex items-center justify-between rounded-lg border bg-card p-3">
          <div className="space-y-0.5 me-4">
            <Label htmlFor={`set-${def.key}`} className="text-sm font-medium">
              {def.label}
            </Label>
            {def.hint && <p className="text-xs text-muted-foreground leading-relaxed">{def.hint}</p>}
          </div>
          <Switch id={`set-${def.key}`} checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1.5 rounded-lg border bg-card p-3">
          <Label className="text-sm font-medium">{def.label}</Label>
          {def.hint && <p className="text-xs text-muted-foreground leading-relaxed">{def.hint}</p>}
          <Select value={String(value)} onValueChange={onChange}>
            <SelectTrigger aria-label={def.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {def.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "number":
      return (
        <div className="space-y-1.5 rounded-lg border bg-card p-3">
          <Label htmlFor={`set-${def.key}`} className="text-sm font-medium">
            {def.label}
          </Label>
          {def.hint && <p className="text-xs text-muted-foreground leading-relaxed">{def.hint}</p>}
          <Input
            id={`set-${def.key}`}
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="text-left"
            min={def.min}
            max={def.max}
            value={String(value)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
          />
        </div>
      );
    default:
      return (
        <div className="space-y-1.5 rounded-lg border bg-card p-3">
          <Label htmlFor={`set-${def.key}`} className="text-sm font-medium">
            {def.label}
          </Label>
          {def.hint && <p className="text-xs text-muted-foreground leading-relaxed">{def.hint}</p>}
          <Input id={`set-${def.key}`} value={String(value)} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
  }
}

export function TileShell({ tile }: { tile: TileDefinition }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const goHome = useAppStore((s) => s.goHome);
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  // نکته: سلکتور باید مرجع پایدار برگرداند — مرج جدید هر رندر = حلقه بی‌نهایت
  const rawSettings = useAppStore((s) => s.tileSettings[tile.id]);
  const setTileSettings = useAppStore((s) => s.setTileSettings);

  const current = useMemo<Record<string, string | number | boolean>>(() => {
    const merged: Record<string, string | number | boolean> = {};
    for (const d of tile.settings) merged[d.key] = d.defaultValue;
    return { ...merged, ...(rawSettings ?? {}) };
  }, [rawSettings, tile.settings]);

  const Page = tile.component;
  const pageProps: TilePageProps = {
    settings: current,
    onSettingsChange: (patch) => setTileSettings(tile.id, patch),
    userRole,
    onBack: goHome,
  };

  const TileIcon = tile.icon;

  return (
    <div className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-6">
      {/* هدر کاشی */}
      <div className="flex items-center gap-3 sm:gap-4 mb-6">
        <Button variant="outline" size="icon" onClick={goHome} aria-label="بازگشت به خانه داشبورد">
          <ArrowRight className="w-5 h-5" aria-hidden />
        </Button>
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-md">
          <TileIcon className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-extrabold truncate">{tile.title}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{tile.tagline}</p>
        </div>

        {tile.settings.length > 0 && (
          <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 shrink-0">
                <Settings2 className="w-4 h-4" aria-hidden />
                <span className="hidden sm:inline">تنظیمات کاشی</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[19rem] sm:w-[21rem] overflow-y-auto">
              <SheetHeader className="text-right">
                <SheetTitle className="text-right">تنظیمات اختصاصی کاشی</SheetTitle>
                <SheetDescription className="text-right">
                  «{tile.title}» — این تنظیمات فقط همین کاشی را تغییر می‌دهند.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-3">
                <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground flex gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  <span>نسخه کاشی: {faDigits(tile.version)}</span>
                </div>
                {tile.settings.map((def) => (
                  <SettingControl
                    key={def.key}
                    def={def}
                    value={current[def.key]}
                    onChange={(v) => {
                      setTileSettings(tile.id, { [def.key]: v });
                    }}
                  />
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* محتوای صفحه کاشی */}
      <Page {...pageProps} />
    </div>
  );
}

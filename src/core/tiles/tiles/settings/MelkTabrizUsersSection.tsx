"use client";

/**
 * بخش «مدیریت کاربران ملک تبریز» — PN-017 شاهکار (شورا-ن۰۲۱ · جایگاه ۸)
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۷/۱۹):
 *   «این بخش مدیریت کاربران دپارتمان ملک تبریز را انجام دهد — شاهکار اپلیکیشن»
 * بررسی فراکامل/فراجامع/فراعمیق/چندوجهی سامانه‌های ملک تبریز (download/pn017/systems-audit.json)
 * و انتقال دقیق مدیریت کاربران به این بخش:
 *
 *   تب ۱ «کاربران سامانه» — سیستم کامل مدیریت کاربران (PN-016 — عیناً منتقل‌شده):
 *     فهرست/جستجو/فیلتر · افزودن/ویرایش · ماتریس مجوز کاشی×۵عملیات ·
 *     فعال/غیرفعال · بازنشانی قفل · سیاههٔ فعالیت (۲۴س/۷ر/۳۰ر) · نشست‌ها + بستن از راه دور
 *   تب ۲ «پرسنل ملک تبریز (PM)» — دفترچهٔ دپارتمان از سامانهٔ PM:
 *     ۱۴۳ پرسنل · جستجو · فیلتر شعبه/سمت · «فقط بدون حساب» ·
 *     نشان پیوند حساب اپ · دکمهٔ «ساخت کاربر» (فرم پیش‌پرشده)
 *   تب ۳ «همگام‌سازی PM» — وضعیت اتصال + همگام‌سازی زندهٔ پرسنل از سامانهٔ ملک تبریز
 *   تب ۴ «کارشناس فروش پنهان» — شاهکار PN-021 (دستور مالک ۱۴۰۵/۰۷/۲۶):
 *     ساخت کارشناس فروش در سامانه‌های ملک تبریز (اپلیکیشن ملکا) که در هیچ
 *     فهرست/آمار کاربری ظاهر نمی‌شود — فقط مالک در همین تب می‌بیند و مدیریت می‌کند.
 *   تب ۵ «راهنما» — راهنمای کامل نحوهٔ ایجاد کاربر در سامانه‌های ملک تبریز.
 *
 * فقط OWNER (روت‌های API نیز OWNER-only هستند).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Save, UserPlus, Users, KeyRound, Activity, LogOut, Search, ShieldCheck, Ban,
  Building2, RefreshCw, Link2, UserCheck, Crown, Database, Ghost, Eye, EyeOff, BookOpen,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { faDigits } from "@/lib/jalali";

/* ═══════════ انواع (قرارداد API) ═══════════ */

interface SafeUser {
  id: string; personnelCode: string | null; mobile: string | null; fullName: string;
  role: string; branchTitle: string | null; roleTitleFa: string | null; isActive: boolean;
  createdAt: string; lastLoginAt: string | null; lastLoginIp: string | null; lockedUntil: string | null;
  permissionCount: number;
  /** PN-021 — VISIBLE | HIDDEN */
  visibility: string;
}
interface TilePerm { tileId: string; canRead: boolean; canWrite: boolean; canDelete: boolean; canExport: boolean; canSync: boolean }
interface Registry { id: string; title: string }
interface ListResponse {
  ok: boolean; rows: SafeUser[]; registry: Registry[]; roles: Array<{ id: string; label: string }>;
  overview: { total: number; active: number; byRole: Record<string, number>; guests: number; sessionsActive: number; hidden: number };
}
interface ActivityRow { id: string; action: string; tileId: string | null; details: string | null; ip: string | null; timestamp: string }
interface SessionRow { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastActivityAt: string; expiresAt: string }

/** ردیف پرسنل ملک تبریز (از PM) با پیوند حساب اپ — قرارداد melkUsersDirectory */
interface PmPersonnelRow {
  personnelCode: string | null; fullName: string | null; mobile: string | null;
  roleTitle: string | null; branchTitle: string | null; headManager: string | null;
  hireDate: string | null; employmentType: number | null; voipExtension: string | null;
  active: boolean; saleCount: number; rentCount: number;
  hasAccount: boolean; accountRole: string | null; accountActive: boolean | null;
  /** PN-021 — حساب پنهان مالک */
  accountHidden: boolean;
}
interface DirectoryResponse {
  ok: boolean;
  rows: PmPersonnelRow[];
  stats: {
    pmTotal: number; pmActive: number; linkedAccounts: number; withoutAccount: number;
    byBranch: Record<string, number>; byRoleTitle: Record<string, number>; lastSyncedAt: string | null;
  };
  filterOptions: { branches: string[]; roleTitles: string[]; managers: string[] };
  pmConnection: { status: string; displayName: string | null; lastCheckedAt: string | null } | null;
  overview: ListResponse["overview"];
}
interface SyncStage {
  registryRows: number; registryError: string | null;
  deepAttempted: number; deepEnriched: number; deepFailed: number; deepRemaining: number;
  counts: { sale: number; rent: number; attributedTx: number; contracts: number } | null;
  countsError: string | null; durationMs: number;
}

/* ═══════════ ثابت‌های نمایش ═══════════ */

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  OWNER: { label: "مالک", cls: "bg-amber-500 text-amber-950" },
  MANAGER: { label: "مدیر", cls: "bg-primary text-primary-foreground" },
  EXPERT: { label: "کارشناس", cls: "bg-secondary text-secondary-foreground" },
  VIEWER: { label: "بازدید", cls: "bg-muted text-muted-foreground" },
  GUEST: { label: "مهمان", cls: "bg-muted/60 text-muted-foreground" },
};
const OPS: Array<{ key: keyof Omit<TilePerm, "tileId">; label: string }> = [
  { key: "canRead", label: "خواندن" },
  { key: "canWrite", label: "نوشتن" },
  { key: "canDelete", label: "حذف" },
  { key: "canExport", label: "خروجی" },
  { key: "canSync", label: "همگام" },
];

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return faDigits(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  } catch {
    return "—";
  }
};

const EMPLOYMENT_FA: Record<number, string> = { 1: "حق السهم (درصد)", 3: "حقوق ماهیانه" };

/* ═══════════ بخش شاهکار ═══════════ */

export function MelkTabrizUsersSection() {
  const { toast } = useToast();
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");

  // دادهٔ کاربران (تب ۱)
  const [rows, setRows] = useState<SafeUser[]>([]);
  const [registry, setRegistry] = useState<Registry[]>([]);
  const [roles, setRoles] = useState<Array<{ id: string; label: string }>>([]);
  const [overview, setOverview] = useState<ListResponse["overview"] | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // دفترچهٔ PM (تب ۲)
  const [pmRows, setPmRows] = useState<PmPersonnelRow[]>([]);
  const [pmStats, setPmStats] = useState<DirectoryResponse["stats"] | null>(null);
  const [pmOptions, setPmOptions] = useState<DirectoryResponse["filterOptions"] | null>(null);
  const [pmConn, setPmConn] = useState<DirectoryResponse["pmConnection"]>(null);
  const [pmSearch, setPmSearch] = useState("");
  const [pmBranch, setPmBranch] = useState("all");
  const [pmRole, setPmRole] = useState("all");
  const [pmOnlyWithout, setPmOnlyWithout] = useState(false);
  const [pmLoading, setPmLoading] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);

  // فرم ساخت/ویرایش
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SafeUser | null>(null);
  const [fCode, setFCode] = useState("");
  const [fMobile, setFMobile] = useState("");
  const [fName, setFName] = useState("");
  const [fRole, setFRole] = useState("EXPERT");
  const [fBranch, setFBranch] = useState("");
  const [fTitle, setFTitle] = useState("");

  // PN-021 — کارشناس فروش پنهان (تب ۴)
  const [hiddenRows, setHiddenRows] = useState<SafeUser[]>([]);
  const [hiddenLoading, setHiddenLoading] = useState(true);
  const [stealthOpen, setStealthOpen] = useState(false);
  const [sCode, setSCode] = useState("");
  const [sMobile, setSMobile] = useState("");
  const [sName, setSName] = useState("");
  const [sBranch, setSBranch] = useState("");
  const [sTitle, setSTitle] = useState("کارشناس فروش");

  // پنل جزئیات
  const [detail, setDetail] = useState<SafeUser | null>(null);
  const [perms, setPerms] = useState<TilePerm[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [actWindow, setActWindow] = useState<"24h" | "7d" | "30d">("24h");

  /* ── بارگذاری کاربران ── */
  const load = useCallback(async (opts?: { search?: string; role?: string }) => {
    try {
      const q = new URLSearchParams();
      const s = opts?.search ?? search;
      const r = opts?.role ?? roleFilter;
      if (s) q.set("search", s);
      if (r && r !== "all") q.set("role", r);
      q.set("includeInactive", "1");
      const res = await api<ListResponse>(`/api/admin/users?${q.toString()}`);
      setRows(res.rows ?? []);
      setRegistry(res.registry ?? []);
      setRoles(res.roles ?? []);
      setOverview(res.overview ?? null);
    } catch {
      /* OWNER نیست یا خطا */
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  /* ── بارگذاری دفترچهٔ PM ── */
  const loadDirectory = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (pmSearch) q.set("q", pmSearch);
      if (pmBranch !== "all") q.set("branch", pmBranch);
      if (pmRole !== "all") q.set("role", pmRole);
      if (pmOnlyWithout) q.set("onlyWithoutAccount", "1");
      const res = await api<DirectoryResponse>(`/api/admin/melk-users?${q.toString()}`);
      setPmRows(res.rows ?? []);
      setPmStats(res.stats ?? null);
      setPmOptions(res.filterOptions ?? null);
      setPmConn(res.pmConnection ?? null);
      setOverview((prev) => prev ?? res.overview ?? null);
    } catch {
      /* OWNER نیست یا خطا */
    } finally {
      setPmLoading(false);
    }
  }, [pmSearch, pmBranch, pmRole, pmOnlyWithout]);

  /* ── PN-021: بارگذاری کارشناسان پنهان (تب ۴) ── */
  const loadHidden = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      q.set("visibility", "HIDDEN");
      q.set("includeInactive", "1");
      const res = await api<ListResponse>(`/api/admin/users?${q.toString()}`);
      setHiddenRows(res.rows ?? []);
      setOverview((prev) => (prev ? { ...prev, hidden: res.overview?.hidden ?? 0 } : res.overview ?? null));
      setRegistry((prev) => (prev.length > 0 ? prev : res.registry ?? []));
    } catch {
      /* OWNER نیست یا خطا */
    } finally {
      setHiddenLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userRole === "OWNER") { void load(); void loadDirectory(); void loadHidden(); }
    else { setLoading(false); setPmLoading(false); setHiddenLoading(false); }
  }, [userRole, load, loadDirectory, loadHidden]);

  if (userRole !== "OWNER") return null; // فقط مالک می‌بیند (روت هم OWNER-only)

  /* ── عملیات کاربران (عین PN-016) ── */

  const openCreate = () => {
    setEditing(null); setFCode(""); setFMobile(""); setFName(""); setFRole("EXPERT"); setFBranch(""); setFTitle("");
    setFormOpen(true);
  };
  const openEdit = (u: SafeUser) => {
    setEditing(u); setFCode(u.personnelCode ?? ""); setFMobile(u.mobile ?? ""); setFName(u.fullName);
    setFRole(u.role); setFBranch(u.branchTitle ?? ""); setFTitle(u.roleTitleFa ?? "");
    setFormOpen(true);
  };
  /** ساخت کاربر از ردیف پرسنل PM — فرم پیش‌پرشده (پل PM→اپ) */
  const openFromPm = (p: PmPersonnelRow) => {
    setEditing(null);
    setFCode(p.personnelCode ?? "");
    setFMobile(p.mobile ?? "");
    setFName(p.fullName ?? "");
    setFRole("EXPERT");
    setFBranch(p.branchTitle ?? "");
    setFTitle(p.roleTitle ?? "");
    setFormOpen(true);
  };

  const saveForm = async () => {
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/admin/users/${editing.id}`, {
          method: "PATCH",
          body: { fullName: fName, role: fRole, branchTitle: fBranch || null, roleTitleFa: fTitle || null },
        });
        toast({ title: "کاربر به‌روزرسانی شد", description: `${fName} — ${ROLE_BADGE[fRole]?.label ?? fRole}` });
      } else {
        await api("/api/admin/users", {
          method: "POST",
          body: { personnelCode: fCode || null, mobile: fMobile || null, fullName: fName, role: fRole, branchTitle: fBranch || null, roleTitleFa: fTitle || null },
        });
        toast({ title: "کاربر ساخته شد", description: `${fName} — ${ROLE_BADGE[fRole]?.label ?? fRole} (مجوزهای پیش‌فرض نقش اعمال شد)` });
      }
      setFormOpen(false);
      await load();
      await loadDirectory();
    } catch (e) {
      toast({ title: "ذخیره ناموفق", description: e instanceof ApiClientError ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (u: SafeUser) => {
    setDetail(u); setPerms([]); setActivity([]); setSessions([]);
    try {
      const [d, a, s] = await Promise.all([
        api<{ ok: boolean; user: SafeUser; permissions: TilePerm[] }>(`/api/admin/users/${u.id}`),
        api<{ ok: boolean; rows: ActivityRow[] }>(`/api/admin/users/${u.id}/activity?window=24h`),
        api<{ ok: boolean; rows: SessionRow[] }>(`/api/admin/users/${u.id}/sessions`),
      ]);
      setPerms(d.permissions ?? []);
      setActivity(a.rows ?? []);
      setSessions(s.rows ?? []);
    } catch {
      toast({ title: "بارگذاری جزئیات ناموفق", variant: "destructive" });
    }
  };

  const changeActivityWindow = async (u: SafeUser, w: "24h" | "7d" | "30d") => {
    setActWindow(w);
    try {
      const a = await api<{ ok: boolean; rows: ActivityRow[] }>(`/api/admin/users/${u.id}/activity?window=${w}`);
      setActivity(a.rows ?? []);
    } catch { /* بی‌صدا */ }
  };

  const savePerms = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${detail.id}/permissions`, {
        method: "PUT",
        body: { permissions: perms },
      });
      toast({ title: "مجوزها ذخیره شد", description: `${detail.fullName} — ${faDigits(perms.length)} کاشی` });
    } catch (e) {
      toast({ title: "ذخیرهٔ مجوزها ناموفق", description: e instanceof ApiClientError ? e.message : "خطا", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: SafeUser) => {
    setBusy(true);
    try {
      if (u.isActive) {
        await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
        toast({ title: "کاربر غیرفعال شد", description: `${u.fullName} — همهٔ نشست‌هایش بسته شد` });
      } else {
        await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isActive: true } });
        toast({ title: "کاربر فعال شد", description: u.fullName });
      }
      await load();
      if (detail?.id === u.id) await openDetail({ ...u, isActive: !u.isActive });
    } catch (e) {
      toast({ title: "تغییر وضعیت ناموفق", description: e instanceof ApiClientError ? e.message : "خطا", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (u: SafeUser) => {
    setBusy(true);
    try {
      await api(`/api/admin/users/${u.id}/unlock`, { method: "POST" });
      toast({ title: "قفل حساب بازنشانی شد", description: `${u.fullName} — تلاش‌های ناموفق صفر شد` });
    } catch (e) {
      toast({ title: "بازنشانی ناموفق", description: e instanceof ApiClientError ? e.message : "خطا", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const closeSessions = async (u: SafeUser) => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; closed: number }>(`/api/admin/users/${u.id}/sessions`, { method: "DELETE" });
      toast({ title: "نشست‌ها بسته شد", description: `${u.fullName} — ${faDigits(r.closed)} نشست` });
      setSessions([]);
    } catch (e) {
      toast({ title: "بستن نشست‌ها ناموفق", description: e instanceof ApiClientError ? e.message : "خطا", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const setPerm = (tileId: string, key: keyof Omit<TilePerm, "tileId">, v: boolean) => {
    setPerms((prev) => prev.map((p) => (p.tileId === tileId ? { ...p, [key]: v } : p)));
  };

  /* ── همگام‌سازی PM (تب ۳) ── */

  const runSync = async () => {
    setSyncBusy(true);
    try {
      const r = await api<{ ok: boolean; stage: SyncStage }>("/api/experts/sync", { method: "POST" });
      const st = r.stage;
      toast({
        title: "همگام‌سازی PM کامل شد",
        description: `رجیستری: ${faDigits(String(st.registryRows))} پرسنل · عمق: ${faDigits(String(st.deepEnriched))} نفر (${(st.durationMs / 1000).toFixed(1)} ثانیه)`,
      });
      await loadDirectory();
    } catch (e) {
      toast({ title: "همگام‌سازی ناموفق", description: e instanceof ApiClientError ? e.message : "خطا", variant: "destructive" });
    } finally {
      setSyncBusy(false);
    }
  };

  /* ═══ PN-021: کارشناس فروش پنهان (تب ۴ — شاهکار) ═══ */

  const openStealthCreate = (fromPm?: PmPersonnelRow) => {
    setSCode(fromPm?.personnelCode ?? "");
    setSMobile(fromPm?.mobile ?? "");
    setSName(fromPm?.fullName ?? "");
    setSBranch(fromPm?.branchTitle ?? "");
    setSTitle(fromPm?.roleTitle ?? "کارشناس فروش");
    setStealthOpen(true);
  };

  const saveStealthForm = async () => {
    setBusy(true);
    try {
      const u = await api<{ ok: boolean; user: SafeUser }>("/api/admin/users", {
        method: "POST",
        body: {
          personnelCode: sCode || null,
          mobile: sMobile || null,
          fullName: sName,
          role: "EXPERT",
          branchTitle: sBranch || null,
          roleTitleFa: sTitle || "کارشناس فروش",
          visibility: "HIDDEN",
        },
      });
      toast({
        title: "کارشناس فروش پنهان ساخته شد",
        description: `${u.user.fullName} — در هیچ فهرست کاربری نمایان نیست؛ فقط مالک (شما) او را در همین تب می‌بیند`,
      });
      setStealthOpen(false);
      await loadHidden();
      await loadDirectory();
    } catch (e) {
      toast({ title: "ساخت کارشناس پنهان ناموفق", description: e instanceof ApiClientError ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const revealUser = async (u: SafeUser) => {
    setBusy(true);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { visibility: "VISIBLE" } });
      toast({ title: "کاربر نمایان شد", description: `${u.fullName} از این پس در فهرست کاربران سامانه دیده می‌شود` });
      await loadHidden();
      await load();
    } catch (e) {
      toast({ title: "نمایان‌سازی ناموفق", description: e instanceof ApiClientError ? e.message : "خطا", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const hideUser = async (u: SafeUser) => {
    setBusy(true);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { visibility: "HIDDEN" } });
      toast({ title: "کاربر پنهان شد", description: `${u.fullName} از فهرست کاربران سامانه حذف شد — مدیریت در تب «کارشناس فروش پنهان»` });
      await loadHidden();
      await load();
    } catch (e) {
      toast({ title: "پنهان‌سازی ناموفق", description: e instanceof ApiClientError ? e.message : "خطا", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /* ═══════════ رندر ═══════════ */

  return (
    <Card id="settings-users">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" aria-hidden /> مدیریت کاربران ملک تبریز
        </CardTitle>
        <CardDescription>
          شاهکار — مدیریت یکپارچهٔ کاربران دپارتمان ملک تبریز: کاربران اپلیکیشن، پرسنل سامانهٔ PM، مجوزهای دقیق هر کاشی، سیاههٔ فعالیت، نشست‌های فعال و کارشناس فروش پنهان
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* نمای کلی چندوجهی (کاربران اپ + دپارتمان PM) */}
        {overview && pmStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center" data-testid="mtb-overview">
            {[
              { label: "کاربران اپ", value: overview.total, icon: <Users className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
              { label: "پرسنل ملک تبریز (PM)", value: pmStats.pmTotal, icon: <Building2 className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
              { label: "پوشش حساب‌ها", value: `${pmStats.linkedAccounts}/${pmStats.pmTotal}`, icon: <Link2 className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
              { label: "شعبه‌های دپارتمان", value: Object.keys(pmStats.byBranch).length, icon: <Building2 className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
              { label: "کاربران فعال", value: overview.active, icon: <UserCheck className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
              { label: "نشست‌های زنده", value: overview.sessionsActive, icon: <Activity className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
              { label: "مهمان‌ها", value: overview.guests, icon: <Users className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
              { label: "پرسنل بدون حساب", value: pmStats.withoutAccount, icon: <UserPlus className="w-3.5 h-3.5 mx-auto text-muted-foreground" aria-hidden /> },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-2.5">
                <div className="text-lg font-bold tabular-nums">{faDigits(String(s.value))}</div>
                <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1 pt-0.5">{s.icon}{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <Tabs defaultValue="users" dir="rtl">
          <TabsList className="w-full flex-wrap h-auto">
            <TabsTrigger value="users" className="gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" aria-hidden /> کاربران سامانه
            </TabsTrigger>
            <TabsTrigger value="pm" className="gap-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5" aria-hidden /> پرسنل ملک تبریز (PM)
              {pmStats && <Badge variant="secondary" className="text-[9px] h-4 px-1">{faDigits(String(pmStats.pmTotal))}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="stealth" className="gap-1.5 text-xs">
              <Ghost className="w-3.5 h-3.5" aria-hidden /> کارشناس فروش پنهان
              {overview && overview.hidden > 0 && <Badge className="text-[9px] h-4 px-1 bg-amber-500 text-amber-950">{faDigits(String(overview.hidden))}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-1.5 text-xs">
              <Database className="w-3.5 h-3.5" aria-hidden /> همگام‌سازی PM
            </TabsTrigger>
            <TabsTrigger value="guide" className="gap-1.5 text-xs">
              <BookOpen className="w-3.5 h-3.5" aria-hidden /> راهنما
            </TabsTrigger>
          </TabsList>

          {/* ═══ تب ۱: کاربران سامانه (عین PN-016 — انتقال دقیق) ═══ */}
          <TabsContent value="users" className="space-y-4 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute start-2.5 top-2.5 w-4 h-4 text-muted-foreground" aria-hidden />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void load({ search: (e.target as HTMLInputElement).value }); }}
                  placeholder="جستجو: نام، کد پرسنلی، موبایل…"
                  className="ps-8"
                  aria-label="جستجوی کاربران"
                />
              </div>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); void load({ role: v }); }}>
                <SelectTrigger className="w-[140px]" aria-label="فیلتر نقش"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ نقش‌ها</SelectItem>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.label.split("—")[0].trim()}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={openCreate} className="gap-1.5" data-testid="users-add">
                <UserPlus className="w-3.5 h-3.5" aria-hidden /> افزودن کاربر
              </Button>
            </div>

            {loading ? (
              <p className="text-xs text-muted-foreground">در حال بارگذاری…</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">کاربری یافت نشد.</p>
            ) : (
              <div className="space-y-2" data-testid="users-list">
                {rows.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <button type="button" onClick={() => void openDetail(u)} className="flex flex-wrap items-center gap-2 min-w-0 text-start" data-testid={`users-row-${u.personnelCode ?? u.mobile}`}>
                      <span className="font-bold truncate max-w-[160px]">{u.fullName}</span>
                      {u.personnelCode && <span className="font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">{faDigits(u.personnelCode)}</span>}
                      {u.mobile && <span className="font-mono text-xs text-muted-foreground" dir="ltr">{faDigits(u.mobile)}</span>}
                      <Badge className={`text-[10px] ${ROLE_BADGE[u.role]?.cls ?? ""}`}>{ROLE_BADGE[u.role]?.label ?? u.role}</Badge>
                      {u.roleTitleFa && <span className="text-[10px] text-muted-foreground">{u.roleTitleFa}</span>}
                      {!u.isActive && <Badge variant="outline" className="text-[10px] text-destructive">غیرفعال</Badge>}
                      {u.role !== "OWNER" && u.role !== "GUEST" && (
                        <span className="text-[10px] text-muted-foreground">{faDigits(String(u.permissionCount))} کاشی</span>
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      {u.role !== "OWNER" && u.role !== "GUEST" && (
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => void hideUser(u)} disabled={busy} title="حذف از فهرست کاربران سامانه — مدیریت در تب کارشناس فروش پنهان">
                          <EyeOff className="w-3 h-3" aria-hidden /> پنهان
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void unlock(u)} disabled={busy || u.role === "OWNER"}>
                        <KeyRound className="w-3 h-3" aria-hidden /> بازنشانی قفل
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void toggleActive(u)} disabled={busy || u.role === "OWNER"}>
                        {u.isActive ? <Ban className="w-3 h-3" aria-hidden /> : <ShieldCheck className="w-3 h-3" aria-hidden />}
                        {u.isActive ? "غیرفعال" : "فعال"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openEdit(u)} disabled={busy}>ویرایش</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ═══ تب ۲: پرسنل ملک تبریز (دفترچهٔ PM) ═══ */}
          <TabsContent value="pm" className="space-y-3 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute start-2.5 top-2.5 w-4 h-4 text-muted-foreground" aria-hidden />
                <Input
                  value={pmSearch}
                  onChange={(e) => setPmSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void loadDirectory(); }}
                  placeholder="جستجو: نام، کد پرسنلی، موبایل، داخلی…"
                  className="ps-8"
                  aria-label="جستجوی پرسنل ملک تبریز"
                />
              </div>
              <Select value={pmBranch} onValueChange={(v) => setPmBranch(v)}>
                <SelectTrigger className="w-[150px]" aria-label="فیلتر شعبه"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ شعبه‌ها</SelectItem>
                  {pmOptions?.branches.map((b) => (
                    <SelectItem key={b} value={b}>{b} ({faDigits(String(pmStats?.byBranch[b] ?? 0))})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={pmRole} onValueChange={(v) => setPmRole(v)}>
                <SelectTrigger className="w-[150px]" aria-label="فیلتر سمت"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ سمت‌ها</SelectItem>
                  {pmOptions?.roleTitles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none rounded-md border px-2.5 py-2" data-testid="mtb-only-without">
                <Checkbox checked={pmOnlyWithout} onCheckedChange={(v) => setPmOnlyWithout(v === true)} aria-label="فقط پرسنل بدون حساب" />
                فقط بدون حساب
              </label>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void loadDirectory()}>
                <RefreshCw className="w-3.5 h-3.5" aria-hidden /> به‌روزرسانی
              </Button>
            </div>

            {pmStats && (
              <p className="text-[11px] text-muted-foreground" data-testid="mtb-pm-caption">
                {faDigits(String(pmRows.length))} نفر از {faDigits(String(pmStats.pmTotal))} پرسنل دپارتمان ملک تبریز
                {pmStats.lastSyncedAt && <> — آخرین همگام‌سازی PM: {fmtDate(pmStats.lastSyncedAt)}</>}
                {" "}· {faDigits(String(pmStats.linkedAccounts))} نفر دارای حساب اپلیکیشن
              </p>
            )}

            {pmLoading ? (
              <p className="text-xs text-muted-foreground">در حال بارگذاری دفترچهٔ دپارتمان…</p>
            ) : pmRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">پرسنلی مطابق فیلترها یافت نشد.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto space-y-1.5" data-testid="mtb-pm-list">
                {pmRows.map((p) => (
                  <div key={p.personnelCode ?? p.fullName ?? Math.random().toString(36)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2" data-testid={`mtb-pm-row-${p.personnelCode}`}>
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-bold text-sm truncate max-w-[150px]">{p.fullName ?? "—"}</span>
                      {p.personnelCode && <span className="font-mono text-[11px] tabular-nums text-muted-foreground" dir="ltr">{faDigits(p.personnelCode)}</span>}
                      {p.branchTitle && <Badge variant="outline" className="text-[10px]">{p.branchTitle}</Badge>}
                      {p.roleTitle && <span className="text-[10px] text-muted-foreground">{p.roleTitle}</span>}
                      {p.hasAccount ? (
                        p.accountHidden ? (
                          <Badge className="text-[9px] bg-amber-500 text-amber-950" data-testid={`mtb-hidden-account-${p.personnelCode}`}>
                            <Ghost className="w-2.5 h-2.5 me-0.5" aria-hidden />
                            حساب پنهان
                          </Badge>
                        ) : (
                          <Badge className={`text-[9px] ${ROLE_BADGE[p.accountRole ?? ""]?.cls ?? "bg-muted text-muted-foreground"}`} data-testid={`mtb-has-account-${p.personnelCode}`}>
                            <Crown className="w-2.5 h-2.5 me-0.5" aria-hidden />
                            {p.accountActive === false ? "حساب غیرفعال" : `حساب ${ROLE_BADGE[p.accountRole ?? ""]?.label ?? p.accountRole ?? ""}`}
                          </Badge>
                        )
                      ) : (
                        <Badge variant="secondary" className="text-[9px] text-muted-foreground">بدون حساب اپ</Badge>
                      )}
                      {p.employmentType && p.employmentType in EMPLOYMENT_FA && (
                        <span className="text-[10px] text-muted-foreground">{EMPLOYMENT_FA[p.employmentType]}</span>
                      )}
                    </div>
                    {!p.hasAccount && p.personnelCode && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => openFromPm(p)} disabled={busy} data-testid={`mtb-promote-${p.personnelCode}`}>
                          <UserPlus className="w-3 h-3" aria-hidden /> ساخت کاربر
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => openStealthCreate(p)} disabled={busy} title="ساخت کارشناس فروش پنهان — بدون حضور در فهرست کاربران" data-testid={`mtb-stealth-promote-${p.personnelCode}`}>
                          <Ghost className="w-3 h-3" aria-hidden /> پنهان
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ═══ تب ۳: همگام‌سازی PM ═══ */}
          <TabsContent value="sync" className="space-y-4 pt-3">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-primary" aria-hidden /> اتصال به سامانهٔ PM ملک تبریز
                </h4>
                <Badge variant={pmConn?.status === "connected" ? "default" : "outline"} className="text-[10px]" data-testid="mtb-pm-status">
                  {pmConn?.status === "connected" ? "متصل" : pmConn?.status ? pmConn.status : "متصل نشده"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {pmConn?.displayName ? `حساب متصل: ${pmConn.displayName}` : "از بخش «اتصال به ملک تبریز» بالای همین صفحه، ورود PM مالک را برقرار کنید."}
                {pmConn?.lastCheckedAt && <> — آخرین بررسی: {fmtDate(pmConn.lastCheckedAt)}</>}
              </p>
              <p className="text-xs text-muted-foreground">
                همگام‌سازی، رجیستری پرسنل (کد/نام/موبایل) + عمق PM (شعبه/سمت/مدیر/استخدام) را از سامانهٔ ملک تبریز می‌گیرد و آینهٔ محلی را به‌روز می‌کند — فقط GET به مبدأ، بدون حذف رکورد (دادهٔ مقدس).
              </p>
              <Button size="sm" onClick={() => void runSync()} disabled={syncBusy} className="gap-1.5" data-testid="mtb-sync-btn">
                {syncBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden />}
                همگام‌سازی پرسنل از PM
              </Button>
            </div>
            {pmStats && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center">
                {Object.entries(pmStats.byBranch).map(([b, c]) => (
                  <div key={b} className="rounded-lg border p-2.5">
                    <div className="text-lg font-bold tabular-nums">{faDigits(String(c))}</div>
                    <div className="text-[10px] text-muted-foreground">شعبهٔ {b}</div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          {/* ═══ تب ۴: کارشناس فروش پنهان — شاهکار PN-021 ═══ */}
          <TabsContent value="stealth" className="space-y-4 pt-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-2" data-testid="stealth-intro">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Ghost className="w-4 h-4 text-amber-600" aria-hidden /> کارشناس فروش پنهان — قابلیت ویژهٔ مالک
              </h4>
              <p className="text-xs text-muted-foreground leading-6">
                کارشناس فروش پنهان، کاربری است که شما (مالک سامانه) می‌سازید و <strong>در هیچ فهرست، آمار یا گزارش کاربری ظاهر نمی‌شود</strong> —
                نه در فهرست «کاربران سامانه»، نه در آمار نمای کلی، نه برای هیچ مدیر یا کارشناس دیگری. تنها نقطهٔ مدیریت او همین تب است که فقط خودتان می‌بینید.
              </p>
              <p className="text-xs text-muted-foreground leading-6">
                کارشناس پنهان دقیقاً مانند هر کارشناس دیگری <strong>با کد پرسنلی و کد پیامکی وارد می‌شود</strong>، به کاشی‌های کارشناسان دسترسی دارد و عادی کار می‌کند؛
                فقط «حضورش در فهرست‌ها» حذف شده است. هر زمان بخواهید می‌توانید او را «نمایان» کنید تا به فهرست عادی بازگردد.
              </p>
              <p className="text-[11px] text-muted-foreground border-s-2 border-amber-500/60 ps-2 leading-5">
                نکتهٔ ورود: کد پرسنلی باید در سامانهٔ ARM ثبت شده باشد تا پیامک کد تأیید ارسال شود — راحت‌ترین راه، انتخاب پرسنل از تب «پرسنل ملک تبریز (PM)» با دکمهٔ «پنهان» است.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" data-testid="stealth-caption">
                {hiddenLoading
                  ? "در حال بارگذاری…"
                  : `${faDigits(String(hiddenRows.length))} کارشناس پنهان فعال در سامانه‌های ملک تبریز`}
              </p>
              <Button size="sm" onClick={() => openStealthCreate()} className="gap-1.5" data-testid="stealth-add">
                <UserPlus className="w-3.5 h-3.5" aria-hidden /> ساخت کارشناس فروش پنهان
              </Button>
            </div>

            {!hiddenLoading && hiddenRows.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-4 text-center">
                هنوز کارشناس پنهانی ساخته نشده است — اولین را با دکمهٔ بالا بسازید.
              </p>
            ) : (
              <div className="space-y-2" data-testid="stealth-list">
                {hiddenRows.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2" data-testid={`stealth-row-${u.personnelCode ?? u.mobile}`}>
                    <button type="button" onClick={() => void openDetail(u)} className="flex flex-wrap items-center gap-2 min-w-0 text-start">
                      <Ghost className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden />
                      <span className="font-bold truncate max-w-[160px]">{u.fullName}</span>
                      {u.personnelCode && <span className="font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">{faDigits(u.personnelCode)}</span>}
                      {u.mobile && <span className="font-mono text-xs text-muted-foreground" dir="ltr">{faDigits(u.mobile)}</span>}
                      <Badge className={`text-[10px] ${ROLE_BADGE[u.role]?.cls ?? ""}`}>{ROLE_BADGE[u.role]?.label ?? u.role}</Badge>
                      {u.roleTitleFa && <span className="text-[10px] text-muted-foreground">{u.roleTitleFa}</span>}
                      {!u.isActive && <Badge variant="outline" className="text-[10px] text-destructive">غیرفعال</Badge>}
                      {u.lastLoginAt && <span className="text-[10px] text-muted-foreground">آخرین ورود: {fmtDate(u.lastLoginAt)}</span>}
                    </button>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void revealUser(u)} disabled={busy} data-testid={`stealth-reveal-${u.personnelCode}`}>
                        <Eye className="w-3 h-3" aria-hidden /> نمایان
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void unlock(u)} disabled={busy}>
                        <KeyRound className="w-3 h-3" aria-hidden /> بازنشانی قفل
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void toggleActive(u)} disabled={busy}>
                        {u.isActive ? <Ban className="w-3 h-3" aria-hidden /> : <ShieldCheck className="w-3 h-3" aria-hidden />}
                        {u.isActive ? "غیرفعال" : "فعال"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ═══ تب ۵: راهنما — راهنمای نحوهٔ ایجاد کاربر در سامانه‌های ملک تبریز ═══ */}
          <TabsContent value="guide" className="space-y-4 pt-3">
            <div className="rounded-lg border p-4 space-y-4" data-testid="mtb-guide">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-primary" aria-hidden /> راهنمای ایجاد کاربر در سامانه‌های ملک تبریز
                </h4>
                <p className="text-xs text-muted-foreground pt-1 leading-6">
                  این بخش تنها نقطهٔ مدیریت کاربران اپلیکیشن ملکا (سامانه‌های ملک تبریز) است و فقط مالک سامانه به آن دسترسی دارد.
                  سه مسیر برای ایجاد کاربر وجود دارد؛ مسیر سوم — کارشناس فروش پنهان — قابلیت ویژهٔ مالک است.
                </p>
              </div>

              <div className="rounded-md border p-3 space-y-1.5">
                <h5 className="text-xs font-bold">مسیر ۱ — کاربر عادی (نمایان)</h5>
                <ol className="text-xs text-muted-foreground leading-6 list-decimal ps-5 space-y-0.5">
                  <li>در همین بخش، تب «کاربران سامانه» را باز کنید.</li>
                  <li>دکمهٔ «افزودن کاربر» را بزنید.</li>
                  <li>کد پرسنلی یا موبایل، نام کامل و نقش (کارشناس/مدیر/بازدید) را وارد کنید — شعبه و سمت اختیاری است.</li>
                  <li>«ذخیره» را بزنید — مجوزهای پیش‌فرض نقش به‌صورت خودکار اعمال می‌شود و کاربر در فهرست نمایان است.</li>
                </ol>
              </div>

              <div className="rounded-md border p-3 space-y-1.5">
                <h5 className="text-xs font-bold">مسیر ۲ — از دفترچهٔ پرسنل ملک تبریز (PM)</h5>
                <ol className="text-xs text-muted-foreground leading-6 list-decimal ps-5 space-y-0.5">
                  <li>تب «پرسنل ملک تبریز (PM)» را باز کنید — دفترچهٔ ۱۴۳ نفرهٔ دپارتمان از سامانهٔ PM بارگذاری می‌شود.</li>
                  <li>با فیلتر «فقط بدون حساب» پرسنلِ بدون حساب اپ را ببینید.</li>
                  <li>روی ردیف پرسنل، دکمهٔ «ساخت کاربر» را بزنید — فرم با نام/کد/موبایل/شعبه/سمت او پیش‌پرشده است.</li>
                  <li>«ذخیره» را بزنید — پیوند پرسنل PM با حساب اپ برقرار می‌شود.</li>
                  <li>اگر پرسنل تازه‌ای در سامانهٔ PM ثبت شده باشد، ابتدا تب «همگام‌سازی PM» را اجرا کنید تا دفترچه به‌روز شود.</li>
                </ol>
              </div>

              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-1.5">
                <h5 className="text-xs font-bold flex items-center gap-1.5">
                  <Ghost className="w-3.5 h-3.5 text-amber-600" aria-hidden /> مسیر ۳ — کارشناس فروش پنهان (قابلیت ویژهٔ مالک)
                </h5>
                <ol className="text-xs text-muted-foreground leading-6 list-decimal ps-5 space-y-0.5">
                  <li>تب «کارشناس فروش پنهان» را باز کنید (همین صفحه).</li>
                  <li>دکمهٔ «ساخت کارشناس فروش پنهان» را بزنید — یا از تب PM روی ردیف پرسنلِ بدون حساب، دکمهٔ «پنهان» را بزنید تا فرم پیش‌پرشده باز شود.</li>
                  <li>کد پرسنلی (الزامی برای ورود پیامکی)، نام کامل، موبایل و شعبه را وارد کنید — سمت پیش‌فرض «کارشناس فروش» است.</li>
                  <li>«ساخت» را بزنید — کاربر با نقش کارشناس ساخته می‌شود اما <strong>در هیچ فهرست کاربری ظاهر نمی‌شود</strong>؛ مدیریت او فقط در همین تب است.</li>
                  <li>به کارشناس بگویید مانند همکارانش با همان کد پرسنلی و کد پیامکی وارد اپلیکیشن شود — تجربهٔ ورود و کار او کاملاً عادی است.</li>
                  <li>هر زمان خواستید با دکمهٔ «نمایان» او را به فهرست عادی کاربران بازگردانید، یا با «غیرفعال» دسترسی‌اش را قطع کنید.</li>
                </ol>
                <p className="text-[11px] text-muted-foreground border-s-2 border-amber-500/60 ps-2 leading-5">
                  صداقت فنی: کارشناس پنهان فقط در «نمایش» پنهان است — ورود، مجوزها و ثبت فعالیتش عادی کار می‌کند و سیاههٔ حسابرسی مالک رویداد ساخت/نمایان‌سازی را ثبت می‌کند.
                  به سامانهٔ خارجی PM/ARM هیچ چیزی نوشته نمی‌شود (همگام‌سازی فقط خواندنی است).
                </p>
              </div>

              <div className="rounded-md border p-3 space-y-1.5">
                <h5 className="text-xs font-bold">نحوهٔ ورود کاربرها و رفع اشکال</h5>
                <ul className="text-xs text-muted-foreground leading-6 list-disc ps-5 space-y-0.5">
                  <li>ورود کارشناسان: صفحهٔ ورود ← «کد پرسنلی» ← دریافت کد پیامکی (از سامانهٔ ARM ارسال می‌شود) ← وارد شدن.</li>
                  <li>اگر پیامک نرسید: کد پرسنلی باید در سامانهٔ ARM فعال باشد؛ «بازنشانی قفل» را امتحان کنید یا چند دقیقه بعد دوباره درخواست بدهید.</li>
                  <li>مدیریت مجوزهای کاشی‌ها: روی نام کاربر بزنید ← ماتریس مجوز×کاشی ← ذخیره.</li>
                  <li>قطع دسترسی فوری: دکمهٔ «غیرفعال» — همهٔ نشست‌های فعال کاربر همان لحظه بسته می‌شود.</li>
                  <li>پسوردی وجود ندارد؛ احراز هویت همیشه با پیامک است و مهمان‌ها با موبایل وارد می‌شوند.</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* ── فرم ساخت/ویرایش ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش کاربر" : "افزودن کاربر تازه"}</DialogTitle>
            <DialogDescription>
              {editing ? "تغییر نام، نقش، شعبه و سمت" : "کد پرسنلی یا موبایل + نام + نقش — مجوزهای پیش‌فرض نقش اعمال می‌شود"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!editing && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="u-code">کد پرسنلی</Label>
                  <Input id="u-code" value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="410xxxxxxx" dir="ltr" inputMode="numeric" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="u-mobile">موبایل (مهمان)</Label>
                  <Input id="u-mobile" value={fMobile} onChange={(e) => setFMobile(e.target.value)} placeholder="09xxxxxxxxx" dir="ltr" inputMode="numeric" />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="u-name">نام کامل</Label>
              <Input id="u-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="نام و نام خانوادگی" />
            </div>
            <div className="space-y-1">
              <Label>نقش</Label>
              <Select value={fRole} onValueChange={setFRole} disabled={editing?.role === "OWNER"}>
                <SelectTrigger aria-label="نقش کاربر"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="u-branch">شعبه</Label>
                <Input id="u-branch" value={fBranch} onChange={(e) => setFBranch(e.target.value)} placeholder="مثلاً ملک تبریز" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="u-title">سمت</Label>
                <Input id="u-title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="مثلاً مشاور فروش" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setFormOpen(false)}>انصراف</Button>
            <Button size="sm" onClick={() => void saveForm()} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Save className="w-3.5 h-3.5" aria-hidden />} ذخیره
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── پنل جزئیات: مجوزها + نشست‌ها + فعالیت ── */}
      <Dialog open={Boolean(detail)} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detail.fullName}
                  <Badge className={`text-[10px] ${ROLE_BADGE[detail.role]?.cls ?? ""}`}>{ROLE_BADGE[detail.role]?.label ?? detail.role}</Badge>
                  {detail.lastLoginAt && <span className="text-[10px] font-normal text-muted-foreground">آخرین ورود: {fmtDate(detail.lastLoginAt)}</span>}
                </DialogTitle>
                <DialogDescription>ماتریس مجوزها · سیاههٔ فعالیت · نشست‌های فعال</DialogDescription>
              </DialogHeader>

              {/* ماتریس مجوزها */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" aria-hidden /> مجوزهای کاشی‌ها</h4>
                  {detail.role !== "OWNER" ? (
                    <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => void savePerms()} disabled={busy}>
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : <Save className="w-3 h-3" aria-hidden />} ذخیرهٔ مجوزها
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">مالک بدون محدودیت — ماتریس غیرفعال</span>
                  )}
                </div>
                {detail.role === "GUEST" ? (
                  <p className="text-xs text-muted-foreground">مهمان فقط صفحهٔ خانه را می‌بیند (بدون کاشی).</p>
                ) : perms.length === 0 ? (
                  <p className="text-xs text-muted-foreground">مجوزی ثبت نشده — پس از بازنشانی نقش، ماتریس پیش‌فرض ساخته می‌شود.</p>
                ) : (
                  <div className="rounded-md border overflow-x-auto" data-testid="users-perm-matrix">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="p-2 text-start font-medium">کاشی</th>
                          {OPS.map((o) => <th key={o.key} className="p-2 font-medium">{o.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {perms.map((p) => (
                          <tr key={p.tileId} className="border-b last:border-0">
                            <td className="p-2">{registry.find((r) => r.id === p.tileId)?.title ?? p.tileId}</td>
                            {OPS.map((o) => (
                              <td key={o.key} className="p-2 text-center">
                                <Checkbox
                                  aria-label={`${o.label} — ${p.tileId}`}
                                  checked={Boolean(p[o.key])}
                                  disabled={detail.role === "OWNER"}
                                  onCheckedChange={(v) => setPerm(p.tileId, o.key, v === true)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* نشست‌های فعال */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5"><LogOut className="w-4 h-4 text-primary" aria-hidden /> نشست‌های فعال ({faDigits(String(sessions.length))})</h4>
                  {sessions.length > 0 && (
                    <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => void closeSessions(detail)} disabled={busy}>
                      بستن همه از راه دور
                    </Button>
                  )}
                </div>
                {sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">نشست فعالی وجود ندارد.</p>
                ) : (
                  <div className="space-y-1">
                    {sessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-[11px]">
                        <span className="font-mono" dir="ltr">{s.ip ?? "—"}</span>
                        <span className="text-muted-foreground">آخرین فعالیت: {fmtDate(s.lastActivityAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* سیاههٔ فعالیت */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5"><Activity className="w-4 h-4 text-primary" aria-hidden /> سیاههٔ فعالیت</h4>
                  <div className="flex items-center gap-1">
                    {(["24h", "7d", "30d"] as const).map((w) => (
                      <Button key={w} size="sm" variant={actWindow === w ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => void changeActivityWindow(detail, w)}>
                        {w === "24h" ? "۲۴ ساعت" : w === "7d" ? "۷ روز" : "۳۰ روز"}
                      </Button>
                    ))}
                  </div>
                </div>
                {activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">در این بازه فعالیتی ثبت نشده است.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {activity.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-[11px]">
                        <span className="font-medium">{a.action}</span>
                        <span className="text-muted-foreground truncate max-w-[220px]">{a.details ?? ""}</span>
                        <span className="text-muted-foreground shrink-0">{fmtDate(a.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── PN-021: فرم ساخت کارشناس فروش پنهان ── */}
      <Dialog open={stealthOpen} onOpenChange={setStealthOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Ghost className="w-4 h-4 text-amber-600" aria-hidden /> ساخت کارشناس فروش پنهان
            </DialogTitle>
            <DialogDescription>
              کاربر با نقش «کارشناس» ساخته می‌شود ولی در هیچ فهرست/آمار کاربری ظاهر نمی‌شود — فقط مالک او را در تب «کارشناس فروش پنهان» می‌بیند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="st-code">کد پرسنلی *</Label>
                <Input id="st-code" value={sCode} onChange={(e) => setSCode(e.target.value)} placeholder="410xxxxxxx" dir="ltr" inputMode="numeric" data-testid="stealth-code" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-mobile">موبایل (اختیاری)</Label>
                <Input id="st-mobile" value={sMobile} onChange={(e) => setSMobile(e.target.value)} placeholder="09xxxxxxxxx" dir="ltr" inputMode="numeric" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="st-name">نام کامل *</Label>
              <Input id="st-name" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="نام و نام خانوادگی کارشناس" data-testid="stealth-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="st-branch">شعبه</Label>
                <Input id="st-branch" value={sBranch} onChange={(e) => setSBranch(e.target.value)} placeholder="مثلاً ملک تبریز" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-title">سمت</Label>
                <Input id="st-title" value={sTitle} onChange={(e) => setSTitle(e.target.value)} placeholder="کارشناس فروش" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground border-s-2 border-amber-500/60 ps-2 leading-5">
              نکته: کد پرسنلی باید در سامانهٔ ARM ثبت شده باشد تا کارشناس بتواند با پیامک وارد شود — از تب PM با دکمهٔ «پنهان» این فرم را پیش‌پرشده باز کنید.
            </p>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setStealthOpen(false)}>انصراف</Button>
            <Button size="sm" onClick={() => void saveStealthForm()} disabled={busy} className="gap-1.5" data-testid="stealth-save">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Ghost className="w-3.5 h-3.5" aria-hidden />} ساخت پنهان
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

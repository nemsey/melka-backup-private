"use client";

/**
 * Store اصلی اپلیکیشن (Zustand)
 * ------------------------------------------------------
 * ماشین وضعیت SPA: boot → auth → otp → home ⇄ tile
 * تنظیمات اختصاصی هر کاشی با فضای‌نام مستقل (tileId) و ماندگاری در localStorage.
 * توکن نشست به‌صورت رمزنگاری‌شده (AES-GCM) جدا از این store نگهداری می‌شود.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { secureSave, secureLoad, secureClear } from "@/lib/auth/secure-storage";
import { bindAuth, api } from "./api";

export type AppStage = "boot" | "auth" | "otp" | "home" | "tile";

export interface AuthUser {
  personnelCode: string;
  displayName: string;
  role: "OWNER" | "CONSULTANT";
  expiresAt: string;
}

interface AppState {
  stage: AppStage;
  user: AuthUser | null;
  token: string | null;
  pendingPersonnelCode: string | null;
  activeTileId: string | null;
  /** کاشی ظرفی که کاشی فعلی از آن باز شده است (بازگشت هوشمند: فرزند ← ظرف ← خانه) */
  tileReturnTo: string | null;
  /** تنظیمات اختصاصی کاشی‌ها: { [tileId]: { key: value } } */
  tileSettings: Record<string, Record<string, string | number | boolean>>;

  setStage: (s: AppStage) => void;
  setPendingPersonnelCode: (code: string | null) => void;
  openTile: (tileId: string, returnTo?: string | null) => void;
  goHome: () => void;
  /** بازگشت هوشمند: اگر کاشی از داخل یک ظرف (مثل داشبورد مدیریتی) باز شده باشد،
   *  به همان ظرف برمی‌گردد؛ وگرنه به صفحه خانه */
  goBack: () => void;
  setTileSettings: (tileId: string, patch: Record<string, string | number | boolean>) => void;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  boot: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      // اتصال نگهبان 401 → خروج خودکار
      bindAuth(
        () => get().token,
        () => {
          void get().logout();
        }
      );

      return {
        stage: "boot",
        user: null,
        token: null,
        pendingPersonnelCode: null,
        activeTileId: null,
        tileReturnTo: null,
        tileSettings: {},

        setStage: (s) => set({ stage: s }),
        setPendingPersonnelCode: (code) => set({ pendingPersonnelCode: code }),
        openTile: (tileId, returnTo = null) => set({ activeTileId: tileId, stage: "tile", tileReturnTo: returnTo }),
        goHome: () => set({ activeTileId: null, stage: "home", tileReturnTo: null }),
        goBack: () => {
          const { tileReturnTo, activeTileId } = get();
          if (tileReturnTo && tileReturnTo !== activeTileId) {
            set({ activeTileId: tileReturnTo, stage: "tile", tileReturnTo: null });
          } else {
            set({ activeTileId: null, stage: "home", tileReturnTo: null });
          }
        },

        setTileSettings: (tileId, patch) =>
          set((state) => ({
            tileSettings: {
              ...state.tileSettings,
              [tileId]: { ...(state.tileSettings[tileId] ?? {}), ...patch },
            },
          })),

        login: async (token, user) => {
          await secureSave({
            token,
            user: { personnelCode: user.personnelCode, displayName: user.displayName, role: user.role },
            expiresAt: user.expiresAt,
            savedAt: new Date().toISOString(),
          });
          set({ token, user, stage: "home", pendingPersonnelCode: null, activeTileId: null, tileReturnTo: null });
        },

        logout: async () => {
          const token = get().token;
          if (token) {
            try {
              await api("/api/auth/session", { method: "DELETE" });
            } catch {
              // خروج سرور ناموفق — خروج محلی همچنان انجام می‌شود
            }
          }
          await secureClear();
          set({ token: null, user: null, stage: "auth", activeTileId: null, tileReturnTo: null, pendingPersonnelCode: null });
        },

        boot: async () => {
          try {
            const saved = await secureLoad();
            if (saved) {
              // ابتدا توکن را در store تنظیم می‌کنیم تا api() آن را در هدر بفرستد
              set({
                token: saved.token,
                user: {
                  personnelCode: saved.user.personnelCode,
                  displayName: saved.user.displayName,
                  role: saved.user.role as "OWNER" | "CONSULTANT",
                  expiresAt: saved.expiresAt,
                },
              });
              // اعتبارسنجی نشست روی سرور
              const res = await api<{ ok: boolean; user: AuthUser }>("/api/auth/session");
              if (res.ok) {
                set({ user: res.user, stage: "home" });
                // P6526/ث — پیوند عمیق ?tile=<id> (میان‌برهای PWA اندروید + باز کردن مستقیم کاشی)
                const wanted = new URLSearchParams(window.location.search).get("tile");
                if (wanted) {
                  const { tileRegistry } = await import("@/core/tiles/tile-registry");
                  const role = res.user.role === "OWNER" ? "OWNER" : "CONSULTANT";
                  const tile = tileRegistry.get(wanted);
                  const visible = tile && tileRegistry.listAll(role).some((t) => t.id === wanted);
                  if (tile && visible) {
                    set({ activeTileId: wanted, stage: "tile" });
                  }
                }
                return;
              }
            }
          } catch {
            // نشست نامعتبر — ورود مجدد
          }
          await secureClear();
          set({ token: null, user: null, stage: "auth" });
        },
      };
    },
    {
      name: "melk-app-state",
      storage: createJSONStorage(() => localStorage),
      // فقط تنظیمات کاشی‌ها ماندگار می‌شوند؛ توکن/مرحله هرگز
      partialize: (state) => ({ tileSettings: state.tileSettings }) as AppState,
    }
  )
);

"use client";

/** هدر اصلی داشبورد — برندینگ، کاربر، تم، خروج */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, LogOut, Moon, Sun, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { useAppStore } from "@/lib/client/store";
import { faDateTime } from "@/lib/format";

export function AppHeader() {
  const { theme, setTheme } = useTheme();
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-500 dark:from-emerald-500 dark:to-emerald-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/25">
            <Building2 className="w-5 h-5 text-white" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm sm:text-base leading-tight truncate">داشبورد هوشمند ملک تبریز</h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight hidden sm:block">
              لایه هوش تحلیلی روی CRM ملک تبریز
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "روشن کردن تم" : "تاریک کردن تم"}
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full border bg-card px-2 py-1.5 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="منوی حساب کاربری"
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                    {user?.displayName?.slice(0, 2) ?? "؟"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:block text-sm font-medium max-w-32 truncate">{user?.displayName}</span>
                {user?.role === "OWNER" && (
                  <Badge className="hidden sm:inline-flex bg-amber-500 hover:bg-amber-500 text-amber-950">مالک</Badge>
                )}
                <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <div className="space-y-1">
                  <p className="font-bold">{user?.displayName}</p>
                  <p dir="ltr" className="text-xs text-muted-foreground font-mono text-right">
                    {user?.personnelCode}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    نشست تا: {user ? faDateTime(user.expiresAt) : "—"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  void logout();
                }}
              >
                <LogOut className="w-4 h-4 ml-2" aria-hidden /> خروج از حساب
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

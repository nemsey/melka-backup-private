import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
        extend: {
                /* PN-024 — هویت نگین: ۱۱ گوهر (لایهٔ رویی روی پالت فیروزه‌ای)
                   توکن‌های عملیاتی در globals.css (@theme inline) تعریف‌اند؛
                   این نگاشت برای سازگاری ابزارهای legacy (مثل پلاگین‌های v3) است. */
                negin: {
                        'yaghut-kamani': { 50: 'var(--negin-yaghut-kamani-50)', 200: 'var(--negin-yaghut-kamani-200)', 400: 'var(--negin-yaghut-kamani-400)', 500: 'var(--negin-yaghut-kamani-500)', 700: 'var(--negin-yaghut-kamani-700)' },
                        'kahroba-talaee': { 50: 'var(--negin-kahroba-talaee-50)', 200: 'var(--negin-kahroba-talaee-200)', 400: 'var(--negin-kahroba-talaee-400)', 500: 'var(--negin-kahroba-talaee-500)', 700: 'var(--negin-kahroba-talaee-700)' },
                        'aqiq-limoonee': { 50: 'var(--negin-aqiq-limoonee-50)', 200: 'var(--negin-aqiq-limoonee-200)', 400: 'var(--negin-aqiq-limoonee-400)', 500: 'var(--negin-aqiq-limoonee-500)', 700: 'var(--negin-aqiq-limoonee-700)' },
                        'zomorrod-koohi': { 50: 'var(--negin-zomorrod-koohi-50)', 200: 'var(--negin-zomorrod-koohi-200)', 400: 'var(--negin-zomorrod-koohi-400)', 500: 'var(--negin-zomorrod-koohi-500)', 700: 'var(--negin-zomorrod-koohi-700)' },
                        'marjan-daryayi': { 50: 'var(--negin-marjan-daryayi-50)', 200: 'var(--negin-marjan-daryayi-200)', 400: 'var(--negin-marjan-daryayi-400)', 500: 'var(--negin-marjan-daryayi-500)', 700: 'var(--negin-marjan-daryayi-700)' },
                        'yaghut-banafsh': { 50: 'var(--negin-yaghut-banafsh-50)', 200: 'var(--negin-yaghut-banafsh-200)', 400: 'var(--negin-yaghut-banafsh-400)', 500: 'var(--negin-yaghut-banafsh-500)', 700: 'var(--negin-yaghut-banafsh-700)' },
                        'yaghut-kabud': { 50: 'var(--negin-yaghut-kabud-50)', 200: 'var(--negin-yaghut-kabud-200)', 400: 'var(--negin-yaghut-kabud-400)', 500: 'var(--negin-yaghut-kabud-500)', 700: 'var(--negin-yaghut-kabud-700)' },
                        'kuartz-soorati': { 50: 'var(--negin-kuartz-soorati-50)', 200: 'var(--negin-kuartz-soorati-200)', 400: 'var(--negin-kuartz-soorati-400)', 500: 'var(--negin-kuartz-soorati-500)', 700: 'var(--negin-kuartz-soorati-700)' },
                        'nili': { 50: 'var(--negin-nili-50)', 200: 'var(--negin-nili-200)', 400: 'var(--negin-nili-400)', 500: 'var(--negin-nili-500)', 700: 'var(--negin-nili-700)' },
                        'topaz-abee': { 50: 'var(--negin-topaz-abee-50)', 200: 'var(--negin-topaz-abee-200)', 400: 'var(--negin-topaz-abee-400)', 500: 'var(--negin-topaz-abee-500)', 700: 'var(--negin-topaz-abee-700)' },
                        'morvarid': { 50: 'var(--negin-morvarid-50)', 200: 'var(--negin-morvarid-200)', 400: 'var(--negin-morvarid-400)', 500: 'var(--negin-morvarid-500)', 700: 'var(--negin-morvarid-700)' },
                },
                colors: {
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        card: {
                                DEFAULT: 'hsl(var(--card))',
                                foreground: 'hsl(var(--card-foreground))'
                        },
                        popover: {
                                DEFAULT: 'hsl(var(--popover))',
                                foreground: 'hsl(var(--popover-foreground))'
                        },
                        primary: {
                                DEFAULT: 'hsl(var(--primary))',
                                foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                                DEFAULT: 'hsl(var(--secondary))',
                                foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                                DEFAULT: 'hsl(var(--muted))',
                                foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                                DEFAULT: 'hsl(var(--accent))',
                                foreground: 'hsl(var(--accent-foreground))'
                        },
                        destructive: {
                                DEFAULT: 'hsl(var(--destructive))',
                                foreground: 'hsl(var(--destructive-foreground))'
                        },
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        chart: {
                                '1': 'hsl(var(--chart-1))',
                                '2': 'hsl(var(--chart-2))',
                                '3': 'hsl(var(--chart-3))',
                                '4': 'hsl(var(--chart-4))',
                                '5': 'hsl(var(--chart-5))'
                        },
                        /* ============ پالت مرکزی ۱۳ بخش ملکا (گام صفر — قاعده ۵) ============
                         * مرجع زنده: متغیرهای CSS در src/app/globals.css (--sec-*) —
                         * این جدول سند پالت است؛ مولد: scripts/p6530/gen-palette.py
                         * شاهد: scripts/p6530/colors.json · کنتراست: download/p6530/color-contrast-report.md */
                        'sec-login':          { 50: '#f5f0fc', 200: '#bfa0ee', 400: '#844adf', 500: '#6d28d9', 700: '#3c1b7a' },
                        'sec-home':           { 50: '#eeeff0', 200: '#9599a1', 400: '#353c4c', 500: '#0f172a', 700: '#0c1222' },
                        'sec-finder':         { 50: '#edf6fb', 200: '#90c9e6', 400: '#2a98d0', 500: '#0284c7', 700: '#064970' },
                        'sec-melka-listing':  { 50: '#eef8f4', 200: '#91d1bd', 400: '#2da781', 500: '#059669', 700: '#085242' },
                        'sec-melka-request':  { 50: '#fef3ee', 200: '#f6b694', 400: '#ed7333', 500: '#ea580c', 700: '#7a3313' },
                        'sec-settings':       { 50: '#f2f3f4', 200: '#aeb4bd', 400: '#647081', 500: '#475569', 700: '#283242' },
                        'sec-mgmt':           { 50: '#f7f2ee', 200: '#cfab95', 400: '#a35f35', 500: '#92400e', 700: '#4e2714' },
                        'sec-m1':             { 50: '#eefaf6', 200: '#96e0c8', 400: '#36c495', 500: '#10b981', 700: '#0d644e' },
                        'sec-m2':             { 50: '#fef8ee', 200: '#fbd494', 400: '#f7ae32', 500: '#f59e0b', 700: '#805612' },
                        'sec-m3':             { 50: '#fdf0f0', 200: '#f0a0a0', 400: '#e24949', 500: '#dc2626', 700: '#731a20' },
                        'sec-m4':             { 50: '#eef7fa', 200: '#92cfdd', 400: '#30a3be', 500: '#0891b2', 700: '#095066' },
                        'sec-consultant':     { 50: '#fcf0f5', 200: '#efa0c3', 400: '#e14a8d', 500: '#db2777', 700: '#721a48' },
                        'sec-ai':             { 50: '#f3f2fd', 200: '#b2aef4', 400: '#6b64e9', 500: '#4f46e5', 700: '#2c2a80' },
                        'sec-m5':             { 50: '#f5f3ff', 200: '#c4b5fd', 400: '#8b5cf6', 500: '#7c3aed', 700: '#4c1d95' },
                        'sec-m6':             { 50: '#f7fee7', 200: '#d9f99d', 400: '#84cc16', 500: '#65a30d', 700: '#3f6212' },
                        'sec-m7':             { 50: '#eff6ff', 200: '#bfdbfe', 400: '#3b82f6', 500: '#2563eb', 700: '#1e40af' },
                        'sec-m8':             { 50: '#f0fdfa', 200: '#99f6e4', 400: '#2dd4bf', 500: '#0d9488', 700: '#134e4a' }
                },
                borderRadius: {
                        lg: 'var(--radius)',
                        md: 'calc(var(--radius) - 2px)',
                        sm: 'calc(var(--radius) - 4px)'
                }
        }
  },
  plugins: [tailwindcssAnimate],
};
export default config;

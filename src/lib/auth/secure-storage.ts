/**
 * ذخیره‌سازی امن توکن در کلاینت (رمزنگاری‌شده)
 * ------------------------------------------------------
 * تصمیم امنیتی (صراحت مهندسی):
 * - وب: AES-GCM با کلید دستگاه که در IndexedDB (غیرقابل‌خواندن با localStorage ساده)
 *   نگهداری می‌شود؛ متن ساده هرگز ذخیره نمی‌شود.
 * - اندروید (Capacitor): توصیه‌شده استفاده از @capacitor/preferences با
 *   اندروید Keystore است؛ این لایه قرارداد یکسانی دارد و در build اندروید
 *   می‌توان impl آن را با پلاگین SecureStorage عوض کرد (تولید کد در
 *   capacitor.config.ts و مستندات BUILD).
 */

const STORAGE_KEY = "melk.secure.v1";
const DEVICE_KEY_STORE = "melk.devicekey.v1";
const DB_NAME = "melk-secure";
const STORE = "keys";

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function getDeviceKey(): Promise<CryptoKey> {
  // بازیابی یا تولید کلید AES دستگاه
  const idb = await openDb();
  let rawB64: string | null = null;

  if (idb) {
    rawB64 = await new Promise<string | null>((resolve) => {
      const tx = idb.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(DEVICE_KEY_STORE);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    });
  }

  if (!rawB64) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    rawB64 = toB64(raw.buffer);
    if (idb) {
      await new Promise<void>((resolve) => {
        const tx = idb.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(rawB64, DEVICE_KEY_STORE);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  }

  return crypto.subtle.importKey("raw", fromB64(rawB64) as unknown as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export interface SecurePayload {
  token: string;
  user: { personnelCode: string; displayName: string; role: string };
  expiresAt: string;
  savedAt: string;
}

/** ذخیره رمزنگاری‌شده توکن نشست */
export async function secureSave(payload: SecurePayload): Promise<void> {
  try {
    const key = await getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      new TextEncoder().encode(JSON.stringify(payload)) as unknown as BufferSource
    );
    const packed = { iv: toB64(iv.buffer), data: toB64(cipher) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packed));
  } catch {
    // محیط بدون WebCrypto (SSR) — بی‌عملیات
  }
}

/** بازیابی و رمزگشایی توکن نشست */
export async function secureLoad(): Promise<SecurePayload | null> {
  try {
    const packedRaw = localStorage.getItem(STORAGE_KEY);
    if (!packedRaw) return null;
    const packed = JSON.parse(packedRaw) as { iv: string; data: string };
    const key = await getDeviceKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(packed.iv) as unknown as BufferSource },
      key,
      fromB64(packed.data) as unknown as BufferSource
    );
    const payload = JSON.parse(new TextDecoder().decode(plain)) as SecurePayload;
    // انقضای خودکار سمت کلاینت
    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      await secureClear();
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** پاک‌سازی امن — خروج یا ریست اتصال */
export async function secureClear(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

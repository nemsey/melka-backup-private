#!/usr/bin/env python3
"""پاک‌سازی کامل داده‌های دمو/تست از پایگاه داده — طبق درخواست مالک.
فقط رکوردهای CRM دمو حذف می‌شوند؛ نشست‌ها/حسابرسی/حافظه ایجنت حفظ می‌شوند.
"""
import sqlite3

DB = "/home/z/my-project/db/custom.db"

con = sqlite3.connect(DB)
cur = con.cursor()

def count(table):
    try:
        return cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except sqlite3.OperationalError:
        return -1

print("قبل از پاک‌سازی:")
print("  TransactionRecord:", count("TransactionRecord"))
print("  ExpertRecord:", count("ExpertRecord"))

cur.execute("DELETE FROM TransactionRecord")
cur.execute("DELETE FROM ExpertRecord")
# وضعیت همگام‌سازی ریست به «هنوز استخراج نشده»
cur.execute(
    "UPDATE SyncState SET lastSyncedAt = NULL, lastSuccessAt = NULL, lastError = NULL, lastErrorCode = NULL, attempts = 0, armTokenEnc = NULL"
)
con.commit()

print("\nبعد از پاک‌سازی:")
print("  TransactionRecord:", count("TransactionRecord"))
print("  ExpertRecord:", count("ExpertRecord"))
print("  SyncState:", cur.execute("SELECT id, lastSuccessAt, lastError FROM SyncState").fetchall())
con.close()
print("\n✅ داده‌های دمو/تست CRM به‌طور کامل حذف شدند.")

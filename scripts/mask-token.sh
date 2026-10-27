#!/bin/bash
# Melka Council - Mask Token (PN-048 · DIR-PN048-007)
# هر جایی که این اسکریپت pipe شود، توکن ماسک می‌شود
sed -E 's/ghp_[A-Za-z0-9]{36,}/ghp_****MASKED****/g' \
  | sed -E 's|://[^:/]+:[^@]+@|://****:****@|g'

#!/usr/bin/env bash
# Menjalankan seluruh pengujian: SQL, fungsi murni, dan halaman.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "════ 1. SQL — skema, fungsi transaksi, dan RLS ════"
./test/jalankan.sh | grep -E "^(-- |SEMUA)" || true
echo
echo "════ 2. Fungsi murni (Node, tanpa peramban & tanpa database) ════"
printf 'apotek_core   '; node test/uji_apotek_core.js  | tail -1
printf 'apotek_excel  '; node test/uji_apotek_excel.js | tail -1
printf 'struk_core    '; node test/uji_struk_core.js   | tail -1
echo
echo "════ 3. Halaman (Chromium sungguhan) ════"
printf 'alur apotek & kasir  '; node test/uji_halaman.js       | tail -1
printf 'impor & ekspor Excel '; node test/uji_impor_halaman.js | tail -1

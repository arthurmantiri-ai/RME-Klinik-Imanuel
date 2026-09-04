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
printf 'lab_core      '; node test/uji_lab_core.js     | tail -1
printf 'surat_core    '; node test/uji_surat_core.js   | tail -1
printf 'periksa_core  '; node test/uji_periksa_core.js | tail -1
printf 'antrean_core  '; node test/uji_antrean_core.js | tail -1
echo
echo "════ 3. Kolom db.js vs skema SQL ════"
# Uji halaman semuanya berjalan di demo.html, yang memakai demo-data.js dan
# mengembalikan baris utuh. Kolom yang lupa diminta di .select() aplikasi
# sungguhan tidak akan pernah ketahuan di sana — uji ini yang menangkapnya.
printf 'kontrak kolom '; node test/uji_kolom_db.js | tail -1
echo
echo "════ 4. Halaman (Chromium sungguhan) ════"
printf 'alur apotek & kasir  '; node test/uji_halaman.js       | tail -1
printf 'impor & ekspor Excel '; node test/uji_impor_halaman.js | tail -1
printf 'lab & penunjang      '; node test/uji_lab_halaman.js  | tail -1
printf 'surat keterangan     '; node test/uji_surat_halaman.js | tail -1
printf 'pemeriksaan dokter   '; node test/uji_periksa_halaman.js | tail -1
printf 'antrean & layar      '; node test/uji_antrean_halaman.js | tail -1

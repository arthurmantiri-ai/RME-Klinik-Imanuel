# Pengujian

Tiga lapis, dijalankan dengan `./test/semua.sh` dari folder `rme-imanuel`.

| Lapis | Berkas | Butuh apa | Menguji apa |
|---|---|---|---|
| SQL | `uji_apotek.sql`, `uji_kasir.sql`, `uji_rls.sql`, `uji_impor.sql` | PostgreSQL 15+ | Mesin FEFO, penyerahan resep, pembatalan, penyusunan tagihan, trigger status bayar, impor massal, dan kebijakan RLS per peran |
| Fungsi murni | `uji_apotek_core.js`, `uji_apotek_excel.js`, `uji_struk_core.js` | Node saja | Kartu stok, pratinjau FEFO, penafsiran nilai Excel, pencocokan nama obat, dan mesin struk thermal — tanpa peramban, tanpa database |
| Halaman | `uji_halaman.js`, `uji_impor_halaman.js` | Node + Playwright + Chromium + SheetJS | `demo.html` dijalankan di peramban sungguhan; berkas .xlsx betulan dibuat, diunggah, dan diproses. Setiap galat console menggagalkan pengujian |

## Menyiapkan Node

```bash
npm install playwright xlsx
```

`xlsx` dipakai pengujian untuk MEMBUAT berkas .xlsx uji dan membaca hasil
ekspor, sekaligus sebagai pengganti SheetJS dari CDN — lingkungan pengujian
tidak punya akses internet, jadi permintaan ke CDN dialihkan ke salinan npm.
Aplikasinya sendiri tidak butuh npm sama sekali.

## Menyiapkan PostgreSQL lokal

Pengujian SQL tidak menyentuh database Supabase Anda. Ia membangun database
kosong, memasang seluruh berkas `sql/`, lalu menjalankan pemeriksaannya.

```bash
PGBIN=/usr/lib/postgresql/16/bin
$PGBIN/initdb -D /tmp/pgdata -U postgres --auth=trust
$PGBIN/pg_ctl -D /tmp/pgdata -o '-k /tmp/pgrun -p 5433' start
./test/jalankan.sh
```

`00_supabase_palsu.sql` menirukan bagian Supabase yang dipakai skema —
skema `auth`, `auth.uid()`, dan peran `authenticated` — secukupnya agar
berkas SQL yang sama bisa diuji di PostgreSQL biasa.

## Kenapa impor diuji tiga kali

Penafsiran nilai adalah bagian paling rawan dari impor Excel, dan tiap lapis
menangkap kesalahan yang berbeda:

- **Fungsi murni** menguji `1.500` yang harus jadi 1500 bukan 1,5; serial
  tanggal Excel; `03/04/2028` yang ambigu; dan "Amoxicillin 500mg" yang harus
  bertemu "Amoxicillin 500 mg".
- **SQL** menguji bahwa satu baris gagal membatalkan seluruh berkas, dan bahwa
  obat yang muncul di dua baris hanya dibuat sekali.
- **Halaman** menguji jalur yang tidak bisa disentuh keduanya: SheetJS membaca
  berkas sungguhan, pratinjau menampilkan yang benar, dan stok benar-benar
  bertambah setelah Proses ditekan.

## Kenapa uji RLS terpisah

Uji fungsional berjalan sebagai superuser, sehingga RLS dilewati sepenuhnya;
yang teruji di sana hanya pemeriksaan peran di dalam fungsi. `uji_rls.sql`
menjalankan setiap pemeriksaan sebagai role `authenticated`, persis seperti
permintaan yang datang dari browser. Berkas itulah yang menemukan bahwa tabel
baru tidak mewarisi `GRANT` dari `02_rls.sql`.

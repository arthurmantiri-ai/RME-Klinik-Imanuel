# Pengujian

Tiga lapis, dijalankan dengan `./test/semua.sh` dari folder `rme-imanuel`.

| Lapis | Berkas | Butuh apa | Menguji apa |
|---|---|---|---|
| SQL | `uji_apotek.sql`, `uji_kasir.sql`, `uji_rls.sql` | PostgreSQL 15+ | Mesin FEFO, penyerahan resep, pembatalan, penyusunan tagihan, trigger status bayar, dan kebijakan RLS per peran |
| Fungsi murni | `uji_apotek_core.js`, `uji_struk_core.js` | Node saja | Kartu stok, pratinjau FEFO, dan mesin struk thermal — tanpa peramban, tanpa database |
| Halaman | `uji_halaman.js` | Node + Playwright + Chromium | `demo.html` dijalankan di peramban sungguhan; setiap galat console menggagalkan pengujian |

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

## Kenapa uji RLS terpisah

Uji fungsional berjalan sebagai superuser, sehingga RLS dilewati sepenuhnya;
yang teruji di sana hanya pemeriksaan peran di dalam fungsi. `uji_rls.sql`
menjalankan setiap pemeriksaan sebagai role `authenticated`, persis seperti
permintaan yang datang dari browser. Berkas itulah yang menemukan bahwa tabel
baru tidak mewarisi `GRANT` dari `02_rls.sql`.

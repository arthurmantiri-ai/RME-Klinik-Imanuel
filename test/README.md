# Pengujian

Empat lapis, dijalankan dengan `./test/semua.sh` dari folder `rme-imanuel`.

| Lapis | Berkas | Butuh apa | Menguji apa |
|---|---|---|---|
| SQL | `uji_apotek.sql`, `uji_kasir.sql`, `uji_rls.sql`, `uji_impor.sql`, `uji_penunjang.sql`, `uji_surat.sql` | PostgreSQL 15+ | Mesin FEFO, penyerahan resep, pembatalan, penyusunan tagihan, trigger status bayar, impor massal, penandaan hasil lab, penguncian lembar, penomoran & pembatalan surat, dan kebijakan RLS per peran |
| Fungsi murni | `uji_apotek_core.js`, `uji_apotek_excel.js`, `uji_struk_core.js`, `uji_lab_core.js`, `uji_surat_core.js` | Node saja | Kartu stok, pratinjau FEFO, penafsiran nilai Excel, pencocokan nama obat, mesin struk thermal, pemilihan nilai rujukan dan penandaan hasil lab, bentuk nomor surat, hitungan tanggal istirahat, dan isi tiap jenis surat — tanpa peramban, tanpa database |
| Kontrak kolom | `uji_kolom_db.js` | Node saja | Setiap kolom yang diminta `js/db.js` benar-benar ada di berkas SQL, dan kolom yang halaman gantungkan nasibnya ikut terpilih. Menangkap kelas galat yang tidak melempar apa pun dan tidak terlihat di demo |
| Halaman | `uji_halaman.js`, `uji_impor_halaman.js`, `uji_lab_halaman.js`, `uji_surat_halaman.js` | Node + Playwright + Chromium + SheetJS | `demo.html` dijalankan di peramban sungguhan; berkas .xlsx betulan dibuat, diunggah, dan diproses; alur lab ditelusuri dari permintaan dokter sampai lembar ditutup; surat diterbitkan, dicek nomornya, dan dibatalkan. Setiap galat console menggagalkan pengujian |

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

## Kenapa penandaan hasil lab diuji dua kali

Aturan Tinggi/Rendah/Kritis ditulis dua kali dengan sengaja: yang berlaku ada di
database (`lab_hitung_tanda()`), dan kembarannya di `lab_core.js` dipakai layar untuk
menampilkan tanda sebelum petugas menekan Simpan. Dua salinan aturan bisa berselisih
diam-diam, dan selisih itu berbahaya — layar berkata Normal sementara database menyimpan
Tinggi.

Karena itu `uji_lab_core.js` memakai contoh yang **sama persis** dengan
`uji_penunjang.sql`: Hb 12,5 rendah pada laki-laki dewasa tetapi normal pada perempuan
dewasa; Hb 6,2 kritis, bukan sekadar rendah; rentang umur tersempit menang atas yang
paling umum. Kalau seed nilai rujukan di SQL diubah, uji SQL nomor 1 dan 2 gagal; kalau
penandaan di JS diubah, uji fungsi murni yang gagal.

## Kenapa uji RLS terpisah

Uji fungsional berjalan sebagai superuser, sehingga RLS dilewati sepenuhnya;
yang teruji di sana hanya pemeriksaan peran di dalam fungsi. `uji_rls.sql`
menjalankan setiap pemeriksaan sebagai role `authenticated`, persis seperti
permintaan yang datang dari browser. Berkas itulah yang menemukan bahwa tabel
baru tidak mewarisi `GRANT` dari `02_rls.sql`.

## Kenapa bentuk nomor surat diuji dua kali

Nomor surat disusun database lewat kolom terhitung (`public.format_no_surat()`), tetapi
`js/surat_core.js` punya salinannya supaya pratinjau nomor muncul sambil pengguna
mengetik. Dua salinan aturan bisa berselisih diam-diam — dan selisihnya baru ketahuan
setelah suratnya tercetak.

Karena itu `uji_surat.sql` §1–2 dan `uji_surat_core.js` memakai contoh yang **sama
persis**: `07/SKS/YAKIM/IX/2099`, `01/SR/YAKIM/I/2099`, dan `115/SKBS/YAKIM/XII/2099`.
Contoh ketiga bukan hiasan: `lpad('115', 2, '0')` di PostgreSQL memulangkan `'11'` —
lpad MEMOTONG bila teksnya sudah lebih panjang — sementara `padStart` di JavaScript
tidak. Bug itu benar-benar ada di berkas SQL sampai uji ini ditulis, dan akibatnya baru
akan terasa pada surat ke-100 tahun itu.

## Kenapa uji surat dijalankan di zona waktu lain

`uji_surat_core.js` memaksa `TZ=America/Los_Angeles` di baris pertamanya. Alasannya:
`new Date('2026-09-03')` diurai sebagai tengah malam UTC, dan di zona barat
`getDate()`-nya memulangkan tanggal SEBELUMNYA. Surat keterangan sakit yang tanggalnya
meleset sehari adalah surat yang salah. Menjalankan seluruh berkas di zona itu membuat
kelas kesalahan tersebut gagal keras, bukan lolos karena kebetulan mesin ujinya berada
di zona yang sama dengan kliniknya.

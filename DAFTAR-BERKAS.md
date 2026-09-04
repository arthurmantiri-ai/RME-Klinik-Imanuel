# Modul Pemantauan Kronis — TAHAP 1: dasar & migrasi portal

_Disusun 4 September 2026. Disusun di atas commit `7db7583` (branch `main`)._

Tahap pertama dari tiga. Yang ada di paket ini **belum** memantau apa pun —
ia menyiapkan tempat data hidup dan memindahkan riwayat portal ke sana.
Pemantauan sendiri (daftar "belum ambil obat", jadwal lab, kepatuhan) ada di
Tahap 2; panel laporan di Tahap 3.

---

## Cara memasang

1. **Unggah berkas** di bawah ke repo `arthurmantiri-ai/RME-Klinik-Imanuel`,
   atau terapkan `perubahan.patch` (`git apply perubahan.patch`).
2. **Jalankan `sql/16_kronis.sql`** di SQL Editor Supabase RME, **setelah**
   `15_antrean.sql`. Aman di database berisi data, aman dijalankan ulang.
3. Muat ulang aplikasi. Menu baru **Migrasi Portal** muncul di bagian Sistem
   (hanya untuk akun admin).
4. Ikuti langkah di halaman itu: jalankan `migrasi/ekspor-portal.sql` di
   Supabase **portal sipantau**, unduh CSV-nya, lalu unggah di RME.

`sql/16_kronis.sql` **tidak** perlu dijalankan sendirian di luar transaksi —
tidak ada nilai enum baru di dalamnya (pelajaran `07_peran_kasir.sql`).

---

## Berkas baru (7)

| Berkas | Isi |
|---|---|
| `sql/16_kronis.sql` | Seluruh skema modul: referensi diagnosis & lab kronis, aturan kuota statin, pendaftaran buku kronis, riwayat luar, tabel titipan migrasi, tujuh fungsi migrasi, RLS + GRANT |
| `migrasi/ekspor-portal.sql` | **Dijalankan di database PORTAL, bukan RME.** Menghitung jumlah data, lalu mengeluarkan empat berkas CSV |
| `js/kronis_core.js` | Fungsi murni: pembaca CSV, kunci pasien, pemetaan diagnosis, penilaian usulan, nomor WhatsApp |
| `js/pages/migrasi.js` | Halaman Migrasi Portal (admin): unggah berkas + pencocokan pasien satu per satu |
| `test/uji_kronis.sql` | 24 pemeriksaan SQL |
| `test/uji_kronis_core.js` | 79 pemeriksaan fungsi murni |
| `test/uji_kronis_halaman.js` | 39 pemeriksaan halaman di Chromium |

## Berkas diubah (8)

| Berkas | Perubahan |
|---|---|
| `js/db.js` | 11 fungsi baru (`refKronisDiagnosa`, `kronisImpor*`) |
| `js/app.js` | Menu + rute + judul `#/migrasi` |
| `app.html`, `demo.html` | Memuat `kronis_core.js` dan `pages/migrasi.js` |
| `js/demo-data.js` | Data contoh migrasi + pasien `Budi Santosa` (nama yang hanya beda satu huruf dari `Budi Santoso` — keadaan yang membuat migrasi berbahaya, dan yang harus terlihat di demo) |
| `test/jalankan.sh` | Menjalankan `uji_kronis.sql` |
| `test/semua.sh` | Menjalankan `uji_kronis_core.js` dan `uji_kronis_halaman.js` |
| `test/uji_kolom_db.js` | 4 kontrak kolom baru |

---

## Keputusan yang membentuk berkas ini

**Log pengambilan obat dan pemeriksaan lab TIDAK disalin jadi tabel.**
Di RME keduanya sudah tercatat sendiri: `resep` berstatus `DISERAHKAN` →
`apotek_transaksi`, dan `lab_permintaan` + `lab_hasil`. Salinan kedua akan
berselisih dengan apotek dalam hitungan minggu — alasan yang sama persis
dengan keputusan 1 Sep 2026 bahwa stok apotek tidak menumpang portal.
Pemantauannya dibuat sebagai view di Tahap 2.

**Riwayat portal tidak dijadikan kunjungan palsu.** Pengambilan obat tahun
lalu masuk ke `kronis_riwayat_luar` dengan kolom `sumber`, bukan menjadi
kunjungan + resep + transaksi apotek. Kunjungan yang tidak pernah terjadi
akan ikut terhitung di laporan Dinkes, di rekap kasir, dan kelak di klaim
PCare.

**Pasien lama tidak dibuatkan otomatis.** Tabel `pasien` mewajibkan
`tanggal_lahir` dan `jenis_kelamin`; portal tidak menyimpan keduanya.
Menerbitkan nomor rekam medis dari data yang belum dilihat petugas
menghasilkan pasien kembar — satu dari migrasi, satu lagi saat orangnya
datang dengan ejaan nama yang sedikit berbeda. Ini kesalahan yang sudah
dihindari waktu memutuskan `POST /peserta` Antrol tidak menerbitkan rekam
medis.

**Tempel otomatis hanya berani pada nomor BPJS yang cocok persis DAN hanya
menunjuk satu pasien.** `pasien.no_bpjs` tidak unik di RME. Nomor yang
menunjuk dua pasien adalah tanda salah ketik pada salah satunya, dan
ditinggalkan untuk dilihat manusia — bukan ditebak.

**Pembatalan pencocokan wajib ada.** Halaman yang bisa menempel tapi tidak
bisa melepas membuat petugas ragu menekan tombolnya, lalu seluruh
pencocokan berhenti di baris pertama yang meragukan.

**Hanya HPT dan DM yang punya jatah lab.** Delapan diagnosis kronis lain
dipantau obatnya saja (`bulan_lab` NULL), sehingga pasien asma tidak pernah
muncul di daftar "terlambat lab" untuk pemeriksaan yang memang tidak
dijatahkan padanya.

**Gula darah sewaktu (GDS) tidak mereset jadwal DM.** Nilainya tidak bisa
ditafsirkan tanpa tahu kapan pasien terakhir makan. Kalau klinik memutuskan
lain, tinggal ditambahkan di `ref_kronis_lab` — daftarnya memang dibuat
sebagai tabel supaya bisa diubah tanpa mengubah kode.

**HbA1c ditambahkan ke master lab.** Tanpa itu daftar pereset jadwal DM
tinggal gula puasa dan gula 2 jam PP saja.

---

## Bug yang ditemukan saat membangun — sudah diperbaiki

**Subquery skalar meledak justru pada keadaan yang harus ditangani tenang.**
`kronis_impor_cocokkan_otomatis()` semula mengambil calon pasien dengan
`(select p.id … limit 2)` — maksudnya sekalian menghitung. PostgreSQL
menolak subquery skalar yang memulangkan dua baris dengan
`more than one row returned by a subquery used as an expression`, dan itu
terjadi **tepat pada nomor BPJS ganda** — yaitu satu-satunya keadaan yang
memang harus dilewati dengan tenang, bukan menghentikan impor di tengah
jalan. Ditemukan oleh `uji_kronis.sql` nomor 16. Sekarang `limit 1`, dan
jumlahnya dihitung kolom terpisah.

---

## Yang perlu Anda kerjakan sendiri

| Hal | Catatan |
|---|---|
| Jalankan `sql/16_kronis.sql` | Setelah berkas 15 |
| Jalankan `migrasi/ekspor-portal.sql` di portal | Bagian 0 lebih dulu — angkanya menentukan berat pekerjaan pencocokan |
| Cocokkan pasien di halaman Migrasi Portal | Yang ber-BPJS bisa lewat tombol tempel otomatis; sisanya satu per satu |
| **Isi saldo awal stok apotek** | **Syarat mati sebelum Tahap 2 berguna.** Selama stok kosong, penyerahan resep gagal, tidak ada baris `apotek_transaksi`, dan pemantauan akan melapor "semua pasien belum ambil obat" — tampak seperti bug padahal stoknya yang belum ada |
| Periksa daftar lab pereset jadwal | Master Data → sesuaikan bila klinik memakai pemeriksaan lain |

---

## Uji

```
./test/semua.sh
```

Tahap ini menambah 24 pemeriksaan SQL, 79 fungsi murni, 4 kontrak kolom,
dan 39 alur halaman. Seluruh uji lama tetap hijau.

# RME Klinik Imanuel — Panduan Pemasangan

Rekam Medis Elektronik untuk klinik pratama BPJS, rawat jalan.
Biaya: **Rp 0** (Supabase free tier + Netlify free tier).

---

## Daftar isi

1. [Apa yang sudah jadi](#1-apa-yang-sudah-jadi)
2. [Yang perlu Anda siapkan](#2-yang-perlu-anda-siapkan)
3. [Langkah 1 — Buat database Supabase](#langkah-1--buat-database-supabase)
4. [Langkah 2 — Jalankan enam berkas SQL](#langkah-2--jalankan-enam-berkas-sql)
5. [Langkah 3 — Buat akun admin pertama](#langkah-3--buat-akun-admin-pertama)
6. [Langkah 4 — Hubungkan aplikasi ke database](#langkah-4--hubungkan-aplikasi-ke-database)
7. [Langkah 5 — Unggah ke Netlify](#langkah-5--unggah-ke-netlify)
8. [Langkah 6 — Isi data klinik](#langkah-6--isi-data-klinik)
9. [Alur pemakaian harian](#alur-pemakaian-harian)
10. [Poli gigi](#poli-gigi)
11. [Master data](#master-data)
12. [Bridging PCare & SatuSehat](#bridging-pcare--satusehat)
13. [Keamanan dan kepatuhan PMK 24/2022](#keamanan-dan-kepatuhan-pmk-242022)
14. [Batas paket gratis](#batas-paket-gratis)
15. [Rencana penggabungan dengan portal klinik](#rencana-penggabungan-dengan-portal-klinik)
16. [Yang belum ada](#yang-belum-ada)

---

## 1. Apa yang sudah jadi

| Bagian | Isi |
|---|---|
| **Database** | 36 tabel, 12 view, 73 kebijakan RLS, penomoran RM & antrian otomatis, audit trail, penguncian rekam medis, Row Level Security per peran |
| **Aplikasi** | Login, beranda, pendaftaran, antrian, kajian awal perawat, SOAP dokter, diagnosa ICD-10, tindakan ICD-9-CM, resep, rekam medis, riwayat, laporan, pengaturan |
| **Poli gigi** | Odontogram per bidang gigi (gigi tetap dan sulung), pemeriksaan ekstra/intra oral, indeks DMF-T dan def-t, tindakan gigi ICD-9-CM |
| **Master data** | Kelola sendiri daftar obat (termasuk impor/ekspor CSV), diagnosa ICD-10, dan tindakan ICD-9-CM tanpa membuka dasbor Supabase |
| **Apotek** | Stok per batch dengan urutan keluar FEFO, antrean resep dari dokter, kartu stok harian, laporan bulanan, impor & ekspor Excel |
| **Kasir** | Tagihan disusun otomatis dari tindakan dokter dan obat yang diserahkan apotek, pembayaran, kwitansi PDF, struk thermal 58/80 mm |
| **Kesiapan bridging** | Penanda otomatis untuk data yang nanti dibutuhkan PCare dan SatuSehat tapi belum terisi |
| **Master data** | 178 kode ICD-10, 43 kode tindakan ICD-9-CM, 52 gigi FDI, 27 kondisi odontogram, 70 obat generik Fornas, 3 poli |
| **Bridging** | Dua Edge Function siap pakai (PCare & SatuSehat) — tinggal diisi kredensial |
| **Demo** | `demo.html` berisi data contoh, bisa dibuka tanpa database |

### Isi berkas

```
rme-imanuel/
├── index.html              Halaman login
├── app.html                Aplikasi utama
├── demo.html               Demo dengan data contoh (tanpa database)
├── favicon.svg
├── css/style.css           Sistem desain
├── js/
│   ├── config.js           ← SATU-SATUNYA berkas yang perlu Anda sunting
│   ├── ui.js               Notifikasi, modal, format tanggal
│   ├── db.js               Semua komunikasi dengan Supabase
│   ├── komponen.js         Potongan tampilan bersama
│   ├── app.js              Menu & navigasi
│   ├── odontogram.js       Bagan gigi yang bisa diklik
│   ├── apotek_core.js      Mesin kartu stok & pratinjau FEFO (fungsi murni)
│   ├── apotek_excel.js     Pembacaan berkas impor & penyusunan lembar ekspor
│   ├── struk_core.js       Mesin struk thermal (fungsi murni)
│   ├── struk_printer.js    Bluetooth / USB / dialog cetak
│   ├── invoice_template.js Pengaturan tampilan invoice
│   ├── demo-data.js        Data contoh untuk demo.html
│   └── pages/              Satu berkas per halaman
├── sql/
│   ├── 01_schema.sql       Tabel, trigger, view
│   ├── 02_rls.sql          Hak akses per peran
│   ├── 03_audit.sql        Pencatatan jejak akses
│   ├── 04_seed.sql         Data awal (ICD-10, obat, poli)
│   ├── 05_gigi.sql         Modul poli gigi (odontogram, tindakan)
│   ├── 06_master.sql       Nilai berkode & kesiapan bridging
│   ├── 07_peran_kasir.sql  Menambah peran 'kasir' (satu baris, jalankan sendiri)
│   ├── 08_apotek.sql       Stok obat batch FEFO, penyerahan resep
│   ├── 09_kasir.sql        Tarif, tagihan, pembayaran, template invoice
│   └── 10_apotek_impor.sql Impor stok dari Excel (saldo awal & pembelian)
└── supabase/functions/
    ├── pcare-proxy/        Jembatan ke PCare BPJS
    └── satusehat-proxy/    Jembatan ke SatuSehat (FHIR R4)
```

---

## 2. Yang perlu Anda siapkan

- Akun **Supabase** — https://supabase.com (gratis, cukup daftar dengan GitHub/email)
- Akun **Netlify** — https://netlify.com (gratis)
- Peramban modern (Chrome/Edge/Firefox)

Tidak perlu memasang apa pun di komputer. Tidak perlu kartu kredit.

---

## Langkah 1 — Buat database Supabase

1. Masuk ke https://supabase.com → **New project**
2. Isi:
   - **Name**: `rme-klinik-imanuel`
   - **Database Password**: buat sandi kuat, **simpan baik-baik** (dipakai bila perlu akses langsung)
   - **Region**: `Southeast Asia (Singapore)` — paling dekat dengan Indonesia
3. Klik **Create new project**, tunggu ±2 menit.

> **Catatan tentang pemisahan database.** Saya sarankan project Supabase **baru dan terpisah** dari portal Pantau Klinik Imanuel yang sudah jalan. Alasannya: rekam medis punya aturan akses yang jauh lebih ketat, dan mencampurnya dengan tabel portal yang sudah produksi berisiko mengubah RLS yang sudah bekerja. Penggabungan tetap mudah dilakukan nanti — lihat [bagian 13](#rencana-penggabungan-dengan-portal-klinik).

---

## Langkah 2 — Jalankan sepuluh berkas SQL

Di dasbor Supabase, buka **SQL Editor** (ikon terminal di bilah kiri).

Jalankan **berurutan**, satu per satu. Untuk tiap berkas: buka isinya, salin seluruhnya, tempel di editor, klik **Run**.

| Urutan | Berkas | Isi |
|---|---|---|
| 1 | `sql/01_schema.sql` | Tabel, trigger penomoran, view |
| 2 | `sql/02_rls.sql` | Hak akses per peran |
| 3 | `sql/03_audit.sql` | Audit trail |
| 4 | `sql/04_seed.sql` | ICD-10, obat, poli, aturan pakai |
| 5 | `sql/05_gigi.sql` | Odontogram, pemeriksaan gigi, tindakan ICD-9-CM |
| 6 | `sql/06_master.sql` | Nilai berkode (kesadaran, keadaan pulang) dan kesiapan bridging |
| 7 | `sql/07_peran_kasir.sql` | Menambah peran `kasir` — **jalankan sendirian** (lihat catatan di bawah) |
| 8 | `sql/08_apotek.sql` | Stok obat per batch, mesin FEFO, penyerahan resep |
| 9 | `sql/09_kasir.sql` | Tarif, tagihan, pembayaran, template invoice |
| 10 | `sql/10_apotek_impor.sql` | Impor stok dari Excel |

> **Berkas 7 harus dijalankan sendirian.** Isinya hanya satu baris, tetapi
> PostgreSQL melarang nilai enum yang baru ditambahkan dipakai di dalam
> transaksi yang sama. Kalau Anda menempelkannya bersama berkas 8, seluruh
> blok akan gagal dengan pesan *"unsafe use of new value of enum type"* —
> pesan yang penyebabnya jauh dari baris yang error. Jalankan berkas 7,
> tunggu sampai selesai, baru lanjut ke berkas 8.

Setiap berkas harus selesai dengan **Success. No rows returned** (atau serupa) sebelum lanjut ke berikutnya. Kalau ada pesan merah, berhenti dulu — jangan lanjut ke berkas berikutnya.

**Memeriksa hasilnya.** Jalankan ini di SQL Editor:

```sql
select
  (select count(*) from icd10)   as icd10,
  (select count(*) from icd9cm)  as tindakan,
  (select count(*) from obat)    as obat,
  (select count(*) from ref_gigi) as gigi,
  (select count(*) from poli)    as poli,
  (select count(*) from kasir_tarif) as tarif;
```

Harus muncul: 178 ICD-10, 43 tindakan, 70 obat, 52 gigi, 3 poli, 1 tarif.

---

## Langkah 3 — Buat akun admin pertama

1. Di dasbor Supabase: **Authentication** → **Users** → **Add user** → **Create new user**
2. Isi email dan kata sandi. Centang **Auto Confirm User** (supaya tidak perlu verifikasi email).
3. Klik **Create user**.

Baris di tabel `pegawai` akan dibuat otomatis, tapi perannya masih `pendaftaran`. Naikkan jadi admin lewat **SQL Editor**:

```sql
update pegawai
set peran = 'admin', nama = 'dr. Arthur Mantiri'
where id = (select id from auth.users where email = 'EMAIL-ANDA@contoh.id');
```

Untuk dokter, isi juga jenisnya supaya pilihan dokter saat pendaftaran menyesuaikan poli:

```sql
update pegawai set jenis_dokter = 'GIGI'
where nama = 'drg. Nama Dokter Gigi Anda';
```

Ulangi Langkah 3 untuk tiap staf. Peran yang tersedia:

| Peran | Boleh melakukan |
|---|---|
| `admin` | Semua, termasuk pengaturan dan master data |
| `pendaftaran` | Daftar pasien, buat kunjungan, lihat rekam medis |
| `perawat` | Kajian awal (tanda vital), catat alergi |
| `dokter` | SOAP, diagnosa, tindakan, resep, odontogram, kunci rekam medis |
| `apoteker` | Lihat resep, tandai penyerahan obat |

---

## Langkah 4 — Hubungkan aplikasi ke database

Di dasbor Supabase, buka **Project Settings**:

- **Data API** → salin **Project URL** (bentuknya `https://xxxxx.supabase.co`)
- **API Keys** → salin kunci **anon / public**

Buka berkas `js/config.js` dengan Notepad atau editor teks apa pun, ganti dua baris ini:

```js
SUPABASE_URL: 'https://xxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...(panjang)',
```

Sekalian sesuaikan nama klinik:

```js
NAMA_KLINIK: 'Klinik Pratama Imanuel',
SINGKATAN: 'KI',
```

Simpan.

> **Kunci `anon` aman ditaruh di sini.** Ia hanya mengizinkan permintaan masuk; yang menentukan siapa boleh melihat apa adalah Row Level Security di database. Yang **tidak boleh** ditaruh di sini adalah kunci `service_role`.

---

## Langkah 5 — Unggah ke Netlify

1. Kompres seluruh isi folder `rme-imanuel` menjadi satu berkas ZIP —
   pastikan `index.html` berada **di akar ZIP**, bukan di dalam subfolder.
2. Buka https://app.netlify.com/drop
3. Seret berkas ZIP ke halaman itu.
4. Netlify memberi alamat seperti `https://nama-acak-123.netlify.app`.
5. **Site configuration** → **Change site name** untuk mengganti jadi mis. `rme-imanuel`.

Buka alamat itu, masuk dengan akun dari Langkah 3.

> **Membatasi akses.** Di Netlify, **Site configuration → Access control → Password protection** bisa menambah kata sandi di depan situs. Berguna supaya alamatnya tidak terbuka bagi publik, sebagai lapisan tambahan di atas login aplikasi.

---

## Langkah 6 — Isi data klinik

Masuk sebagai admin, buka **Pengaturan**:

- **Profil Klinik** — nama, alamat, telepon. Ini yang muncul di kop resep dan cetakan rekam medis.
- **Poli** — sesuaikan dengan poli yang benar-benar ada di klinik Anda. Kolom **Jenis**
  menentukan tampilan layar dokter: poli berjenis `GIGI` memunculkan odontogram dan
  pemeriksaan gigi. Bawaannya Poli Umum (`UMUM`), Poli Gigi (`GIGI`), dan Poli KIA (`KIA`).
- **Pengguna** — atur peran tiap staf.

Lalu buka menu **Master Data** untuk menyesuaikan daftar obat dengan yang benar-benar
tersedia di klinik. Lihat [Master data](#master-data).

---

## Alur pemakaian harian

```
PENDAFTARAN        PERAWAT           DOKTER              APOTEK              KASIR
     │                │                │                   │                   │
 Cari pasien ─▶ Kajian awal ─▶ SOAP + Diagnosa ─▶ Resep masuk antrean ─▶ Tagihan disusun
 atau daftar    (tanda vital,   (ICD-10) +          apotek, obat            otomatis dari
 pasien baru     anamnesis)      Tindakan +         diserahkan,             tindakan + obat
     │                │          Resep              stok terpotong          yang diserahkan
 Nomor antrian   Status naik   Kunci rekam medis     FEFO                         │
 keluar otomatis  MENUNGGU     Status SELESAI          │                    Bayar → kwitansi
                  DOKTER                                                     & struk thermal
```

Hal-hal yang bekerja otomatis:

- Nomor rekam medis, nomor kunjungan, dan nomor antrian dibuat sistem
- Kunjungan ditandai **Baru** atau **Lama** berdasarkan riwayat pasien
- IMT dihitung dari berat dan tinggi badan
- Tanda vital di luar batas normal diberi warna merah di layar dokter
- Alergi dan catatan penting muncul menyolok di bilah atas
- Catatan dokter tersimpan otomatis tiap 90 detik
- Diagnosa pertama otomatis jadi diagnosa primer
- Resep dokter langsung muncul di antrean apotek, tanpa diketik ulang
- Stok terpotong dengan urutan **FEFO** — batch yang paling dekat kadaluwarsa
  keluar lebih dulu, tanggal masuk hanya jadi pemutus seri
- Kasir menarik tindakan dari catatan dokter dan obat dari **yang benar-benar
  diserahkan apotek**, bukan dari angka yang ditulis di resep
- Kunjungan BPJS tetap dicatat nilainya untuk laporan, tetapi tidak ditagihkan
  ke pasien

---

## Apotek

Empat hal yang perlu dipahami sebelum memakainya sehari-hari.

**Stok dicatat per batch, bukan per obat.** Satu obat bisa punya beberapa
tumpukan di rak dengan tanggal kadaluwarsa, faktur, PBF, dan harga beli yang
berbeda. Masing-masing dicatat terpisah, karena itulah satu-satunya cara
menjawab "yang mana yang harus keluar duluan".

**Urutannya FEFO, bukan FIFO.** Yang keluar lebih dulu adalah batch yang paling
dekat kadaluwarsa — bukan yang paling dulu masuk. FIFO keliru untuk obat:
kiriman lama bisa saja kadaluwarsanya masih jauh, sementara kiriman baru justru
tinggal sebulan lagi. Dengan FIFO, kiriman baru itu akan mengendap sampai
benar-benar kadaluwarsa dan akhirnya dibuang.

**Batch kadaluwarsa terkunci.** Obat yang sudah lewat tanggal tidak akan ikut
melayani resep, walaupun ia paling depan dalam antrean. Ia hanya bisa
dikeluarkan lewat kategori **Obat Expired**, **Obat Rusak**, atau **Retur ke
PBF** — yang memang tujuannya membuang.

**Yang dicatat keluar adalah yang diserahkan.** Saat menyerahkan resep,
apoteker mengisi jumlah yang benar-benar diberikan ke pasien. Kalau resep
menulis 30 tapi stok hanya cukup 20, isi 20 — dan resepnya ditandai
*diserahkan sebagian*. Angka itulah yang memotong stok dan yang ditagihkan
kasir. Kalau sistem memotong dari angka resep, kartu stok akan melenceng dari
isi rak dalam hitungan minggu, dan selisihnya tidak akan pernah bisa dilacak.

**Membatalkan salah input.** Tab Riwayat punya tombol Batalkan selama transaksi
belum lewat 7 hari. Pembatalan mengembalikan stok, membuka kembali resepnya
supaya bisa diserahkan ulang, dan menyisakan baris aslinya sebagai jejak.
Batas 7 hari ditegakkan di dalam database, bukan cuma di tombol.

**Kartu stok** menggantikan buku catatan manual: berapa masuk, berapa keluar,
sisa berapa — per obat per hari, atau per tanggal untuk semua obat. Saldonya
ditarik mundur dari stok yang ada sekarang, jadi baris terakhir bulan berjalan
selalu cocok dengan tab Stok saat ini.

---

## Memuat stok pertama kali (impor Excel)

Ini yang Anda pakai saat sistem baru dinyalakan: memasukkan seluruh isi rak
tanpa mengetik satu per satu.

**Langkahnya.** Apotek → **Impor Excel** → pilih **Saldo awal (opname)** →
Unduh template → isi di Excel → unggah → periksa pratinjau → Proses.

**Pilih jenis impornya dengan benar.** Ada dua:

| Jenis | Untuk apa | Bedanya |
|---|---|---|
| **Saldo awal (opname)** | Stok yang sudah ada di rak saat sistem mulai dipakai | Tidak dihitung sebagai pembelian |
| **Pembelian / obat masuk** | Kiriman PBF, satu faktur berisi banyak item | Masuk laporan pembelian bulan berjalan |

Perbedaannya bukan sekadar label. Kalau memuat persediaan lama ditandai sebagai
pembelian, laporan bulan pertama akan menunjukkan belanja ratusan juta rupiah
yang tidak pernah terjadi — dan bulan itu tidak akan pernah bisa dibandingkan
dengan bulan-bulan berikutnya. Yang bertanda Saldo Awal diberi kolom tersendiri
di rekap dan diberi keterangan di layar laporan.

**Satu baris = satu batch.** Obat yang sama dengan tanggal kadaluwarsa, faktur,
PBF, atau harga beli berbeda ditulis di baris terpisah. Baris yang gabungannya
persis sama akan menambah stok batch yang ada, bukan membuat baris baru.

**Tanggal.** Tulis `2028-06-30` — tahun, bulan, tanggal. Bentuk `30/06/2028`
juga diterima, tapi `03/04/2028` bisa dibaca dua cara. Sistem membacanya
hari-dulu dan **menampilkan hasil bacaannya** di kolom Kadaluwarsa ("3 April
2028"), jadi salah baca langsung terlihat sebelum apa pun tersimpan.

**Obat yang belum ada di Master Data tidak langsung ditolak.** Barisnya
ditandai, dan Anda punya dua pilihan:

- Centang kolom **Buat** — obatnya ditambahkan ke Master Data saat impor,
  dengan nama, satuan, dan harga jual dari berkas. Penambahan itu tercatat di
  audit log atas nama Anda.
- Kalau ada nama yang mirip, sistem menyebutkannya lebih dulu — tekan namanya
  untuk memakai obat yang sudah ada. Ini yang mencegah "Amoxicilin 500mg" dan
  "Amoxicillin 500 mg" hidup sebagai dua kartu stok yang tidak pernah
  dijumlahkan.

Beda spasi saja bukan masalah: "Amoxicillin 500mg" otomatis bertemu
"Amoxicillin 500 mg" di Master Data.

**Semua atau tidak sama sekali.** Berkas 80 baris yang ditolak di baris ke-63
tidak menyisakan 62 batch yang terlanjur masuk. Kalau ada satu baris yang
ditolak database, tidak ada satu pun yang tersimpan — pesannya menyebut nomor
barisnya, Anda perbaiki di Excel, lalu unggah ulang berkas yang sama tanpa
khawatir stok tercatat dua kali.

**Batasnya 2.000 baris sekali impor.** Berkas yang lebih besar dipecah dulu.

---

## Ekspor Excel

Apotek → **Ekspor Excel**. Satu berkas berisi lembar yang Anda pilih:

| Lembar | Isi |
|---|---|
| **Ringkasan** | Nilai aset, 10 obat bernilai terbesar, yang menipis, yang kadaluwarsa atau hampir |
| **Stok per Obat** | Satu baris per obat: total, nilai, jumlah batch, kadaluwarsa terdekat |
| **Stok per Batch** | Rincian tiap batch |
| **Riwayat Transaksi** | Semua pergerakan pada rentang tanggal yang dipilih |
| **Rekap 12 Bulan** | Pembelian, saldo awal, dan keluar per kategori |
| **Kartu Stok** | Kartu harian satu obat pada satu bulan |

Angkanya ditulis sebagai **angka**, bukan teks berformat "Rp 1.500", jadi masih
bisa dijumlahkan dan disaring di Excel.

Lembar **Stok per Batch** memakai judul kolom yang sama persis dengan template
impor. Artinya hasil ekspor bisa langsung diunggah kembali — berguna untuk
memindahkan stok ke database lain, atau memulihkan keadaan setelah kesalahan
besar.

---

## Kasir

**Tagihan tidak diketik, tapi ditarik.** Dari halaman Kasir, pilih kunjungan
yang menunggu ditagih, tekan **Susun tagihan**. Sistem mengambil tindakan
ICD-9-CM dari catatan dokter (dengan tarif dari master Tarif) dan obat dari
apa yang sudah diserahkan apotek. Kasir masih bisa menambah baris manual untuk
hal-hal di luar itu — surat keterangan, misalnya.

**Penjamin menentukan siapa yang membayar.** Kunjungan BPJS dan Gratis:
seluruh barisnya ditandai *ditanggung penjamin*, tagihan pasien Rp 0, tetapi
nilai ekonominya tetap tercatat sehingga pertanyaan "berapa nilai obat BPJS
bulan ini" tetap bisa dijawab. Untuk obat atau layanan di luar tanggungan,
hilangkan centang **Ditagih** pada baris itu — baris tersebut kembali menjadi
tanggungan pasien.

**Tagihan yang sudah dibayar terkunci.** Struk sudah dicetak dan diserahkan;
mengubah isinya setelah itu membuat kertas di tangan pasien dan catatan di
sistem menyebut dua hal berbeda. Koreksi dilakukan dengan menghapus
pembayarannya lebih dulu — tindakan yang hanya bisa dilakukan admin dan
selalu tercatat di audit log dengan alasannya.

**Tarif berversi.** Menaikkan tarif tidak mengubah tagihan yang sudah terbit.
Di halaman **Tarif & Invoice**, tombol *Ubah tarif* membuat versi baru dengan
tanggal berlaku baru; versi lama tetap tersimpan karena tagihan lama merujuk
angkanya.

**Mencetak.** Dua jalur, keduanya dari tombol Cetak:

| Jalur | Dipakai untuk | Catatan |
|---|---|---|
| Struk thermal | Kwitansi harian di meja kasir | 58 mm atau 80 mm; Bluetooth, USB, atau dialog cetak sistem |
| Kwitansi PDF | Yang perlu disimpan atau dikirim | Diunduh sebagai berkas |

Printer Bluetooth dan USB hanya bisa dipakai lewat Chrome atau Edge. **Di
iPhone dan iPad hal itu mustahil** — Safari tidak mendukung akses perangkat
semacam itu dan tidak akan mendukungnya. Tombolnya memang disembunyikan di
sana; pakai tombol Cetak biasa, yang membuka dialog cetak sistem, lalu pilih
printer thermal dari daftar.

Tampilan kwitansi dan struk diatur di **Tarif & Invoice → Tampilan invoice**:
warna, judul, apa saja yang dicetak, catatan kaki, ruang tanda tangan. Ada
pratinjau langsung yang dirender mesin yang sama dengan yang mencetak ke
printer, jadi yang terlihat di layar itulah yang keluar dari kertas.

---

## Poli gigi

Pasien yang didaftarkan ke poli berjenis `GIGI` akan membuka layar dokter yang berbeda:
di atas catatan SOAP muncul odontogram dan formulir pemeriksaan gigi.

### Odontogram

Bagan 52 gigi dengan penomoran FDI dua digit — 32 gigi tetap (11–48) dan 20 gigi sulung
(51–85). Tampilan awal dipilih otomatis dari umur pasien: di bawah 6 tahun tampil gigi
sulung, 6–12 tahun gigi campuran, di atas itu gigi tetap. Tetap bisa diganti manual.

Tiap gigi terbagi lima bidang, mengikuti kaidah odontogram:

| Bidang | Letak pada bagan |
|---|---|
| **O** — Oklusal / insisal | Kotak tengah |
| **M** — Mesial | Sisi yang menghadap garis tengah wajah |
| **D** — Distal | Sisi yang menjauhi garis tengah |
| **V** — Vestibular (bukal/labial) | Sisi pipi — di atas untuk rahang atas, di bawah untuk rahang bawah |
| **L** — Lingual / palatal | Sisi lidah atau langit-langit — kebalikan dari V |

**Cara mengisi.** Pilih satu kondisi di papan warna, lalu klik bidang gigi yang dimaksud —
seperti memakai stabilo. Klik bidang yang sama lagi untuk membatalkan. Untuk kondisi yang
mengenai seluruh gigi (gigi hilang, belum erupsi, mahkota), klik **nomor giginya**.

Notasi yang dipakai adalah notasi odontogram standar Indonesia:

| Kelompok | Kode |
|---|---|
| Kondisi gigi | `sou` sehat · `car` karies · `cfr` fraktur mahkota · `att` atrisi · `ano` anomali · `nvt` non-vital · `rrx` sisa akar · `mis` hilang · `une` belum erupsi · `pre` erupsi sebagian |
| Tambalan | `amf` amalgam · `cof` komposit · `gif` glass ionomer · `fis` fissure sealant |
| Perawatan & protesa | `rct` perawatan saluran akar · `fmc` `poc` `mpc` `gmc` mahkota · `ipx` implan · `abu` `pon` `meb` `pob` jembatan · `prd` `fld` gigi tiruan |

Kondisi seperti perawatan saluran akar tidak menutup gigi — ia tampil sebagai bingkai
berwarna, sehingga tambalan pada bidangnya tetap terlihat. Kondisi seperti gigi hilang
menutup seluruh kotak.

**Indeks DMF-T dan def-t dihitung sendiri** dari odontogram dan ikut tersimpan bersama
pemeriksaan gigi. Gigi berlubang menang atas tambalan: satu gigi hanya dihitung sekali.

### Odontogram itu milik pasien, bukan milik kunjungan

Odontogram menempel pada pasien dan terus diperbarui tiap kunjungan. Yang direkam tiap
kali berubah adalah **selisihnya** — kondisi sebelum dan sesudah, beserta kunjungan mana
yang mengubahnya. Karena itu, saat Anda membuka rekam medis kunjungan lama, odontogram
yang tampil adalah keadaan gigi **sebagaimana saat kunjungan itu**, bukan keadaan hari ini.

Contoh: gigi 36 karies pada bidang oklusal dan distal, lalu ditambal komposit pada
kunjungan berikutnya. Rekam medis kunjungan pertama tetap menunjukkan karies; kunjungan
kedua menunjukkan tambalan.

### Pemeriksaan gigi dan tindakan

Formulir di bawah odontogram mencakup pemeriksaan ekstra oral (wajah, kelenjar limfe, TMJ,
bibir) dan intra oral (mukosa pipi, gusi, lidah, palatum, dasar mulut, oklusi, torus,
diastema), serta penilaian kebersihan mulut dan skor OHI-S.

Tindakan dicatat dengan kode **ICD-9-CM**. Tindakan yang memang mengenai satu gigi
tertentu — pencabutan, penambalan, perawatan saluran akar — meminta nomor giginya, dan
rekam medis tidak bisa dikunci sebelum nomor itu diisi. Tindakan seperti skeling yang
mengenai seluruh mulut tidak meminta nomor gigi.

Bagian tindakan juga muncul di poli umum, dengan daftar kode untuk tindakan FKTP umum
(penjahitan luka, nebulisasi, ekstraksi serumen, imunisasi, dan lainnya).

---

## Master data

Menu **Master Data** (hanya admin) berisi tiga daftar yang muncul saat dokter memeriksa
pasien. Semuanya bisa diubah dari aplikasi — tidak perlu membuka dasbor Supabase.

### Obat

Bawaannya 70 obat generik Fornas. Yang bisa dilakukan:

- **Tambah, ubah, nonaktifkan.** Obat yang dinonaktifkan tidak hilang dari resep lama,
  hanya tidak muncul lagi saat dokter mencari. Ini yang benar untuk obat yang sudah tidak
  distok: riwayat tetap utuh.
- **Impor CSV.** Berguna saat Anda memindahkan daftar obat dari portal sipantau. Kolom
  yang dikenali: `kode_internal`, `nama`, `nama_generik`, `bentuk_sediaan`, `kekuatan`,
  `satuan`, `golongan`, `kode_kfa`, `kode_pcare`, `formularium`, `harga`. Hanya `nama`
  yang wajib. Ada pratinjau sebelum data benar-benar masuk.
- **Ekspor CSV.** Untuk mencadangkan atau menyuntingnya di Excel lalu diimpor kembali.

Baris dicocokkan dengan `kode_internal`, jadi impor yang sama bisa dijalankan berulang
untuk memperbarui data tanpa menggandakannya.

### Diagnosa ICD-10

Centang **tombol cepat** pada diagnosa yang sering dipakai di klinik Anda — diagnosa itu
akan muncul sebagai tombol sekali klik di layar dokter, jadi tidak perlu diketik berulang.
Bawaannya sudah ditandai berdasarkan pola kunjungan FKTP pada umumnya, tapi tiap klinik
berbeda; sesuaikan setelah beberapa minggu berjalan.

### Tindakan ICD-9-CM

Sama polanya. Yang khas di sini adalah centang **per gigi**: tindakan yang ditandai begitu
akan meminta nomor gigi saat dicatat, dan rekam medis tidak bisa dikunci sebelum nomornya
diisi.

---

## Bridging PCare & SatuSehat

Struktur data sudah disiapkan sejak awal untuk keduanya, jadi tidak perlu membongkar aplikasi saat kredensial nanti keluar. Yang perlu diurus:

### A. PCare BPJS Kesehatan

1. Ajukan surat permohonan bridging ke **Kantor Cabang BPJS Kesehatan** setempat.
2. Yang akan Anda terima: `cons_id`, `secret_key`, `user_key`, username & password PCare, dan kode aplikasi.
3. BPJS memberi akses lingkungan uji coba (*development*) lebih dulu. Lakukan pengujian di sana sebelum minta akses produksi.

### B. SatuSehat (Kemenkes)

1. Pastikan klinik punya **kode registrasi faskes** dari Kemenkes.
2. Daftar di https://satusehat.kemkes.go.id → dapatkan `client_id`, `client_secret`, dan **Organization ID**.
3. Daftarkan **Location** untuk tiap poli, dan **Practitioner** (nomor IHS) untuk tiap dokter/perawat.
4. Isi nilainya di aplikasi: Organization ID & Location ID di **Pengaturan → Profil Klinik**; nomor IHS tenaga medis di **Pengaturan → Pengguna**.
5. Uji di lingkungan *staging*, lalu ajukan *go-live*.

Halaman **Pengaturan → Bridging** menampilkan daftar periksa kesiapan data, jadi Anda bisa melihat sekilas apa yang masih kurang.

### B1. Data gigi ke SatuSehat

Odontogram dikirim sebagai `Observation` — satu untuk tiap temuan — dengan `bodySite`
berisi nomor gigi dan komponen berisi bidang, kondisi, serta bahan tambalan atau protesa,
mengikuti Lampiran Terminologi Gigi SatuSehat. Tindakan dikirim sebagai `Procedure`.

Satu hal yang perlu Anda lengkapi: **kode SNOMED tiap gigi**. Tabel `ref_gigi` sudah berisi
52 gigi dengan nomor FDI-nya, tapi kolom `kode_snomed` sengaja dibiarkan kosong karena
tabel pemetaannya ada di dokumentasi SatuSehat yang baru bisa diakses setelah klinik
terdaftar. Isi dari Lampiran Terminologi Gigi (Tabel 1), misalnya:

```sql
update ref_gigi set kode_snomed = '422653006' where fdi = '11';
update ref_gigi set kode_snomed = '866005003' where fdi = '46';
-- dan seterusnya untuk 52 gigi
```

Selama kolom itu kosong, nomor FDI tetap dikirim sebagai teks pada `bodySite.text`,
jadi datanya tidak hilang — hanya belum berkode standar.

Satu lagi yang perlu dicek: sistem kode untuk `Procedure.code`. Aplikasi mengirim
ICD-9-CM karena itu yang dipakai untuk klaim di Indonesia. Bila SatuSehat memintanya
dalam terminologi lain, ubah satu baris `prosedur:` pada `SYS` di
`satusehat-proxy/index.ts`.

### C. Memasang Edge Function

Butuh Supabase CLI (dipasang sekali di komputer):

```bash
npm install -g supabase
supabase login
supabase link --project-ref REF-PROJECT-ANDA

supabase functions deploy pcare-proxy
supabase functions deploy satusehat-proxy
```

Lalu isi kredensial sebagai **Secret** — bukan di dalam kode:

```bash
supabase secrets set \
  PCARE_BASE_URL="https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev" \
  PCARE_CONS_ID="..." PCARE_SECRET_KEY="..." PCARE_USER_KEY="..." \
  PCARE_USERNAME="..." PCARE_PASSWORD="..." PCARE_KD_APLIKASI="095"

supabase secrets set \
  SATUSEHAT_BASE_URL="https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1" \
  SATUSEHAT_AUTH_URL="https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1" \
  SATUSEHAT_CLIENT_ID="..." SATUSEHAT_CLIENT_SECRET="..." SATUSEHAT_ORG_ID="..."
```

Terakhir, nyalakan di `js/config.js`:

```js
BRIDGING: { PCARE_AKTIF: true, SATUSEHAT_AKTIF: true }
```

> **Mengapa lewat Edge Function, bukan langsung dari peramban?** Tiga alasan: kredensial BPJS tidak boleh sampai ke perangkat pengguna; kedua layanan memblokir permintaan lintas-asal dari peramban; dan respons PCare terenkripsi sehingga pembongkarannya harus di sisi server.

**Satu hal yang perlu dicek ulang.** Skema tanda tangan dan enkripsi PCare di `pcare-proxy/index.ts` mengikuti pola yang berlaku umum (HMAC-SHA256 untuk tanda tangan, AES-256-CBC + LZ-String untuk respons). Setelah kredensial diterima, cocokkan sekali lagi dengan dokumen TrustMark resmi dari BPJS. Bila ada perbedaan, yang perlu disesuaikan hanya dua fungsi: `buatTandaTangan()` dan `bongkar()`.

---

## Keamanan dan kepatuhan PMK 24/2022

| Ketentuan | Bagaimana dipenuhi |
|---|---|
| Isi rekam medis rawat jalan | Identitas, anamnesis, pemeriksaan fisik, diagnosa ICD-10, terapi, edukasi, tindak lanjut |
| Diagnosa wajib ICD-10 | Pencarian ICD-10 dengan 162 kode tersering; kode disimpan terpisah dari teks |
| Audit trail | Setiap tambah/ubah/hapus terekam di `audit_log` beserti data lama, data baru, pelaku, dan waktu. Pembukaan rekam medis pasien juga tercatat sebagai `VIEW_RM`. |
| Rekam medis tidak boleh diubah diam-diam | Setelah dikunci, perubahan ditolak database. Koreksi hanya lewat **Addendum** yang tercatat terpisah. |
| Retensi minimal 25 tahun | Tidak ada penghapusan otomatis. Penghapusan hanya manual oleh admin dan tetap terekam. |
| Pembatasan akses | Row Level Security per peran — perawat tidak bisa menulis diagnosa, pendaftaran tidak bisa menulis SOAP, dan seterusnya. Diuji langsung, bukan hanya diatur di tampilan. |

Yang **masih menjadi tanggung jawab Anda**:

- Menetapkan kebijakan tertulis tentang siapa boleh mengakses apa
- Membuat cadangan berkala — **paket gratis Supabase tidak punya cadangan otomatis sama sekali**. Lihat [Cadangan data](#cadangan-data).
- Memastikan setiap staf punya akun sendiri — **jangan berbagi akun**, karena audit trail jadi tidak berarti
- Persetujuan pasien (*informed consent*) untuk tindakan tertentu

---

## Cadangan data

**Paket gratis Supabase tidak membuat cadangan otomatis.** Cadangan harian tujuh hari itu
milik paket Pro. Di paket gratis, tidak ada yang bisa dipulihkan kalau data hilang —
Supabase sendiri menyarankan penggunanya mengekspor data secara berkala dan menyimpannya
di luar.

Untuk rekam medis ini bukan urusan sepele: PMK 24/2022 mewajibkan penyimpanan minimal
25 tahun, dan itu tanggung jawab klinik, bukan tanggung jawab penyedia server.

### Yang perlu dicadangkan hanya datanya

Struktur databasenya sudah ada di keenam berkas SQL yang Anda simpan — kalau perlu
dibangun ulang, tinggal dijalankan lagi. Yang tidak tergantikan hanya isinya: data pasien,
kunjungan, dan rekam medis.

### Caranya

Perlu Supabase CLI, dipasang sekali di komputer:

```bash
npm install -g supabase
supabase login
supabase link --project-ref REF-PROJECT-ANDA
```

Lalu setiap kali mencadangkan — cukup satu perintah:

```bash
supabase db dump --linked --data-only -f cadangan-2026-08-31.sql
```

Ganti tanggalnya tiap kali, simpan berkasnya di tempat yang bukan komputer klinik:
Google Drive, hard disk eksternal, atau keduanya. Berkasnya berupa teks biasa, jadi
ukurannya kecil dan bisa dibuka untuk diperiksa.

Untuk cadangan yang benar-benar lengkap termasuk strukturnya:

```bash
supabase db dump --linked -f skema-2026-08-31.sql
```

### Seberapa sering

Sesuaikan dengan seberapa banyak pekerjaan yang sanggup Anda ulang. Klinik yang melayani
20–30 pasien sehari sebaiknya mencadangkan **seminggu sekali** — kalau terjadi sesuatu,
yang hilang paling banyak satu minggu catatan, dan itu masih bisa dipulihkan dari berkas
rekam medis cetak.

Kalau nanti klinik naik ke paket Pro, cadangan harian berjalan otomatis dan langkah ini
jadi lapisan tambahan saja, bukan satu-satunya pengaman.

### Memulihkan

```bash
psql "URL-KONEKSI-PROJECT-BARU" -f skema-2026-08-31.sql
psql "URL-KONEKSI-PROJECT-BARU" -f cadangan-2026-08-31.sql
```

URL koneksinya ada di **Project Settings → Database → Connection string**.
Sebaiknya dicoba sekali ke project kosong selagi belum ada data sungguhan, supaya Anda
tahu langkahnya bekerja sebelum benar-benar membutuhkannya.

---

## Batas paket gratis

| Layanan | Batas gratis | Perkiraan cukup untuk |
|---|---|---|
| Supabase Database | 500 MB | ± 150.000–250.000 kunjungan (data teks murni) |
| Supabase Storage | 1 GB | Lampiran/foto — hemat-hemat |
| Supabase Edge Function | 500.000 panggilan/bulan | Jauh lebih dari cukup |
| Netlify | 100 GB bandwidth/bulan | Jauh lebih dari cukup |
| Cadangan otomatis | **Tidak ada di paket gratis** | Harus dicadangkan sendiri — lihat [Cadangan data](#cadangan-data) |

**Yang perlu diperhatikan:** project Supabase gratis akan dijeda bila **tidak ada aktivitas selama 7 hari**. Untuk klinik yang dipakai tiap hari kerja ini tidak jadi masalah. Bila klinik tutup panjang, cukup buka aplikasi sekali untuk membangunkannya.

Bila suatu saat perlu naik, paket berbayar Supabase mulai USD 25/bulan.

---

## Rencana penggabungan dengan portal klinik

Aplikasi ini sengaja dirancang supaya mudah disatukan dengan Pantau Klinik Imanuel nanti:

1. **Seluruh akses database lewat satu berkas** (`js/db.js`). Saat digabung, cukup berkas ini yang menunjuk ke project Supabase gabungan.
2. **Kunci penghubung pasien adalah NIK** (unik di tabel `pasien`). Data pasien di portal bisa dicocokkan lewat NIK tanpa mengubah struktur.
3. **Tampilan memakai satu berkas CSS** dengan variabel warna di bagian atas — mudah diselaraskan dengan gaya portal.
4. **Tidak ada asumsi tentang nama tabel portal.** Tabel RME semua memakai nama yang khas (`kunjungan`, `kajian_awal`, `pemeriksaan`, `diagnosa`, `resep`), jadi kecil kemungkinan bentrok.

Langkah penggabungan nanti, ringkasnya: jalankan keenam berkas SQL di project portal → pindahkan data dengan `pg_dump`/`pg_restore` → arahkan `config.js` ke project portal → tambahkan tautan RME di menu portal.

---

## Yang belum ada

Sesuai kesepakatan, versi ini fokus pada alur inti rawat jalan. Yang belum dibuat:

- Tarif tindakan dan modul kasir
- Surat keterangan sakit, surat rujukan format BPJS, surat kontrol
- Input hasil laboratorium dan unggah lampiran
- Foto rontgen gigi (periapikal/panoramik) — perlu penyimpanan gambar
- Modul apotek (stok obat, penyerahan) — sebagian sudah ada di portal Anda
- Antrean online / integrasi Mobile JKN (Antrol)
- Laporan LB1 dan format Dinkes
- Skrining PTM/Prolanis terstruktur

Struktur database sudah menyediakan tempat untuk sebagian besar hal di atas, jadi penambahannya nanti tidak perlu membongkar yang sudah ada.

---

## Kalau ada masalah

| Gejala | Kemungkinan sebab |
|---|---|
| "Aplikasi belum dihubungkan ke database" | `js/config.js` belum diisi |
| Bisa masuk tapi langsung keluar lagi | Baris di tabel `pegawai` belum ada atau `aktif = false` |
| "Akses ditolak" di halaman Pengaturan | Peran akun bukan `admin` |
| Data pasien kosong padahal ada isinya | RLS memblokir — pastikan akun punya baris di `pegawai` dengan `aktif = true` |
| Tombol simpan diagnosa tidak jalan | Peran akun bukan `dokter` atau `admin` |
| Project Supabase "paused" | Tidak ada aktivitas 7 hari — klik *Restore* di dasbor |
| Odontogram tidak muncul di layar dokter | Jenis poli belum diatur `GIGI` — ubah di Pengaturan → Poli |
| Rekam medis gigi tidak bisa dikunci | Ada tindakan per-gigi yang belum disebutkan nomor giginya |
| Dokter gigi tidak muncul saat pendaftaran | Kolom `jenis_dokter` diisi `UMUM` — ubah di Pengaturan → Pengguna |
| Obat tidak muncul saat dokter meresepkan | Obat dinonaktifkan — cek di Master Data → Obat |
| Impor CSV obat menolak berkas | Baris judul tidak memuat kolom `nama`, atau berkas lebih dari 3 MB |
| Peringatan "data belum lengkap" pada pasien | NIK atau nomor BPJS belum benar — tidak menghalangi pelayanan, tapi dibutuhkan saat bridging |

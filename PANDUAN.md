# RME Klinik Imanuel — Panduan Pemasangan

Rekam Medis Elektronik untuk klinik pratama BPJS, rawat jalan.
Biaya: **Rp 0** (Supabase free tier + Netlify free tier).

---

## Daftar isi

1. [Apa yang sudah jadi](#1-apa-yang-sudah-jadi)
2. [Yang perlu Anda siapkan](#2-yang-perlu-anda-siapkan)
3. [Langkah 1 — Buat database Supabase](#langkah-1--buat-database-supabase)
4. [Langkah 2 — Jalankan lima belas berkas SQL](#langkah-2--jalankan-lima-belas-berkas-sql)
5. [Langkah 3 — Buat akun master pertama](#langkah-3--buat-akun-master-pertama)
6. [Langkah 4 — Hubungkan aplikasi ke database](#langkah-4--hubungkan-aplikasi-ke-database)
7. [Langkah 5 — Unggah ke Netlify](#langkah-5--unggah-ke-netlify)
8. [Langkah 6 — Isi data klinik](#langkah-6--isi-data-klinik)
9. [Alur pemakaian harian](#alur-pemakaian-harian)
10. [Layar pemeriksaan dokter](#layar-pemeriksaan-dokter)
11. [Poli gigi](#poli-gigi)
12. [Lab & pemeriksaan penunjang](#lab--pemeriksaan-penunjang)
13. [Surat keterangan](#surat-keterangan)
14. [Master data](#master-data)
15. [Hak Akses per peran](#hak-akses-per-peran)
16. [Antrean, layar tunggu, dan antrean online Mobile JKN](#antrean-layar-tunggu-dan-antrean-online-mobile-jkn)
17. [Bridging PCare & SatuSehat](#bridging-pcare--satusehat)
18. [Keamanan dan kepatuhan PMK 24/2022](#keamanan-dan-kepatuhan-pmk-242022)
19. [Batas paket gratis](#batas-paket-gratis)
20. [Rencana penggabungan dengan portal klinik](#rencana-penggabungan-dengan-portal-klinik)
21. [Yang belum ada](#yang-belum-ada)

---

## 1. Apa yang sudah jadi

| Bagian | Isi |
|---|---|
| **Database** | 48 tabel, 18 view, 99 kebijakan RLS, penomoran RM & antrian otomatis, audit trail, penguncian rekam medis, Row Level Security per peran |
| **Aplikasi** | Login, beranda, pendaftaran, antrian, kajian awal perawat, SOAP dokter, diagnosa ICD-10, tindakan ICD-9-CM, resep, rekam medis, riwayat, laporan, pengaturan |
| **Poli gigi** | Odontogram per bidang gigi (gigi tetap dan sulung), pemeriksaan ekstra/intra oral, indeks DMF-T dan def-t, tindakan gigi ICD-9-CM |
| **Master data** | Kelola sendiri daftar obat (termasuk impor/ekspor CSV), diagnosa ICD-10, dan tindakan ICD-9-CM tanpa membuka dasbor Supabase |
| **Apotek** | Stok per batch dengan urutan keluar FEFO, antrean resep dari dokter, kartu stok harian, laporan bulanan, impor & ekspor Excel |
| **Kasir** | Tagihan disusun otomatis dari tindakan dokter dan obat yang diserahkan apotek, pembayaran, kwitansi PDF, struk thermal 58/80 mm |
| **Surat keterangan** | Surat sakit, rujukan bentuk BPJS, surat kontrol, keterangan berbadan sehat, resume medis, dan surat keterangan bebas isi — berkop klinik, bernomor otomatis, lengkap dengan riwayat dan cetak ulang |
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
│   ├── lab_core.js         Nilai rujukan & penandaan hasil lab (fungsi murni)
│   ├── kop_klinik.js       Gambar kop surat, tertanam sebagai data URI
│   ├── surat_core.js       Bentuk & isi tiap jenis surat (fungsi murni)
│   ├── surat_cetak.js      Penyaji surat: halaman cetak dan PDF
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
│   ├── 10_apotek_impor.sql Impor stok dari Excel (saldo awal & pembelian)
│   ├── 11_penunjang.sql    Lab, bacaan rontgen, register arsip berkas
│   ├── 12_kasir_penunjang.sql Lab & penunjang masuk ke tagihan
│   ├── 13_surat.sql        Surat keterangan, penomoran, dan riwayatnya
│   └── 14_periksa_terstruktur.sql  Pemeriksaan berfield, siap PCare & SatuSehat
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

## Langkah 2 — Jalankan lima belas berkas SQL

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
| 11 | `sql/11_penunjang.sql` | Laboratorium, bacaan rontgen/EKG/USG, register arsip berkas |
| 12 | `sql/12_kasir_penunjang.sql` | Lab & penunjang ikut masuk tagihan |
| 13 | `sql/13_surat.sql` | Surat keterangan: jenis surat, penomoran, riwayat, pengaturan kop |
| 14 | `sql/14_periksa_terstruktur.sql` | Pemeriksaan dokter berfield: tabel rujukan berkode, kolom baru pada `pemeriksaan`, view payload PCare & Observation SatuSehat |
| 15 | `sql/15_antrean.sql` | Antrean online (Mobile JKN/Antrol), jadwal & kuota poli, layar ruang tunggu |

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
  (select count(*) from kasir_tarif) as tarif,
  (select count(*) from ref_jenis_surat) as jenis_surat,
  (select count(*) from poli_jadwal) as jadwal_antrean;
```

Harus muncul: 178 ICD-10, 43 tindakan, 70 obat, 52 gigi, 3 poli, 1 tarif, 6 jenis surat,
33 baris jadwal antrean (3 poli × 6 hari pagi + 3 poli × 5 hari sore).

---

## Langkah 3 — Buat akun master pertama

1. Di dasbor Supabase: **Authentication** → **Users** → **Add user** → **Create new user**
2. Isi email dan kata sandi. Centang **Auto Confirm User** (supaya tidak perlu verifikasi email).
3. Klik **Create user**.

Baris di tabel `pegawai` akan dibuat otomatis, tapi perannya masih `admin`. Naikkan jadi master lewat **SQL Editor**:

```sql
update pegawai
set peran = 'master', nama = 'dr. Arthur Mantiri'
where id = (select id from auth.users where email = 'EMAIL-ANDA@contoh.id');
```

Untuk dokter, isi juga jenisnya supaya pilihan dokter saat pendaftaran menyesuaikan poli:

```sql
update pegawai set jenis_dokter = 'GIGI'
where nama = 'drg. Nama Dokter Gigi Anda';
```

Ulangi Langkah 3 untuk tiap staf. Peran yang tersedia:

| Peran | Boleh melakukan (bawaan) |
|---|---|
| `master` | Semua, tanpa kecuali — termasuk Pengaturan dan Master Data. Satu-satunya peran yang tidak bisa dibatasi lewat Hak Akses. |
| `admin` | Staf loket: daftar pasien, buat kunjungan, lihat rekam medis |
| `perawat` | Kajian awal (tanda vital), catat alergi |
| `dokter` | Anamnesis, pemeriksaan fisik, diagnosa, tindakan, resep, odontogram, kunci rekam medis, terbitkan surat |
| `apoteker` | Lihat resep, tandai penyerahan obat |
| `kasir` | Susun tagihan, catat pembayaran |

> **9 Sep 2026 — nama peran berubah, dan hak akses kini bisa diatur.**
> Peran tertinggi dulu bernama `admin`, sekarang `master`. Peran staf loket
> dulu bernama `pendaftaran`, sekarang `admin` — sesuai istilah yang dipakai
> staf klinik sehari-hari. Akun yang sudah ada otomatis ikut berganti nama
> perannya; tidak ada yang perlu diketik ulang. Daftar "boleh melakukan" di
> atas adalah **bawaan saja** — `master` bisa mengubah, per peran dan per
> fitur, lewat **Pengaturan → Hak Akses** (lihat [bagian tersendiri di
> bawah](#hak-akses-per-peran)). Menu itu sendiri, seperti halaman
> Pengguna, sengaja **tidak** bisa diserahkan ke peran lain — supaya
> `master` tidak pernah bisa mengunci dirinya sendiri dari satu-satunya
> tempat memperbaiki hak akses.

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

Masuk sebagai master, buka **Pengaturan**:

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
PENDAFTARAN      PERAWAT        DOKTER            LAB            APOTEK          KASIR
     │              │             │                │                │              │
 Cari pasien ─▶ Kajian ─▶ SOAP + Diagnosa ─▶ Hasil diisi, ─▶ Resep masuk ─▶ Tagihan
 atau daftar    awal      (ICD-10) +          ditandai        antrean,       disusun
 pasien baru              Tindakan +          Tinggi/Rendah   stok           otomatis
     │                    Minta lab +         otomatis        terpotong      dari yang
 Nomor antrian            Resep                  │            FEFO           dikerjakan
 keluar otomatis            │              Lembar ditutup       │                 │
                     Kunci rekam medis     & terkunci                     Bayar → kwitansi
                                                                           & struk thermal
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
- Permintaan lab dokter langsung muncul di antrean laboratorium, tanpa diketik ulang
- Hasil lab ditandai **Tinggi**, **Rendah**, atau **Kritis** menurut nilai rujukan yang
  sesuai jenis kelamin dan umur pasien, dan hasilnya kembali sendiri ke layar dokter
- Kasir menarik tindakan dari catatan dokter, pemeriksaan lab dari **yang benar-benar
  dikerjakan**, dan obat dari **yang benar-benar diserahkan apotek** — bukan dari angka
  yang ditulis di resep
- Kunjungan BPJS tetap dicatat nilainya untuk laporan, tetapi tidak ditagihkan
  ke pasien
- **Surat keterangan** yang dibuat dari layar dokter mengambil sendiri diagnosa,
  tanda vital, terapi, dan rencana tindak lanjut dari kunjungan yang sama — nomornya
  pun disarankan otomatis. Lihat [Surat keterangan](#surat-keterangan)

> **Kapan suratnya dibuat.** Tombol **Buat surat** ada di layar Pemeriksaan Dokter dan
> di Rekam Medis, jadi surat sakit atau rujukan bisa langsung dicetak begitu pemeriksaan
> selesai — pasien tidak perlu antre ke loket lagi untuk itu. Surat tetap bisa dibuat
> belakangan lewat menu Surat Keterangan; datanya diambil dari kunjungan yang dipilih.

---

## Layar pemeriksaan dokter

Sejak September 2026 layar ini tidak lagi berupa empat kotak teks bebas. Isinya
kini **field terpisah** — dan itu bukan demi kerapian, melainkan karena tidak
satu pun paragraf bisa dikirim ke PCare maupun SatuSehat. PCare meminta 30 field
terpisah (keluhan, kdSadar, sistole, suhu, kdPrognosa, terapiObat, kdTacc, dan
seterusnya); SatuSehat meminta tiap tanda vital dan tiap temuan sebagai
Observation berkode tersendiri.

**Catatan SOAP tetap ada.** Kotak S, O, A, dan P masih di bawah layar, dan
isinya **tersusun sendiri** dari field yang Anda isi di atasnya — jadi rekam
medis yang dicetak tetap berbunyi seperti tulisan dokter, bukan seperti daftar
centang. Anda boleh menyuntingnya; huruf yang Anda ketik sendiri tidak akan
ditimpa saat isian lain berubah.

### Urutan mengisi

| Bagian | Isinya | Yang mempercepat |
|---|---|---|
| **S — Anamnesis** | Keluhan utama, delapan butir riwayat penyakit sekarang, riwayat dahulu/keluarga/obat/sosial, alergi berkode | Keluhan utama, riwayat dahulu, dan obat rutin **sudah terisi** dari kajian awal perawat |
| **O — Pemeriksaan fisik** | Keadaan umum, kesadaran, lalu 13 sistem tubuh | Tombol **Semua dalam batas normal** menandai 12 sistem sekaligus; Anda tinggal membuka yang memang tidak normal |
| **A — Diagnosa** | ICD-10 ditegakkan + diagnosis banding | Daftar diagnosa yang sering dipakai bisa diklik |
| **P — Resep & terapi** | Obat, terapi non-obat, BMHP, edukasi | Aturan pakai diurai jadi angka sendiri |
| **Tindak lanjut** | Rencana, rujukan berkode, TACC, keadaan pulang, prognosa | Blok rujukan hanya muncul bila pasien memang dirujuk |

### Tiga keadaan tiap sistem, bukan dua

Tiap sistem tubuh punya **Normal**, **Ada temuan**, dan **Tidak diperiksa**.
Ketiganya berbeda arti, dan bedanya penting: rekam medis yang hanya memuat
temuan abnormal tidak bisa dibedakan dari sistem yang tidak pernah disentuh.
Karena itu sistem yang Anda tandai normal **ikut tercetak** di rekam medis,
lengkap dengan kalimat bakunya.

Genitourinaria sengaja **tidak ikut** tombol "Semua dalam batas normal".
Menandainya normal berarti menuliskan pemeriksaan yang tidak dilakukan, atas
nama Anda, di dokumen hukum.

### Aturan pakai jadi dua angka

PCare tidak menerima kalimat "3 x sehari 1 tablet"; yang diminta dua angka —
berapa kali sehari dan berapa tiap kali. Angkanya **diurai sendiri** dari
kalimat yang memang sudah Anda ketik, dan hasilnya diperlihatkan di bawah kotak
aturan pakai (`signa 3 × 1`). Aturan pakai yang tidak berangka — "sesuai anjuran
dokter", "oleskan tipis" — ditandai **belum terbaca sebagai angka** dan tidak
ditebak. Menebaknya berarti mengirim aturan pakai yang salah ke BPJS sementara
kertas resep yang dipegang pasien tetap benar; tidak akan ada yang pernah tahu.

### Kartu "Data untuk BPJS & SatuSehat"

Muncul di panel kanan untuk setiap pasien JKN, **juga selagi bridging belum
menyala**. Gunanya justru itu: memperlihatkan kekurangan data hari ini, bukan
pada hari kredensial datang. Tombol **Lihat data yang akan dikirim** membuka
isi payload PCare apa adanya — field yang belum terisi ditandai berwarna.

Dua tingkat peringatan, dan bedanya disengaja:

- **Merah — belum bisa dikunci.** Rekam medisnya sendiri tidak sah tanpa ini:
  keluhan utama, diagnosa, pemeriksaan fisik, keadaan pulang, tujuan rujukan,
  alasan TACC.
- **Kuning — pengingat.** Data bridging kurang, tetapi pelayanan tetap sah dan
  rekam medis tetap bisa dikunci: prognosa, tanda vital, aturan pakai yang tidak
  berangka. Sistem yang menolak menyimpan rekam medis karena satu kolom PCare
  kosong akan segera dicari akalnya — dokter akan mengisi apa saja supaya
  tombolnya menyala, dan data yang masuk jadi lebih buruk daripada kolom kosong.

### Diagnosa lebih dari tiga

PCare hanya punya tiga slot (`kdDiag1`–`kdDiag3`). Diagnosa keempat dan
seterusnya **tetap tersimpan di rekam medis** tetapi ditandai *tidak terkirim*
di tabel diagnosa. Yang terkirim adalah tiga teratas menurut urutan tabel; ubah
jenis diagnosa atau hapus baris untuk mengatur mana yang ikut.

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
pembayarannya lebih dulu — tindakan yang hanya bisa dilakukan master dan
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

## Lab & pemeriksaan penunjang

Menu **Lab & Penunjang** berisi tiga hal yang biasanya dikerjakan orang yang sama:
antrean laboratorium, bacaan pemeriksaan penunjang, dan register arsip berkas.

### Keputusan yang perlu Anda ketahui: modul ini tidak menyimpan gambar

Supabase paket gratis memberi 1 GB penyimpanan berkas. Satu foto rontgen dari kamera HP
berukuran 3–5 MB; seratus foto sebulan menghabiskan kuota itu dalam waktu di bawah dua
tahun. Dan cara habisnya paling tidak enak: unggahan mulai gagal di tengah jam praktek,
tanpa pemberitahuan sebelumnya.

Karena itu yang disimpan aplikasi ini adalah **isi medisnya**, bukan gambarnya:

| Yang biasanya difoto | Yang disimpan di sini | Kenapa |
|---|---|---|
| Lembar hasil lab | Angkanya, per pemeriksaan | Angka bisa ditandai Tinggi/Rendah otomatis, bisa dibandingkan antar kunjungan, dan kelak bisa dikirim ke SatuSehat. Foto lembar tidak bisa satu pun dari ketiganya |
| Film rontgen gigi | Bacaannya: temuan, kesan, saran — terkait nomor gigi | Inilah yang dibaca dokter berikutnya; filmnya sendiri jarang dibuka ulang |
| Berkas fisik apa pun | Nomor arsipnya di register | Nol byte, tetap ketemu saat dicari |

Akibatnya penggunaan penyimpanan berkas tetap **0 byte**, dan yang tumbuh hanya database
— sekitar 2 KB per lembar hasil lab lengkap. Kuota database 500 MB baru habis setelah
kira-kira 250.000 pemeriksaan.

Kalau suatu hari klinik berlangganan Supabase berbayar dan ingin menyimpan gambarnya
juga: tabel `lampiran` sudah punya kolom `berkas_path`, `berkas_mime`, `berkas_ukuran`,
dan `berkas_sha256` yang sengaja dibiarkan kosong. Yang perlu ditambah hanya unggahan di
sisi aplikasi — tabel, kebijakan RLS, laporan, dan cetakan tidak ada yang berubah.

### Alur laboratorium

1. **Dokter meminta.** Di halaman Pemeriksaan Dokter ada kartu *Pemeriksaan penunjang*
   dengan tombol **Minta lab**. Pilih per pemeriksaan, atau sekali klik lewat paket
   (Darah Rutin, Gula Darah, Profil Lipid, Fungsi Ginjal, Fungsi Hati, Urine Lengkap,
   Skrining Ibu Hamil). Boleh menambahkan keterangan klinis untuk petugas lab.
2. **Petugas mengisi.** Menu **Lab & Penunjang → Antrean lab**. Klik lembarnya, ketik
   angkanya. Setiap angka disimpan begitu kotaknya ditinggalkan — tidak ada tombol
   "Simpan semua" yang bisa membuat setengah jam pekerjaan hilang.
3. **Penandaan otomatis.** Nilai di luar rujukan ditandai *Tinggi* atau *Rendah*; nilai
   yang berbahaya ditandai **Kritis** dan memunculkan peringatan agar dokter segera
   diberi tahu. Rujukannya mengikuti jenis kelamin dan umur pasien — Hb 12,5 g/dL
   *rendah* pada laki-laki dewasa tetapi *normal* pada perempuan dewasa.
4. **Lembar ditutup.** Tombol **Selesaikan lembar** baru hidup setelah semua isian
   terisi. Setelah ditutup, hasilnya terkunci; hanya master yang bisa membukanya kembali,
   dan alasannya wajib diisi serta tercatat pada lembarnya.
5. **Dokter membaca.** Hasilnya muncul sendiri di kartu *Pemeriksaan penunjang* pada
   halaman pemeriksaan, dan ikut tercetak di rekam medis.

Hasil lab boleh masuk **setelah** dokter mengunci rekam medis — memang begitu urutannya
di banyak kasus, dan bagian penunjang sengaja tidak ikut terkunci.

### Melihat tren

Ikon grafik di ujung tiap baris hasil membuka riwayat pemeriksaan yang sama pada pasien
itu, lengkap dengan selisih terhadap pemeriksaan sebelumnya. Inilah yang tidak bisa
diberikan foto lembar hasil, dan alasan utama angkanya diketik ulang.

### Hasil dari lab luar

**Antrean lab → Catat hasil lab luar.** Pilih pasien, tanggal pemeriksaan aslinya, nama
laboratoriumnya, lalu pemeriksaan mana saja yang ada hasilnya — dan ketik angkanya.
Hasil lab luar:

- boleh dicatat perawat (mencatat hasil jadi adalah entri data, bukan permintaan medis);
- boleh bertanggal mundur, bahkan tanpa kunjungan, untuk hasil yang dibawa pasien dari
  sebelum ia terdaftar di klinik ini;
- **tidak ikut ditagihkan**, karena bukan klinik yang mengerjakannya.

Lembar kertasnya sendiri dicatat di **Arsip berkas** supaya dapat nomor.

### Bacaan rontgen gigi

**Lab & Penunjang → Bacaan penunjang**, atau langsung dari halaman pemeriksaan dokter
lewat tombol **Tulis bacaan**. Isinya mengikuti kebiasaan penulisan radiologi: *temuan*
(apa yang terlihat), *kesan* (kesimpulan — wajib diisi), dan *saran*.

Untuk foto periapikal, bitewing, panoramik, dan oklusal, sebutkan **nomor giginya**
(FDI, mis. `36 37`). Gigi yang punya bacaan diberi sudut ungu di odontogram; arahkan
kursor ke giginya untuk melihat kesan terakhirnya. Nomor yang bukan gigi FDI ditolak
sebelum tersimpan.

Bacaan hanya boleh ditulis dokter — menafsirkan gambaran radiologis adalah tindakan
medis, bukan pekerjaan administratif.

### Register arsip berkas

Film, lembar hasil lab luar, surat rujukan, dan informed consent tetap berwujud kertas.
PMK 24/2022 mewajibkan rekam medis disimpan 25 tahun; yang tidak diwajibkan adalah
menyimpannya dalam bentuk digital.

**Lab & Penunjang → Arsip berkas.** Catat berkasnya, sistem memberi nomor
`ARS-2026-0001`, tulis nomor itu di pojok berkasnya dengan spidol, lalu simpan berurutan
menurut nomor. Mencari film gigi dari dua tahun lalu berubah dari membongkar lemari
menjadi membaca satu nomor di layar. Nomor arsipnya ikut tercetak di rekam medis, jadi
siapa pun yang membacanya tahu berkas aslinya ada dan tahu harus mencari nomor berapa.

### Nilai rujukan — **wajib dicocokkan sebelum lab dipakai**

Aplikasi terpasang dengan 41 pemeriksaan dan nilai rujukan umum yang lazim dipakai di
Indonesia. **Itu bukan nilai rujukan alat Anda.** Setiap alat dan setiap reagen punya
rentangnya sendiri, dan yang sah adalah yang tercetak pada sisipan reagen.

Buka **Master Data → Pemeriksaan Lab**, cocokkan dengan buku alat, lalu perbaiki yang
berbeda sebelum lab melayani pasien pertama. Satu pemeriksaan boleh punya beberapa baris
rujukan: laki-laki, perempuan, dan beberapa rentang umur — yang paling khusus yang dipakai.

Memperbaiki nilai rujukan hari ini **tidak** mengubah hasil kemarin: setiap lembar hasil
menyimpan salinan nilai rujukan yang berlaku saat pemeriksaan dilakukan, prinsip yang
sama dengan tarif di modul kasir.

### Tarif lab dan penunjang

**Tarif & Invoice → Tarif baru**, pilih jenis **Pemeriksaan laboratorium** atau
**Penunjang**, lalu pilih pemeriksaannya dari daftar (bukan diketik bebas — kode yang
berselisih satu huruf membuat tarifnya diam-diam tidak pernah ketemu saat menagih).

Yang ditagihkan adalah pemeriksaan yang **benar-benar dikerjakan**, bukan yang diminta
dokter. Kalau dokter meminta sepuluh dan hari itu hanya delapan yang bisa dikerjakan,
yang masuk tagihan delapan. Pemeriksaan tanpa tarif tetap masuk dengan harga Rp 0 dan
ketahuan belum diisi — jauh lebih baik daripada hilang diam-diam dari tagihan.

Untuk pasien BPJS, nilainya tetap tercatat untuk laporan tetapi tidak ditagihkan.

### Siapa boleh apa

| | Minta lab | Isi hasil | Tutup lembar | Buka kunci | Tulis bacaan | Catat arsip |
|---|---|---|---|---|---|---|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dokter | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Perawat | hanya hasil lab luar | ✓ | ✓ | — | — | ✓ |
| Pendaftaran | — | — | — | — | — | ✓ |
| Apoteker & kasir | — | — | — | — | — | — |

Semua peran tetap bisa **membaca** hasil lab dan bacaan penunjang; yang dibatasi hanya
menulisnya. Batasan ini ditegakkan di database (RLS), bukan hanya disembunyikan di layar.

---

## Surat keterangan

Menu **Surat Keterangan** menerbitkan enam jenis surat, semuanya berkop klinik dan
bernomor otomatis. Yang menerbitkan hanya **dokter** (bawaan; bisa ditambah lewat
Pengaturan → Hak Akses); peran lain tetap bisa
membuka tab Riwayat surat untuk mencetak ulang — itu memang pekerjaan loket.

| Kode | Surat | Isinya terisi otomatis dari |
|---|---|---|
| `SKS` | Surat Keterangan Sakit | Tanggal kunjungan; lama istirahat diketik dokter |
| `SR` | Surat Rujukan (bentuk BPJS) | Diagnosa + ICD-10, anamnesa, tanda vital, terapi, rencana rujukan dokter |
| `SK` | Surat Kontrol | Tanggal kontrol dari rencana tindak lanjut dokter |
| `SKBS` | Surat Keterangan Berbadan Sehat | Tinggi, berat, tekanan darah, nadi, napas, suhu dari kajian awal |
| `RM` | Resume Medis | Seluruh SOAP, diagnosa, tindakan, dan resep kunjungan |
| `SKL` | Surat Keterangan (isi bebas) | — judul dan isinya diketik sendiri |

### Nomor surat

Bentuknya ditetapkan Yayasan Kesehatan Imanuel dan disusun oleh sistem:

```
07/SKS/YAKIM/IX/2026
^^ ^^^ ^^^^^ ^^ ^^^^
|  |   |     |  +-- tahun
|  |   |     +----- bulan dalam angka Romawi
|  |   +----------- singkatan yayasan, tetap
|  +--------------- kode jenis surat
+------------------ nomor urut, minimal dua digit
```

**Yang Anda ketik hanya angka nomor urutnya.** Sisanya disusun sendiri, jadi tidak ada
surat yang bisa keluar dengan bentuk nomor berbeda karena salah ketik garis miring.

- Deretnya **terpisah per jenis surat** dan **diulang tiap tahun**. Surat sakit punya
  deret sendiri, surat rujukan punya deret sendiri.
- Sistem menyodorkan **nomor terbesar + 1**. Sarannya boleh diganti — klinik yang sudah
  punya buku agenda berjalan bisa memasukkan nomor yang mendahului.
- Kalau nomornya sudah dipakai, peringatannya muncul **saat Anda mengetik**, bukan
  setelah tombol Simpan ditekan.
- **Nomor yang sudah dipakai tidak pernah dipakai ulang**, termasuk milik surat yang
  dibatalkan. Surat yang batal hampir selalu sudah tercetak dan mungkin sudah dipegang
  pasien; kalau nomornya dilepas kembali, satu nomor di buku agenda menunjuk dua lembar
  berbeda dan tidak ada cara memisahkannya lagi.

Bulan dan tahun pada nomor mengikuti **tanggal surat**, bukan tanggal hari ini. Surat
yang dibuat 2 Oktober untuk melengkapi agenda September tetap bernomor `.../IX/2026`.

### Cara membuatnya

1. Buka menu **Surat Keterangan** → tab **Buat surat**, cari pasiennya, lalu pilih
   kunjungan yang menjadi dasar surat. Lebih cepat lagi: dari layar **Pemeriksaan
   Dokter** atau **Rekam Medis** ada tombol **Buat surat** yang langsung membawa data
   kunjungannya.
2. Pilih jenis suratnya. Kolomnya berganti mengikuti jenis, dan yang bisa diambil dari
   rekam medis sudah terisi — boleh diubah.
3. Periksa nomornya. Lihat kotak **Nomor surat yang akan tercetak**.
4. Lihat **pratinjau** di sebelah kanan. Itu bukan tiruan: yang tampil di layar adalah
   berkas yang sama persis dengan yang dikirim ke printer.
5. **Simpan & cetak** atau **Simpan & unduh PDF**. Boleh juga **Simpan saja** dan
   dicetak nanti dari tab Riwayat.

### Tanda tangan

Surat tercetak dengan **ruang tanda tangan kosong**, nama dokter, dan nomor SIP.
Dokter menandatangani dengan pulpen, klinik membubuhkan stempel — itu yang membuat
suratnya sah.

Spesimen tanda tangan digital **sengaja tidak disimpan**. Alasannya bukan ukuran berkas
(satu spesimen PNG cuma puluhan kilobyte), melainkan siapa yang bisa membubuhkannya:
begitu gambar tanda tangan dokter ada di dalam sistem, surat keterangan sakit bertanda
tangan dokter bisa terbit tanpa dokter itu pernah melihat pasiennya.

### Peringatan yang tidak menghalangi

Beberapa hal diingatkan tanpa menolak penyimpanan — keputusan medisnya tetap milik dokter:

- Kesimpulan **"berbadan sehat"** sementara angka yang ikut tercetak menunjukkan demam,
  tekanan darah tinggi, atau nadi di luar batas. Surat yang membantah dirinya sendiri
  biasanya lahir dari angka yang terisi otomatis lalu tidak dibaca ulang.
- **Rujukan pasien BPJS** yang nomor rujukan PCare-nya belum diisi. Lembar ini tetap
  boleh dicetak untuk dibawa pasien, tetapi rujukannya baru sah setelah dientri di
  aplikasi PCare — bridging PCare belum aktif di RME ini.
- **Tanggal kontrol** yang lebih awal daripada tanggal surat.
- **Istirahat delapan hari atau lebih**.

### Riwayat surat

Tab **Riwayat surat** memuat semua surat yang pernah terbit. Bisa disaring per tanggal,
jenis, dan status, dan dicari dengan satu kotak (nomor surat, nama pasien, No. RM, atau
perihal). Dari sana surat bisa **dibuka, dicetak ulang, diunduh sebagai PDF**, dan —
oleh master, atau dokter yang menerbitkannya sendiri — **diubah** atau
**dibatalkan dengan alasan**.

Cetak ulang memulangkan lembar yang sama persis dengan yang dulu ditandatangani: isi
surat dibaca dari yang tersimpan, bukan disusun ulang dari rekam medis. Nama dan SIP
penanda tangan pun ikut disalin ke barisnya, jadi surat tahun ini tidak berubah kalau
nomor SIP dokter diperbarui tahun depan.

### Mengganti kop surat

**Pengaturan → Kop & Surat** (master). Di sana bisa diatur:

- **Kop surat** — unggah JPG/PNG yang baru. Gambarnya dikecilkan otomatis di peramban ke
  lebar 1500 piksel lalu disimpan di database sebagai satu baris, **bukan** di Supabase
  Storage — jadi tidak memakan kuota berkas. Kop bawaannya sudah tertanam di aplikasi.
- **Cetak kop pada surat** — matikan bila klinik memakai kertas berkop yang sudah tercetak.
- **Garis hitam di bawah kop** — bawaannya mati; kop Klinik Imanuel sudah punya garis
  hijau sendiri.
- **Kota pada baris tanggal** dan **catatan kaki**.

---

## Master data

Menu **Master Data** (hanya master, bawaan) berisi empat daftar yang muncul saat dokter memeriksa
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

## Hak Akses per peran

_Ditambahkan 9 Sep 2026, bersamaan dengan penukaran nama peran `admin` → `master`
dan `pendaftaran` → `admin`._

Setiap fitur di aplikasi ini — bukan cuma menu mana yang terlihat, tapi juga aksi
di dalam halaman (menyimpan pasien, mengisi hasil lab, membatalkan surat, dan
seterusnya) — sekarang dijaga oleh satu **kode hak akses**. Peran `master` selalu
punya semua kode tanpa kecuali dan tidak perlu diatur; peran lain (`admin`,
`perawat`, `dokter`, `apoteker`, `kasir`) mulai dari bawaan yang mencerminkan
persis perilaku aplikasi sebelum fitur ini ada, dan bisa diubah kapan saja.

### Mengatur

**Pengaturan → Hak Akses** (hanya `master` yang bisa membuka tab ini). Tabelnya
dikelompokkan per modul — Menu, Data pasien & kunjungan, Pelayanan medis, Apotek
& kasir, Surat keterangan, Antrean, Buku Kronis, Data acuan & laporan — dengan
satu baris keterangan singkat di tiap kode dan satu kotak centang per peran.
Mencentang atau melepas centang tersimpan seketika itu juga.

**Perubahan berlaku saat staf terkait memuat ulang halaman atau masuk lagi** —
bukan langsung ke sesi yang sedang berjalan, sama seperti perubahan peran di
tab Pengguna.

### Dua hal yang sengaja TIDAK bisa diatur di sini

- **Ubah peran pengguna** (tab Pengguna, halaman ini juga) — tetap hardcode
  khusus `master`. Kalau ini bisa diserahkan ke peran lain, peran itu bisa
  menaikkan dirinya sendiri jadi `master`.
- **Tab Hak Akses ini sendiri** — tetap hardcode khusus `master`. Kalau tab ini
  sendiri diatur lewat matriks yang diaturnya sendiri, `master` bisa tanpa
  sengaja mengunci dirinya dari satu-satunya tempat memperbaikinya, dan
  jalan keluarnya hanya lewat SQL Editor Supabase langsung.

Di luar dua itu, semuanya — termasuk siapa yang boleh membuka Master Data,
Tarif & Invoice, Migrasi Portal, dan halaman Pengaturan itu sendiri — bisa
diserahkan ke peran lain kalau klinik memang menginginkannya.

### Kalau sedang meng-upgrade dari versi sebelum 9 Sep 2026

Database yang sudah berjalan (bukan pemasangan baru) perlu satu langkah
tambahan: jalankan `sql/20_ganti_nama_peran.sql` lebih dulu di **SQL Editor**,
lalu **dalam sesi yang sama** jalankan ulang berkas-berkas berikut secara
berurutan (semuanya aman dijalankan ulang di database berisi data):
`02_rls.sql`, `05_gigi.sql`, `06_master.sql`, `08_apotek.sql`, `09_kasir.sql`,
`11_penunjang.sql`, `13_surat.sql`, `14_periksa_terstruktur.sql`,
`15_antrean.sql`, `16_kronis.sql`. Jangan berhenti di tengah — kalau langkah
re-run itu terlewat, kebijakan RLS lama yang masih menyebut nama peran lama
akan gagal dengan pesan *"invalid input value for enum peran_pegawai"*.
Pemasangan **baru** dari nol tidak perlu berkas `20_ganti_nama_peran.sql` sama
sekali — `01_schema.sql` sudah langsung memakai nama peran final.

---

## Antrean, layar tunggu, dan antrean online Mobile JKN

### Satu hal yang harus dipahami lebih dulu: arahnya terbalik

Pada **PCare**, klinik adalah *klien* — aplikasi kita yang menelepon server BPJS.

Pada **antrean online FKTP**, klinik adalah *server*. Aplikasi Mobile JKN di ponsel
pasien menelepon **web service milik klinik**. Yang Anda serahkan ke BPJS karena itu
bukan permohonan kredensial, melainkan **alamat web service klinik beserta username
dan password yang Anda buat sendiri** di halaman Pengaturan.

Perbedaan ini menentukan hampir semua hal di bawah, jadi ingat baik-baik: untuk
antrean online, BPJS yang mengetuk pintu kita.

### Nomor antrean sekarang punya tabelnya sendiri

Sebelumnya nomor antrean lahir bersama kunjungan — ia baru ada ketika pasien sudah
berdiri di loket. Antrean online lahir sehari sebelumnya, dari orang yang belum tentu
datang, yang mungkin belum pernah berobat di sini, dan yang boleh membatalkan lewat
ponselnya. Dua hal itu tidak muat di satu tabel tanpa merusak rekam medis.

Sekarang alurnya:

```
Mobile JKN  ──▶  nomor antrean  ──▶  check-in di loket  ──▶  kunjungan (rekam medis)
   atau                                     ▲
   loket    ──────────────────────────────────┘
```

**Kunjungan tetap lahir saat pasien hadir.** Yang berubah hanya: nomornya kini
diwarisi dari antrean, bukan dihitung ulang. Pasien yang mendaftar langsung di loket
tetap otomatis mendapat nomor — Anda tidak perlu melakukan apa pun untuk itu.

### Halaman Antrean Hari Ini

Menu **Antrean Hari Ini** kini berupa papan dengan empat tab:

| Tab | Isinya |
|---|---|
| **Menunggu loket** | Pemesanan Mobile JKN dan nomor loket yang belum didaftarkan. Di sinilah admin bekerja. |
| **Menunggu poli** | Pasien yang sudah punya kunjungan dan menunggu diperiksa. Di sinilah dokter memanggil. |
| **Selesai & batal** | Riwayat hari ini |
| **Semua** | Semuanya |

Di atasnya ada kartu per poli: nomor yang sedang dipanggil, berapa yang menunggu,
sisa kuota, dan jam buka. Poli yang libur ditandai **Tutup hari ini** — bukan
dibiarkan kosong, supaya "sepi" dan "libur" tidak tertukar.

Halaman ini menyegarkan dirinya sendiri tiap 12 detik.

### Memanggil pasien

Ada dua titik panggil, dan keduanya menulis ke layar tunggu yang sama:

- **Admin/loket** memanggil dari papan antrean, tombol **Panggil**. Tujuannya
  "Loket Pendaftaran".
- **Dokter** memanggil dari **halaman pemeriksaan**, bilah paling atas, tombol
  **Panggil pasien**. Tujuannya nama poli.

Tombol dokter sengaja ditaruh di halaman pemeriksaan, bukan hanya di papan antrean.
Kalau dokter harus pindah halaman untuk memanggil, yang terjadi di klinik adalah
dokter membuka pintu dan berteriak — dan layar tunggu tidak pernah menunjukkan nomor
yang benar.

Menekan tombol kedua kalinya menjadi **Panggil ulang**, dan layar mengumumkannya
sebagai panggilan ulang supaya pasien yang tadi tidak dengar tahu ini kesempatan
kedua, bukan nomor yang berbeda.

Tombol **⋯** menyediakan: *tandai sedang dilayani*, *tandai tidak hadir* (nomornya
dilewati, **kuotanya kembali**, dan pasien boleh mengambil nomor baru), dan
*batalkan nomor*.

### Check-in

Untuk pemesanan Mobile JKN, tekan **Check-in**. Dialognya menampilkan nomor kartu
dan NIK peserta supaya Anda bisa mencocokkannya dengan kartu fisik.

Kalau pesertanya **belum pernah berobat di sini**, sistem tidak membuatkan rekam
medis otomatis — dialog akan meminta Anda mencari atau mendaftarkan pasiennya lebih
dulu. Ini disengaja: nomor rekam medis adalah identitas seumur hidup, dan
menerbitkannya dari data yang belum pernah dilihat petugas adalah cara tercepat
melahirkan pasien kembar (satu dari Mobile JKN, satu lagi saat orangnya datang dan
ejaan namanya beda sedikit).

### Layar tunggu

**Pengaturan → Antrean & Layar → Layar Tunggu**, tekan **Buat tautan layar**.
Salin tautannya, buka di TV atau tablet ruang tunggu, lalu biarkan.

Yang perlu Anda ketahui tentang layar ini:

- **Tidak perlu login.** Ia hanya membawa token panjang di URL.
- **Hanya menampilkan nomor.** Tidak ada nama pasien, nomor rekam medis, nomor
  BPJS, atau data medis apa pun — bukan karena disembunyikan, melainkan karena
  fungsi database yang dipakainya secara struktural tidak bisa memulangkannya.
  Itulah yang membuat tautannya aman dibiarkan terbuka seharian: seandainya
  tersebar, yang terbaca hanya kalimat yang memang diteriakkan petugas.
- **Berbunyi.** Bel dua nada lalu suara membacakan nomornya dalam bahasa Indonesia.
  Peramban melarang halaman berbunyi sebelum disentuh sekali, jadi pada pemakaian
  pertama tekan tombol **🔔 Aktifkan suara** di pojok bawah (menyentuh layar di mana
  pun juga bisa). Setelah itu tombolnya hilang.
- **Tidak mengosongkan diri saat jaringan putus.** Nomor terakhir tetap terpampang;
  hanya titik kecil di pojok yang berubah merah. Pasien yang melihat layar kosong
  akan mengira antreannya hilang dan berbondong ke loket — tepat ketika Anda sedang
  menghadapi gangguan jaringan.

**Mengganti token** mematikan tautan lama seketika. Lakukan kalau tautannya pernah
terkirim ke luar klinik, lalu buka ulang tautan baru di TV.

### Jadwal dan kuota

**Pengaturan → Antrean & Layar → Jadwal & Kuota.**

Tiap poli punya jadwal per hari, boleh sampai tiga sesi (pagi/sore). Isian bawaannya
Senin–Sabtu pagi 08.00–12.00 dan Senin–Jumat sore 16.00–20.00 — sesuaikan dengan jam
praktek Anda. Tombol **Salin** menyalin jam dan kuota satu hari ke Senin–Sabtu
sekaligus.

Ada **dua angka kuota**, dan bedanya penting:

| Kuota | Membatasi |
|---|---|
| **Kuota total** | Seluruh pasien hari itu |
| **Kuota online** | Berapa di antaranya boleh dipesan lewat Mobile JKN |

Sisanya tetap tersedia untuk pasien yang datang langsung. Itulah gunanya dua angka:
kalau hanya ada satu, pemesanan online bisa menghabiskan seluruh kursi sebelum pintu
klinik dibuka.

**Pendaftaran online ditutup pukul** sengaja dibuat lebih awal daripada jam tutup
poli. Nomor yang terbit pukul 11.55 untuk poli yang tutup 12.00 hampir pasti tidak
terlayani, dan nomor hangus lebih merepotkan daripada nomor yang ditolak.

**Hari Libur** menutup tanggal tertentu — untuk semua poli atau satu poli saja.

### Menyiapkan antrean online (Antrol)

Tiga hal harus beres sebelum ini bisa dinyalakan. Halaman **Antrean & Layar**
menampilkan ketiganya sebagai daftar kesiapan di bagian atas.

**1. Kode poli PCare.** Mobile JKN mengirim `kdPoli` milik BPJS, bukan kode poli
klinik. Isi di **Pengaturan → Poli**. Selama kosong, setiap pemesanan ke poli itu
dijawab *"Poli tidak ditemukan"* — dan pesan itu akan tampak seperti sistem rusak
padahal hanya kolom yang belum diisi.

**2. Pasang Edge Function.** Dari komputer yang punya Supabase CLI:

```bash
supabase functions deploy antrol --no-verify-jwt
```

`--no-verify-jwt` **wajib**. BPJS tidak punya akun Supabase; tanpa opsi itu setiap
permintaan mereka dijawab 401 oleh Supabase sebelum kode kita sempat berjalan.

**3. Buat akun web service.** Tab **Antrean Online (Antrol)** → **Buat akun**.
Password dibuat acak oleh sistem dan **ditampilkan sekali saja** — salin dan simpan
bersama berkas pendaftaran. Kalau hilang, buat password baru untuk username yang sama;
tidak ada cara membacanya kembali, bahkan oleh master.

Lalu serahkan ke Kantor Cabang BPJS: **base URL** (ada di halaman itu, tombol salin),
**username**, dan **password**.

**Uji coba.** Sebelum menghubungi BPJS, jalankan panel **Uji coba** di halaman yang
sama. Ia menembak Edge Function lewat HTTP sungguhan — persis seperti yang akan
dilakukan BPJS — dan memeriksa tiga hal: token bisa dibuat, status antrean terbaca,
dan **token palsu ditolak**. Yang ketiga itu yang paling penting: kalau ia lolos,
pintu klinik terbuka untuk siapa saja yang tahu alamatnya.

**Log permintaan masuk** di bagian bawah mencatat setiap permintaan BPJS beserta
jawaban kita. Inilah yang dibuka saat UAT ketika mereka mengatakan "kami kirim,
faskes tidak menjawab".

### Enam layanan yang disediakan klinik

| Fitur | Metode | Jalur |
|---|---|---|
| Generate token | `GET` | `/auth` |
| Status antrean | `GET` | `/antrean/status/{kodepoli}/{tanggal}` |
| Ambil antrean | `POST` | `/antrean` |
| Sisa antrean peserta | `GET` | `/antrean/sisapeserta/{nokartu}/{kodepoli}/{tanggal}` |
| Post peserta baru | `POST` | `/peserta` |
| Batal antrean | `PUT` | `/antrean/batal` |

Beberapa keputusan yang sudah tertanam di dalamnya, supaya Anda tidak terkejut saat
UAT:

- **Kode 202 bukan kegagalan.** Ia berarti "nomornya terbit, tetapi pesertanya belum
  terdaftar sebagai pasien di sini". Nomor tetap diberikan — pasien yang sudah
  berangkat tidak boleh disuruh pulang. Di papan antrean, nomor itu bertanda
  *belum jadi pasien klinik*.
- **`POST /peserta` tidak membuat rekam medis.** Datanya disimpan sebagai catatan
  pada nomor antreannya supaya petugas loket melihatnya lengkap saat check-in.
- **Satu peserta, satu nomor, per poli, per hari.** Termasuk kalau nomor pertamanya
  diambil di loket — pemeriksaan itu menutup celah antar-jalur.
- **Loket tidak pernah terhalang.** Aturan duplikat dan kuota online hanya berlaku
  untuk jalur Mobile JKN. Petugas yang sedang berhadapan dengan pasien harus selalu
  bisa mendaftarkannya; sistem yang menolak akan disiasati dengan mengosongkan nomor
  BPJS, dan yang rusak kemudian adalah data klaim.
- **Pasien yang sudah check-in tidak bisa dibatalkan dari ponselnya.** Kalau memang
  ingin batal, petugas yang membatalkan — dan kunjungannya juga dibereskan.

### Yang masih menunggu BPJS

Kredensial dan pendaftaran ke Kantor Cabang. Semua yang lain di modul ini —
papan antrean, panggil dari loket dan dokter, layar tunggu, jadwal, kuota —
**sudah bisa dipakai hari ini** tanpa menunggu apa pun.

---

## Bridging PCare & SatuSehat

Struktur data sudah disiapkan sejak awal untuk keduanya, jadi tidak perlu membongkar aplikasi saat kredensial nanti keluar. Yang perlu diurus:

### Yang sudah siap, dan yang memang menunggu orang

Sejak berkas `sql/14_periksa_terstruktur.sql` dijalankan, **bentuk datanya sudah
selesai**. Ada tiga view yang menyusun payload persis seperti yang diminta BPJS,
dan bisa Anda lihat isinya kapan saja lewat tombol *Lihat data yang akan dikirim*
di layar pemeriksaan:

| View | Isinya | Dipakai untuk |
|---|---|---|
| `v_pcare_kunjungan` | Satu baris per kunjungan BPJS, nama kolomnya sama persis dengan field payload | `POST /kunjungan` |
| `v_pcare_obat` | Satu baris per butir resep, lengkap `signa1` & `signa2` | `POST /obat/kunjungan` |
| `v_pcare_tindakan` | Satu baris per tindakan | `POST /tindakan` |
| `v_satusehat_observasi` | Tiap tanda vital dan tiap temuan fisik sebagai satu Observation berkode LOINC | `POST /Observation` |

**Yang sengaja masih kosong: kolom `kode_pcare`.** Nilai-nilai itu — kode
kesadaran, keadaan pulang, prognosa, sub spesialis, sarana, alergi — **milik
BPJS**, dan sistem tidak menebaknya. Alasannya sederhana: kode `kdStatusPulang`
yang salah tidak menimbulkan galat apa pun. Klaimnya terkirim, diterima, dan
isinya keliru — dan tidak ada satu pun tanda di layar yang memberitahu Anda.

Yang bisa dibangun sekarang justru sudah dibangun: **tempatnya**, halaman
pemetaan, dan daftar apa saja yang masih kosong. Buka **Pengaturan → Rujukan &
Kode PCare**; di sana ada dua hal:

1. **Daftar faskes tujuan rujukan.** Isi rumah sakit yang biasa dituju pasien
   klinik — cukup sekali. Selama daftarnya kosong, dokter tidak bisa memilih
   faskes tujuan dan rujukan tidak bisa dikunci. Kode yang Anda ketik sendiri
   ditandai *diketik sendiri* sampai dicocokkan dengan daftar resmi BPJS.
2. **Pemetaan kode PCare.** Setiap nilai berkode yang belum punya pasangan
   didaftar di sini beserta nama field PCare-nya. Isi setelah kredensial datang;
   nilainya bisa diambil dari endpoint referensi PCare (jalurnya sudah ada di
   `supabase/functions/pcare-proxy/index.ts`, operasi `ref.*`).

Kode LOINC untuk pemeriksaan fisik per sistem juga terdaftar di sana, dan diisi
setelah klinik terdaftar SatuSehat. **Kode LOINC tanda vital sudah terisi** —
nilainya berasal dari profil FHIR *vitalsigns* yang baku lintas negara dan tidak
berubah oleh keputusan lokal mana pun.

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
| Retensi minimal 25 tahun | Tidak ada penghapusan otomatis. Penghapusan hanya manual oleh master dan tetap terekam. |
| Pembatasan akses | Row Level Security per peran — perawat tidak bisa menulis diagnosa, admin (staf loket) tidak bisa menulis SOAP, dan seterusnya. Rinciannya bisa diatur `master` lewat Pengaturan → Hak Akses. Diuji langsung, bukan hanya diatur di tampilan. |

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
| Supabase Storage | 1 GB | **Tidak dipakai sama sekali** — lihat [Lab & pemeriksaan penunjang](#lab--pemeriksaan-penunjang) |
| Supabase Edge Function | 500.000 panggilan/bulan | Jauh lebih dari cukup |
| Netlify | 100 GB bandwidth/bulan | Jauh lebih dari cukup |
| Cadangan otomatis | **Tidak ada di paket gratis** | Harus dicadangkan sendiri — lihat [Cadangan data](#cadangan-data) |

**Kenapa penyimpanan berkas kosong.** Foto rontgen dan lembar hasil sengaja tidak
diunggah; yang disimpan angka dan bacaannya, dan berkas fisiknya dicatat nomor arsipnya.
Dengan begitu satu-satunya kuota yang tumbuh adalah database, dan pertumbuhannya lambat:
sekitar 2 KB per lembar hasil lab. Alasan lengkapnya ada di bagian
[Lab & pemeriksaan penunjang](#lab--pemeriksaan-penunjang).

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

Yang belum dibuat:

- Ubah atau batalkan pendaftaran yang salah (sementara lewat dasbor Supabase)
- "Lupa kata sandi" di halaman login
- Koreksi stok opname berkala lewat Excel (sengaja ditunda)
- **Unggah gambar** (foto rontgen, pindaian lembar hasil) — sengaja tidak dibuat selama
  klinik memakai paket gratis. Struktur tabelnya sudah disiapkan; lihat
  [Lab & pemeriksaan penunjang](#lab--pemeriksaan-penunjang)
- Laporan LB1 dan format Dinkes
- Skrining PTM/Prolanis terstruktur

Struktur database sudah menyediakan tempat untuk sebagian besar hal di atas, jadi penambahannya nanti tidak perlu membongkar yang sudah ada.

---

## Kalau ada masalah

| Gejala | Kemungkinan sebab |
|---|---|
| "Aplikasi belum dihubungkan ke database" | `js/config.js` belum diisi |
| Bisa masuk tapi langsung keluar lagi | Baris di tabel `pegawai` belum ada atau `aktif = false` |
| "Akses ditolak" di halaman Pengaturan | Peran akun bukan `master`, dan kode `menu_pengaturan` belum diaktifkan untuk perannya di Hak Akses |
| Data pasien kosong padahal ada isinya | RLS memblokir — pastikan akun punya baris di `pegawai` dengan `aktif = true` |
| Tombol simpan diagnosa tidak jalan | Peran akun bukan `dokter`, dan kode `periksa` belum diaktifkan untuk perannya di Hak Akses |
| Project Supabase "paused" | Tidak ada aktivitas 7 hari — klik *Restore* di dasbor |
| Odontogram tidak muncul di layar dokter | Jenis poli belum diatur `GIGI` — ubah di Pengaturan → Poli |
| Rekam medis gigi tidak bisa dikunci | Ada tindakan per-gigi yang belum disebutkan nomor giginya |
| Dokter gigi tidak muncul saat pendaftaran | Kolom `jenis_dokter` diisi `UMUM` — ubah di Pengaturan → Pengguna |
| Obat tidak muncul saat dokter meresepkan | Obat dinonaktifkan — cek di Master Data → Obat |
| Impor CSV obat menolak berkas | Baris judul tidak memuat kolom `nama`, atau berkas lebih dari 3 MB |
| Peringatan "data belum lengkap" pada pasien | NIK atau nomor BPJS belum benar — tidak menghalangi pelayanan, tapi dibutuhkan saat bridging |

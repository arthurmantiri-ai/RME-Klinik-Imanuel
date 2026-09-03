# Modul Pemeriksaan Terstruktur — daftar berkas untuk diunggah

Paket ini berisi **5 berkas baru** dan **15 berkas yang diubah**.

Semuanya sudah diuji, seluruh `./test/semua.sh` hijau:
20 uji SQL pemeriksaan (di atas 103 uji SQL yang sudah ada),
67 pemeriksaan fungsi murni `periksa_core`, 36 kontrak kolom `db.js` ↔ skema,
dan 59 alur halaman di Chromium sungguhan — nol galat console, nol regresi
pada empat modul yang sudah jalan.

Salin berkas-berkas di bawah ke repo `arthurmantiri-ai/RME-Klinik-Imanuel`
**pada jalur yang sama persis**, lalu commit.

> `js/config.js` **tidak ikut** dalam paket ini. Berkas itu sudah berisi URL
> dan kunci anon Anda di repo, dan tidak ada satu pun perubahan yang
> membutuhkannya.

---

## Apa yang berubah, dalam satu paragraf

Layar pemeriksaan dokter tidak lagi empat kotak teks bebas. Setiap hal yang
diminta PCare (30 field) dan SatuSehat (Observation berkode) kini punya
kolomnya sendiri, dan catatan **S/O/A/P tetap ada** — tersusun sendiri dari
field itu, masih bisa disunting. Database mendapat tujuh tabel rujukan berkode
dan empat view yang menyusun payload PCare & SatuSehat **persis** seperti bentuk
yang diminta, sehingga saat bridging dinyalakan tidak ada lagi yang perlu
disesuaikan — kecuali memasangkan kode milik BPJS lewat halaman baru
**Pengaturan → Rujukan & Kode PCare**.

---

## A. Berkas baru (5)

| Jalur | Isi |
|---|---|
| `sql/14_periksa_terstruktur.sql` | 7 tabel rujukan berkode (`ref_prognosa`, `ref_tacc`, `ref_tkp`, `ref_alergi`, `ref_ppk`, `ref_subspesialis`, `ref_sarana`, `ref_sistem_fisik`, `ref_vital`), 20 kolom baru pada `pemeriksaan`, kolom PCare pada `resep_item`/`tindakan`/`obat`/`icd9cm`, 2 trigger penjaga isi, 4 view payload (`v_pcare_kunjungan`, `v_pcare_obat`, `v_pcare_tindakan`, `v_satusehat_observasi`), 2 view kesiapan, RLS + GRANT |
| `js/periksa_core.js` | Fungsi murni: menyusun narasi S/O/A/P dari isian terstruktur, mengurai aturan pakai jadi `signa1`/`signa2`, membangun payload PCare untuk pratinjau, menyusun Observation SatuSehat, memeriksa kelengkapan sebelum rekam medis dikunci |
| `test/uji_periksa.sql` | 20 uji SQL: bentuk payload, urutan `kdDiag1..3`, TACC wajib beralasan, nama menyusul kode, alergi satu kode per jenis, Observation LOINC, GRANT view, RLS master |
| `test/uji_periksa_core.js` | 67 pemeriksaan fungsi murni, dijalankan di `TZ=America/Los_Angeles` agar salah-tanggal gagal keras |
| `test/uji_periksa_halaman.js` | 59 pemeriksaan alur halaman di Chromium sungguhan — dokter, perawat, dan admin |

## B. Berkas yang diubah (15)

| Jalur | Apa yang berubah |
|---|---|
| `js/pages/periksa.js` | **Ditulis ulang.** Anamnesis terstruktur (8 butir riwayat penyakit sekarang), pemeriksaan fisik 13 sistem dengan tombol "Semua dalam batas normal", diagnosis banding, terapi non-obat & BMHP, prognosa & TACC berkode, blok rujukan terstruktur, kartu kesiapan BPJS + pratinjau payload, kartu SOAP yang tersusun sendiri |
| `js/db.js` | Pemuat 8 tabel rujukan baru (dengan cache), alergi berkode per jenis, pratinjau payload PCare, observasi SatuSehat, kesiapan kode, `simpanPpk`, `simpanPemetaanKode`; `cariObat` kini meminta `kode_pcare` & `dpho`, `cariIcd9` meminta `kode_pcare`; `simpanResep` & `simpanTindakan` menyimpan kolom PCare |
| `js/pages/rekam.js` | Tabel pemeriksaan fisik per sistem (yang normal ikut tercetak), diagnosis banding, terapi non-obat, BMHP, tanggal estimasi rujukan, kriteria TACC |
| `js/pages/pengaturan.js` | Tab baru **Rujukan & Kode PCare**: kelola daftar faskes tujuan rujukan (`kdppk`) dan isi pemetaan kode PCare yang masih kosong |
| `js/pages/master.js` | Centang **Ada di DPHO BPJS** pada obat, kolom **Kode tindakan PCare** pada ICD-9-CM, `dpho` masuk kolom ekspor/impor CSV |
| `js/demo-data.js` | Data contoh 8 tabel rujukan baru + 12 fungsi tiruan, pemeriksaan contoh berisi field terstruktur — supaya `demo.html` tetap bisa dipakai tanpa database |
| `css/style.css` | Gaya baris pemeriksaan fisik per sistem (`.sistem-baris` dan turunannya) |
| `app.html` | 1 tag `<script>` baru (`js/periksa_core.js`) |
| `demo.html` | 1 tag `<script>` baru (`js/periksa_core.js`) |
| `supabase/functions/pcare-proxy/index.ts` | 8 jalur referensi baru (`ref.statuspulang`, `ref.prognosa`, `ref.alergi`, `ref.spesialis`, `ref.subspesialis`, `ref.sarana`, `ref.faskes`, `ref.tindakan`) dan 4 operasi obat/tindakan — inilah asal nilai `kode_pcare` nanti |
| `test/jalankan.sh` | `uji_periksa` masuk daftar uji SQL |
| `test/semua.sh` | `uji_periksa_core` dan `uji_periksa_halaman` masuk daftar |
| `test/uji_kolom_db.js` | 5 kontrak kolom baru: `refSistemFisik.normal_teks`/`temuan_lazim`/`bawaan_periksa`, `refVitalSemua.kode_loinc`, `cariObat.dpho`/`kode_pcare` |
| `test/README.md` | Kenapa payload PCare diuji dua kali, kenapa ujinya di zona waktu barat, kenapa aturan pakai tidak ditebak |
| `PANDUAN.md` | Bab **Layar pemeriksaan dokter** (±70 baris), bab bridging diperluas, berkas SQL ke-14, pohon berkas, daftar isi |
| `README.md` | Ringkasan pemeriksaan berfield dan kesiapan bridging |

---

## Yang harus Anda lakukan setelah mengunggah

### 1. Jalankan `sql/14_periksa_terstruktur.sql` di Supabase

Sekali saja, **setelah** berkas 13. Aman dijalankan di database yang sudah
berisi data — seluruhnya `add column if not exists` dan `create table if not
exists`, tidak ada satu pun kolom yang dibuang. Rekam medis yang sudah ada
tetap terbaca persis seperti semula.

### 2. Isi daftar faskes tujuan rujukan

**Pengaturan → Rujukan & Kode PCare → Tambah faskes.** Cukup rumah sakit yang
biasa dituju pasien klinik — sekali saja.

Selama daftarnya kosong, dokter tidak bisa memilih faskes tujuan dan rujukan
tidak bisa dikunci. Kode `kdppk` yang Anda ketik sendiri ditandai *diketik
sendiri* sampai dicocokkan dengan daftar resmi BPJS.

### 3. Tandai obat yang ada di DPHO

**Master Data → Obat → Ubah → centang "Ada di DPHO BPJS"**, dan isi kolom
**Kode obat PCare**-nya. Obat bertanda DPHO dikirim memakai `kdObat`; yang
tidak bertanda dikirim sebagai `nmObatNonDPHO` dengan namanya. Bisa dikerjakan
bertahap — obat yang belum ditandai tetap bisa diresepkan seperti biasa.

### 4. (Nanti) Isi pemetaan kode PCare

**Pengaturan → Rujukan & Kode PCare** mendaftar setiap nilai berkode yang belum
punya pasangan kode BPJS, lengkap dengan nama field PCare-nya. Isi setelah
kredensial datang.

---

## Kenapa kolom `kode_pcare` sengaja dibiarkan kosong

Ini keputusan, bukan pekerjaan yang belum selesai.

Kode untuk kesadaran, keadaan pulang, prognosa, sub spesialis, sarana, dan
alergi **milik BPJS**. Menebaknya tidak menimbulkan galat apa pun: `kdStatusPulang`
yang salah tetap membuat klaim terkirim, tetap diterima, dan tetap keliru
isinya — tanpa satu pun tanda di layar. Kesalahan seperti itu baru ketahuan
berbulan-bulan kemudian, lewat klaim yang dikembalikan, dan tidak bisa
ditelusuri lagi ke keputusan yang membuatnya.

Yang bisa dibangun sekarang justru sudah dibangun, dan itulah bagian yang mahal
kalau ditunda: **strukturnya**. Tempat kodenya ada, halaman pemetaannya ada,
daftar apa yang masih kosong ada, jalur mengambilnya dari PCare ada, dan
view payload-nya sudah menyusun 30 field itu dari data yang benar-benar
tersimpan. Yang tersisa hanya mengetik kode di satu halaman.

Yang **memang diisi** sekarang hanya nilai yang baku dan tidak berubah:
kode LOINC tanda vital (dari profil FHIR *vitalsigns*, sama di semua negara)
dan `kdTkp`/`kdTacc` yang nilainya tetap sejak PCare v1.

---

## Dua bug yang ditemukan saat mengerjakan ini

Keduanya sudah diperbaiki dan sudah ada ujinya.

**1. Pendengar peristiwa bertumpuk di daftar pemeriksaan fisik.** `gambarFisik()`
memasang pendengar klik setiap kali dipanggil, sementara ia dipanggil ulang tiap
kali satu sistem ditandai. Setelah dua kali penggambaran, satu klik berjalan dua
kali: yang pertama menandai ABNORMAL, yang kedua melihat statusnya sudah sama
lalu membatalkannya. Gejalanya adalah tombol yang "tidak bereaksi" — tanpa galat,
tanpa pesan, dan makin parah tiap kali layar digambar. Pendengarnya kini dipasang
sekali di `pasangFisik()`.

**2. TACC tanpa alasan menggagalkan simpan sementara.** Trigger `cek_tacc()` di
database menolak TACC yang perlu alasan tetapi alasannya kosong — dan penolakan
itu menggagalkan **seluruh** penyimpanan, termasuk catatan pemeriksaan yang sudah
panjang diketik. Sekarang TACC yang belum beralasan tidak ikut dikirim saat
menyimpan sementara; yang menahan adalah pemeriksaan kelengkapan pada tombol
**Selesai & kunci rekam medis**, dan itu memang tempatnya.

---

## Catatan tentang `test/jalankan.sh` dan `test/semua.sh`

Kedua berkas ini ikut berubah mode jadi dapat dieksekusi (`chmod +x`). Kalau
Anda menyalin berkasnya lewat antarmuka web GitHub, mode itu tidak ikut dan
Anda perlu menjalankannya dengan `bash test/semua.sh`. Kalau lewat `git`,
patch-nya sudah membawa perubahan mode.

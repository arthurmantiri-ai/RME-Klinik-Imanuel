# Modul Antrean Online (Antrol) & Layar Tunggu — daftar berkas untuk diunggah

Paket ini berisi **9 berkas baru** dan **12 berkas yang diubah**.

Disusun di atas commit **`61e07c9`** (repo terbaru — modul pemeriksaan terstruktur
sudah di dalamnya). `perubahan.patch` sudah diuji `git apply --check` bersih pada
klon segar, dan seluruh `./test/semua.sh` hijau di klon yang sudah dipatch:

| Lapis uji | Hasil |
|---|---|
| SQL — 40 uji antrean baru | lulus, di atas 124 uji SQL yang sudah ada |
| `antrean_core.js` — 61 pemeriksaan fungsi murni | lulus |
| Kontrak kolom `db.js` ↔ skema | 38 lulus |
| Halaman antrean & layar di Chromium | 58 lulus, **0 galat console** |
| Empat modul lama (apotek, kasir, lab, surat, periksa) | **nol regresi** |

Salin berkas-berkas di bawah ke repo `arthurmantiri-ai/RME-Klinik-Imanuel`
**pada jalur yang sama persis**, lalu commit — atau terapkan `perubahan.patch`.

> `js/config.js` **tidak ikut** dalam paket ini. Berkas itu sudah berisi URL dan
> kunci anon Anda di repo, dan tidak ada satu pun perubahan yang membutuhkannya.

---

## Apa yang berubah, dalam satu paragraf

Nomor antrean sekarang punya tabelnya sendiri, terpisah dari kunjungan. Alasannya:
antrean online lahir sehari sebelumnya, dari orang yang belum tentu datang, yang
mungkin belum pernah berobat di sini, dan yang boleh membatalkan lewat ponselnya —
tiga hal yang tidak muat di tabel kunjungan tanpa merusak rekam medis. Di atas
tabel itu dibangun papan antrean dua tahap (loket → poli) dengan tombol panggil di
loket **dan** di ruang periksa dokter, layar TV ruang tunggu yang berdiri sendiri
tanpa login, serta enam web service Antrean FKTP yang diminta BPJS — lengkap dengan
jadwal, kuota, akun, dan log — siap dinyalakan begitu kredensial datang.

---

## Arah panggilannya terbalik dari PCare — ini yang paling penting

```
pcare-proxy    RME  ──panggil──▶  server BPJS
antrol         BPJS ──panggil──▶  server KITA      ← modul ini
```

Untuk antrean FKTP, **kliniklah yang jadi server**. Yang diserahkan ke BPJS bukan
permohonan kredensial melainkan **alamat web service klinik + username + password
yang Anda buat sendiri**. Konsekuensinya menentukan seluruh bentuk modul ini:

- Edge Function `antrol` harus dipasang dengan **`--no-verify-jwt`**. BPJS tidak
  punya akun Supabase; tanpa itu setiap permintaan mereka dijawab 401 oleh Supabase
  sebelum kode kita sempat berjalan.
- Yang menjaga pintunya bukan RLS melainkan tabel `antrol_akun` (hash + salt).
- **Seluruh aturan hidup di database, bukan di Deno.** Kuota, jadwal, duplikat,
  format nomor kartu — semuanya fungsi SQL `antrol_*`, karena aturan yang ditulis
  di Edge Function hanya bisa diuji dengan menjalankan Deno, yang berarti tidak akan
  pernah diuji. Semuanya diuji di `test/uji_antrean.sql` dengan kode metadata yang
  persis akan dilihat BPJS saat UAT.

---

## Berkas BARU (9)

| Jalur | Isi |
|---|---|
| `sql/15_antrean.sql` | Tabel `antrean`, `antrean_panggilan`, `poli_jadwal`, `poli_libur`, `antrol_akun`, `antrol_log`, `sys_antrean_pengaturan`; fungsi tindakan petugas; enam fungsi `antrol_*`; fungsi layar `antrean_layar()`; view `v_antrean_hari_ini` & `v_antrean_kuota`; RLS + GRANT |
| `supabase/functions/antrol/index.ts` | Edge Function publik: enam endpoint Antrean FKTP. Tipis dengan sengaja — hanya auth, routing, log, dan HTTP |
| `js/antrean_core.js` | Fungsi murni: bentuk nomor, kalimat panggilan, pemeriksaan kartu/NIK/tanggal, jadwal, estimasi, token layar |
| `js/pages/jadwal.js` | Halaman **Antrean & Layar** (admin): jadwal & kuota, hari libur, layar tunggu, Antrol + panel uji coba + log |
| `display.html` | Layar TV ruang tunggu — halaman berdiri sendiri, CSS sendiri |
| `js/display.js` | Logikanya: penyegaran 3 detik, bel WebAudio, suara Indonesia, penanda panggilan baru, tahan putus jaringan |
| `test/uji_antrean.sql` | 40 uji: kontrak Antrol lengkap dengan kode 200/201/202, kuota, jadwal, duplikat antar-jalur, hak akses `anon` |
| `test/uji_antrean_core.js` | 61 pemeriksaan fungsi murni, contohnya sama persis dengan uji SQL |
| `test/uji_antrean_halaman.js` | 58 alur di Chromium: papan antrean, panggil dari dokter, halaman admin, dan layar tunggu |

## Berkas yang DIUBAH (12)

| Jalur | Perubahan |
|---|---|
| `js/pages/antrian.js` | **Ditulis ulang** menjadi papan antrean dua tahap: kartu kuota per poli, tab loket/poli/selesai, panggil, panggil ulang, check-in, tidak hadir, batal, ambil nomor loket |
| `js/pages/periksa.js` | Bilah panggilan di paling atas halaman dokter: **Panggil pasien** dan **Mulai periksa** |
| `js/db.js` | 24 fungsi antrean baru; kontraknya dijaga `uji_kolom_db.js` |
| `js/app.js` | Menu **Antrean & Layar**, rute `#/jadwal`, dan lencana antrean kini dihitung dari tabel antrean (bukan kunjungan) supaya pemesanan Mobile JKN yang belum hadir ikut terlihat |
| `js/demo-data.js` | Antrean, jadwal, kuota, akun Antrol, dan tiruan `antrean_layar()` untuk demo & uji halaman |
| `app.html`, `demo.html` | Dua tag skrip baru |
| `test/uji_kolom_db.js` | Dua kontrak baru (`token_layar`, `konfigurasi`) |
| `test/jalankan.sh`, `test/semua.sh` | Menjalankan uji antrean |
| `PANDUAN.md` | Bab baru **Antrean, layar tunggu, dan antrean online Mobile JKN**; berkas SQL jadi lima belas |
| `README.md` | Ringkasan modul antrean & Antrol |

---

## Yang harus Anda lakukan setelah mengunggah

### 1. Jalankan `sql/15_antrean.sql` di Supabase

Setelah berkas 14. **Aman di database berisi data** — seluruhnya
`create ... if not exists` dan `add column if not exists`.

Berkas ini juga **memperbaiki dua bug lama** pada `gen_no_kunjungan()`; keduanya
dijelaskan di bawah.

### 2. Pasang Edge Function `antrol`

```bash
supabase functions deploy antrol --no-verify-jwt
```

`--no-verify-jwt` **wajib**, alasannya di atas.

### 3. Buat tautan layar tunggu

**Pengaturan → Antrean & Layar → Layar Tunggu → Buat tautan layar**, lalu buka
tautannya di TV atau tablet ruang tunggu. Ini **sudah bisa dipakai hari ini** —
tidak menunggu BPJS sama sekali.

### 4. Sesuaikan jadwal & kuota

Isian bawaan: Senin–Sabtu pagi 08.00–12.00, Senin–Jumat sore 16.00–20.00,
kuota 40/20 pagi dan 30/15 sore. Sesuaikan dengan jam praktek klinik.

### 5. Isi kode PCare tiap poli

**Pengaturan → Poli.** Mobile JKN mengirim `kdPoli` milik BPJS, bukan kode klinik.
Selama kosong, pemesanan ke poli itu selalu dijawab *"Poli tidak ditemukan"*.

### 6. Baru setelah itu: hubungi BPJS

Buat akun web service di tab **Antrean Online (Antrol)**, jalankan panel **Uji
coba**, lalu serahkan base URL + username + password ke Kantor Cabang.

---

## Tiga bug lama yang ditemukan dan diperbaiki

Ketiganya tidak pernah bisa terjadi selama semua nomor antrean lahir di loket.
Ketiganya menjadi pasti terjadi begitu ada antrean online.

**1. Nomor antrean bertabrakan.** `gen_no_kunjungan()` menghitung `no_antrian` dari
tabel *kunjungan*: `max(no_antrian) + 1`. Lima pemesanan Mobile JKN untuk hari ini
sudah memegang nomor 1–5 tetapi belum satu pun punya kunjungan — jadi pasien pertama
yang datang ke loket diberi nomor 1, nomor yang sudah dipegang orang lain, dan
pendaftarannya gagal dengan `unique_violation` mentah di tengah jam sibuk. Sekarang
`no_antrian` tidak dihitung di sana lagi; pemiliknya tabel `antrean`, yang memegang
kunci serialisasinya.

**2. Satu nomor kunjungan cacat mematikan pendaftaran sehari penuh.**
`substring(no_kunjungan from 10)::int` mengandaikan **setiap** baris hari itu
bernomor `YYYYMMDD-NNNN`. Satu baris bernomor lain — hasil impor, perbaikan manual
lewat dasbor Supabase, atau penggabungan dengan portal sipantau nanti — membuat
seluruh pendaftaran hari itu gagal dengan *"invalid input syntax for type integer"*.
Baris yang tidak berbentuk sekarang dilewati.

**3. `INSERT` banyak baris sekaligus menghasilkan nomor kembar.** Trigger `AFTER ROW`
di PostgreSQL diantrikan sampai seluruh statement selesai. Pada
`insert into kunjungan values (...), (...)` kedua baris menghitung nomor antrean
**sebelum** satu pun antrean tertulis, lalu sama-sama meminta nomor yang sama.
Ditemukan oleh `test/uji_kasir.sql` yang memang menulis dua kunjungan dalam satu
perintah. Penerbitan nomor dipindahkan ke trigger `BEFORE INSERT`.

---

## Keputusan yang perlu Anda ketahui

| Hal | Keputusan | Alasan |
|---|---|---|
| **Nama di layar tunggu** | **Tidak ada sama sekali.** Nomor saja | Pilihan Anda. Efek sampingnya besar: fungsi `antrean_layar()` secara struktural tidak menyentuh tabel pasien, sehingga tautan layar yang tercecer tidak membocorkan apa pun — isinya kalimat yang memang diteriakkan petugas |
| **Akses layar** | Tautan bertoken, **tanpa login** | TV yang ditinggalkan menyala tidak bisa dipakai membuka rekam medis. Kalau layar login pakai akun pegawai, sesi menganggur di TV berarti RME terbuka bagi siapa pun yang menyentuhnya |
| **Alur panggil** | **Dua tahap**: loket lalu poli | Admin memanggil untuk verifikasi kartu, dokter memanggil ke ruang periksa. Pasien tahu ia sedang menunggu tahap yang mana |
| **Suara** | Bel WebAudio + pembaca suara bawaan peramban (id-ID) | Tanpa berkas audio yang harus diunduh: panggilan pertama pagi hari sering jatuh saat jaringan paling sibuk, dan bel yang belum selesai diunduh berarti pasien pertama tidak terpanggil |
| **Loket tidak pernah terhalang** | Aturan duplikat & kuota online **hanya** untuk jalur Mobile JKN | Sistem yang menolak mendaftarkan pasien yang sedang berdiri di depan petugas akan disiasati dengan mengosongkan nomor BPJS — dan yang rusak kemudian adalah data klaim, bukan antreannya |
| **Kode 202** | Nomor **tetap terbit** untuk peserta yang belum jadi pasien | Pasien yang sudah berangkat tidak boleh disuruh pulang. Kode 202 memberi tahu Mobile JKN agar mengirim data dirinya; papan antrean menandainya *belum jadi pasien klinik* |
| **`POST /peserta`** | **Tidak** membuat rekam medis otomatis | Nomor RM adalah identitas seumur hidup. Menerbitkannya dari data yang belum dilihat petugas adalah cara tercepat melahirkan pasien kembar — satu dari Mobile JKN, satu lagi saat orangnya datang dan ejaan namanya beda sedikit |
| **Nomor batal** | **Tidak pernah dipakai ulang**; kuotanya kembali | Pasien mungkin sudah memotret nomornya. Dua orang bernomor sama di ruang tunggu tidak bisa dibereskan lagi |
| **Password web service** | Dibuat acak sistem, disimpan sebagai hash bersalt, **ditampilkan sekali** | Ia disalin sekali ke formulir BPJS dan tidak pernah diketik ulang manusia, jadi tidak ada alasan membuatnya bisa dihafal — sementara pintunya menghadap internet terbuka |
| **`ANJUNGAN` di enum sumber** | Dimasukkan sekarang meski mesin anjungan belum dibuat | Menambah nilai enum kemudian memaksa satu migrasi yang harus dijalankan sendirian di luar transaksi — pelajaran dari `07_peran_kasir.sql`. Nilai yang belum terpakai tidak memakan apa pun |
| **Layar saat jaringan putus** | Nomor terakhir **tetap terpampang**; hanya titik pojok berubah merah | Pasien yang melihat layar kosong mengira antreannya hilang dan berbondong ke loket — tepat ketika petugas sedang menghadapi gangguan jaringan |

---

## Aturan yang ditulis dua kali, dijaga contoh uji yang sama persis

Pola yang sama dengan penandaan lab, nomor surat, dan payload PCare:

| Aturan | Di database | Di JavaScript |
|---|---|---|
| Bentuk nomor antrean | kolom `antrean.nomor` | `AntreanCore.formatNomor()` |
| Pemeriksaan nomor kartu | `antrol_periksa_kartu()` | `AntreanCore.periksaKartu()` |
| Pemeriksaan NIK | `antrol_periksa_nik()` | `AntreanCore.periksaNik()` |

`test/uji_antrean.sql` dan `test/uji_antrean_core.js` memakai nomor, kartu, dan
tanggal yang **sama persis** — termasuk contoh nomor 1000 yang membuktikan
`lpad` PostgreSQL (yang **memotong**) dan `padStart` JavaScript (yang tidak)
memulangkan hasil yang sama. Kalau salah satu diubah, salah satu uji gagal —
bukan hasilnya yang berselisih diam-diam di klinik.

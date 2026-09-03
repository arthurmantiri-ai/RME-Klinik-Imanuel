# Modul Surat Keterangan — daftar berkas untuk diunggah

Paket ini berisi **8 berkas baru** dan **16 berkas yang diubah**. Semuanya sudah diuji:
seluruh `./test/semua.sh` hijau (16 uji SQL surat, 208 pemeriksaan fungsi murni,
30 kontrak kolom, 54 alur halaman di Chromium, nol galat console).

Salin berkas-berkas di bawah ke repo `arthurmantiri-ai/RME-Klinik-Imanuel`
**pada jalur yang sama persis**, lalu commit.

---

## A. Berkas baru (8)

| Jalur | Isi |
|---|---|
| `sql/13_surat.sql` | Tabel `ref_jenis_surat`, `surat`, `sys_surat_pengaturan`; penomoran; fungsi pembatalan; RLS; audit; view `v_surat` |
| `js/kop_klinik.js` | Gambar kop Klinik Imanuel, tertanam sebagai data URI (dari `Kop Klinik Imanuel.doc`) |
| `js/surat_core.js` | Bentuk nomor surat, hitungan tanggal, terbilang, dan definisi enam jenis surat — fungsi murni |
| `js/surat_cetak.js` | Penyaji satu model dokumen menjadi halaman cetak (HTML) dan berkas PDF (pdfmake) |
| `js/pages/surat.js` | Halaman Surat Keterangan: formulir + pratinjau, dan tab Riwayat surat |
| `test/uji_surat.sql` | 16 uji SQL: penomoran, keunikan, pembatalan, RLS, GRANT view, audit |
| `test/uji_surat_core.js` | 208 pemeriksaan fungsi murni, dijalankan di zona waktu lain agar salah-tanggal gagal keras |
| `test/uji_surat_halaman.js` | 54 pemeriksaan alur halaman di Chromium sungguhan |

## B. Berkas yang diubah (16)

| Jalur | Apa yang berubah |
|---|---|
| `js/db.js` | 13 fungsi surat baru + pengaturan surat; ditambahkan sebelum bagian Bridging dan didaftarkan di blok `return` |
| `js/app.js` | Menu **Surat Keterangan**, rute `#/surat`, judul halaman |
| `js/ui.js` | Satu ikon baru (`surat`) |
| `js/demo-data.js` | Data contoh surat + 13 fungsi tiruan, supaya `demo.html` bisa dipakai tanpa database |
| `js/pages/periksa.js` | Kartu **Surat keterangan** di panel kanan layar pemeriksaan dokter |
| `js/pages/rekam.js` | Tombol **Buat surat** dan daftar surat kunjungan di rekam medis |
| `js/pages/pengaturan.js` | Tab baru **Kop & Surat**: unggah kop, kota, catatan kaki |
| `css/style.css` | Gaya halaman surat (tata letak formulir + pratinjau, kotak nomor) |
| `app.html` | 4 tag `<script>` baru |
| `demo.html` | 4 tag `<script>` baru |
| `test/jalankan.sh` | `uji_surat` masuk daftar uji SQL |
| `test/semua.sh` | `uji_surat_core` dan `uji_surat_halaman` masuk daftar |
| `test/uji_kolom_db.js` | Kontrak `daftarDokter.no_sip` + pemeriksaan kode jenis surat sama di JS, SQL, dan demo |
| `test/README.md` | Penjelasan kenapa nomor surat diuji dua kali dan kenapa ujinya berjalan di zona waktu lain |
| `PANDUAN.md` | Bab **Surat keterangan** (±110 baris), berkas SQL ke-13, pohon berkas, daftar isi |
| `README.md` | Ringkasan modul surat |

`perubahan-berkas-lama.patch` berisi `git diff` bagian B, kalau lebih enak ditinjau
sebagai patch daripada berkas utuh.

---

## Setelah diunggah — satu langkah di Supabase

Jalankan **`sql/13_surat.sql`** sekali di **SQL Editor** Supabase. Berkas ini aman
dijalankan di database yang sudah berisi data: semuanya `create ... if not exists`,
`create or replace`, dan `on conflict do nothing/update`.

Memeriksa hasilnya:

```sql
select count(*) from ref_jenis_surat;      -- harus 6
select public.format_no_surat(7,'SKS',9,2026);  -- harus 07/SKS/YAKIM/IX/2026
```

Tidak ada langkah lain. Tidak ada berkas yang perlu disunting — kop surat sudah
tertanam di `js/kop_klinik.js`.

---

## Yang mungkin ingin Anda ubah sendiri

| Di mana | Apa |
|---|---|
| Pengaturan → Kop & Surat | Kota pada baris tanggal (bawaan **Manado**) dan catatan kaki |
| Pengaturan → Kop & Surat | Unggah kop lain bila kop klinik diperbarui |
| Pengaturan → Pengguna | Pastikan **No. SIP** tiap dokter terisi — nomor itu tercetak di bawah tanda tangan pada semua surat |

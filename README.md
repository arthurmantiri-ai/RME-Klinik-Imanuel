# RME Klinik Imanuel

Rekam Medis Elektronik untuk klinik pratama BPJS — rawat jalan.
Biaya operasional Rp 0 (Supabase + Netlify paket gratis).

**Mulai dari sini → [PANDUAN.md](PANDUAN.md)**

## Lihat dulu tanpa menyiapkan apa pun

Buka `demo.html` lewat peramban. Berisi data contoh (nama pasien fiktif),
tidak terhubung ke database mana pun. Ada pemilih **Lihat sebagai** di bagian
atas untuk mencoba tampilan tiap peran, termasuk dokter gigi.

## Ringkas

- **Peran**: admin · pendaftaran · perawat · dokter · apoteker · kasir
- **Poli**: umum dan gigi (poli gigi memunculkan odontogram dan pemeriksaan gigi)
- **Alur**: pendaftaran → kajian awal → pemeriksaan dokter (anamnesis + pemeriksaan
  fisik per sistem + ICD-10 + tindakan + penunjang + resep) → kunci rekam medis →
  surat keterangan bila perlu → apotek (stok terpotong FEFO) → kasir (tagihan + kwitansi)
- **Pemeriksaan dokter berfield, bukan paragraf**: setiap hal yang diminta PCare dan
  SatuSehat punya kolomnya sendiri — keluhan, kesadaran, tanda vital, temuan fisik per
  sistem tubuh, prognosa, TACC, rujukan berkode. Catatan S/O/A/P tetap ada dan
  **tersusun sendiri** dari isian itu, jadi rekam medis yang dicetak tetap berbunyi
  seperti tulisan dokter. Satu tombol menandai seluruh pemeriksaan fisik dalam batas
  normal; dokter tinggal membuka yang memang tidak normal
- **Apotek**: stok per batch dengan urutan keluar FEFO, antrean resep dari dokter,
  kartu stok harian, laporan bulanan, impor & ekspor Excel (saldo awal dan pembelian)
- **Kasir**: tagihan disusun otomatis dari tindakan dokter dan obat yang benar-benar
  diserahkan; kunjungan BPJS dicatat nilainya tanpa ditagihkan; kwitansi PDF dan
  struk thermal 58/80 mm
- **Lab & penunjang**: dokter meminta lewat paket, petugas mengisi angkanya, nilai di
  luar rujukan ditandai otomatis menurut jenis kelamin dan umur, nilai kritis diberi
  peringatan, tren antar kunjungan, lembar hasil siap cetak. Bacaan rontgen gigi
  terkait nomor gigi dan tampil di odontogram
- **Tanpa penyimpanan gambar**: yang disimpan angka dan bacaannya; berkas fisik
  (film, lembar hasil lab luar) dicatat nomor arsipnya. Kuota 1 GB Supabase Storage
  tidak terpakai sedikit pun — alasannya di [PANDUAN.md](PANDUAN.md#lab--pemeriksaan-penunjang)
- **Surat keterangan**: surat sakit, rujukan bentuk BPJS, surat kontrol, keterangan
  berbadan sehat, resume medis, dan surat keterangan bebas isi — berkop klinik,
  bernomor `XX/JENIS/YAKIM/BULAN-ROMAWI/TAHUN` (yang diketik hanya angka nomornya),
  pratinjau yang sama persis dengan hasil cetak, riwayat lengkap dengan cetak ulang,
  unduh PDF, dan pembatalan beralasan. Tanda tangan tetap dengan pulpen —
  [alasannya di PANDUAN.md](PANDUAN.md#tanda-tangan)
- **Siap bridging, bukan sekadar "nanti disesuaikan"**: empat view di database menyusun
  payload `POST /kunjungan`, `/obat/kunjungan`, `/tindakan` PCare dan daftar Observation
  SatuSehat persis seperti bentuk yang diminta — isinya bisa dilihat dari layar dokter
  hari ini juga. Yang tersisa hanya memasangkan kode milik BPJS di
  **Pengaturan → Rujukan & Kode PCare**; sistem sengaja tidak menebaknya, karena kode
  yang salah tidak menimbulkan galat apa pun
- **Antrean & layar tunggu**: papan antrean dua tahap (loket → poli), panggil dari
  loket maupun dari ruang periksa, panggil ulang, tandai tidak hadir. Layar TV ruang
  tunggu berdiri sendiri (`display.html`) — tanpa login, **nomor saja tanpa nama
  pasien**, dengan bel dan suara panggilan berbahasa Indonesia
- **Antrean online Mobile JKN (Antrol) — siap pasang**: enam web service yang diminta
  BPJS untuk FKTP sudah lengkap sebagai Edge Function `antrol`, dengan jadwal poli,
  kuota total vs kuota online, hari libur, akun web service berhash, dan log
  permintaan masuk. Arahnya terbalik dari PCare: **BPJS yang memanggil klinik**.
  Yang tersisa hanya kredensial dari Kantor Cabang —
  [alasan & caranya di PANDUAN.md](PANDUAN.md#antrean-layar-tunggu-dan-antrean-online-mobile-jkn)
- **Master data**: kelola obat, ICD-10, tindakan, pemeriksaan lab, dan tarif dari
  aplikasi; impor/ekspor CSV
- **Kepatuhan**: PMK 24/2022 — audit trail, penguncian rekam medis, addendum, ICD-10

## Satu-satunya berkas yang perlu disunting

`js/config.js` — isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`.

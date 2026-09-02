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
- **Alur**: pendaftaran → kajian awal → SOAP + ICD-10 + tindakan + resep →
  kunci rekam medis → apotek (stok terpotong FEFO) → kasir (tagihan + kwitansi)
- **Apotek**: stok per batch dengan urutan keluar FEFO, antrean resep dari dokter,
  kartu stok harian, laporan bulanan, impor & ekspor Excel (saldo awal dan pembelian)
- **Kasir**: tagihan disusun otomatis dari tindakan dokter dan obat yang benar-benar
  diserahkan; kunjungan BPJS dicatat nilainya tanpa ditagihkan; kwitansi PDF dan
  struk thermal 58/80 mm
- **Master data**: kelola obat, ICD-10, tindakan, dan tarif dari aplikasi; impor/ekspor CSV
- **Kepatuhan**: PMK 24/2022 — audit trail, penguncian rekam medis, addendum, ICD-10
- **Siap bridging**: PCare BPJS & SatuSehat (FHIR R4) sudah ditulis dan diuji;
  bridging dinyalakan belakangan, dan aplikasi menandai data yang belum lengkap sejak sekarang

## Satu-satunya berkas yang perlu disunting

`js/config.js` — isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`.

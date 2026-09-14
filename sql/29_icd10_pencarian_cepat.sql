-- =====================================================================
--  RME KLINIK IMANUEL — PERBAIKAN: PENCARIAN DIAGNOSA ICD-10 LAMBAT
--  Jalankan SETELAH 28_antrol_tanpa_kuota.sql
--
--  Keluhan Arthur (14 Sep 2026): setelah impor CSV ~10.300 kode ICD-10
--  tambahan (WHO, via fitur Impor CSV yang baru), kotak pencarian
--  diagnosa di layar dokter (DB.cariIcd -> js/db.js) jadi terasa lambat
--  tiap kali mengetik.
--
--  BUKAN karena indeksnya belum ada — idx_icd10_nama_id, idx_icd10_nama_en,
--  dan idx_icd10_kode (GIN + pg_trgm) sudah dibuat sejak sql/01_schema.sql,
--  dan sudah persis menutupi tiga kolom yang dicari cariIcd(). Penyebabnya
--  lebih halus: indeks GIN, secara bawaan, punya `fastupdate = on` —
--  artinya baris yang baru di-INSERT/UPSERT tidak langsung masuk ke
--  struktur indeks utama, melainkan ditampung dulu di "pending list", dan
--  baru digabungkan belakangan (oleh VACUUM, atau otomatis kalau pending
--  list-nya sudah kepenuhan). Selama pending list itu belum digabungkan,
--  SETIAP pencarian ikut memindai pending list itu secara linier di atas
--  indeks utamanya — dan itu yang terasa sebagai "lambat" persis setelah
--  impor besar seperti kemarin, sebelum autovacuum sempat membereskannya
--  sendiri.
--
--  Perbaikan di sini dua lapis:
--   1. VACUUM ANALYZE sekali di bawah — membereskan pending list yang
--      SUDAH menumpuk dari impor kemarin, dan menyegarkan statistik tabel
--      untuk perencana query. Efeknya langsung terasa begitu skrip ini
--      selesai.
--   2. Matikan fastupdate pada tiga indeks itu — supaya baris baru
--      (termasuk impor besar berikutnya, kalau WHO merilis revisi ICD-10)
--      langsung masuk ke struktur indeks utama tanpa lewat pending list
--      sama sekali. Tabel ini jarang ditulis (data acuan, bukan transaksi
--      pasien) tapi SANGAT sering dibaca (tiap dokter mengetik), jadi
--      trade-off yang benar adalah: penulisan sedikit lebih lambat,
--      pembacaan selalu konsisten cepat — persis kebalikan dari asumsi
--      bawaan `fastupdate = on` yang mengoptimalkan untuk penulisan.
--
--  Aman dijalankan ulang. Tidak mengunci tabel lama (ALTER INDEX ... SET
--  hanya mengubah parameter penyimpanan, bukan menulis ulang indeksnya;
--  VACUUM ANALYZE tanpa FULL tidak mengunci pembacaan/penulisan tabel).
-- =====================================================================

alter index if exists idx_icd10_nama_id set (fastupdate = off);
alter index if exists idx_icd10_nama_en set (fastupdate = off);
alter index if exists idx_icd10_kode    set (fastupdate = off);

vacuum analyze icd10;

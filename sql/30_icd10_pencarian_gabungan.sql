-- =====================================================================
--  RME KLINIK IMANUEL — PERCEPAT LAGI: SATU INDEKS GABUNGAN ICD-10
--  Jalankan SETELAH 29_icd10_pencarian_cepat.sql
--
--  Arthur melaporkan pencarian ICD-10 sudah lebih cepat setelah 29_...,
--  tapi masih agak lama. Penyebab sisa: cariIcd() dan daftarIcd10()
--  (js/db.js) mencari lewat TIGA indeks GIN terpisah sekaligus (kode,
--  nama_id, nama_en) yang digabung dengan OR — untuk setiap ketikan,
--  Postgres memindai ketiga indeks itu lalu MENGGABUNGKAN hasilnya
--  (bitmap OR) sebelum menyaring baris yang cocok. Tiga kali pindai +
--  satu kali gabung, padahal cukup satu.
--
--  Perbaikan: satu kolom gabungan `cari_teks` (kode + nama_id + nama_en
--  digabung jadi satu teks) dengan SATU indeks GIN. Pencarian jadi satu
--  kali pindai indeks, bukan tiga digabung. `cari_teks` adalah GENERATED
--  COLUMN (STORED) — terisi dan diperbarui SENDIRI oleh PostgreSQL setiap
--  baris ditambah/diubah (termasuk lewat impor CSV), Anda tidak perlu
--  mengisi atau memeliharanya secara manual sama sekali.
--
--  js/db.js yang menyertai berkas ini sudah diarahkan memakai `cari_teks`
--  (cariIcd untuk kotak pencarian dokter, daftarIcd10 untuk tab Master
--  Data), jadi begitu migrasi ini selesai, TIGA indeks lama di bawah
--  sudah tidak dipakai query mana pun lagi — dihapus di sini supaya
--  PostgreSQL tidak perlu memelihara empat indeks tiap kali ada impor
--  CSV besar berikutnya, cukup satu.
--
--  CARA MENJALANKAN — TETAP DUA LANGKAH TERPISAH (pelajaran dari 29_):
--  VACUUM tidak boleh berjalan di dalam blok transaksi, dan Supabase SQL
--  Editor membungkus SELURUH isi yang ditempel jadi satu blok transaksi.
--  Jadi BAGIAN A dan BAGIAN B di bawah WAJIB dua query terpisah:
--    1. Blok baru di SQL Editor -> tempel BAGIAN A saja -> Run.
--    2. Bersihkan isinya -> tempel BAGIAN B saja -> Run.
--
--  Aman dijalankan ulang. Menambah kolom generated pada tabel berisi
--  belasan ribu baris makan waktu beberapa detik (Postgres menulis
--  ulang tabelnya sekali) — itu normal, bukan macet, jangan ditutup
--  di tengah jalan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BAGIAN A — jalankan sebagai query pertama
-- ---------------------------------------------------------------------
alter table icd10
  add column if not exists cari_teks text
  generated always as (
    kode || ' ' || coalesce(nama_id, '') || ' ' || coalesce(nama_en, '')
  ) stored;

create index if not exists idx_icd10_cari_teks
  on icd10 using gin (cari_teks gin_trgm_ops);

-- Sama seperti 29_: matikan fastupdate dari awal, supaya impor besar
-- berikutnya tidak menumpuk pending list lagi di indeks yang baru ini.
alter index idx_icd10_cari_teks set (fastupdate = off);

drop index if exists idx_icd10_nama_id;
drop index if exists idx_icd10_nama_en;
drop index if exists idx_icd10_kode;

-- ---------------------------------------------------------------------
-- BAGIAN B — bersihkan editor, lalu jalankan INI SENDIRIAN sebagai
-- query kedua (terpisah dari Bagian A di atas).
-- ---------------------------------------------------------------------
vacuum analyze icd10;

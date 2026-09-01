-- =====================================================================
--  RME KLINIK IMANUEL - PENAMBAHAN PERAN 'kasir'
--  Jalankan SETELAH 06_master.sql, SEBELUM 08_apotek.sql
--
--  BERKAS INI SENGAJA DIPISAH DAN HANYA BERISI SATU PERINTAH.
--  Alasannya teknis: PostgreSQL tidak mengizinkan nilai enum yang baru
--  ditambahkan dipakai di dalam transaksi yang sama. Kalau perintah ini
--  digabung ke berkas apotek/kasir, seluruh berkas akan gagal dengan
--  pesan "unsafe use of new value of enum type" — kegagalan yang
--  membingungkan karena penyebabnya jauh dari baris yang error.
--
--  Jalankan berkas ini sendirian, tunggu sampai selesai, baru lanjut.
-- =====================================================================

alter type peran_pegawai add value if not exists 'kasir';

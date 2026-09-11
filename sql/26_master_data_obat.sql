-- =====================================================================
--  RME KLINIK IMANUEL — HAK AKSES: MASTER DATA KHUSUS OBAT
--  Jalankan SETELAH 25_tarif_kasir.sql
--
--  Permintaan Arthur (11 Sep 2026): apoteker perlu bisa membuka & mengelola
--  Master Data untuk OBAT saja (menambah, mengubah, menonaktifkan) — tanpa
--  ikut diberi akses ke Diagnosa (ICD-10), Tindakan (ICD-9-CM), atau
--  Pemeriksaan Lab, yang semuanya sampai sekarang duduk di belakang kode
--  `master_data` yang SAMA (lihat sql/02_rls.sql bagian A, sql/05_gigi.sql,
--  sql/11_penunjang.sql).
--
--  Pola yang dipakai: bukan mengganti `master_data` jadi lebih sempit
--  (itu akan mencabut akses admin/master ke tabel lain), melainkan kode
--  BARU `master_data_obat` yang HANYA menambah izin — dicek lewat fungsi
--  `boleh_master_data_obat()` yang meloloskan siapa pun yang punya kode
--  `master_data` (penuh) ATAU `master_data_obat` (sempit, khusus tabel
--  `obat`). Kebijakan RLS tabel `obat` diarahkan ke fungsi baru ini;
--  `faskes`, `poli`, `icd10`, `signa` (sql/02_rls.sql), `icd9cm` dkk
--  (sql/05_gigi.sql), dan referensi lab (sql/11_penunjang.sql) TIDAK
--  disentuh — tetap murni `boleh_master_data()`.
--
--  Sisi tampilan (js/pages/master.js, js/app.js) mengikuti pola yang sama:
--  peran dengan `master_data_obat` saja melihat menu "Master Data" dan
--  tab "Obat", tapi tidak tab ICD-10/ICD-9/Lab.
--
--  Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Fungsi hak akses
-- ---------------------------------------------------------------------
create or replace function public.boleh_master_data_obat() returns boolean
language sql stable security definer set search_path = public
as $$ select public.boleh_master_data() or public.hak_akses_cek('master_data_obat') $$;

grant execute on function public.boleh_master_data_obat() to authenticated;

-- ---------------------------------------------------------------------
-- B. Kebijakan tulis tabel `obat`: dari boleh_master_data() -> fungsi baru.
--    Kebijakan baca (`obat_baca`, dibuat di sql/02_rls.sql) TIDAK diubah —
--    seluruh staf sudah boleh membaca, sama seperti sebelumnya.
-- ---------------------------------------------------------------------
drop policy if exists obat_kelola on obat;
create policy obat_kelola on obat for all
  to authenticated
  using (public.boleh_master_data_obat())
  with check (public.boleh_master_data_obat());

-- ---------------------------------------------------------------------
-- C. Isian awal: apoteker dapat kode ini secara bawaan. Bisa dicabut atau
--    diberikan ke peran lain kapan saja lewat Pengaturan -> Hak Akses.
-- ---------------------------------------------------------------------
insert into public.hak_akses (kode, peran, diizinkan) values
  ('master_data_obat', 'apoteker', true)
on conflict (kode, peran) do nothing;

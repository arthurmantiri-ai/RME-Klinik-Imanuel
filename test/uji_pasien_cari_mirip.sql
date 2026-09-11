-- =====================================================================
--  UJI pasien_cari_mirip() — dipakai halaman Pra-daftar Pasien
--  Dijalankan SETELAH uji_kronis.sql: memakai tiga pasien yang sudah
--  disiapkan di sana (Budi Santoso, Budi Santosa yang sengaja mirip,
--  dan Siti Aminah tanpa nomor BPJS) supaya tidak menduplikasi data uji.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- Budi Santoso (D1) diberi NIK untuk menguji jalur skor tertinggi.
update pasien set nik = '3374012345678901'
 where id = 'bbbbbbb1-0000-0000-0000-0000000000D1';

\echo '--- 1. Grant EXECUTE ke authenticated benar-benar terpasang'
do $$
begin
  assert has_function_privilege('authenticated',
    'public.pasien_cari_mirip(text,text,text,int)', 'execute'),
    'Tanpa grant ini, halaman Pra-daftar Pasien akan gagal dengan permission denied.';
end $$;

\echo '--- 2. NIK sama persis menang telak, walau nama yang dicari beda sekali'
do $$
declare r record;
begin
  select * into r from public.pasien_cari_mirip(
    p_nama := 'Nama Yang Sama Sekali Tidak Mirip', p_nik := '3374012345678901') limit 1;
  assert r.id = 'bbbbbbb1-0000-0000-0000-0000000000D1', 'NIK sama harus tetap ditemukan.';
  assert r.skor = 100, 'NIK sama = skor 100.';
  assert r.alasan = 'NIK sama', r.alasan;
end $$;

\echo '--- 3. Nomor BPJS sama persis (skor 95), tanpa NIK diberikan'
do $$
declare r record;
begin
  select * into r from public.pasien_cari_mirip(
    p_nama := 'Nama Lain Lagi', p_no_bpjs := '0001234567890') limit 1;
  assert r.id = 'bbbbbbb1-0000-0000-0000-0000000000D1', 'BPJS sama harus ditemukan.';
  assert r.skor = 95, 'BPJS sama tanpa NIK = skor 95.';
  assert r.alasan = 'Nomor BPJS sama', r.alasan;
end $$;

\echo '--- 4. Nama sama persis (skor 90) mengalahkan nama yang cuma mirip'
do $$
declare r record;
begin
  select * into r from public.pasien_cari_mirip(p_nama := 'Budi Santoso') limit 1;
  assert r.id = 'bbbbbbb1-0000-0000-0000-0000000000D1',
    'Nama sama persis harus diurutkan di atas nama yang cuma mirip (Budi Santosa).';
  assert r.skor = 90, 'Nama sama persis, tanpa NIK/BPJS = skor 90.';
end $$;

\echo '--- 5. "Budi Santosa" tetap muncul sebagai usulan kemiripan (skor di bawah 90)'
do $$
declare n int; skor_kembar numeric;
begin
  select count(*) into n from public.pasien_cari_mirip(p_nama := 'Budi Santoso', p_batas := 8)
   where id = 'bbbbbbb1-0000-0000-0000-0000000000D2';
  assert n = 1, 'Nama yang mirip (beda satu huruf) tetap harus terlihat sebagai usulan.';
  select skor into skor_kembar from public.pasien_cari_mirip(p_nama := 'Budi Santoso', p_batas := 8)
   where id = 'bbbbbbb1-0000-0000-0000-0000000000D2';
  assert skor_kembar < 90, 'Nama yang cuma mirip tidak boleh mendapat skor "sama persis".';
end $$;

\echo '--- 6. Nama yang benar-benar tidak berhubungan tidak ikut terusulkan'
do $$
declare n int;
begin
  select count(*) into n from public.pasien_cari_mirip(
    p_nama := 'Zzzqvwx Tidak Ada Hubungannya Sama Sekali');
  assert n = 0, 'Ambang batas similarity() harus menyaring nama yang benar-benar tidak berhubungan.';
end $$;

\echo '--- 7. p_batas benar-benar membatasi jumlah baris'
do $$
declare n int;
begin
  select count(*) into n from public.pasien_cari_mirip(p_nama := 'Budi Santoso', p_batas := 1);
  assert n = 1, 'p_batas=1 harus memulangkan tepat satu baris walau ada lebih dari satu usulan.';
end $$;

\echo 'SEMUA UJI pasien_cari_mirip LULUS'

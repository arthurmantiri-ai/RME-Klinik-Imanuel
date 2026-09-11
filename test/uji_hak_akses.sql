-- =====================================================================
--  UJI HAK AKSES — mekanisme generik hak_akses_cek() / tabel hak_akses
--  (9 Sep 2026, lihat sql/02_rls.sql bagian "HAK AKSES")
--
--  Dijalankan SETELAH uji_apotek.sql (butuh akun uji 111=master,
--  222=apoteker, 333=dokter, 444=kasir yang dibuat di sana).
--
--  Berkas lain (uji_apotek.sql, uji_kasir.sql, uji_penunjang.sql, dst)
--  sudah menguji setiap fungsi boleh_<kode>() SATU PER SATU lewat modulnya
--  masing-masing. Berkas ini menguji MEKANISME generiknya sendiri, yang
--  dipakai oleh seluruh fungsi boleh_<kode>() itu:
--    1. master selalu lolos, walau tabel hak_akses kosong/tidak ada baris.
--    2. Baris eksplisit true/false ditegakkan untuk peran lain.
--    3. Mengubah baris langsung mengubah hasil hak_akses_cek() berikutnya
--       (tidak ada cache di sisi database).
--    4. Tabel hak_akses sendiri: dibaca semua staf, ditulis hanya master.
--    5. v_hak_akses_saya hanya memuat kode milik peran sendiri.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- Kode uji-uji ini SENGAJA dibuat-buat (bukan kode sungguhan yang dipakai
-- aplikasi) supaya tidak mengganggu isian seed kode sungguhan yang dipakai
-- berkas uji lain yang berjalan sebelum/sesudahnya.
delete from public.hak_akses where kode like 'uji_%';

\echo '--- 1. master selalu lolos walau tabel kosong untuk kode itu'
do $$
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  assert public.hak_akses_cek('uji_tidak_pernah_diisi') = true,
    'master harus selalu lolos hak_akses_cek(), apa pun isi tabelnya';
end $$;

\echo '--- 2. Peran lain ditolak selama belum ada baris/baris false'
do $$
begin
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  assert public.hak_akses_cek('uji_kode_a') = false,
    'tanpa baris di hak_akses, peran selain master harus ditolak (bawaan aman)';

  insert into public.hak_akses (kode, peran, diizinkan) values ('uji_kode_a','dokter', false);
  assert public.hak_akses_cek('uji_kode_a') = false,
    'baris dengan diizinkan=false harus tetap menolak';
end $$;

\echo '--- 3. Mengizinkan lewat tabel langsung berlaku, tanpa cache'
do $$
begin
  update public.hak_akses set diizinkan = true where kode = 'uji_kode_a' and peran = 'dokter';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  assert public.hak_akses_cek('uji_kode_a') = true,
    'setelah diizinkan=true, dokter harus langsung lolos tanpa perlu apa pun lagi';

  -- Peran lain (apoteker) yang tidak punya baris untuk kode yang sama
  -- tidak ikut terpengaruh baris milik peran lain.
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
  assert public.hak_akses_cek('uji_kode_a') = false,
    'izin satu peran tidak boleh bocor ke peran lain untuk kode yang sama';
end $$;

\echo '--- 4. boleh_<kode>() sungguhan adalah pembungkus tipis hak_akses_cek()'
do $$
begin
  -- 'apotek' sudah diseed true untuk apoteker (lihat sql/08_apotek.sql).
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
  assert public.boleh_apotek() = public.hak_akses_cek('apotek'),
    'boleh_apotek() harus sama persis dengan hak_akses_cek(''apotek'')';
  assert public.boleh_apotek() = true, 'apoteker harus tetap boleh apotek (perilaku bawaan)';

  -- 'menu_tarif' diseed true untuk kasir sejak 11 Sep 2026
  -- (lihat sql/09_kasir.sql / sql/25_tarif_kasir.sql).
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  assert public.boleh_tarif() = public.hak_akses_cek('menu_tarif'),
    'boleh_tarif() harus sama persis dengan hak_akses_cek(''menu_tarif'')';
  assert public.boleh_tarif() = true, 'kasir harus tetap boleh tarif (perilaku bawaan)';
end $$;

\echo '--- 5. Tabel hak_akses: dibaca semua staf aktif'
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', true);
  set local role authenticated;
  select count(*) into n from public.hak_akses where kode = 'uji_kode_a';
  reset role;
  assert n = 1, 'staf aktif (dokter) harus bisa membaca tabel hak_akses';
end $$;

\echo '--- 6. Tabel hak_akses: HANYA master yang boleh menulis'
do $$
declare n int;
begin
  -- Dokter mencoba mengubah izinnya sendiri jadi true untuk kode lain — RLS
  -- harus menolak (0 baris berubah), BUKAN error, sama seperti kebijakan
  -- tulis lain di proyek ini.
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', true);
  set local role authenticated;
  begin
    with x as (
      insert into public.hak_akses (kode, peran, diizinkan)
      values ('uji_kode_b','dokter', true)
      returning 1)
    select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0,
    'dokter tidak boleh menaikkan hak aksesnya sendiri lewat tabel hak_akses langsung — '
    'kalau ini tidak ditolak, siapa pun bisa memberi dirinya izin apa pun';

  -- master boleh.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  with x as (
    insert into public.hak_akses (kode, peran, diizinkan)
    values ('uji_kode_b','dokter', true)
    returning 1)
  select count(*) into n from x;
  reset role;
  assert n = 1, 'master harus bisa menulis ke tabel hak_akses';
end $$;

\echo '--- 7. v_hak_akses_saya hanya memuat kode milik peran sendiri, dan kosong untuk master'
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', true);
  set local role authenticated;
  select count(*) into n from public.v_hak_akses_saya where kode = 'uji_kode_b';
  reset role;
  assert n = 1, 'dokter harus melihat kode uji_kode_b miliknya sendiri di v_hak_akses_saya';

  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
  set local role authenticated;
  select count(*) into n from public.v_hak_akses_saya where kode = 'uji_kode_b';
  reset role;
  assert n = 0, 'apoteker tidak boleh ikut melihat kode milik peran lain (dokter)';

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  select count(*) into n from public.v_hak_akses_saya;
  reset role;
  assert n = 0,
    'v_hak_akses_saya sengaja kosong untuk master — App.boleh()/hak_akses_cek() '
    'meloloskannya lewat jaring pengaman, bukan lewat daftar kode';
end $$;

\echo '--- 8. pegawai_kelola dan hak_akses (gerbang tab Hak Akses) TIDAK ada di tabel hak_akses'
do $$
declare n int;
begin
  select count(*) into n from public.hak_akses where kode in ('pegawai_kelola','hak_akses');
  assert n = 0,
    'pegawai_kelola & hak_akses sengaja hardcode master-only di RLS/JS, bukan lewat '
    'tabel ini — kalau ada baris untuknya, artinya seseorang mulai menaruh isian di '
    'kode yang seharusnya tidak pernah bisa diatur lewat matriks (risiko kunci-diri-sendiri)';
end $$;

-- Bersih-bersih: kode uji tidak boleh ikut tertinggal di database.
delete from public.hak_akses where kode like 'uji_%';

\echo 'SEMUA UJI HAK AKSES LULUS'

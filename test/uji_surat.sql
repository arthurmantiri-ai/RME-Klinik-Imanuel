-- =====================================================================
--  UJI FUNGSIONAL MODUL SURAT
--  Penomoran, keunikan nomor, pembatalan, dan hak akses.
--  Dijalankan SETELAH uji_penunjang.sql (memakai pengguna, poli, pasien,
--  dan kunjungan dari sana).
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Fungsi bantu yang sama seperti di uji_rls.sql dan uji_penunjang.sql.
-- Ditulis ulang dengan sengaja: berkas-berkas itu membuangnya di baris
-- terakhir, jadi berkas ini tidak boleh bergantung pada sisanya.
-- ---------------------------------------------------------------------
create or replace function uji_ditolak(p_user uuid, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute p_sql;
    reset role;
    return false;
  exception when others then
    reset role;
    return true;
  end;
end $$;

create or replace function uji_terlihat(p_user uuid, p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text,''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

create or replace function uji_terubah(p_user uuid, p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute 'with x as (' || p_sql || ' returning 1) select count(*) from x' into n;
  exception when others then n := 0;
  end;
  reset role;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Persiapan: satu dokter kedua, untuk menguji bahwa dokter tidak bisa
-- menyunting surat dokter lain.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777','dokter2@uji.id')
on conflict do nothing;
update pegawai set nama='Dokter Kedua Uji', peran='dokter'
 where id='77777777-7777-7777-7777-777777777777';

-- Surat uji dibuang lebih dulu supaya berkas ini bisa dijalankan ulang
-- pada database yang sama tanpa bentrok nomor.
delete from surat where tahun = 2099;

select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);


\echo '--- 1. Bentuk nomor surat disusun database, bukan diketik pengguna'
do $$
declare v_nomor text;
begin
  insert into surat (jenis_kode, nomor_urut, bulan, tahun, tanggal_surat,
                     pasien_id, kunjungan_id, perihal, data, ttd_nama, ttd_sip,
                     dibuat_oleh, dokter_id)
  values ('SKS', 7, 9, 2099, '2099-09-03',
          'bbbbbbb1-0000-0000-0000-000000000001',
          'ddddddd1-0000-0000-0000-0000000000C1',
          'Istirahat 2 hari',
          '{"mulai":"2099-09-03","lama":2}'::jsonb,
          'dr. Uji Satu', '446/SIP/2024/0091',
          '33333333-3333-3333-3333-333333333333',
          '33333333-3333-3333-3333-333333333333')
  returning nomor_surat into v_nomor;

  -- Contoh ini SAMA PERSIS dengan yang dipakai test/uji_surat_core.js.
  -- Kalau bentuk nomor di database dan di JavaScript berselisih, salah
  -- satu dari dua uji itu gagal — bukan tercetak beda diam-diam.
  assert v_nomor = '07/SKS/YAKIM/IX/2099',
    'bentuk nomor surat salah: ' || v_nomor;
end $$;


\echo '--- 2. Angka Romawi benar untuk dua belas bulan'
do $$
declare
  harap text[] := array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  i int;
begin
  for i in 1..12 loop
    assert public.bulan_romawi(i) = harap[i],
      format('bulan %s seharusnya %s, bukan %s', i, harap[i], public.bulan_romawi(i));
  end loop;
  assert public.format_no_surat(1, 'SR', 1, 2099) = '01/SR/YAKIM/I/2099',
    'nomor satu digit harus diberi nol di depan';
  assert public.format_no_surat(115, 'SKBS', 12, 2099) = '115/SKBS/YAKIM/XII/2099',
    'nomor tiga digit tidak boleh dipotong';
end $$;


\echo '--- 3. Deret nomor terpisah per jenis surat dan diulang tiap tahun'
do $$
begin
  -- SKS tahun 2099 sudah dipakai sampai 7, jadi saran berikutnya 8.
  assert public.surat_nomor_berikutnya('SKS', 2099) = 8,
    'saran nomor SKS 2099 seharusnya 8';
  -- Surat rujukan punya deretnya sendiri; belum ada satu pun.
  assert public.surat_nomor_berikutnya('SR', 2099) = 1,
    'deret SR tidak boleh ikut terpakai oleh SKS';
  -- Tahun berbeda mulai dari satu lagi.
  assert public.surat_nomor_berikutnya('SKS', 2098) = 1,
    'deret harus diulang tiap tahun';
end $$;


\echo '--- 4. Satu nomor hanya boleh menunjuk satu lembar, selamanya'
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into surat (jenis_kode, nomor_urut, bulan, tahun, tanggal_surat,
                       pasien_id, data, ttd_nama, dibuat_oleh)
    values ('SKS', 7, 9, 2099, '2099-09-20',
            'bbbbbbb1-0000-0000-0000-000000000001', '{}'::jsonb, 'dr. Uji Satu',
            '33333333-3333-3333-3333-333333333333');
  exception when unique_violation then v_gagal := true;
  end;
  assert v_gagal, 'nomor surat yang sudah dipakai seharusnya ditolak';

  -- Jenis lain dengan nomor sama tetap boleh — deretnya memang terpisah.
  insert into surat (jenis_kode, nomor_urut, bulan, tahun, tanggal_surat,
                     pasien_id, data, ttd_nama, dibuat_oleh)
  values ('SR', 7, 9, 2099, '2099-09-20',
          'bbbbbbb1-0000-0000-0000-000000000001', '{}'::jsonb, 'dr. Uji Satu',
          '33333333-3333-3333-3333-333333333333');

  assert public.surat_nomor_terpakai('SKS', 2099, 7) = '07/SKS/YAKIM/IX/2099',
    'nomor yang terpakai harus bisa dicek sebelum disimpan';
  assert public.surat_nomor_terpakai('SKS', 2099, 99) is null,
    'nomor yang belum dipakai harus memulangkan kosong';
end $$;


\echo '--- 5. Bulan dan tahun terisi dari tanggal surat bila tidak dikirim'
do $$
declare v_nomor text;
begin
  insert into surat (jenis_kode, nomor_urut, tanggal_surat,
                     pasien_id, data, ttd_nama, dibuat_oleh)
  values ('SK', 3, '2099-03-17',
          'bbbbbbb1-0000-0000-0000-000000000001', '{}'::jsonb, 'dr. Uji Satu',
          '33333333-3333-3333-3333-333333333333')
  returning nomor_surat into v_nomor;
  assert v_nomor = '03/SK/YAKIM/III/2099', 'bulan/tahun otomatis salah: ' || v_nomor;
end $$;


\echo '--- 6. Nomor mengikuti bulan yang disimpan, bukan tanggal suratnya'
-- Surat yang dibuat awal Oktober untuk melengkapi agenda September harus
-- tetap bernomor .../IX/. Kalau bulannya diturunkan dari tanggal saat
-- dibaca, seluruh buku agenda klinik jadi salah setiap awal bulan.
do $$
declare v_nomor text;
begin
  insert into surat (jenis_kode, nomor_urut, bulan, tahun, tanggal_surat,
                     pasien_id, data, ttd_nama, dibuat_oleh)
  values ('SKBS', 4, 9, 2099, '2099-10-02',
          'bbbbbbb1-0000-0000-0000-000000000001', '{}'::jsonb, 'dr. Uji Satu',
          '33333333-3333-3333-3333-333333333333')
  returning nomor_surat into v_nomor;
  assert v_nomor = '04/SKBS/YAKIM/IX/2099',
    'bulan pada nomor harus yang disimpan, bukan dari tanggal: ' || v_nomor;
end $$;


\echo '--- 7. Pembatalan wajib beralasan, dan nomornya tetap terpakai'
do $$
declare v_id uuid; v_s surat; v_gagal boolean := false;
begin
  select id into v_id from surat where jenis_kode='SR' and tahun=2099 and nomor_urut=7;

  begin
    perform public.surat_batalkan(v_id, '   ');
  exception when others then v_gagal := true;
  end;
  assert v_gagal, 'pembatalan tanpa alasan seharusnya ditolak';

  v_s := public.surat_batalkan(v_id, 'salah faskes tujuan');
  assert v_s.status = 'BATAL', 'status seharusnya BATAL';
  assert v_s.alasan_batal = 'salah faskes tujuan', 'alasan pembatalan tidak tercatat';

  -- Nomornya TIDAK dilepas kembali. Lembar yang terlanjur tercetak dan
  -- dipegang pasien tidak boleh punya kembaran bernomor sama.
  v_gagal := false;
  begin
    insert into surat (jenis_kode, nomor_urut, bulan, tahun, tanggal_surat,
                       pasien_id, data, ttd_nama, dibuat_oleh)
    values ('SR', 7, 9, 2099, '2099-09-25',
            'bbbbbbb1-0000-0000-0000-000000000001', '{}'::jsonb, 'dr. Uji Satu',
            '33333333-3333-3333-3333-333333333333');
  exception when unique_violation then v_gagal := true;
  end;
  assert v_gagal, 'nomor surat yang dibatalkan tidak boleh dipakai ulang';

  assert public.surat_nomor_terpakai('SR', 2099, 7) = '07/SR/YAKIM/IX/2099 (dibatalkan)',
    'pemeriksaan nomor harus menyebut bahwa suratnya dibatalkan';

  -- Tidak bisa dibatalkan dua kali.
  v_gagal := false;
  begin
    perform public.surat_batalkan(v_id, 'coba lagi');
  exception when others then v_gagal := true;
  end;
  assert v_gagal, 'surat yang sudah batal tidak boleh dibatalkan lagi';
end $$;


\echo '--- 8. Surat yang dibatalkan tidak bisa disunting isinya'
-- Tanpa penjagaan ini, "batalkan lalu perbaiki" jadi cara mengubah surat
-- yang sudah dipegang pasien tanpa meninggalkan jejak: nomornya sama,
-- isinya lain, dan tidak ada satu kolom pun yang menandainya.
do $$
declare v_id uuid; v_gagal boolean := false;
begin
  select id into v_id from surat where jenis_kode='SR' and tahun=2099 and nomor_urut=7;
  begin
    update surat set data = '{"faskes_tujuan":"RS lain"}'::jsonb where id = v_id;
  exception when others then v_gagal := true;
  end;
  assert v_gagal, 'isi surat yang dibatalkan seharusnya tidak bisa diubah';

  -- Mencatat cetakan tetap boleh: surat batal pun kadang perlu dicetak
  -- sebagai bukti arsip.
  perform public.surat_catat_cetak(v_id);
  assert (select jml_cetak from surat where id = v_id) = 1,
    'pencatatan cetak harus tetap jalan pada surat yang dibatalkan';
end $$;


\echo '--- 9. Yang boleh menerbitkan surat hanya dokter dan admin'
do $$
declare
  v_sql text := 'insert into surat (jenis_kode, nomor_urut, bulan, tahun, tanggal_surat,'
    || ' pasien_id, data, ttd_nama) values (%L, %s, 9, 2099, ''2099-09-28'','
    || ' ''bbbbbbb1-0000-0000-0000-000000000001'', ''{}''::jsonb, ''dr. Uji'')';
begin
  -- Perawat, pendaftaran, dan apoteker: boleh baca, tidak boleh menerbitkan.
  assert uji_ditolak('55555555-5555-5555-5555-555555555555', format(v_sql, 'SKS', 51)),
    'perawat tidak boleh menerbitkan surat';
  assert uji_ditolak('66666666-6666-6666-6666-666666666666', format(v_sql, 'SKS', 52)),
    'pendaftaran tidak boleh menerbitkan surat';
  assert uji_ditolak('22222222-2222-2222-2222-222222222222', format(v_sql, 'SKS', 53)),
    'apoteker tidak boleh menerbitkan surat';

  -- Tapi mereka HARUS bisa membacanya: loket yang mencetak ulang.
  assert uji_terlihat('66666666-6666-6666-6666-666666666666',
    'select count(*) from surat') > 0,
    'pendaftaran harus bisa melihat surat untuk mencetak ulang';
  assert uji_terlihat('22222222-2222-2222-2222-222222222222',
    'select count(*) from v_surat') > 0,
    'apoteker harus bisa membaca view surat';

  -- Dokter dan admin boleh menerbitkan.
  assert not uji_ditolak('33333333-3333-3333-3333-333333333333', format(v_sql, 'SKS', 54)),
    'dokter harus boleh menerbitkan surat';
  assert not uji_ditolak('11111111-1111-1111-1111-111111111111', format(v_sql, 'SKS', 55)),
    'admin harus boleh menerbitkan surat';

  -- Tanpa sesi, tidak ada yang terlihat sama sekali.
  assert uji_terlihat(null, 'select count(*) from surat') = 0,
    'pengguna tanpa sesi tidak boleh melihat surat siapa pun';
  assert uji_terlihat(null, 'select count(*) from v_surat') = 0,
    'pengguna tanpa sesi tidak boleh membaca view surat';
end $$;


\echo '--- 10. Dokter hanya boleh menyunting surat terbitannya sendiri'
do $$
declare v_id uuid;
begin
  select id into v_id from surat
   where jenis_kode='SKS' and tahun=2099 and nomor_urut=54;  -- terbitan dokter 3333

  assert uji_terubah('77777777-7777-7777-7777-777777777777',
    format('update surat set perihal = ''disunting dokter lain'' where id = %L', v_id)) = 0,
    'dokter lain tidak boleh menyunting surat yang bukan terbitannya';

  assert uji_terubah('33333333-3333-3333-3333-333333333333',
    format('update surat set perihal = ''disunting sendiri'' where id = %L', v_id)) = 1,
    'dokter harus boleh menyunting surat terbitannya sendiri';

  assert uji_terubah('11111111-1111-1111-1111-111111111111',
    format('update surat set perihal = ''disunting admin'' where id = %L', v_id)) = 1,
    'admin harus boleh menyunting surat mana pun';

  -- Membatalkan berjalan lewat fungsi SECURITY DEFINER, jadi dokter lain
  -- ditolaknya oleh pemeriksaan di dalam fungsi, bukan oleh RLS.
  assert uji_ditolak('77777777-7777-7777-7777-777777777777',
    format('select public.surat_batalkan(%L, ''iseng'')', v_id)),
    'dokter lain tidak boleh membatalkan surat yang bukan terbitannya';
end $$;


\echo '--- 11. Loket boleh mencatat cetakan, tetapi tidak boleh mengubah isinya'
-- Kalau pencatatan cetak dibuat sebagai UPDATE biasa, memberi izin
-- mencetak ulang kepada loket sama dengan memberi izin mengubah isi surat.
do $$
declare v_id uuid; v_sebelum int;
begin
  select id, jml_cetak into v_id, v_sebelum from surat
   where jenis_kode='SKS' and tahun=2099 and nomor_urut=7;

  assert uji_terubah('66666666-6666-6666-6666-666666666666',
    format('update surat set data = ''{"lama":30}''::jsonb where id = %L', v_id)) = 0,
    'pendaftaran tidak boleh mengubah isi surat';

  perform uji_terlihat('66666666-6666-6666-6666-666666666666',
    format('select 1 from (select public.surat_catat_cetak(%L)) x', v_id));

  assert (select jml_cetak from surat where id = v_id) = v_sebelum + 1,
    'pendaftaran harus bisa mencatat cetak ulang';
end $$;


\echo '--- 12. Master jenis surat hanya boleh diubah admin'
do $$
begin
  assert uji_terubah('33333333-3333-3333-3333-333333333333',
    'update ref_jenis_surat set nama = ''Diubah dokter'' where kode = ''SKS''') = 0,
    'master jenis surat tidak boleh diubah dokter';
  assert uji_terubah('11111111-1111-1111-1111-111111111111',
    'update ref_jenis_surat set keterangan = ''diperiksa admin'' where kode = ''SKS''') = 1,
    'admin harus boleh mengubah master jenis surat';

  assert uji_terubah('33333333-3333-3333-3333-333333333333',
    'update sys_surat_pengaturan set konfigurasi = ''{"kota":"Salah"}''::jsonb where id = 1') = 0,
    'pengaturan surat tidak boleh diubah dokter';
  assert uji_terlihat('55555555-5555-5555-5555-555555555555',
    'select count(*) from sys_surat_pengaturan') = 1,
    'semua staf harus bisa membaca pengaturan surat — kopnya dibutuhkan saat mencetak';
end $$;


\echo '--- 13. View surat bisa dibaca sebagai authenticated, bukan hanya superuser'
-- View tidak mewarisi GRANT dari 02_rls.sql, persis seperti tabel baru.
-- Tanpa pemeriksaan ini, halaman Surat akan tampil sebagai
-- "permission denied for view v_surat" di klinik padahal seluruh uji
-- fungsional di atas lulus — karena semuanya berjalan sebagai superuser.
do $$
begin
  assert has_table_privilege('authenticated', 'v_surat', 'select'),
    'v_surat belum diberi GRANT select kepada authenticated';
  assert has_table_privilege('authenticated', 'surat', 'insert'),
    'tabel surat belum diberi GRANT';
  assert has_table_privilege('authenticated', 'ref_jenis_surat', 'select'),
    'tabel ref_jenis_surat belum diberi GRANT';
  assert has_table_privilege('authenticated', 'sys_surat_pengaturan', 'select'),
    'tabel sys_surat_pengaturan belum diberi GRANT';
  assert has_function_privilege('authenticated',
    'public.surat_nomor_berikutnya(text, integer)', 'execute'),
    'fungsi saran nomor belum diberi GRANT execute';
end $$;


\echo '--- 14. Setiap perubahan surat meninggalkan jejak audit'
do $$
declare v_id uuid; n int;
begin
  select id into v_id from surat where jenis_kode='SR' and tahun=2099 and nomor_urut=7;
  select count(*) into n from audit_log
   where tabel = 'surat' and record_id = v_id::text;
  assert n >= 2, format('audit surat kurang lengkap: %s baris', n);
  assert exists (select 1 from audit_log
    where tabel = 'surat' and record_id = v_id::text and aksi = 'INSERT'),
    'penerbitan surat tidak tercatat di audit';
  assert exists (select 1 from audit_log
    where tabel = 'surat' and record_id = v_id::text and aksi = 'UPDATE'
      and data_baru->>'status' = 'BATAL'),
    'pembatalan surat tidak tercatat di audit';
end $$;


\echo '--- 15. View surat memulangkan identitas pasien dan jenis surat'
do $$
declare v v_surat%rowtype;
begin
  select * into v from v_surat where jenis_kode='SKS' and tahun=2099 and nomor_urut=7;
  assert v.nama_pasien is not null, 'nama pasien tidak ikut di view';
  assert v.no_rm is not null, 'nomor rekam medis tidak ikut di view';
  assert v.jenis_nama = 'Surat Keterangan Sakit', 'nama jenis surat salah di view';
  assert v.no_kunjungan is not null, 'nomor kunjungan tidak ikut di view';
  assert v.nama_pembuat is not null, 'nama pembuat tidak ikut di view';
end $$;


\echo '--- 16. Penerbit surat diambil dari sesi, bukan dari yang dikirim peramban'
-- Kolom dibuat_oleh menentukan siapa yang boleh menyunting dan
-- membatalkan surat. Kalau nilainya boleh diketik klien, satu permintaan
-- yang disusun tangan bisa menerbitkan surat "atas nama" dokter lain
-- lengkap dengan izin menyuntingnya.
do $$
declare v_pemilik uuid;
begin
  assert uji_terubah('77777777-7777-7777-7777-777777777777',
    'insert into surat (jenis_kode, nomor_urut, bulan, tahun,
       tanggal_surat, pasien_id, data, ttd_nama, dibuat_oleh)
     values (''SKL'', 61, 9, 2099, ''2099-09-29'',
       ''bbbbbbb1-0000-0000-0000-000000000001'', ''{}''::jsonb, ''dr. Uji'',
       ''33333333-3333-3333-3333-333333333333'')') = 1,
    'dokter kedua harus boleh menerbitkan suratnya sendiri';

  select dibuat_oleh into v_pemilik from surat
   where jenis_kode='SKL' and tahun=2099 and nomor_urut=61;
  assert v_pemilik = '77777777-7777-7777-7777-777777777777',
    'dibuat_oleh harus mengikuti sesi, bukan nilai yang dikirim klien';
end $$;


-- ---------------------------------------------------------------------
-- Bersih-bersih
-- ---------------------------------------------------------------------
delete from surat where tahun = 2099;
drop function if exists uji_ditolak(uuid, text);
drop function if exists uji_terlihat(uuid, text);
drop function if exists uji_terubah(uuid, text);

\echo 'SEMUA UJI SURAT LULUS'

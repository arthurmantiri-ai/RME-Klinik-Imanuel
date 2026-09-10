-- =====================================================================
--  UJI FUNGSIONAL MODUL PENUNJANG
--  Laboratorium, bacaan rontgen, register arsip, dan sambungannya ke kasir.
--  Dijalankan SETELAH uji_apotek.sql, uji_kasir.sql, dan uji_rls.sql
--  (memakai pengguna, poli, dan pasien dari sana).
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Dua fungsi bantu yang sama seperti di uji_rls.sql. Ditulis ulang di sini
-- dengan sengaja: berkas itu membuangnya di baris terakhir, jadi berkas ini
-- tidak boleh bergantung pada sisanya.
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

-- RLS pada UPDATE tidak melempar galat; ia hanya membuat nol baris cocok.
-- Karena itu penolakan UPDATE diperiksa lewat jumlah baris yang benar-benar
-- berubah, bukan lewat ada tidaknya galat.
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
-- Persiapan
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555','perawat@uji.id'),
  ('66666666-6666-6666-6666-666666666666','daftar@uji.id')
on conflict do nothing;
update pegawai set nama='Perawat Uji', peran='perawat'     where id='55555555-5555-5555-5555-555555555555';
-- UUID 666...6 dulu berperan 'pendaftaran' (staf loket) — nama peran itu
-- sekarang 'admin' (9 Sep 2026); bukan akun 'master' (itu UUID 111...1).
update pegawai set nama='Daftar Uji',  peran='admin'       where id='66666666-6666-6666-6666-666666666666';

-- Tiga pasien dengan jenis kelamin dan umur berbeda: nilai rujukan
-- hemoglobin berbeda untuk ketiganya, dan itulah yang diuji.
insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin) values
  ('bbbbbbb1-0000-0000-0000-00000000000F','UJI002','Pasien Perempuan',
    (public.tgl_klinik() - interval '30 years')::date,'P'),
  ('bbbbbbb1-0000-0000-0000-00000000000C','UJI003','Pasien Anak',
    (public.tgl_klinik() - interval '3 years')::date,'L')
on conflict (id) do nothing;

insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal) values
  ('ddddddd1-0000-0000-0000-0000000000C1','UJI-KUNJ-LAB-UMUM',
   'bbbbbbb1-0000-0000-0000-000000000001','ccccccc1-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333','UMUM', public.tgl_klinik()),
  ('ddddddd1-0000-0000-0000-0000000000C2','UJI-KUNJ-LAB-BPJS',
   'bbbbbbb1-0000-0000-0000-00000000000F','ccccccc1-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333','BPJS', public.tgl_klinik())
on conflict (id) do nothing;

-- Tarif lab & penunjang, berlaku sejak setahun lalu.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
insert into kasir_tarif (jenis, kode, nama, tarif, berlaku_mulai) values
  ('LAB','HB',  'Hemoglobin',            25000, public.tgl_klinik() - 365),
  ('LAB','GDS', 'Glukosa Darah Sewaktu', 20000, public.tgl_klinik() - 365),
  ('LAB','LEU', 'Leukosit',              25000, public.tgl_klinik() - 365),
  ('PENUNJANG','RO_PERIAPIKAL','Rontgen periapikal', 75000, public.tgl_klinik() - 365);


\echo '--- 1. Nilai rujukan mengikuti jenis kelamin, bukan baris yang kebetulan ketemu duluan'
do $$
declare r ref_lab_rujukan%rowtype; v_hb uuid;
begin
  select id into v_hb from ref_lab where kode = 'HB';

  r := public.lab_rujukan_untuk(v_hb, 'L', 420);   -- laki-laki 35 tahun
  assert r.batas_bawah = 13.0, format('Hb laki-laki dewasa batas bawah 13,0. Dapat %s', r.batas_bawah);

  r := public.lab_rujukan_untuk(v_hb, 'P', 360);   -- perempuan 30 tahun
  assert r.batas_bawah = 12.0, format('Hb perempuan dewasa batas bawah 12,0. Dapat %s', r.batas_bawah);
end $$;

\echo '--- 2. Rentang umur tersempit yang menang, bukan yang paling umum'
do $$
declare r ref_lab_rujukan%rowtype; v_hb uuid;
begin
  select id into v_hb from ref_lab where kode = 'HB';

  r := public.lab_rujukan_untuk(v_hb, 'L', 36);    -- anak 3 tahun
  assert r.batas_bawah = 11.5 and r.batas_atas = 13.5,
    format('Hb anak 3 tahun harus 11,5-13,5. Dapat %s-%s', r.batas_bawah, r.batas_atas);

  r := public.lab_rujukan_untuk(v_hb, 'P', 6);     -- bayi 6 bulan
  assert r.batas_bawah = 10.5 and r.batas_atas = 13.5,
    format('Hb bayi 6 bulan harus 10,5-13,5. Dapat %s-%s', r.batas_bawah, r.batas_atas);
end $$;

\echo '--- 3. Nilai 12,5 pada laki-laki RENDAH, pada perempuan NORMAL'
do $$
declare v_p1 uuid; v_p2 uuid; v_hb uuid; t text;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);

  -- Laki-laki dewasa
  v_p1 := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 12.5 where permintaan_id = v_p1;
  select tanda into t from lab_hasil where permintaan_id = v_p1;
  assert t = 'RENDAH', format('Hb 12,5 pada laki-laki harus RENDAH. Dapat %s', t);

  -- Perempuan dewasa, nilai yang sama persis
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p2 := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C2', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 12.5 where permintaan_id = v_p2;
  select tanda into t from lab_hasil where permintaan_id = v_p2;
  assert t = 'NORMAL', format('Hb 12,5 pada perempuan harus NORMAL. Dapat %s', t);

  perform public.lab_batalkan(v_p1, 'pembersihan data uji');
  perform public.lab_batalkan(v_p2, 'pembersihan data uji');
end $$;

\echo '--- 4. Nilai kritis dibedakan dari sekadar di luar rentang'
do $$
declare v_p uuid; v_hb uuid; t text;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);

  update lab_hasil set nilai_angka = 11.0 where permintaan_id = v_p;
  select tanda into t from lab_hasil where permintaan_id = v_p;
  assert t = 'RENDAH', format('Hb 11,0 = RENDAH. Dapat %s', t);

  update lab_hasil set nilai_angka = 6.2 where permintaan_id = v_p;
  select tanda into t from lab_hasil where permintaan_id = v_p;
  assert t = 'KRITIS_RENDAH', format('Hb 6,2 harus KRITIS_RENDAH, bukan sekadar rendah. Dapat %s', t);

  update lab_hasil set nilai_angka = 21.0 where permintaan_id = v_p;
  select tanda into t from lab_hasil where permintaan_id = v_p;
  assert t = 'KRITIS_TINGGI', format('Hb 21,0 harus KRITIS_TINGGI. Dapat %s', t);

  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 5. Hasil berupa pilihan ditandai lewat teks normalnya'
do $$
declare v_p uuid; v_id uuid; t text;
begin
  select id into v_id from ref_lab where kode = 'HBSAG';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_id]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);

  update lab_hasil set nilai_teks = 'Non Reaktif' where permintaan_id = v_p;
  select tanda into t from lab_hasil where permintaan_id = v_p;
  assert t = 'NORMAL', format('HBsAg Non Reaktif harus NORMAL. Dapat %s', t);

  update lab_hasil set nilai_teks = 'Reaktif' where permintaan_id = v_p;
  select tanda into t from lab_hasil where permintaan_id = v_p;
  assert t = 'ABNORMAL', format('HBsAg Reaktif harus ABNORMAL. Dapat %s', t);

  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 6. Nilai rujukan disalin ke barisnya; mengubah master tidak mengubah hasil lama'
do $$
declare v_p uuid; v_ua uuid; v_bawah numeric; v_teks text;
begin
  select id into v_ua from ref_lab where kode = 'UA';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_ua]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 6.0 where permintaan_id = v_p;

  select rujukan_bawah, rujukan_teks into v_bawah, v_teks
    from lab_hasil where permintaan_id = v_p;
  assert v_bawah = 3.4, format('rujukan bawah asam urat laki-laki 3,4. Dapat %s', v_bawah);
  assert v_teks = '3.4 - 7.0', format('teks rujukan harus terbentuk otomatis. Dapat "%s"', v_teks);

  -- Klinik mengganti alat, rentangnya berubah.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  update ref_lab_rujukan set batas_bawah = 2.0
   where lab_id = v_ua and jenis_kelamin = 'L';

  select rujukan_bawah into v_bawah from lab_hasil where permintaan_id = v_p;
  assert v_bawah = 3.4,
    format('hasil lama harus tetap memakai rujukan saat itu (3,4). Dapat %s', v_bawah);

  update ref_lab_rujukan set batas_bawah = 3.4
   where lab_id = v_ua and jenis_kelamin = 'L';
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 7. Lembar hasil tidak bisa ditutup selama masih ada yang kosong'
do $$
declare v_p uuid; v_hb uuid; v_gds uuid; berhasil boolean := false;
begin
  select id into v_hb  from ref_lab where kode = 'HB';
  select id into v_gds from ref_lab where kode = 'GDS';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb, v_gds]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);

  update lab_hasil set nilai_angka = 14.0 where permintaan_id = v_p and lab_id = v_hb;
  begin
    perform public.lab_selesaikan(v_p);
    berhasil := true;
  exception when others then null;
  end;
  assert not berhasil, 'lembar dengan pemeriksaan kosong tidak boleh bisa ditutup';

  update lab_hasil set nilai_angka = 110 where permintaan_id = v_p and lab_id = v_gds;
  perform public.lab_selesaikan(v_p);
  assert (select status from lab_permintaan where id = v_p) = 'SELESAI', 'seharusnya SELESAI';

  -- Perawat tidak boleh membatalkan lembar yang sudah ditutup; master boleh.
  berhasil := false;
  begin perform public.lab_batalkan(v_p, 'coba batal'); berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'lembar yang sudah selesai tidak boleh dibatalkan perawat';

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 8. Lembar yang sudah selesai terkunci; hanya master yang boleh membukanya, dengan alasan'
do $$
declare v_p uuid; v_hb uuid; berhasil boolean := false; v_cat text;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 14.0 where permintaan_id = v_p;
  perform public.lab_selesaikan(v_p);

  -- Perawat mencoba mengoreksi setelah lembar ditutup
  begin
    update lab_hasil set nilai_angka = 99 where permintaan_id = v_p;
    berhasil := true;
  exception when others then null;
  end;
  assert not berhasil, 'hasil yang sudah selesai tidak boleh diubah perawat';

  -- Perawat juga tidak boleh membuka kuncinya
  berhasil := false;
  begin perform public.lab_buka_kunci(v_p, 'salah ketik'); berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'hanya master yang boleh membuka kunci';

  -- Master membuka kunci, tapi alasan wajib
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  berhasil := false;
  begin perform public.lab_buka_kunci(v_p, '   '); berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'membuka kunci tanpa alasan harus ditolak';

  perform public.lab_buka_kunci(v_p, 'salah ketik satuan');
  assert (select status from lab_permintaan where id = v_p) = 'DIKERJAKAN', 'harus kembali DIKERJAKAN';

  select catatan_klinis into v_cat from lab_permintaan where id = v_p;
  assert v_cat like '%salah ketik satuan%', 'alasan membuka kunci harus tercatat di lembarnya';

  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 15.0 where permintaan_id = v_p;
  assert (select nilai_angka from lab_hasil where permintaan_id = v_p) = 15.0,
    'setelah dibuka, koreksi harus bisa disimpan';
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 9. Perubahan hasil lab meninggalkan jejak audit'
do $$
declare v_p uuid; v_hb uuid; n int;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 14.0 where permintaan_id = v_p;

  select count(*) into n from audit_log
   where tabel = 'lab_hasil' and aksi = 'UPDATE'
     and record_id = (select id::text from lab_hasil where permintaan_id = v_p);
  assert n >= 1, 'perubahan hasil lab harus tercatat di audit_log';
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 10. Bacaan penunjang wajib punya kesan, dan hanya dokter yang boleh menulisnya'
do $$
declare v_id uuid; berhasil boolean := false;
begin
  -- Perawat mencoba menulis bacaan
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  begin
    v_id := public.penunjang_simpan(null,'bbbbbbb1-0000-0000-0000-000000000001',
      'ddddddd1-0000-0000-0000-0000000000C1', public.tgl_klinik(), 'RO_PERIAPIKAL',
      null,'INTERNAL',null,null,null,'Karies profunda', null, array['36']);
    berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'perawat tidak boleh menulis bacaan radiologis';

  -- Dokter tanpa kesan
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  berhasil := false;
  begin
    v_id := public.penunjang_simpan(null,'bbbbbbb1-0000-0000-0000-000000000001',
      'ddddddd1-0000-0000-0000-0000000000C1', public.tgl_klinik(), 'RO_PERIAPIKAL',
      null,'INTERNAL',null,null,'Tampak area radiolusen', '  ', null, array['36']);
    berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'bacaan tanpa kesan harus ditolak';
end $$;

\echo '--- 11. Satu bacaan boleh menyebut beberapa gigi, dan daftarnya diganti saat disunting'
do $$
declare v_id uuid; n int;
begin
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_id := public.penunjang_simpan(null,'bbbbbbb1-0000-0000-0000-000000000001',
    'ddddddd1-0000-0000-0000-0000000000C1', public.tgl_klinik(), 'RO_PERIAPIKAL',
    'Periapikal regio 36-37','INTERNAL',null,'F-001',
    'Tampak area radiolusen pada mahkota gigi 36 mencapai kamar pulpa',
    'Karies profunda gigi 36 dengan pelebaran ligamen periodontal',
    'Perawatan saluran akar', array['36','37']);

  select count(*) into n from penunjang_gigi where penunjang_id = v_id;
  assert n = 2, format('harus 2 gigi terkait, dapat %s', n);

  -- Disunting: ternyata hanya gigi 36
  perform public.penunjang_simpan(v_id,'bbbbbbb1-0000-0000-0000-000000000001',
    'ddddddd1-0000-0000-0000-0000000000C1', public.tgl_klinik(), 'RO_PERIAPIKAL',
    'Periapikal gigi 36','INTERNAL',null,'F-001','Tampak area radiolusen',
    'Karies profunda gigi 36','Perawatan saluran akar', array['36']);

  select count(*) into n from penunjang_gigi where penunjang_id = v_id;
  assert n = 1, format('daftar gigi harus diganti, bukan ditambah. Dapat %s', n);

  -- Nomor gigi karangan diabaikan, tidak membuat baris palsu
  perform public.penunjang_simpan(v_id,'bbbbbbb1-0000-0000-0000-000000000001',
    'ddddddd1-0000-0000-0000-0000000000C1', public.tgl_klinik(), 'RO_PERIAPIKAL',
    'Periapikal gigi 36','INTERNAL',null,'F-001','Tampak area radiolusen',
    'Karies profunda gigi 36','Perawatan saluran akar', array['36','99']);
  select count(*) into n from penunjang_gigi where penunjang_id = v_id;
  assert n = 1, format('nomor gigi yang tidak ada di ref_gigi harus diabaikan. Dapat %s', n);
end $$;

\echo '--- 12. Tagihan menarik lab yang dikerjakan klinik, bukan yang diminta'
do $$
declare v_p uuid; v_hb uuid; v_gds uuid; v_leu uuid; v_t uuid; n int; v numeric;
begin
  select id into v_hb  from ref_lab where kode = 'HB';
  select id into v_gds from ref_lab where kode = 'GDS';
  select id into v_leu from ref_lab where kode = 'LEU';

  -- Dokter minta tiga; lab hanya sempat mengerjakan dua.
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb, v_gds, v_leu]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 14.0 where permintaan_id = v_p and lab_id = v_hb;
  update lab_hasil set nilai_angka = 110  where permintaan_id = v_p and lab_id = v_gds;

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  v_t := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-0000000000C1');

  select count(*) into n from kasir_tagihan_item where tagihan_id = v_t and sumber = 'LAB';
  assert n = 2, format('hanya 2 pemeriksaan yang dikerjakan yang boleh ditagih, dapat %s', n);

  select sum(total_baris) into v from kasir_tagihan_item
   where tagihan_id = v_t and sumber = 'LAB';
  assert v = 45000, format('25.000 + 20.000 = 45.000. Dapat %s', v);

  assert exists (select 1 from kasir_tagihan_item
                  where tagihan_id = v_t and sumber='LAB' and nama = 'Lab: Hemoglobin'),
    'nama baris lab harus berawalan "Lab: "';
end $$;

\echo '--- 13. Menyusun ulang tagihan tidak menggandakan baris lab'
do $$
declare v_t uuid; n int;
begin
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  v_t := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-0000000000C1');
  select count(*) into n from kasir_tagihan_item where tagihan_id = v_t and sumber = 'LAB';
  assert n = 2, format('setelah disusun ulang tetap 2 baris lab, dapat %s', n);
end $$;

\echo '--- 14. Bacaan penunjang internal ikut ditagih, lengkap dengan nomor giginya'
do $$
declare v_t uuid; nm text; v numeric;
begin
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  v_t := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-0000000000C1');

  select nama, harga_satuan into nm, v from kasir_tagihan_item
   where tagihan_id = v_t and sumber = 'PENUNJANG';
  assert nm like '%(gigi 36)%', format('nomor gigi harus ikut di baris tagihan. Dapat "%s"', nm);
  assert v = 75000, format('tarif rontgen periapikal 75.000. Dapat %s', v);
end $$;

\echo '--- 15. Hasil dari lab luar tidak ditagihkan — bukan klinik yang mengerjakannya'
do $$
declare v_p uuid; v_hb uuid; v_t uuid; n int;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb],
                          null, 'EKSTERNAL', 'Lab Prodia');
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 13.0 where permintaan_id = v_p;

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  v_t := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-0000000000C1');
  select count(*) into n from kasir_tagihan_item where tagihan_id = v_t and sumber = 'LAB';
  assert n = 2, format('hasil lab luar tidak boleh menambah baris tagihan. Dapat %s baris', n);
end $$;

\echo '--- 16. Permintaan yang dibatalkan tidak ikut ditagih'
do $$
declare v_p uuid; v_gds uuid; v_t uuid; n int;
begin
  select id into v_gds from ref_lab where kode = 'GDS';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_gds]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 200 where permintaan_id = v_p;
  perform public.lab_batalkan(v_p, 'salah pasien');

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  v_t := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-0000000000C1');
  select count(*) into n from kasir_tagihan_item where tagihan_id = v_t and sumber = 'LAB';
  assert n = 2, format('permintaan batal tidak boleh masuk tagihan. Dapat %s baris', n);
end $$;

\echo '--- 17. Lab pasien BPJS tercatat nilainya tetapi tidak ditagihkan'
do $$
declare v_p uuid; v_hb uuid; v_t uuid; t kasir_tagihan%rowtype; v boolean;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C2', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 13.0 where permintaan_id = v_p;

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  v_t := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-0000000000C2');
  select * into t from kasir_tagihan where id = v_t;

  select ditanggung_penjamin into v from kasir_tagihan_item
   where tagihan_id = v_t and sumber = 'LAB';
  assert v, 'baris lab BPJS harus ditandai ditanggung penjamin';
  assert t.total = 0, format('pasien BPJS tidak ditagih. Dapat total %s', t.total);
  assert t.subtotal = 25000, format('nilainya tetap tercatat untuk laporan. Dapat %s', t.subtotal);
end $$;

\echo '--- 18. Register arsip memberi nomor urut tahunan'
do $$
declare v_no text; v_bentuk text;
begin
  perform set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666', false);
  insert into lampiran (pasien_id, kunjungan_id, jenis, judul, tanggal_dokumen, asal, lokasi_simpan)
  values ('bbbbbbb1-0000-0000-0000-000000000001','ddddddd1-0000-0000-0000-0000000000C1',
          'FILM_RONTGEN','Film periapikal gigi 36', public.tgl_klinik(),
          'Klinik Imanuel','Lemari B laci 2')
  returning no_arsip, bentuk into v_no, v_bentuk;

  assert v_no like 'ARS-%', format('nomor arsip harus berawalan ARS-. Dapat %s', v_no);
  assert v_no like ('ARS-' || to_char(public.tgl_klinik(),'YYYY') || '-%'),
    format('nomor arsip harus memuat tahun dokumen. Dapat %s', v_no);
  assert v_bentuk = 'FISIK',
    format('tanpa berkas digital, bentuknya FISIK. Dapat %s', v_bentuk);
end $$;

\echo '--- 19. Kolom berkas digital ada tetapi tidak dipakai; mengisinya mengubah bentuk sendiri'
do $$
declare v_bentuk text; n int;
begin
  select count(*) into n from lampiran where berkas_path is not null;
  assert n = 0, 'pada paket gratis tidak boleh ada satu pun berkas digital tersimpan';

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  update lampiran set berkas_path = 'contoh/berkas.webp'
   where judul = 'Film periapikal gigi 36'
  returning bentuk into v_bentuk;
  assert v_bentuk = 'DIGITAL',
    format('mengisi berkas_path harus otomatis mengubah bentuk jadi DIGITAL. Dapat %s', v_bentuk);

  update lampiran set berkas_path = null where judul = 'Film periapikal gigi 36';
end $$;

\echo '--- 20. Peran ditegakkan sebagai authenticated, bukan hanya di dalam fungsi'
do $$
declare v_p uuid; v_hb uuid;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb]);

  -- Apoteker: boleh melihat, tidak boleh mengisi hasil lab
  assert uji_terlihat('22222222-2222-2222-2222-222222222222',
    'select count(*) from lab_hasil') > 0, 'apoteker harus tetap bisa membaca hasil lab';
  assert uji_terubah('22222222-2222-2222-2222-222222222222',
    format('update lab_hasil set nilai_angka = 1 where permintaan_id = %L', v_p)) = 0,
    'apoteker tidak boleh mengisi hasil lab';

  -- Admin (staf loket): boleh mencatat arsip, tidak boleh mengisi hasil lab
  assert uji_terubah('66666666-6666-6666-6666-666666666666',
    format('update lab_hasil set nilai_angka = 1 where permintaan_id = %L', v_p)) = 0,
    'admin (staf loket) tidak boleh mengisi hasil lab';
  assert not uji_ditolak('66666666-6666-6666-6666-666666666666',
    'insert into lampiran (pasien_id, jenis, judul) values
       (''bbbbbbb1-0000-0000-0000-000000000001'',''SURAT_RUJUKAN'',''Uji arsip pendaftaran'')'),
    'admin (staf loket) harus boleh mencatat berkas masuk';

  -- Perawat boleh mengisi hasil, tidak boleh menulis bacaan radiologis
  assert uji_terubah('55555555-5555-5555-5555-555555555555',
    format('update lab_hasil set nilai_angka = 14 where permintaan_id = %L', v_p)) = 1,
    'perawat harus boleh mengisi hasil lab';
  assert uji_ditolak('55555555-5555-5555-5555-555555555555',
    'insert into penunjang (pasien_id, jenis, kesan) values
       (''bbbbbbb1-0000-0000-0000-000000000001'',''EKG'',''uji'')'),
    'perawat tidak boleh menulis bacaan penunjang';

  -- Data acuan (master_data) lab hanya boleh diubah master
  assert uji_terubah('55555555-5555-5555-5555-555555555555',
    'update ref_lab set nama = ''Diubah perawat'' where kode = ''HB''') = 0,
    'data acuan lab hanya boleh diubah master, bukan perawat';
  assert uji_terubah('11111111-1111-1111-1111-111111111111',
    'update ref_lab set keterangan = ''diperiksa admin'' where kode = ''HB''') = 1,
    'master harus boleh mengubah data acuan lab';

  -- Tanpa sesi, tidak ada yang terlihat
  assert uji_terlihat(null, 'select count(*) from lab_hasil') = 0,
    'pengguna tanpa sesi tidak boleh melihat hasil lab siapa pun';
  assert uji_terlihat(null, 'select count(*) from penunjang') = 0,
    'pengguna tanpa sesi tidak boleh melihat bacaan penunjang';

  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 20b. View baru bisa dibaca sebagai authenticated, bukan hanya sebagai superuser'
-- View tidak mewarisi GRANT dari 02_rls.sql, persis seperti tabel baru.
-- Tanpa pemeriksaan ini, halaman Lab akan tampil sebagai galat
-- "permission denied for view v_lab_antrean" di klinik, padahal seluruh
-- uji fungsional di atas lulus — karena semuanya berjalan sebagai superuser.
do $$
declare v text;
begin
  foreach v in array array['v_lab_antrean','v_penunjang_lengkap','v_lab_tren',
                           'v_kasir_menunggu_lab']
  loop
    assert has_table_privilege('authenticated', ('public.'||v)::regclass, 'SELECT'),
      format('role authenticated tidak boleh membaca %s — GRANT-nya terlewat', v);
    assert uji_terlihat('55555555-5555-5555-5555-555555555555',
      format('select count(*) from %s', v)) >= 0,
      format('%s gagal dibaca sebagai authenticated', v);
  end loop;
end $$;

\echo '--- 21. View tren hanya memuat lembar yang sudah selesai'
do $$
declare v_p uuid; v_hb uuid; n int;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 15.5 where permintaan_id = v_p;

  select count(*) into n from v_lab_tren
   where pasien_id = 'bbbbbbb1-0000-0000-0000-000000000001'
     and lab_id = v_hb and permintaan_id = v_p;
  assert n = 0, 'lembar yang belum ditutup belum boleh muncul di tren';

  perform public.lab_selesaikan(v_p);
  select count(*) into n from v_lab_tren
   where pasien_id = 'bbbbbbb1-0000-0000-0000-000000000001'
     and lab_id = v_hb and permintaan_id = v_p;
  assert n = 1, 'setelah ditutup harus muncul di tren';
end $$;

\echo '--- 22. Antrean lab menghitung yang terisi, yang tak normal, dan yang kritis'
do $$
declare v_p uuid; v_hb uuid; v_gds uuid; r record;
begin
  select id into v_hb  from ref_lab where kode = 'HB';
  select id into v_gds from ref_lab where kode = 'GDS';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb, v_gds]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 6.0 where permintaan_id = v_p and lab_id = v_hb;

  select * into r from v_lab_antrean where id = v_p;
  assert r.jml_pemeriksaan = 2, format('2 pemeriksaan diminta, dapat %s', r.jml_pemeriksaan);
  assert r.jml_terisi = 1,      format('baru 1 terisi, dapat %s', r.jml_terisi);
  assert r.jml_kritis = 1,      format('Hb 6,0 harus terhitung kritis, dapat %s', r.jml_kritis);
  assert r.jml_tak_normal = 1,  format('1 tak normal, dapat %s', r.jml_tak_normal);
  assert r.no_lab like 'LAB-%', format('nomor lembar harus berawalan LAB-, dapat %s', r.no_lab);
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 23. Kasir diberi peringatan bila masih ada lab yang belum selesai'
-- Kunjungan tersendiri, supaya hasilnya tidak bergantung pada sisa
-- permintaan dari pemeriksaan-pemeriksaan sebelumnya di berkas ini.
insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal)
values ('ddddddd1-0000-0000-0000-0000000000C3','UJI-KUNJ-LAB-TUNGGU',
        'bbbbbbb1-0000-0000-0000-000000000001','ccccccc1-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333','UMUM', public.tgl_klinik())
on conflict (id) do nothing;

do $$
declare v_p uuid; v_hb uuid; n int;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C3', array[v_hb]);

  select lab_belum_selesai into n from v_kasir_menunggu_lab
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C3';
  assert n = 1, format('kunjungan dengan lab berjalan harus terdeteksi belum siap ditagih. Dapat %s', n);

  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 14.0 where permintaan_id = v_p;
  perform public.lab_selesaikan(v_p);

  select lab_belum_selesai into n from v_kasir_menunggu_lab
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C3';
  assert n = 0, format('setelah semua selesai harus 0, dapat %s', n);
end $$;

\echo '--- 24. Meminta pemeriksaan = kewenangan dokter; mencatat hasil lab luar = entri data'
do $$
declare v_hb uuid; v_id uuid; berhasil boolean := false;
begin
  select id into v_hb from ref_lab where kode = 'HB';

  -- Perawat tidak boleh MEMINTA pemeriksaan dikerjakan klinik
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  begin
    v_id := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb]);
    berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'perawat tidak boleh meminta pemeriksaan internal';

  -- Tetapi boleh MENCATAT hasil yang datang dari lab luar
  v_id := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb],
                           null, 'EKSTERNAL', 'Lab Prodia');
  assert v_id is not null, 'perawat harus boleh mencatat hasil lab luar';
  perform public.lab_batalkan(v_id, 'pembersihan data uji');

  -- Apoteker tidak boleh keduanya
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
  berhasil := false;
  begin
    v_id := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C1', array[v_hb],
                             null, 'EKSTERNAL', 'Lab Prodia');
    berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'apoteker tidak berurusan dengan hasil laboratorium';
end $$;

\echo '--- 25. Hasil lab luar boleh dicatat tanpa kunjungan, asal pasiennya disebut'
do $$
declare v_hb uuid; v_id uuid; berhasil boolean := false; r lab_permintaan%rowtype;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);

  -- Tanpa kunjungan DAN tanpa pasien: ditolak, karena hasilnya akan
  -- menggantung tanpa pemilik.
  begin
    v_id := public.lab_minta(null, array[v_hb], null, 'EKSTERNAL', 'Lab Luar');
    berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'lembar tanpa kunjungan dan tanpa pasien harus ditolak';

  -- Dengan pasien: diterima, dan tanggalnya boleh mundur ke tanggal
  -- pemeriksaan aslinya.
  v_id := public.lab_minta(null, array[v_hb], 'Dibawa pasien', 'EKSTERNAL',
                           'Lab Prodia', 'bbbbbbb1-0000-0000-0000-000000000001',
                           (public.tgl_klinik() - 30)::date, 'PRO-8891');
  select * into r from lab_permintaan where id = v_id;
  assert r.kunjungan_id is null, 'kunjungan memang sengaja kosong';
  assert r.pasien_id = 'bbbbbbb1-0000-0000-0000-000000000001', 'pasien harus tercatat';
  assert r.tanggal = (public.tgl_klinik() - 30), 'tanggal pemeriksaan asli harus dipakai';
  assert r.no_lembar_luar = 'PRO-8891', 'nomor lembar lab luar harus tersimpan';
  assert r.no_lab like 'LAB-%', 'lembar tetap dapat nomor internal';

  -- Pasien karangan ditolak
  berhasil := false;
  begin
    v_id := public.lab_minta(null, array[v_hb], null, 'EKSTERNAL', 'Lab Luar',
                             gen_random_uuid());
    berhasil := true;
  exception when others then null; end;
  assert not berhasil, 'pasien yang tidak ada harus ditolak';
end $$;

\echo '--- 26. Lembar yang terkunci tidak bisa dibuka lewat tabelnya'
do $$
declare v_p uuid; v_hb uuid; n int;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C3', array[v_hb]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 14.0 where permintaan_id = v_p;
  perform public.lab_selesaikan(v_p);

  -- Jalan memutar: ubah status lembarnya langsung, lalu betulkan angkanya.
  -- Inilah yang membuat penguncian jadi hiasan kalau tabelnya bisa ditulis.
  n := uji_terubah('55555555-5555-5555-5555-555555555555',
        format('update lab_permintaan set status = ''DIKERJAKAN'' where id = %L', v_p));
  assert n = 0, 'perawat tidak boleh mengubah status lembar langsung';
  assert (select status from lab_permintaan where id = v_p) = 'SELESAI',
    'status lembar harus tetap SELESAI';

  -- Dokter pun tidak boleh membuat lembar dengan menulis langsung
  assert uji_ditolak('33333333-3333-3333-3333-333333333333',
    'insert into lab_permintaan (pasien_id, tanggal) values
       (''bbbbbbb1-0000-0000-0000-000000000001'', public.tgl_klinik())'),
    'lembar hanya boleh dibuat lewat fungsi lab_minta()';

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 27. Umur dihitung pada tanggal pemeriksaan, bukan hari ini'
do $$
declare v_p uuid; v_hb uuid; t text; v numeric;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  -- Pasien Anak lahir 3 tahun lalu. Lembar lab luar bertanggal saat ia
  -- masih berumur 3 bulan: rujukan yang benar 10,5-13,5, bukan 11,5-13,5.
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  v_p := public.lab_minta(null, array[v_hb], null, 'EKSTERNAL', 'Lab Luar',
                          'bbbbbbb1-0000-0000-0000-00000000000C',
                          (public.tgl_klinik() - interval '2 years 9 months')::date);
  update lab_hasil set nilai_angka = 11.0 where permintaan_id = v_p;

  select rujukan_bawah, tanda into v, t from lab_hasil where permintaan_id = v_p;
  assert v = 10.5,
    format('umur saat pemeriksaan 3 bulan → rujukan bawah 10,5. Dapat %s', v);
  assert t = 'NORMAL',
    format('Hb 11,0 pada bayi 3 bulan itu normal, bukan %s', t);
end $$;

\echo '--- 28. Nilai rujukan pada lembar lama tidak ikut berubah saat dikoreksi'
do $$
declare v_p uuid; v_ua uuid; v numeric; teks text;
begin
  select id into v_ua from ref_lab where kode = 'UA';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C3', array[v_ua]);
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 6.0 where permintaan_id = v_p;

  -- Klinik ganti reagen; master memperbarui data acuan.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  update ref_lab_rujukan set batas_bawah = 2.0, batas_atas = 9.9
   where lab_id = v_ua and jenis_kelamin = 'L';

  -- Sebulan kemudian ketahuan salah ketik pada lembar lama, lalu dibetulkan.
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 6.1 where permintaan_id = v_p;

  select rujukan_bawah, rujukan_teks into v, teks from lab_hasil where permintaan_id = v_p;
  assert v = 3.4,
    format('koreksi angka tidak boleh menarik rentang alat baru ke lembar lama. Dapat %s', v);
  assert teks = '3.4 - 7.0',
    format('teks rujukan lembar lama harus tetap. Dapat "%s"', teks);

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  update ref_lab_rujukan set batas_bawah = 3.4, batas_atas = 7.0
   where lab_id = v_ua and jenis_kelamin = 'L';
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 29. Lembar naik sendiri dari Diminta ke Dikerjakan saat mulai diisi'
do $$
declare v_p uuid; v_hb uuid; r lab_permintaan%rowtype;
begin
  select id into v_hb from ref_lab where kode = 'HB';
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  v_p := public.lab_minta('ddddddd1-0000-0000-0000-0000000000C3', array[v_hb]);
  assert (select status from lab_permintaan where id = v_p) = 'DIMINTA', 'awalnya DIMINTA';

  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
  update lab_hasil set nilai_angka = 14.0 where permintaan_id = v_p;

  select * into r from lab_permintaan where id = v_p;
  assert r.status = 'DIKERJAKAN', format('harus naik ke DIKERJAKAN, dapat %s', r.status);
  assert r.dikerjakan_oleh = '55555555-5555-5555-5555-555555555555',
    'petugas yang mulai mengisi harus tercatat';

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  perform public.lab_batalkan(v_p, 'pembersihan data uji');
end $$;

\echo '--- 30. Satu foto rontgen tidak ditagih dua kali'
do $$
declare v_t uuid; n int;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  insert into kasir_tarif (jenis, kode_icd9, kode, nama, tarif, berlaku_mulai)
  values ('TINDAKAN','87.12','87.12','Rontgen gigi lainnya', 75000, public.tgl_klinik() - 365)
  on conflict do nothing;

  -- Dokter mencatat tindakan rontgennya DAN menulis bacaannya — dua hal
  -- yang keduanya benar, tetapi hanya boleh menghasilkan satu baris tagihan.
  insert into tindakan (kunjungan_id, kode_icd9, nama, fdi, jumlah, urutan)
  values ('ddddddd1-0000-0000-0000-0000000000C1','87.12','Rontgen gigi lainnya','36', 1, 9);

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
  v_t := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-0000000000C1');

  select count(*) into n from kasir_tagihan_item
   where tagihan_id = v_t and sumber = 'PENUNJANG';
  assert n = 0,
    format('bacaan tidak boleh ditagih lagi kalau tindakannya sudah dicatat. Dapat %s baris', n);

  select count(*) into n from kasir_tagihan_item
   where tagihan_id = v_t and sumber = 'TINDAKAN' and ref_kode = '87.12';
  assert n = 1, 'baris tindakan yang membawa kode ICD-9 yang dipertahankan';

  delete from tindakan where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C1'
    and kode_icd9 = '87.12';
end $$;

drop function uji_ditolak(uuid, text);
drop function uji_terlihat(uuid, text);
drop function uji_terubah(uuid, text);

\echo 'SEMUA UJI PENUNJANG LULUS'

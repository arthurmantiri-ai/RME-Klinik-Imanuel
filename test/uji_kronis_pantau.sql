-- =====================================================================
--  UJI FUNGSIONAL MODUL KRONIS — TAHAP 2 (pemantauan)
--  Dijalankan SETELAH uji_kronis.sql (memakai pegawai & poli dari
--  uji_apotek.sql/uji_penunjang.sql: admin=1111…, apoteker=2222…,
--  dokter=3333…, perawat=5555…, pendaftaran=6666…).
--
--  Yang diuji di sini SENGAJA bukan tampilan (label/warna) — itu ada di
--  uji_kronis_pantau_core.js. Yang diuji di sini adalah FAKTA yang
--  view/fungsi pulangkan: tanggal ambil terakhir yang benar, obat non-
--  kronis yang tidak ikut terhitung, transaksi batal yang tidak ikut
--  terhitung, dan kuota statin yang dihitung sejak tanggal yang benar.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- Helper RLS lokal berkas ini — dibuang lagi di baris terakhir. Setiap
-- berkas uji mendefinisikan salinannya sendiri dan membersihkannya
-- sendiri (lihat uji_kronis.sql, uji_rls.sql): helper ini TIDAK
-- bertahan lintas berkas.
create or replace function ujikp_terlihat(p_user uuid, p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text,''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Persiapan: obat & pasien khusus berkas ini
-- ---------------------------------------------------------------------
insert into obat (id, kode_internal, nama, satuan, harga) values
  ('aaaaaaa2-0000-0000-0000-000000000001','UJIKP-AML','Amlodipine 10 mg','Tablet', 500),
  ('aaaaaaa2-0000-0000-0000-000000000002','UJIKP-MET','Metformin 500 mg','Tablet', 400),
  ('aaaaaaa2-0000-0000-0000-000000000003','UJIKP-ATV','Atorvastatin 20 mg','Tablet', 2500)
on conflict (id) do nothing;

-- Stok awal secukupnya untuk seluruh transaksi keluar di berkas ini.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$
begin
  perform public.apotek_masuk('aaaaaaa2-0000-0000-0000-000000000001', 1000, 500, (public.tgl_klinik() + interval '2 years')::date, 'PBF Uji');
  perform public.apotek_masuk('aaaaaaa2-0000-0000-0000-000000000002', 1000, 400, (public.tgl_klinik() + interval '2 years')::date, 'PBF Uji');
  perform public.apotek_masuk('aaaaaaa2-0000-0000-0000-000000000003', 1000, 2500, (public.tgl_klinik() + interval '2 years')::date, 'PBF Uji');
end $$;

insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin, no_hp) values
  ('bbbbbbb2-0000-0000-0000-000000000001','UJIKP01','Kronis Terkendali',
    (public.tgl_klinik() - interval '55 years')::date, 'L', '081200000001'),
  ('bbbbbbb2-0000-0000-0000-000000000002','UJIKP02','Kronis Asma Saja',
    (public.tgl_klinik() - interval '30 years')::date, 'P', '081200000002'),
  ('bbbbbbb2-0000-0000-0000-000000000003','UJIKP03','Belum Terdaftar Kronis',
    (public.tgl_klinik() - interval '48 years')::date, 'L', '081200000003')
on conflict (id) do nothing;

insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal) values
  ('ddddddd2-0000-0000-0000-000000000001','UJIKP-KUNJ-1','bbbbbbb2-0000-0000-0000-000000000001',
    'ccccccc1-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','BPJS', public.tgl_klinik()),
  ('ddddddd2-0000-0000-0000-000000000002','UJIKP-KUNJ-2','bbbbbbb2-0000-0000-0000-000000000002',
    'ccccccc1-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','BPJS', public.tgl_klinik()),
  ('ddddddd2-0000-0000-0000-000000000003','UJIKP-KUNJ-3','bbbbbbb2-0000-0000-0000-000000000003',
    'ccccccc1-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','BPJS', public.tgl_klinik())
on conflict (id) do nothing;


\echo '--- 1. kronis_tambah_bulan menangani ujung bulan (31 Jan + 1 bulan = akhir Feb)'
do $$
begin
  assert public.kronis_tambah_bulan('2026-01-31', 1) = '2026-02-28',
    'Tahun 2026 bukan kabisat, 31 Jan + 1 bulan harus jadi 28 Feb.';
  assert public.kronis_tambah_bulan('2024-01-31', 1) = '2024-02-29',
    '2024 kabisat, harus jadi 29 Feb.';
  assert public.kronis_tambah_bulan('2026-05-10', 3) = '2026-08-10', 'Tambah 3 bulan biasa.';
end $$;


\echo '--- 2. Mendaftarkan buku kronis: minimal satu diagnosis wajib'
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
do $$
begin
  begin
    perform public.kronis_daftar_simpan('bbbbbbb2-0000-0000-0000-000000000001', '{}');
    assert false, 'Harus ditolak: diagnosa kosong.';
  exception when others then
    assert sqlerrm ilike '%minimal satu%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
end $$;


\echo '--- 3. Bukan dokter/perawat/admin tidak boleh mendaftarkan buku kronis'
do $$
begin
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', true); -- kasir
  set local role authenticated;
  begin
    perform public.kronis_daftar_simpan('bbbbbbb2-0000-0000-0000-000000000001', array['HPT']);
    assert false, 'Kasir tidak boleh mendaftarkan buku kronis.';
  exception when others then null;
  end;
  reset role;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);


\echo '--- 4. Mendaftarkan pasien DM+HPT dengan obat rutin dan statin'
do $$
declare v_terapi uuid;
begin
  v_terapi := public.kronis_daftar_simpan(
    p_pasien_id => 'bbbbbbb2-0000-0000-0000-000000000001',
    p_diagnosa  => array['DM','HPT'],
    p_obat      => jsonb_build_array(
                     jsonb_build_object('obat_id','aaaaaaa2-0000-0000-0000-000000000001',
                                        'nama_obat','Amlodipine 10 mg','signa','1x1'),
                     jsonb_build_object('obat_id','aaaaaaa2-0000-0000-0000-000000000002',
                                        'nama_obat','Metformin 500 mg','signa','2x1')),
    p_statin_kunci => 'atorvastatin',
    p_statin_obat_id => 'aaaaaaa2-0000-0000-0000-000000000003',
    p_statin_nama => 'Atorvastatin 20 mg',
    p_statin_tgl_lab => (public.tgl_klinik() - interval '40 days')::date);
  assert v_terapi is not null, 'Harus memulangkan id terapi.';
  assert (select array_agg(kode order by kode) from kronis_terapi_diagnosa where terapi_id = v_terapi)
         = array['DM','HPT'], 'Diagnosa harus DM dan HPT.';
  assert (select count(*) from kronis_obat where terapi_id = v_terapi) = 2,
    'Harus ada dua obat rutin.';
end $$;

\echo '--- 5. Mendaftar ulang MENGGANTI SET diagnosa & obat, bukan menambah'
do $$
declare v_terapi uuid;
begin
  v_terapi := (select id from kronis_terapi where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001' and aktif);
  perform public.kronis_daftar_simpan(
    p_pasien_id => 'bbbbbbb2-0000-0000-0000-000000000001',
    p_diagnosa  => array['DM'],   -- HPT dilepas
    p_obat      => jsonb_build_array(
                     jsonb_build_object('obat_id','aaaaaaa2-0000-0000-0000-000000000002',
                                        'nama_obat','Metformin 500 mg','signa','2x1')),
    p_statin_kunci => 'atorvastatin',
    p_statin_obat_id => 'aaaaaaa2-0000-0000-0000-000000000003',
    p_statin_nama => 'Atorvastatin 20 mg',
    p_statin_tgl_lab => (public.tgl_klinik() - interval '40 days')::date);
  assert (select id from kronis_terapi where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001' and aktif) = v_terapi,
    'Baris terapi yang sama dipakai lagi, bukan baris baru.';
  assert public.kronis_diagnosa_pasien('bbbbbbb2-0000-0000-0000-000000000001') = array['DM'],
    'HPT harus sudah lepas, tersisa DM saja.';
  assert (select count(*) from kronis_obat where terapi_id = v_terapi) = 1,
    'Obat harus tersisa satu (Amlodipine dilepas).';
  -- Kembalikan ke DM+HPT untuk uji-uji berikutnya.
  perform public.kronis_daftar_simpan(
    p_pasien_id => 'bbbbbbb2-0000-0000-0000-000000000001',
    p_diagnosa  => array['DM','HPT'],
    p_obat      => jsonb_build_array(
                     jsonb_build_object('obat_id','aaaaaaa2-0000-0000-0000-000000000001',
                                        'nama_obat','Amlodipine 10 mg','signa','1x1'),
                     jsonb_build_object('obat_id','aaaaaaa2-0000-0000-0000-000000000002',
                                        'nama_obat','Metformin 500 mg','signa','2x1')),
    p_statin_kunci => 'atorvastatin',
    p_statin_obat_id => 'aaaaaaa2-0000-0000-0000-000000000003',
    p_statin_nama => 'Atorvastatin 20 mg',
    p_statin_tgl_lab => (public.tgl_klinik() - interval '40 days')::date);
end $$;

\echo '--- 6. Obat berkuota yang tidak dikenal ditolak'
do $$
begin
  begin
    perform public.kronis_daftar_simpan('bbbbbbb2-0000-0000-0000-000000000002',
      array['ASMA'], '[]'::jsonb, 'obat-ngasal');
    assert false, 'Harus ditolak: kunci statin tidak dikenal.';
  exception when others then
    assert sqlerrm ilike '%tidak dikenal%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
end $$;

-- Pasien kedua: ASMA saja (tidak ada jatah lab).
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false); -- perawat
do $$
begin
  perform public.kronis_daftar_simpan('bbbbbbb2-0000-0000-0000-000000000002', array['ASMA']);
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);


\echo '--- 7. "Belum ambil obat": obat lain (parasetamol) TIDAK dianggap sudah ambil'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$
begin
  -- Amoxicillin/Paracetamol dari fixture uji_apotek.sql — bukan obat kronis pasien ini.
  perform public.apotek_keluar(
    p_obat_id => 'aaaaaaa1-0000-0000-0000-000000000002',   -- Paracetamol
    p_jumlah => 10, p_kategori => 'Resep Pasien',
    p_tanggal => public.tgl_klinik(),
    p_kunjungan_id => 'ddddddd2-0000-0000-0000-000000000001');
end $$;

do $$
declare v_terakhir date;
begin
  v_terakhir := public.kronis_terakhir_ambil('bbbbbbb2-0000-0000-0000-000000000001');
  assert v_terakhir is null,
    format('Parasetamol bukan obat kronisnya, terakhir_ambil harus tetap NULL, dapat %s', v_terakhir);
end $$;


\echo '--- 8. Mengambil Metformin (obat kronis terdaftar) tercatat sebagai "sudah ambil"'
do $$
begin
  perform public.apotek_keluar(
    p_obat_id => 'aaaaaaa2-0000-0000-0000-000000000002',   -- Metformin, terdaftar
    p_jumlah => 30, p_kategori => 'Resep Pasien',
    p_tanggal => public.tgl_klinik(),
    p_kunjungan_id => 'ddddddd2-0000-0000-0000-000000000001');
end $$;
do $$
begin
  assert public.kronis_terakhir_ambil('bbbbbbb2-0000-0000-0000-000000000001') = public.tgl_klinik(),
    'Metformin adalah obat kronis terdaftar, harus tercatat sebagai terakhir_ambil hari ini.';
end $$;


\echo '--- 9. v_kronis_obat_bulan_ini: bulan_ini_ambil benar, dan ASMA tetap dipantau obatnya'
do $$
declare r record;
begin
  select * into r from v_kronis_obat_bulan_ini where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001';
  assert found, 'Pasien DM+HPT harus muncul di pemantauan obat.';
  assert r.bulan_ini_ambil, 'Sudah ambil Metformin hari ini, bulan_ini_ambil harus true.';
  assert r.bulan_tertinggal = 0, 'Baru ambil bulan ini, bulan_tertinggal harus 0.';

  select * into r from v_kronis_obat_bulan_ini where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000002';
  assert found, 'Pasien ASMA-saja tetap harus dipantau obatnya (pantau_obat=true untuk semua diagnosa dasar).';
  assert not r.bulan_ini_ambil and r.terakhir_ambil is null,
    'Pasien ASMA belum pernah mengambil apa pun di RME.';
end $$;


\echo '--- 10. Pembatalan transaksi membuatnya TIDAK ikut terhitung lagi'
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false); -- dokter
do $$
begin
  perform public.kronis_daftar_simpan('bbbbbbb2-0000-0000-0000-000000000003', array['HPT'],
    jsonb_build_array(jsonb_build_object('obat_id','aaaaaaa2-0000-0000-0000-000000000001',
                                          'nama_obat','Amlodipine 10 mg')));
end $$;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false); -- apoteker
do $$
declare v_grup uuid;
begin
  select (public.apotek_keluar(
    p_obat_id => 'aaaaaaa2-0000-0000-0000-000000000001',
    p_jumlah => 10, p_kategori => 'Resep Pasien',
    p_tanggal => public.tgl_klinik(),
    p_kunjungan_id => 'ddddddd2-0000-0000-0000-000000000003')->>'grup_id')::uuid into v_grup;

  assert public.kronis_terakhir_ambil('bbbbbbb2-0000-0000-0000-000000000003') = public.tgl_klinik(),
    'Sebelum dibatalkan, harus tercatat sudah ambil hari ini.';

  perform public.apotek_batalkan_grup(v_grup, 'uji pembatalan');
  assert public.kronis_terakhir_ambil('bbbbbbb2-0000-0000-0000-000000000003') is null,
    'Setelah dibatalkan, transaksi ini tidak boleh ikut terhitung lagi.';
end $$;


\echo '--- 11. Jadwal & kepatuhan lab: DM+HPT memakai interval TERKETAT (3 bulan), ASMA tidak muncul'
do $$
declare r record;
begin
  select * into r from v_kronis_lab_jadwal where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001';
  assert found, 'Pasien DM+HPT harus muncul di jadwal lab.';
  assert r.interval_bulan = 3, format('Interval harus 3 (DM lebih ketat dari HPT), dapat %s', r.interval_bulan);
  assert r.terakhir_lab is null, 'Belum pernah periksa lab sama sekali.';
  assert r.jadwal_berikutnya = public.kronis_tambah_bulan(r.tanggal_mulai, 3),
    'Tanpa riwayat lab, jadwal dihitung dari tanggal_mulai pendaftaran.';

  assert not exists (select 1 from v_kronis_lab_jadwal where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000002'),
    'Pasien ASMA-saja tidak boleh muncul di jadwal lab — tidak ada jatah lab untuknya.';
end $$;


\echo '--- 12. Hasil lab yang RELEVAN mereset jadwal; yang TIDAK relevan (portal LAB apa pun dihitung, tapi lab RME harus lewat ref_kronis_lab)'
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false); -- dokter
do $$
declare v_p uuid; v_gdp uuid; v_hb uuid;
begin
  select id into v_gdp from ref_lab where kode = 'GDP';
  select id into v_hb  from ref_lab where kode = 'HB';   -- bukan bagian ref_kronis_lab DM/HPT

  -- Lembar TIDAK relevan (Hb saja) — tidak boleh mereset jadwal.
  v_p := public.lab_minta(null, array[v_hb], p_pasien_id => 'bbbbbbb2-0000-0000-0000-000000000001',
                           p_tanggal => (public.tgl_klinik() - interval '5 days')::date);
  update lab_hasil set nilai_angka = 13.0 where permintaan_id = v_p;
  perform public.lab_selesaikan(v_p);
  assert public.kronis_terakhir_lab('bbbbbbb2-0000-0000-0000-000000000001') is null,
    'Hb bukan bagian ref_kronis_lab untuk DM/HPT, tidak boleh mereset jadwal.';

  -- Lembar RELEVAN (GDP, bagian pemantauan DM) — harus mereset.
  v_p := public.lab_minta(null, array[v_gdp], p_pasien_id => 'bbbbbbb2-0000-0000-0000-000000000001',
                           p_tanggal => (public.tgl_klinik() - interval '3 days')::date);
  update lab_hasil set nilai_angka = 95 where permintaan_id = v_p;
  perform public.lab_selesaikan(v_p);
  assert public.kronis_terakhir_lab('bbbbbbb2-0000-0000-0000-000000000001')
         = (public.tgl_klinik() - interval '3 days')::date,
    'GDP relevan untuk DM, harus jadi tanggal lab terakhir.';
end $$;


\echo '--- 13. Kuota statin: hanya dihitung SEJAK tanggal LDL terbaru, bukan sejak awal'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false); -- apoteker
do $$
begin
  -- Penebusan SEBELUM statin_tgl_lab (40 hari lalu) — tidak boleh terhitung.
  perform public.apotek_keluar(
    p_obat_id => 'aaaaaaa2-0000-0000-0000-000000000003', p_jumlah => 30,
    p_kategori => 'Resep Pasien', p_tanggal => (public.tgl_klinik() - interval '50 days')::date,
    p_kunjungan_id => 'ddddddd2-0000-0000-0000-000000000001');
  -- Dua penebusan SESUDAHNYA — harus terhitung.
  perform public.apotek_keluar(
    p_obat_id => 'aaaaaaa2-0000-0000-0000-000000000003', p_jumlah => 30,
    p_kategori => 'Resep Pasien', p_tanggal => (public.tgl_klinik() - interval '30 days')::date,
    p_kunjungan_id => 'ddddddd2-0000-0000-0000-000000000001');
  perform public.apotek_keluar(
    p_obat_id => 'aaaaaaa2-0000-0000-0000-000000000003', p_jumlah => 30,
    p_kategori => 'Resep Pasien', p_tanggal => (public.tgl_klinik() - interval '2 days')::date,
    p_kunjungan_id => 'ddddddd2-0000-0000-0000-000000000001');
end $$;
do $$
declare r record;
begin
  select * into r from v_kronis_statin where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001';
  assert found, 'Pasien dengan statin terdaftar harus muncul di v_kronis_statin.';
  assert r.terpakai = 2,
    format('Hanya 2 penebusan SESUDAH tgl_dasar yang boleh terhitung, dapat %s', r.terpakai);
  assert r.maks = 3, 'Atorvastatin maksimal 3 kali.';
end $$;

\echo '--- 14. Hasil LDL baru menggeser tgl_dasar kuota statin (bukan lagi tanggal migrasi)'
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false); -- dokter
do $$
declare v_p uuid; v_ldl uuid;
begin
  select id into v_ldl from ref_lab where kode = 'LDL';
  v_p := public.lab_minta(null, array[v_ldl], p_pasien_id => 'bbbbbbb2-0000-0000-0000-000000000001',
                           p_tanggal => (public.tgl_klinik() - interval '1 days')::date);
  update lab_hasil set nilai_angka = 110 where permintaan_id = v_p;
  perform public.lab_selesaikan(v_p);
end $$;
do $$
declare r record;
begin
  select * into r from v_kronis_statin where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001';
  assert r.tgl_dasar = (public.tgl_klinik() - interval '1 days')::date,
    'LDL baru harus menjadi tgl_dasar, menggantikan tanggal migrasi.';
  assert r.terpakai = 0,
    format('Ketiga penebusan sebelumnya semuanya SEBELUM LDL baru, terpakai harus reset ke 0, dapat %s', r.terpakai);
end $$;


\echo '--- 15. Peringatan H-3: tepat 1 bulan sejak ambil terakhir = belum boleh, H-3 = boleh'
do $$
declare v jsonb;
begin
  v := public.kronis_h3_cek('bbbbbbb2-0000-0000-0000-000000000001');
  assert v is not null, 'Pasien terdaftar kronis harus memulangkan hasil, bukan null.';
  assert (v->>'jadwal_berikutnya')::date = public.kronis_tambah_bulan(public.tgl_klinik(), 1),
    'Ambil terakhir hari ini (Metformin), jadwal berikutnya = hari ini + 1 bulan.';
  assert (v->>'hari_menuju_jadwal')::int > 3,
    'Baru saja ambil, jauh dari jadwal — harus dianggap terlalu cepat kalau ambil lagi sekarang.';

  -- Pasien tanpa pendaftaran kronis aktif: harus null, bukan galat.
  -- (bbbbbbb1-…-001 = "Pasien Uji" dari fixture uji_apotek.sql — tidak
  -- pernah disentuh modul kronis mana pun.)
  assert public.kronis_h3_cek('bbbbbbb1-0000-0000-0000-000000000001') is null,
    'Pasien tanpa buku kronis aktif harus memulangkan null.';
end $$;


\echo '--- 16. Usulan diagnosa dari kode ICD-10 mengenali awalan, bukan kode penuh'
do $$
declare v_kode text[];
begin
  -- I10 = Hipertensi esensial (primer) — awalan HPT ref_kronis_diagnosa.
  -- Pasien 2 terdaftar ASMA saja, belum HPT — harus diusulkan.
  select array_agg(kode order by kode) into v_kode
    from public.kronis_usulan_diagnosa('bbbbbbb2-0000-0000-0000-000000000002', array['I10']);
  assert v_kode @> array['HPT'], format('I10 harus mengusulkan HPT, dapat %s', v_kode);

  -- Pasien 1 sudah terdaftar HPT — tidak boleh diusulkan ULANG.
  select array_agg(kode order by kode) into v_kode
    from public.kronis_usulan_diagnosa('bbbbbbb2-0000-0000-0000-000000000001', array['I10']);
  assert v_kode is null or not (v_kode @> array['HPT']),
    'HPT sudah terdaftar aktif untuk pasien ini, tidak boleh diusulkan lagi.';

  -- Kode yang tidak dikenal awalannya tidak mengusulkan apa pun.
  select array_agg(kode order by kode) into v_kode
    from public.kronis_usulan_diagnosa('bbbbbbb2-0000-0000-0000-000000000002', array['Z00']);
  assert v_kode is null, 'Kode pemeriksaan umum (Z00) tidak boleh mengusulkan diagnosis kronis apa pun.';
end $$;


\echo '--- 17. Menghentikan pendaftaran: riwayat tetap ada, tidak boleh diselesaikan dua kali'
do $$
declare v_terapi uuid;
begin
  v_terapi := (select id from kronis_terapi where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000003' and aktif);
  perform public.kronis_terapi_selesai(v_terapi, 'Uji selesai');
  assert not exists (select 1 from kronis_terapi where id = v_terapi and aktif),
    'Harus tidak aktif lagi.';
  assert exists (select 1 from kronis_terapi where id = v_terapi and tanggal_selesai = public.tgl_klinik()
                 and alasan_selesai = 'Uji selesai'),
    'Riwayat alasan & tanggal selesai harus tersimpan.';
  begin
    perform public.kronis_terapi_selesai(v_terapi, 'Uji selesai lagi');
    assert false, 'Tidak boleh menyelesaikan pendaftaran yang sudah tidak aktif.';
  exception when others then null;
  end;
  assert not exists (select 1 from v_kronis_obat_bulan_ini where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000003'),
    'Pasien yang pendaftarannya sudah selesai tidak boleh lagi muncul di pemantauan.';
end $$;


\echo '--- 18. Daftar telepon H-1: hanya kontrol BESOK yang muncul, bukan hari ini atau lusa'
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
do $$
begin
  insert into pemeriksaan (kunjungan_id, tindak_lanjut, tanggal_kontrol, kontrol_instruksi)
  values ('ddddddd2-0000-0000-0000-000000000001', 'KONTROL',
          public.tgl_klinik() + 1, 'Puasa 10 jam sebelum datang')
  on conflict (kunjungan_id) do update
     set tindak_lanjut = 'KONTROL', tanggal_kontrol = excluded.tanggal_kontrol,
         kontrol_instruksi = excluded.kontrol_instruksi;

  insert into pemeriksaan (kunjungan_id, tindak_lanjut, tanggal_kontrol)
  values ('ddddddd2-0000-0000-0000-000000000002', 'KONTROL', public.tgl_klinik())
  on conflict (kunjungan_id) do update
     set tindak_lanjut = 'KONTROL', tanggal_kontrol = excluded.tanggal_kontrol;

  insert into pemeriksaan (kunjungan_id, tindak_lanjut, tanggal_kontrol)
  values ('ddddddd2-0000-0000-0000-000000000003', 'KONTROL', public.tgl_klinik() + 2)
  on conflict (kunjungan_id) do update
     set tindak_lanjut = 'KONTROL', tanggal_kontrol = excluded.tanggal_kontrol;
end $$;
do $$
declare r record;
begin
  assert (select count(*) from v_kronis_telpon_h1
           where pasien_id in ('bbbbbbb2-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002',
                                'bbbbbbb2-0000-0000-0000-000000000003')) = 1,
    'Hanya satu dari ketiganya yang jadwal kontrolnya persis besok.';
  select * into r from v_kronis_telpon_h1 where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001';
  assert found and r.kontrol_instruksi = 'Puasa 10 jam sebelum datang',
    'Instruksi petugas harus ikut terbawa ke daftar telepon.';
end $$;


\echo '--- 19. v_kronis_pasien merangkum terapi, diagnosa, dan obat dalam satu baris'
do $$
declare r record;
begin
  select * into r from v_kronis_pasien where pasien_id = 'bbbbbbb2-0000-0000-0000-000000000001';
  assert found, 'Pasien 1 masih aktif, harus muncul.';
  assert r.diagnosa = array['DM','HPT'], 'Diagnosa harus DM dan HPT.';
  assert jsonb_array_length(r.obat) = 2, 'Harus dua obat rutin.';
  assert r.statin_kunci = 'atorvastatin', 'Statin harus ikut terbawa.';
end $$;


\echo '--- 20. Tabel & view baru terbaca sebagai authenticated, bukan hanya superuser'
-- set local role di dalam SATU pernyataan top-level (blok do ini) supaya
-- benar-benar berlaku — dipisah jadi pernyataan top-level sendiri-sendiri
-- (seperti draf awal berkas ini) diam-diam TIDAK berlaku sama sekali:
-- setiap pernyataan top-level yang dikirim psql adalah transaksinya
-- sendiri, dan "set local" mati begitu transaksi itu selesai. Memakai
-- helper ujik_terlihat() (dari uji_kronis.sql) yang membungkus
-- set_config + set local role + execute + reset role dalam satu
-- pemanggilan fungsi menghindari jebakan ini sama sekali.
do $$
declare v text;
begin
  foreach v in array array['v_kronis_obat_bulan_ini','v_kronis_lab_jadwal','v_kronis_statin',
                            'v_kronis_telpon_h1','v_kronis_pasien']
  loop
    perform ujikp_terlihat('33333333-3333-3333-3333-333333333333',
      format('select count(*) from %I', v));
  end loop;
end $$;

drop function if exists ujikp_terlihat(uuid, text);

\echo 'SEMUA UJI KRONIS PANTAU LULUS'

-- =====================================================================
--  UJI PEMISAHAN KOLAM STOK (17_apotek_kolam.sql)
--  Dijalankan dengan psql -v ON_ERROR_STOP=1, setelah uji_apotek.sql dan
--  setelah skema 16_kronis.sql terpasang.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Persiapan: obat, pasien, kunjungan, resep — prefiks UUID 0ba0000x
-- supaya tidak bentrok dengan berkas uji lain.
-- ---------------------------------------------------------------------
insert into obat (id, kode_internal, nama, satuan, harga) values
  ('0ba00001-0000-0000-0000-000000000001','UJIK-AML','Amlodipine 5 mg','Tablet', 500),
  ('0ba00001-0000-0000-0000-000000000002','UJIK-VIT','Vitamin C 500 mg','Tablet', 300)
on conflict (id) do nothing;

insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin) values
  ('0ba00002-0000-0000-0000-000000000001','UJIK001','Pasien Kronis Uji','1970-01-01','P'),
  ('0ba00002-0000-0000-0000-000000000002','UJIK002','Pasien Biasa Uji','1985-06-06','L')
on conflict (id) do nothing;

insert into poli (id, kode, nama) values
  ('0ba00003-0000-0000-0000-000000000001','UJIKPOLI','Poli Uji Kolam')
on conflict (kode) do nothing;

insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal) values
  ('0ba00004-0000-0000-0000-000000000001','UJIK-KUNJ-1',
   '0ba00002-0000-0000-0000-000000000001','0ba00003-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333','UMUM', public.tgl_klinik()),
  ('0ba00004-0000-0000-0000-000000000002','UJIK-KUNJ-2',
   '0ba00002-0000-0000-0000-000000000002','0ba00003-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333','UMUM', public.tgl_klinik())
on conflict (id) do nothing;

insert into resep (id, kunjungan_id, no_resep, dibuat_oleh) values
  ('0ba00005-0000-0000-0000-000000000001','0ba00004-0000-0000-0000-000000000001',
   'UJIK-R-1','33333333-3333-3333-3333-333333333333'),
  ('0ba00005-0000-0000-0000-000000000002','0ba00004-0000-0000-0000-000000000002',
   'UJIK-R-2','33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

-- Resep 1 (pasien kronis): Amlodipine — bagian dari terapi kronisnya.
-- Resep 2 (pasien biasa): Amlodipine juga, tapi pasiennya TIDAK terdaftar
-- kronis — inilah yang membuktikan preferensi kolamnya bukan soal nama
-- obat, melainkan soal pasiennya.
insert into resep_item (id, resep_id, obat_id, nama_obat, jumlah, satuan, signa, urutan) values
  ('0ba00006-0000-0000-0000-000000000001','0ba00005-0000-0000-0000-000000000001',
   '0ba00001-0000-0000-0000-000000000001','Amlodipine 5 mg', 10,'Tablet','1x1', 0),
  ('0ba00006-0000-0000-0000-000000000002','0ba00005-0000-0000-0000-000000000002',
   '0ba00001-0000-0000-0000-000000000001','Amlodipine 5 mg', 10,'Tablet','1x1', 0)
on conflict (id) do nothing;

-- Pendaftaran buku kronis pasien 1, sebagai admin (boleh_kronis_kelola()).
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
do $$
declare v_terapi uuid;
begin
  select id into v_terapi from kronis_terapi
   where pasien_id = '0ba00002-0000-0000-0000-000000000001' and aktif;
  if v_terapi is null then
    insert into kronis_terapi (pasien_id, aktif, catatan)
    values ('0ba00002-0000-0000-0000-000000000001', true, 'Uji kolam')
    returning id into v_terapi;
    insert into kronis_terapi_diagnosa (terapi_id, kode) values (v_terapi, 'HPT');
    insert into kronis_obat (terapi_id, obat_id, nama_obat, urutan)
    values (v_terapi, '0ba00001-0000-0000-0000-000000000001', 'Amlodipine 5 mg', 0);
  end if;
end $$;

-- Berlagak jadi apoteker untuk seluruh pengujian di bawah.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);

\echo '--- 1. Bawaan tetap reguler kalau kolam tidak disebut'
do $$
declare h jsonb; k text;
begin
  h := public.apotek_masuk('0ba00001-0000-0000-0000-000000000002', 100, 300,
        public.tgl_klinik() + 300, 'PBF Vitamin', 'FKV-001');
  assert (h->>'kolam') = 'reguler', format('bawaan harus reguler, dapat %s', h->>'kolam');
  select kolam into k from apotek_batch where id = (h->>'batch_id')::uuid;
  assert k = 'reguler', 'kolom kolam di batch harus reguler';
end $$;

\echo '--- 2. Batch identik di kolam berbeda TIDAK digabung'
do $$
declare h1 jsonb; h2 jsonb; n int;
begin
  h1 := public.apotek_masuk('0ba00001-0000-0000-0000-000000000001', 60, 500,
         public.tgl_klinik() + 200, 'PBF Sama', 'FK-KOL-1', null, null, null, 'Pembelian', 'reguler');
  h2 := public.apotek_masuk('0ba00001-0000-0000-0000-000000000001', 40, 500,
         public.tgl_klinik() + 200, 'PBF Sama', 'FK-KOL-1', null, null, null, 'Pembelian', 'kronis');
  assert (h1->>'digabung')::boolean = false, 'batch pertama tidak boleh digabung';
  assert (h2->>'digabung')::boolean = false,
    'batch kolam berbeda tidak boleh digabung walau faktur/pbf/harga/expired sama persis';
  select count(*) into n from apotek_batch
   where obat_id = '0ba00001-0000-0000-0000-000000000001' and no_faktur = 'FK-KOL-1';
  assert n = 2, format('harus ada 2 batch terpisah (satu per kolam), ada %s', n);
end $$;

\echo '--- 3. Kolam tidak dikenal ditolak'
do $$
declare gagal boolean := false;
begin
  begin
    perform public.apotek_masuk('0ba00001-0000-0000-0000-000000000001', 10, 500,
      public.tgl_klinik() + 200, 'PBF X', null, null, null, null, 'Pembelian', 'entah');
  exception when others then gagal := true;
  end;
  assert gagal, 'kolam yang tidak dikenal harus ditolak';
end $$;

\echo '--- 4. FEFO tetap jalan DI DALAM kolam yang disukai, bukan asal ambil kolam itu'
-- Batch kronis kedua, kadaluwarsa lebih dekat dari batch kronis pertama.
do $$
declare h jsonb; sisa_dekat numeric; sisa_jauh numeric;
begin
  h := public.apotek_masuk('0ba00001-0000-0000-0000-000000000001', 20, 500,
        public.tgl_klinik() + 50, 'PBF Sama', 'FK-KOL-2', null, null, null, 'Pembelian', 'kronis');
  -- Total kolam kronis sekarang: 40 (FK-KOL-1, exp +200) + 20 (FK-KOL-2, exp +50).
  h := public.apotek_keluar('0ba00001-0000-0000-0000-000000000001', 15, 'Penjualan Bebas',
        null, null, null, null, null, 'kronis');
  select stok_sisa into sisa_dekat from apotek_batch where no_faktur = 'FK-KOL-2';
  select stok_sisa into sisa_jauh  from apotek_batch
   where no_faktur = 'FK-KOL-1' and kolam = 'kronis';
  assert sisa_dekat = 5,  format('batch kronis kadaluwarsa terdekat harus terpotong dulu, sisa %s', sisa_dekat);
  assert sisa_jauh  = 40, format('batch kronis kadaluwarsa jauh tidak boleh tersentuh, sisa %s', sisa_jauh);
end $$;

\echo '--- 5. Kolam yang disukai kosong TIDAK menolak — menyeberang ke kolam lain'
do $$
declare h jsonb; p jsonb; sisa_reguler_dekat numeric; sisa_reguler_jauh numeric;
begin
  -- Kolam kronis tersisa 5 (FK-KOL-2) + 40 (FK-KOL-1/kronis) = 45.
  -- Kolam reguler: FK-KOL-1/reguler (60, exp+200) — dibuat di uji 2 — dan
  -- batch baru FK-KOL-3 (30, exp+400) yang expired-nya lebih jauh, supaya
  -- kalau yang terpotong justru FK-KOL-1/reguler, itu pasti FEFO di dalam
  -- kolam reguler yang bekerja, bukan kebetulan urutan pembuatan batch.
  h := public.apotek_masuk('0ba00001-0000-0000-0000-000000000001', 30, 450,
        public.tgl_klinik() + 400, 'PBF Reguler', 'FK-KOL-3', null, null, null, 'Pembelian', 'reguler');
  h := public.apotek_keluar('0ba00001-0000-0000-0000-000000000001', 50, 'Penjualan Bebas',
        null, null, null, null, null, 'kronis');
  p := h->'potongan';
  assert jsonb_array_length(p) = 3,
    format('harus terpecah 3 batch (2 kronis + 1 reguler), dapat %s', jsonb_array_length(p));
  assert (p->2->>'kolam') = 'reguler',
    format('potongan terakhir harus dari kolam reguler (menyeberang), dapat %s', p->2->>'kolam');
  select stok_sisa into sisa_reguler_dekat from apotek_batch
   where no_faktur = 'FK-KOL-1' and kolam = 'reguler';
  select stok_sisa into sisa_reguler_jauh from apotek_batch where no_faktur = 'FK-KOL-3';
  assert sisa_reguler_dekat = 55,
    format('batch reguler expired terdekat yang harus terpotong 5 (60-5), sisa %s', sisa_reguler_dekat);
  assert sisa_reguler_jauh = 30,
    format('batch reguler expired lebih jauh tidak boleh tersentuh selama yang terdekat masih ada, sisa %s', sisa_reguler_jauh);
end $$;

\echo '--- 6. apotek_transaksi.kolam mencatat kolam yang BENAR-BENAR terpotong'
do $$
declare n_kronis int; n_reguler int;
begin
  select count(*) into n_kronis  from apotek_transaksi
   where obat_id = '0ba00001-0000-0000-0000-000000000001' and jenis = 'KELUAR' and kolam = 'kronis';
  select count(*) into n_reguler from apotek_transaksi
   where obat_id = '0ba00001-0000-0000-0000-000000000001' and jenis = 'KELUAR' and kolam = 'reguler';
  assert n_kronis = 3,  format('harus ada 3 baris keluar tercatat kolam kronis (uji 4 & 5), ada %s', n_kronis);
  assert n_reguler = 1, format('harus ada 1 baris keluar tercatat kolam reguler (menyeberang di uji 5), ada %s', n_reguler);
end $$;

\echo '--- 7. kronis_kolam_resep_item(): ya untuk pasien+obat terdaftar, tidak untuk lainnya'
do $$
begin
  assert public.kronis_kolam_resep_item(
    '0ba00002-0000-0000-0000-000000000001', '0ba00001-0000-0000-0000-000000000001') = 'kronis',
    'pasien dengan terapi kronis aktif dan obat yang terdaftar harus kolam kronis';
  assert public.kronis_kolam_resep_item(
    '0ba00002-0000-0000-0000-000000000002', '0ba00001-0000-0000-0000-000000000001') = 'reguler',
    'pasien TANPA terapi kronis harus reguler walau obatnya sama';
  assert public.kronis_kolam_resep_item(
    '0ba00002-0000-0000-0000-000000000001', '0ba00001-0000-0000-0000-000000000002') = 'reguler',
    'obat yang bukan bagian resep tetapnya harus reguler walau pasiennya kronis';
end $$;

\echo '--- 8. apotek_serahkan_resep() otomatis memilih kolam TANPA apoteker menyebutkannya'
do $$
declare h jsonb; b_kronis uuid; b_reguler uuid;
begin
  -- Batch baru untuk uji resep: kronis EXPIRED LEBIH JAUH dari reguler,
  -- supaya kalau yang terpilih kolam kronis, itu pasti karena preferensi
  -- pasien — bukan kebetulan FEFO polos.
  h := public.apotek_masuk('0ba00001-0000-0000-0000-000000000001', 100, 500,
        public.tgl_klinik() + 500, 'PBF Resep', 'FK-KOL-R1', null, null, null, 'Pembelian', 'kronis');
  b_kronis := (h->>'batch_id')::uuid;
  h := public.apotek_masuk('0ba00001-0000-0000-0000-000000000001', 100, 500,
        public.tgl_klinik() + 10, 'PBF Resep', 'FK-KOL-R2', null, null, null, 'Pembelian', 'reguler');
  b_reguler := (h->>'batch_id')::uuid;

  -- Resep pasien KRONIS: harus ambil dari batch kronis walau expired-nya
  -- jauh lebih lama dari batch reguler yang tersedia.
  h := public.apotek_serahkan_resep('0ba00005-0000-0000-0000-000000000001',
        jsonb_build_array(jsonb_build_object(
          'resep_item_id','0ba00006-0000-0000-0000-000000000001','jumlah',10)));
  assert ((h->'rincian')->0->>'kolam') = 'kronis',
    format('resep pasien kronis harus dicatat kolam kronis, dapat %s', (h->'rincian')->0->>'kolam');

  -- Resep pasien BIASA, obat sama: harus tetap ambil dari reguler
  -- (FEFO normal — batch reguler memang expired lebih dekat).
  h := public.apotek_serahkan_resep('0ba00005-0000-0000-0000-000000000002',
        jsonb_build_array(jsonb_build_object(
          'resep_item_id','0ba00006-0000-0000-0000-000000000002','jumlah',10)));
  assert ((h->'rincian')->0->>'kolam') = 'reguler',
    format('resep pasien biasa harus dicatat kolam reguler, dapat %s', (h->'rincian')->0->>'kolam');
end $$;

\echo '--- 9. apotek_impor(): kolam per baris, kosong = reguler, tidak dikenal ditolak'
do $$
declare h jsonb; n_kronis int; n_reguler int; gagal boolean := false;
begin
  h := public.apotek_impor(jsonb_build_array(
    jsonb_build_object('obat_id','0ba00001-0000-0000-0000-000000000002',
      'jumlah',50,'harga_beli',300,'tgl_expired',(public.tgl_klinik()+300)::text,
      'pbf','PBF Impor','no_faktur','FK-IMP-KOL-1','kolam','Kronis'),
    jsonb_build_object('obat_id','0ba00001-0000-0000-0000-000000000002',
      'jumlah',30,'harga_beli',300,'tgl_expired',(public.tgl_klinik()+300)::text,
      'pbf','PBF Impor','no_faktur','FK-IMP-KOL-2')
  ), 'Pembelian');
  assert (h->>'baris')::int = 2, 'kedua baris harus terproses';

  select count(*) into n_kronis from apotek_batch
   where no_faktur = 'FK-IMP-KOL-1' and kolam = 'kronis';
  select count(*) into n_reguler from apotek_batch
   where no_faktur = 'FK-IMP-KOL-2' and kolam = 'reguler';
  assert n_kronis = 1,  'baris dengan kolom Kolam="Kronis" harus masuk kolam kronis';
  assert n_reguler = 1, 'baris tanpa kolom Kolam harus bawaan ke kolam reguler';

  begin
    perform public.apotek_impor(jsonb_build_array(
      jsonb_build_object('obat_id','0ba00001-0000-0000-0000-000000000002',
        'jumlah',5,'harga_beli',300,'tgl_expired',(public.tgl_klinik()+300)::text,
        'pbf','PBF Impor','no_faktur','FK-IMP-KOL-3','kolam','entah-berantah')
    ), 'Pembelian');
  exception when others then gagal := true;
  end;
  assert gagal, 'kolam yang tidak dikenal di baris impor harus ditolak (dibungkus pesan baris)';
end $$;

\echo 'SEMUA UJI KOLAM APOTEK LULUS'

-- =====================================================================
--  UJI FUNGSIONAL MODUL KRONIS — TAHAP 1 (dasar & migrasi)
--  Dijalankan SETELAH uji_apotek.sql dan uji_rls.sql (memakai pengguna
--  admin/dokter/apoteker dan poli dari sana).
--
--  Yang diuji di sini bukan tampilan, melainkan tiga hal yang kalau
--  salah tidak akan pernah kelihatan di layar:
--    * pemetaan tulisan portal ke kode RME
--    * pencocokan pasien — dan kesanggupannya MENOLAK menebak
--    * pembatalan pencocokan yang mengembalikan keadaan persis semula
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

create or replace function ujik_ditolak(p_user uuid, p_sql text)
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

create or replace function ujik_terlihat(p_user uuid, p_sql text)
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
create or replace function ujik_terubah(p_user uuid, p_sql text)
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
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);

-- Tiga pasien. Dua punya nomor BPJS, satu tidak — dan pasangan
-- "Budi Santoso" sengaja dibuat mirip supaya usulan harus memilih.
insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin, no_bpjs, alamat) values
  ('bbbbbbb1-0000-0000-0000-0000000000D1','UJIK01','Budi Santoso',
    (public.tgl_klinik() - interval '58 years')::date,'L','0001234567890','Jl. Mawar 1'),
  ('bbbbbbb1-0000-0000-0000-0000000000D2','UJIK02','Budi Santosa',
    (public.tgl_klinik() - interval '41 years')::date,'L','0009999999999','Jl. Melati 2'),
  ('bbbbbbb1-0000-0000-0000-0000000000D3','UJIK03','Siti Aminah',
    (public.tgl_klinik() - interval '63 years')::date,'P', null,'Jl. Kenanga 3')
on conflict (id) do nothing;


\echo '--- 1. Kunci pasien mengikuti portal: BPJS menang, bukan angka saja yang dibaca'
do $$
begin
  assert public.kronis_kunci('Budi Santoso','0001234567890') = 'b:0001234567890',
    'Nomor BPJS harus jadi kunci.';
  -- Portal memakai replace(/\D/g,''): spasi dan tanda hubung dibuang, nol depan TIDAK.
  assert public.kronis_kunci('Budi','000-123 456 7890') = 'b:0001234567890',
    'Tanda baca pada nomor BPJS harus diabaikan.';
  assert public.kronis_kunci('  Siti Aminah ', null) = 'n:siti aminah',
    'Tanpa BPJS, kuncinya nama huruf kecil tanpa spasi tepi.';
  assert public.kronis_kunci('Siti Aminah','') = 'n:siti aminah',
    'BPJS kosong sama dengan tanpa BPJS.';
  -- Yang paling penting: nomor yang isinya bukan angka sama sekali tidak
  -- boleh menghasilkan kunci 'b:' kosong — dua pasien tanpa BPJS akan
  -- tergabung jadi satu orang.
  assert public.kronis_kunci('Ahmad','-') = 'n:ahmad',
    'Nomor BPJS tanpa angka harus jatuh ke kunci nama.';
end $$;


\echo '--- 2. Tulisan diagnosis portal terpetakan, termasuk bentuk HPT+DM'
do $$
begin
  assert public.kronis_kode_diagnosa('Hipertensi, Diabetes Melitus') = array['DM','HPT'],
    format('Dapat %s', public.kronis_kode_diagnosa('Hipertensi, Diabetes Melitus'));
  assert public.kronis_kode_diagnosa('HPT+DM') = array['DM','HPT'],
    'Bentuk lab rutin HPT+DM harus terbaca dua diagnosis.';
  assert public.kronis_kode_diagnosa('DM') = array['DM'], 'DM tunggal.';
  assert public.kronis_kode_diagnosa('Asma, PPOK') = array['ASMA','PPOK'], 'Dua diagnosis paru.';
  assert public.kronis_kode_diagnosa('Batuk Pilek') = '{}', 'Yang bukan kronis tidak dipetakan.';
  assert public.kronis_kode_diagnosa(null) = '{}', 'NULL tidak meledak.';
  -- Duplikat di portal ('Hipertensi, HPT') tidak boleh jadi dua baris.
  assert public.kronis_kode_diagnosa('Hipertensi, HPT') = array['HPT'],
    'Alias ganda tetap satu kode.';
end $$;


\echo '--- 3. Hanya HPT dan DM yang punya jatah lab — delapan sisanya tidak'
do $$
declare n int;
begin
  select count(*) into n from ref_kronis_diagnosa where bulan_lab is not null;
  assert n = 2, format('Harus 2 diagnosis berjatah lab, dapat %s', n);
  assert (select bulan_lab from ref_kronis_diagnosa where kode='DM')  = 3, 'DM tiap 3 bulan.';
  assert (select bulan_lab from ref_kronis_diagnosa where kode='HPT') = 6, 'HPT tiap 6 bulan.';
  select count(*) into n from ref_kronis_diagnosa;
  assert n = 10, format('Sepuluh diagnosis kronis, dapat %s', n);
  -- Pemantauan OBAT berlaku untuk kesepuluh — inilah bedanya dengan lab.
  select count(*) into n from ref_kronis_diagnosa where pantau_obat;
  assert n = 10, 'Pemantauan obat berlaku untuk seluruh diagnosis.';
end $$;


\echo '--- 4. Daftar lab pereset jadwal: HbA1c ada, gula sewaktu sengaja tidak'
do $$
declare n int;
begin
  assert exists (select 1 from ref_lab where kode = 'HBA1C'), 'HbA1c harus ditambahkan ke master lab.';

  select count(*) into n from ref_kronis_lab k join ref_lab l on l.id = k.lab_id
   where k.kode_kronis = 'DM';
  assert n = 3, format('DM direset 3 pemeriksaan, dapat %s', n);

  assert exists (select 1 from ref_kronis_lab k join ref_lab l on l.id=k.lab_id
                  where k.kode_kronis='DM' and l.kode='HBA1C'), 'HbA1c mereset jadwal DM.';
  assert not exists (select 1 from ref_kronis_lab k join ref_lab l on l.id=k.lab_id
                  where k.kode_kronis='DM' and l.kode='GDS'),
    'Gula darah SEWAKTU tidak boleh menyatakan pemantauan DM sudah dilakukan.';

  select count(*) into n from ref_kronis_lab where kode_kronis = 'HPT';
  assert n = 6, format('HPT direset 6 pemeriksaan, dapat %s', n);
  -- Delapan diagnosis lain tidak punya satu pun.
  select count(*) into n from ref_kronis_lab where kode_kronis not in ('DM','HPT');
  assert n = 0, 'Diagnosis tanpa jatah lab tidak boleh punya pemeriksaan pereset.';
end $$;


\echo '--- 5. Menampung data portal: dikelompokkan per orang, bukan per baris'
do $$
declare v jsonb; n int;
begin
  v := public.kronis_impor_tampung('KRONIS_TERAPI', jsonb_build_array(
    jsonb_build_object('id','101','nama_pasien','Budi Santoso','no_bpjs','0001234567890',
      'no_telp','081234567890','diagnosis','Hipertensi, Diabetes Melitus',
      'resep_tetap', E'Amlodipine 5 mg\nMetformin 500 mg\nObat Racikan Khusus',
      'statin_obat','Simvastatin 20 mg','statin_maks',6,
      'statin_tanggal_lab', (public.tgl_klinik() - 90)::text,
      'aktif', true, 'tanggal_ambil_terakhir', (public.tgl_klinik() - 20)::text),
    jsonb_build_object('id','102','nama_pasien','Siti Aminah','no_bpjs',null,
      'no_telp','081200000000','diagnosis','Asma','resep_tetap','Salbutamol','aktif',true)
  ));
  assert (v->>'masuk')::int = 2, format('Dua baris terapi masuk, dapat %s', v->>'masuk');

  v := public.kronis_impor_tampung('OBAT_KRONIS', jsonb_build_array(
    jsonb_build_object('id','201','nama_pasien','Budi Santoso','no_bpjs','000-123-456-7890',
      'tanggal_ambil',(public.tgl_klinik() - 50)::text,'diagnosis','Hipertensi, Diabetes Melitus',
      'resep_obat','Amlodipine 5 mg'),
    jsonb_build_object('id','202','nama_pasien','Budi Santoso','no_bpjs','0001234567890',
      'tanggal_ambil',(public.tgl_klinik() - 20)::text,'resep_obat','Amlodipine 5 mg'),
    jsonb_build_object('id','203','nama_pasien','Siti Aminah',
      'tanggal_ambil',(public.tgl_klinik() - 35)::text,'resep_obat','Salbutamol')
  ));
  assert (v->>'masuk')::int = 3, format('Tiga baris obat masuk, dapat %s', v->>'masuk');

  -- Tiga baris, dua orang: baris 201 memakai nomor BPJS bertanda hubung dan
  -- HARUS jatuh ke orang yang sama dengan 202.
  select count(*) into n from kronis_impor_pasien;
  assert n = 2, format('Dua orang di tabel titipan, dapat %s', n);

  select jml_obat into n from kronis_impor_pasien where kunci = 'b:0001234567890';
  assert n = 2, format('Budi punya 2 pengambilan, dapat %s', n);
  assert (select punya_terapi from kronis_impor_pasien where kunci='b:0001234567890'),
    'Budi punya baris pendaftaran terapi.';
end $$;


\echo '--- 6. Impor diulang tidak menggandakan apa pun'
do $$
declare v jsonb; n int;
begin
  v := public.kronis_impor_tampung('OBAT_KRONIS', jsonb_build_array(
    jsonb_build_object('id','202','nama_pasien','Budi Santoso','no_bpjs','0001234567890',
      'tanggal_ambil',(public.tgl_klinik() - 20)::text,'resep_obat','Amlodipine 5 mg')
  ));
  assert (v->>'masuk')::int = 0 and (v->>'dilewati')::int = 1,
    format('Baris berulang harus dilewati. Dapat masuk=%s lewat=%s', v->>'masuk', v->>'dilewati');
  select jml_obat into n from kronis_impor_pasien where kunci = 'b:0001234567890';
  assert n = 2, format('Hitungan tidak boleh menggelembung, dapat %s', n);
end $$;


\echo '--- 7. Lab rutin ikut tertampung, dan diagnosanya terbaca dari kolom lain'
do $$
declare v jsonb;
begin
  v := public.kronis_impor_tampung('LAB_RUTIN', jsonb_build_array(
    jsonb_build_object('id','301','nama_pasien','Budi Santoso','no_bpjs','0001234567890',
      'diagnosa','HPT+DM','tanggal_lab',(public.tgl_klinik() - 120)::text,
      'lab_pemeriksa','Lab Prodia','catatan','GDP 180'),
    jsonb_build_object('id','302','nama_pasien','Budi Santoso','no_bpjs','0001234567890',
      'diagnosa','HPT+DM','tanggal_lab',(public.tgl_klinik() - 30)::text,
      'lab_pemeriksa','Lab Klinik')
  ));
  assert (v->>'masuk')::int = 2, 'Dua lembar lab masuk.';
  assert (select jml_lab from kronis_impor_pasien where kunci='b:0001234567890') = 2,
    'Hitungan lab per orang.';
end $$;


\echo '--- 8. Jadwal kontrol: yang lewat dan yang masih di depan dipisahkan nanti'
do $$
declare v jsonb;
begin
  v := public.kronis_impor_tampung('PASIEN_KONTROL', jsonb_build_array(
    -- no_wa, bukan no_telp — kolom portal memang berbeda di tabel ini.
    jsonb_build_object('id','401','nama_pasien','Budi Santoso','no_bpjs','0001234567890',
      'no_wa','081234567890','poli_asal','Poli Umum','nama_dokter','dr. Uji',
      'diagnosa','Evaluasi Hipertensi',
      'tanggal_kontrol',(public.tgl_klinik() + 10)::text,
      'instruksi_petugas','Ingatkan puasa 10 jam.'),
    jsonb_build_object('id','402','nama_pasien','Budi Santoso','no_bpjs','0001234567890',
      'poli_asal','Poli Umum','tanggal_kontrol',(public.tgl_klinik() - 60)::text)
  ));
  assert (v->>'masuk')::int = 2, 'Dua jadwal kontrol tertampung.';
end $$;


\echo '--- 9. Usulan pasangan: BPJS sama di atas, nama mirip di bawahnya'
do $$
declare r record; v_id bigint;
begin
  select id into v_id from kronis_impor_pasien where kunci = 'b:0001234567890';
  select * into r from public.kronis_impor_usulan(v_id) limit 1;
  assert r.pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000D1',
    'Pasien ber-BPJS sama harus jadi usulan teratas.';
  assert r.skor = 100 and r.alasan = 'Nomor BPJS sama', format('Dapat skor %s (%s)', r.skor, r.alasan);

  -- "Budi Santosa" harus tetap MUNCUL sebagai kandidat kedua. Menyembunyikannya
  -- akan membuat petugas mengira hanya ada satu Budi.
  assert exists (select 1 from public.kronis_impor_usulan(v_id)
                  where pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000D2'),
    'Nama mirip harus ikut ditampilkan, bukan disembunyikan.';

  -- Siti tidak punya BPJS: yang menolongnya hanya kemiripan nama.
  select id into v_id from kronis_impor_pasien where kunci = 'n:siti aminah';
  select * into r from public.kronis_impor_usulan(v_id) limit 1;
  assert r.pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000D3',
    'Tanpa BPJS, nama sama persis harus tetap terusulkan.';
  assert r.skor >= 90, format('Nama sama persis skornya minimal 90, dapat %s', r.skor);
end $$;


\echo '--- 10. Pencocokan menuangkan terapi, obat, riwayat, dan jadwal yang masih di depan'
do $$
declare v jsonb; v_id bigint; v_terapi uuid; n int;
begin
  select id into v_id from kronis_impor_pasien where kunci = 'b:0001234567890';
  v := public.kronis_impor_cocokkan(v_id, 'bbbbbbb1-0000-0000-0000-0000000000D1');

  assert (v->>'terapi')::boolean, 'Pendaftaran buku kronis harus terbentuk.';
  assert (v->>'ambil_obat')::int = 2, format('Dua riwayat ambil obat, dapat %s', v->>'ambil_obat');
  assert (v->>'lab')::int = 2,        format('Dua riwayat lab, dapat %s', v->>'lab');
  -- Yang lewat 60 hari TIDAK ikut. Jadwal kedaluwarsa bukan riwayat penyakit.
  assert (v->>'kontrol')::int = 1,    format('Satu jadwal kontrol (yang di depan), dapat %s', v->>'kontrol');

  select id into v_terapi from kronis_terapi
   where pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000D1' and aktif;
  assert v_terapi is not null, 'Terapi aktif harus ada.';

  select count(*) into n from kronis_terapi_diagnosa where terapi_id = v_terapi;
  assert n = 2, format('Dua diagnosis (HPT & DM), dapat %s', n);

  -- Tiga baris resep portal: dua ketemu di master obat, satu tidak.
  select count(*) into n from kronis_obat where terapi_id = v_terapi;
  assert n = 3, format('Tiga baris obat rutin, dapat %s', n);
  select count(*) into n from kronis_obat where terapi_id = v_terapi and obat_id is not null;
  assert n = 2, format('Dua di antaranya bertaut ke master obat, dapat %s', n);
  -- Yang tidak ketemu TETAP disimpan — justru supaya kelihatan dan bisa dibetulkan.
  assert exists (select 1 from kronis_obat
                  where terapi_id = v_terapi and obat_id is null
                    and nama_obat = 'Obat Racikan Khusus'),
    'Obat yang tidak ketemu masternya harus tetap tercatat, bukan dibuang diam-diam.';

  -- Statin dari teks portal terpetakan ke aturan kuota.
  assert (select statin_kunci from kronis_terapi where id = v_terapi) = 'simvastatin',
    'Teks "Simvastatin 20 mg" harus mengenali aturan kuota simvastatin.';
  assert (select statin_tgl_lab from kronis_terapi where id = v_terapi)
         = public.tgl_klinik() - 90, 'Tanggal lab LDL portal ikut terbawa.';

  assert (select status from kronis_impor_pasien where id = v_id) = 'COCOK', 'Status jadi COCOK.';
  select count(*) into n from kronis_impor_baris where impor_id = v_id and not dituang;
  assert n = 0, 'Semua baris titipan ditandai sudah dituang.';
end $$;


\echo '--- 11. Riwayat luar menyimpan sumbernya, supaya angka kepatuhan bisa dibaca jujur'
do $$
declare n int;
begin
  select count(*) into n from kronis_riwayat_luar
   where pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000D1' and sumber = 'PORTAL';
  assert n = 5, format('Dua obat + dua lab + satu kontrol = 5, dapat %s', n);
  assert (select kontrol_instruksi from kronis_riwayat_luar
           where sumber_id = '401') = 'Ingatkan puasa 10 jam.',
    'Instruksi petugas ikut terbawa dari portal.';
  assert not exists (select 1 from kronis_riwayat_luar where sumber_id = '402'),
    'Jadwal kontrol yang sudah lewat tidak dibawa.';
end $$;


\echo '--- 12. Satu pasien tidak boleh jadi tujuan dua baris titipan'
do $$
declare v_id bigint; v_gagal boolean := false;
begin
  select id into v_id from kronis_impor_pasien where kunci = 'n:siti aminah';
  begin
    perform public.kronis_impor_cocokkan(v_id, 'bbbbbbb1-0000-0000-0000-0000000000D1');
  exception when others then v_gagal := true;
  end;
  assert v_gagal, 'Menempel dua baris portal ke satu pasien harus ditolak — '
                  'kalau tidak, seluruh riwayatnya tergandakan.';
end $$;


\echo '--- 13. Pembatalan mengembalikan keadaan persis seperti sebelum ditempel'
do $$
declare v jsonb; v_id bigint; n int;
begin
  select id into v_id from kronis_impor_pasien where kunci = 'b:0001234567890';
  v := public.kronis_impor_batal_cocok(v_id);
  assert (v->>'riwayat_dicabut')::int = 5, format('Lima riwayat dicabut, dapat %s', v->>'riwayat_dicabut');
  assert (v->>'terapi_dicabut')::boolean, 'Pendaftaran hasil migrasi ikut dicabut.';

  select count(*) into n from kronis_riwayat_luar
   where pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000D1';
  assert n = 0, format('Tidak boleh ada riwayat tersisa, dapat %s', n);
  select count(*) into n from kronis_terapi
   where pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000D1';
  assert n = 0, 'Terapi hasil migrasi ikut hilang.';

  assert (select status from kronis_impor_pasien where id = v_id) = 'MENUNGGU',
    'Baris titipan kembali menunggu.';
  select count(*) into n from kronis_impor_baris where impor_id = v_id and dituang;
  assert n = 0, 'Barisnya boleh dituang lagi.';
end $$;


\echo '--- 14. Menempel ulang setelah dibatalkan menghasilkan angka yang sama'
do $$
declare v jsonb; v_id bigint;
begin
  select id into v_id from kronis_impor_pasien where kunci = 'b:0001234567890';
  v := public.kronis_impor_cocokkan(v_id, 'bbbbbbb1-0000-0000-0000-0000000000D1');
  assert (v->>'ambil_obat')::int = 2 and (v->>'lab')::int = 2 and (v->>'kontrol')::int = 1,
    format('Hasil tempel ulang harus sama. Dapat %s', v::text);
end $$;


\echo '--- 15. Pencocokan otomatis hanya berani pada BPJS yang menunjuk satu pasien'
do $$
declare v jsonb; v_id bigint;
begin
  -- Siti tanpa BPJS: tidak boleh tersentuh pencocokan otomatis.
  v := public.kronis_impor_cocokkan_otomatis();
  assert (v->>'tertempel')::int = 0,
    format('Tidak ada yang layak ditempel otomatis, dapat %s', v->>'tertempel');
  assert (select status from kronis_impor_pasien where kunci='n:siti aminah') = 'MENUNGGU',
    'Baris tanpa BPJS harus tetap menunggu manusia.';

  -- Sekarang tambahkan satu orang portal yang BPJS-nya cocok persis dengan
  -- pasien kedua, dan pastikan ia tertempel sendiri.
  perform public.kronis_impor_tampung('OBAT_KRONIS', jsonb_build_array(
    jsonb_build_object('id','501','nama_pasien','B. Santosa','no_bpjs','0009999999999',
      'tanggal_ambil',(public.tgl_klinik() - 15)::text,'resep_obat','Amlodipine 10 mg')));
  v := public.kronis_impor_cocokkan_otomatis();
  assert (v->>'tertempel')::int = 1, format('Satu tertempel otomatis, dapat %s', v->>'tertempel');
  assert (select pasien_id from kronis_impor_pasien where kunci='b:0009999999999')
         = 'bbbbbbb1-0000-0000-0000-0000000000D2',
    'Nama yang berbeda ejaan tidak menghalangi kecocokan BPJS persis.';
end $$;


\echo '--- 16. BPJS ganda tidak ditebak — ditinggalkan untuk dilihat manusia'
do $$
declare v jsonb; n int;
begin
  -- Dua pasien dengan nomor BPJS sama: salah ketik yang memang terjadi.
  insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin, no_bpjs) values
    ('bbbbbbb1-0000-0000-0000-0000000000D4','UJIK04','Rina A',
      (public.tgl_klinik() - interval '50 years')::date,'P','0007777777777'),
    ('bbbbbbb1-0000-0000-0000-0000000000D5','UJIK05','Rina B',
      (public.tgl_klinik() - interval '52 years')::date,'P','0007777777777')
  on conflict (id) do nothing;

  perform public.kronis_impor_tampung('OBAT_KRONIS', jsonb_build_array(
    jsonb_build_object('id','601','nama_pasien','Rina','no_bpjs','0007777777777',
      'tanggal_ambil',(public.tgl_klinik() - 10)::text,'resep_obat','Amlodipine 5 mg')));

  v := public.kronis_impor_cocokkan_otomatis();
  assert (v->>'tertempel')::int = 0, 'Nomor BPJS yang menunjuk dua pasien tidak boleh ditebak.';
  assert (select status from kronis_impor_pasien where kunci='b:0007777777777') = 'MENUNGGU',
    'Barisnya tetap menunggu.';
end $$;


\echo '--- 17. Mengabaikan baris, dan tidak bisa mengabaikan yang sudah tertempel'
do $$
declare v_id bigint; v_gagal boolean := false;
begin
  select id into v_id from kronis_impor_pasien where kunci = 'b:0007777777777';
  perform public.kronis_impor_abaikan(v_id, 'Bukan pasien klinik ini.');
  assert (select status from kronis_impor_pasien where id=v_id) = 'ABAIKAN', 'Status ABAIKAN.';

  select id into v_id from kronis_impor_pasien where kunci = 'b:0001234567890';
  begin
    perform public.kronis_impor_abaikan(v_id, 'coba');
  exception when others then v_gagal := true;
  end;
  assert v_gagal, 'Baris yang sudah tertempel tidak boleh diabaikan begitu saja.';
end $$;


\echo '--- 18. Satu pasien hanya boleh punya satu pendaftaran kronis aktif'
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into kronis_terapi (pasien_id, aktif)
    values ('bbbbbbb1-0000-0000-0000-0000000000D1', true);
  exception when unique_violation then v_gagal := true;
  end;
  assert v_gagal, 'Pendaftaran aktif kedua harus ditolak.';

  -- Yang sudah tidak aktif boleh berdampingan: berhenti lalu mulai lagi
  -- adalah informasi klinis, bukan sampah.
  insert into kronis_terapi (pasien_id, aktif, tanggal_selesai, alasan_selesai)
  values ('bbbbbbb1-0000-0000-0000-0000000000D1', false, public.tgl_klinik(), 'Pindah faskes');
  assert (select count(*) from kronis_terapi
           where pasien_id='bbbbbbb1-0000-0000-0000-0000000000D1') = 2,
    'Pendaftaran nonaktif boleh berdampingan dengan yang aktif.';
end $$;


\echo '--- 19. Bukan admin tidak bisa menyentuh migrasi, dan tidak melihat tabel titipannya'
do $$
declare v_id bigint;
begin
  select id into v_id from kronis_impor_pasien where kunci = 'n:siti aminah';

  -- Dokter (33333333) bukan admin.
  assert ujik_ditolak('33333333-3333-3333-3333-333333333333',
    format('select public.kronis_impor_cocokkan(%s, ''bbbbbbb1-0000-0000-0000-0000000000D3'')', v_id)),
    'Dokter tidak boleh mencocokkan data migrasi.';
  assert ujik_ditolak('33333333-3333-3333-3333-333333333333',
    'select public.kronis_impor_tampung(''OBAT_KRONIS'', ''[]''::jsonb)'),
    'Dokter tidak boleh memasukkan data migrasi.';
  assert ujik_ditolak('33333333-3333-3333-3333-333333333333',
    'select public.kronis_impor_bersihkan(true)'),
    'Dokter tidak boleh membersihkan data migrasi.';

  -- RLS: tabel titipan tidak terbaca oleh selain admin.
  assert ujik_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from kronis_impor_pasien') = 0,
    'Tabel titipan tidak boleh terbaca oleh dokter.';
  assert ujik_terlihat('11111111-1111-1111-1111-111111111111',
    'select count(*) from kronis_impor_pasien') > 0,
    'Admin harus bisa membacanya.';
end $$;


\echo '--- 20. Dokter dan perawat BOLEH menandai pasien kronis — penandaannya di ruang periksa'
do $$
begin
  assert not ujik_ditolak('33333333-3333-3333-3333-333333333333',
    'insert into kronis_terapi (pasien_id, aktif) values
       (''bbbbbbb1-0000-0000-0000-0000000000D3'', true)'),
    'Dokter harus bisa mendaftarkan pasien kronis.';
  assert not ujik_ditolak('55555555-5555-5555-5555-555555555555',
    'update kronis_terapi set catatan = ''dicek perawat''
      where pasien_id = ''bbbbbbb1-0000-0000-0000-0000000000D3'''),
    'Perawat harus bisa memperbarui catatan.';
  -- Apoteker tidak: ia menyerahkan obat, bukan menetapkan diagnosis kronis.
  assert ujik_terubah('22222222-2222-2222-2222-222222222222',
    'update kronis_terapi set catatan = ''diubah apoteker''
      where pasien_id = ''bbbbbbb1-0000-0000-0000-0000000000D3''') = 0,
    'Apoteker tidak boleh mengubah pendaftaran kronis.';
end $$;


\echo '--- 21. Tabel & view baru terbaca sebagai authenticated, bukan hanya superuser'
do $$
declare t text;
begin
  -- Pelajaran yang sudah dua kali terjadi: GRANT tidak diwariskan.
  foreach t in array array['ref_kronis_diagnosa','ref_kronis_lab','ref_kronis_kuota_obat',
                           'kronis_terapi','kronis_terapi_diagnosa','kronis_obat',
                           'kronis_riwayat_luar']
  loop
    perform ujik_terlihat('11111111-1111-1111-1111-111111111111',
                          format('select count(*) from %I', t));
  end loop;
  perform ujik_terlihat('11111111-1111-1111-1111-111111111111',
                        'select total from v_kronis_impor_ringkas');
end $$;


\echo '--- 22. Ringkasan migrasi menghitung yang menunggu tanpa BPJS'
do $$
declare r record;
begin
  select * into r from v_kronis_impor_ringkas;
  assert r.total > 0, 'Ada baris titipan.';
  assert r.menunggu_tanpa_bpjs >= 1,
    'Siti tanpa BPJS harus terhitung — dialah yang paling butuh dilihat manusia.';
  assert r.cocok >= 2, format('Dua baris sudah tertempel, dapat %s', r.cocok);
end $$;


\echo '--- 23. Kolom instruksi kontrol tersedia di pemeriksaan'
do $$
begin
  assert exists (select 1 from information_schema.columns
                  where table_name='pemeriksaan' and column_name='kontrol_instruksi'),
    'pemeriksaan.kontrol_instruksi harus ada untuk pengingat H-1.';
end $$;


\echo '--- 24. Membersihkan titipan yang selesai, menyisakan yang masih menunggu'
do $$
declare v jsonb; n int;
begin
  select count(*) into n from kronis_impor_pasien where status = 'MENUNGGU';
  v := public.kronis_impor_bersihkan(false);
  assert (v->>'dihapus')::int > 0, 'Ada yang dibersihkan.';
  assert (select count(*) from kronis_impor_pasien) = n,
    'Yang masih MENUNGGU tidak boleh ikut terhapus.';
  -- Riwayat yang sudah tertempel TIDAK ikut hilang: ia sudah jadi milik
  -- rekam medis, bukan milik tabel titipan.
  assert (select count(*) from kronis_riwayat_luar
           where pasien_id='bbbbbbb1-0000-0000-0000-0000000000D1') = 5,
    'Riwayat yang sudah dituang harus bertahan setelah titipannya dibersihkan.';
end $$;


drop function if exists ujik_ditolak(uuid, text);
drop function if exists ujik_terlihat(uuid, text);
drop function if exists ujik_terubah(uuid, text);

\echo 'SEMUA UJI KRONIS LULUS'

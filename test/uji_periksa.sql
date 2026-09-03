-- =====================================================================
--  UJI FUNGSIONAL PEMERIKSAAN TERSTRUKTUR
--  Bentuk payload PCare, observasi SatuSehat, penjaga isi, dan hak akses.
--  Dijalankan SETELAH uji_surat.sql (memakai pengguna, poli, pasien, dan
--  kunjungan yang dibuat uji_penunjang.sql).
--
--  Yang diuji di sini bukan "apakah kolomnya ada" melainkan "apakah
--  kolomnya cukup": setiap field yang diminta PCare disusun dari data
--  yang benar-benar tersimpan, dan yang tidak bisa disusun muncul sebagai
--  kekurangan yang bisa dibaca manusia.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

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

/* Untuk UPDATE, `uji_ditolak` tidak cukup: RLS yang menyaring seluruh
   baris tidak melempar galat, ia hanya mengubah nol baris. Yang harus
   diperiksa adalah berapa baris yang benar-benar berubah. */
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

select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);

-- ---------------------------------------------------------------------
-- Persiapan. Kunjungan C2 milik pasien perempuan, cara bayar BPJS —
-- itulah yang masuk view PCare. C1 umum, dipakai membuktikan yang
-- sebaliknya.
-- ---------------------------------------------------------------------
update pasien set no_bpjs = '0001234567890', nik = '7371010101010001'
 where id = 'bbbbbbb1-0000-0000-0000-00000000000F';
update poli set kode_pcare = '001'
 where id = 'ccccccc1-0000-0000-0000-000000000001';
update pegawai set kode_dokter_pcare = '000123'
 where id = '33333333-3333-3333-3333-333333333333';

delete from pemeriksaan where kunjungan_id in
  ('ddddddd1-0000-0000-0000-0000000000C1','ddddddd1-0000-0000-0000-0000000000C2');
delete from kajian_awal where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
delete from diagnosa where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';

insert into kajian_awal (kunjungan_id, keluhan_utama, sistolik, diastolik, nadi,
                         nafas, suhu, spo2, berat_badan, tinggi_badan,
                         lingkar_perut, skala_nyeri, kesadaran_kode)
values ('ddddddd1-0000-0000-0000-0000000000C2', 'Batuk berdahak sejak 3 hari',
        130, 85, 88, 20, 37.8, 97, 62.0, 165.0, 84.0, 3, 'CM');


\echo '--- 1. Payload PCare tersusun utuh dari data yang tersimpan'
do $$
declare v record;
begin
  insert into pemeriksaan (kunjungan_id, keluhan_utama, anamnesis,
                           kesadaran_kode, status_pulang_kode, prognosa_kode,
                           terapi_obat, terapi_non_obat, bmhp, tindak_lanjut)
  values ('ddddddd1-0000-0000-0000-0000000000C2',
          'Batuk berdahak sejak 3 hari',
          'Batuk berdahak putih sejak 3 hari, demam hilang timbul.',
          'CM', 'SEMBUH', 'BONAM',
          'Parasetamol 500 mg 3x1; Ambroksol 30 mg 3x1',
          'Kompres hangat, banyak minum', 'Tidak Ada', 'SELESAI');

  insert into diagnosa (kunjungan_id, kode_icd10, nama, jenis, kasus, urutan)
  values ('ddddddd1-0000-0000-0000-0000000000C2','J06.9','ISPA','PRIMER','BARU',0);

  select * into v from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';

  assert v."noKartu"    = '0001234567890', 'noKartu salah';
  assert v."kdPoli"     = '001',           'kdPoli salah';
  assert v."tglDaftar" ~ '^\d{2}-\d{2}-\d{4}$', 'tglDaftar harus DD-MM-YYYY: ' || v."tglDaftar";
  assert v."tglPulang" ~ '^\d{2}-\d{2}-\d{4}$', 'tglPulang harus DD-MM-YYYY';
  assert v."sistole"    = 130,  'sistole salah';
  assert v."diastole"   = 85,   'diastole salah';
  assert v."heartRate"  = 88,   'heartRate diambil dari nadi';
  assert v."respRate"   = 20,   'respRate diambil dari nafas';
  assert v."beratBadan" = 62.0, 'beratBadan salah';
  assert v."lingkarPerut" = 84.0, 'lingkarPerut salah';
  assert v."kdDokter"   = '000123', 'kdDokter salah';
  assert v."kdDiag1"    = 'J06.9', 'kdDiag1 salah';
  assert v."keluhan"    = 'Batuk berdahak sejak 3 hari', 'keluhan salah';
  assert v."terapiObat" like 'Parasetamol%', 'terapiObat salah';
  assert v."bmhp"       = 'Tidak Ada', 'bmhp salah';
  assert v."kdTkp"      = '10', 'klinik pratama rawat jalan selalu kdTkp 10';
end $$;


\echo '--- 2. Suhu dikirim dengan koma, bukan titik'
do $$
declare v_suhu text;
begin
  select "suhu" into v_suhu from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  -- PCare adalah layanan berbahasa Indonesia dan menerima suhu sebagai
  -- teks berkoma. Titik desimal diterima diam-diam lalu dibaca sebagai
  -- angka lain — kesalahan yang tidak menimbulkan galat apa pun.
  assert v_suhu = '37,8', 'suhu harus berkoma, bukan ' || v_suhu;
end $$;


\echo '--- 3. Kunjungan umum tidak ikut view PCare'
do $$
declare n int;
begin
  insert into pemeriksaan (kunjungan_id, keluhan_utama, status_pulang_kode, prognosa_kode)
  values ('ddddddd1-0000-0000-0000-0000000000C1','Nyeri lutut','SEMBUH','BONAM');
  select count(*) into n from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C1';
  assert n = 0, 'kunjungan non-BPJS tidak boleh masuk antrean kirim PCare';
end $$;


\echo '--- 4. kdDiag1..3 mengikuti urutan primer lebih dulu'
do $$
declare v record;
begin
  insert into diagnosa (kunjungan_id, kode_icd10, nama, jenis, kasus, urutan) values
    ('ddddddd1-0000-0000-0000-0000000000C2','R50.9','Demam','SEKUNDER','BARU',1),
    ('ddddddd1-0000-0000-0000-0000000000C2','R05','Batuk','SEKUNDER','BARU',2);

  select * into v from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert v."kdDiag1" = 'J06.9', 'diagnosa primer harus jadi kdDiag1';
  assert v."kdDiag2" = 'R50.9', 'kdDiag2 salah: ' || coalesce(v."kdDiag2",'null');
  assert v."kdDiag3" = 'R05',   'kdDiag3 salah: ' || coalesce(v."kdDiag3",'null');
end $$;


\echo '--- 5. Diagnosa keempat tidak terkirim, dan itu diberitahukan'
do $$
declare v_kurang text[];
begin
  insert into diagnosa (kunjungan_id, kode_icd10, nama, jenis, kasus, urutan)
  values ('ddddddd1-0000-0000-0000-0000000000C2','I10','Hipertensi','SEKUNDER','LAMA',3);

  update kunjungan set status = 'SELESAI'
   where id = 'ddddddd1-0000-0000-0000-0000000000C2';

  select kekurangan into v_kurang from v_kesiapan_kunjungan
   where id = 'ddddddd1-0000-0000-0000-0000000000C2';
  -- PCare hanya punya tiga slot. Kalau kelebihannya dibuang diam-diam,
  -- rekam medis dan klaim berselisih tanpa ada yang tahu.
  assert 'Lebih dari 3 diagnosa — PCare hanya menerima kdDiag1..3' = any(v_kurang),
    'kelebihan diagnosa harus diberitahukan';

  delete from diagnosa
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2' and kode_icd10 = 'I10';
end $$;


\echo '--- 6. Alasan TACC wajib bila TACC dipilih'
do $$
declare v_ditolak boolean := false;
begin
  begin
    update pemeriksaan set tacc_kode = 'C1', tacc_alasan = null
     where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  exception when others then v_ditolak := true;
  end;
  assert v_ditolak, 'TACC tanpa alasan harus ditolak — BPJS mengembalikan klaimnya';

  update pemeriksaan set tacc_kode = 'C1', tacc_alasan = 'Komplikasi pneumonia'
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert (select "kdTacc" from v_pcare_kunjungan
           where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2') = '2',
    'kode PCare untuk Complication adalah 2';
end $$;


\echo '--- 7. Tanpa TACC, alasannya ikut dibersihkan'
do $$
begin
  update pemeriksaan set tacc_kode = 'TIDAK', tacc_alasan = 'sisa isian lama'
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert (select tacc_alasan from pemeriksaan
           where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2') is null,
    'alasan TACC harus dibuang saat TACC dibatalkan, bukan ditinggal menempel';
  assert (select "kdTacc" from v_pcare_kunjungan
           where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2') = '-1',
    'tanpa TACC harus terkirim sebagai -1';
end $$;


\echo '--- 8. Nama prognosa dan status pulang diisi database dari kodenya'
do $$
declare v record;
begin
  update pemeriksaan set prognosa_kode = 'DUBIA_BONAM', status_pulang_kode = 'MEMBAIK',
         prognosa = null, status_pulang = null
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';

  select prognosa, status_pulang into v from pemeriksaan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  -- Surat dan resume medis mencetak teks ini. Kalau aplikasi lupa
  -- mengisinya, suratnya keluar tanpa prognosa dan tidak ada galat.
  assert v.prognosa = 'Dubia ad bonam', 'nama prognosa harus menyusul kodenya';
  assert v.status_pulang = 'Membaik', 'nama status pulang harus menyusul kodenya';
end $$;


\echo '--- 9. Rujukan lanjut berbentuk objek bersarang, dan null bila tidak merujuk'
do $$
declare v jsonb;
begin
  select "rujukLanjut" into v from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert v is null, 'tanpa rujukan, rujukLanjut harus null bukan objek kosong';

  insert into ref_ppk (kode, nama, jenis) values ('0123R001','RSUD Uji','RS')
  on conflict (kode) do nothing;

  update pemeriksaan
     set tindak_lanjut = 'RUJUK_LANJUT', rujuk_ppk_kode = '0123R001',
         rujuk_subspesialis_kode = 'PD', rujuk_sarana_kode = 'TANPA',
         rujuk_tgl_estimasi = public.tgl_klinik() + 3,
         status_pulang_kode = 'RUJUK'
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';

  select "rujukLanjut" into v from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert v ? 'kdppk',        'rujukLanjut harus memuat kdppk';
  assert v ? 'tglEstRujuk',  'rujukLanjut harus memuat tglEstRujuk';
  assert v ? 'subSpesialis', 'rujukLanjut harus memuat subSpesialis';
  assert v->>'kdppk' = '0123R001', 'kdppk salah';
  assert v->'subSpesialis' ? 'kdSubSpesialis1', 'subSpesialis harus bersarang';
  assert (v->>'tglEstRujuk') ~ '^\d{2}-\d{2}-\d{4}$', 'tglEstRujuk harus DD-MM-YYYY';
end $$;


\echo '--- 10. Alergi terkirim satu kode per jenis, 00 bila tidak ada'
do $$
declare v record; v_obat uuid;
begin
  select * into v from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert v."alergiObat" = '00' and v."alergiMakan" = '00' and v."alergiUdara" = '00',
    'tanpa alergi tercatat, ketiganya harus 00';

  select id into v_obat from ref_alergi where jenis='OBAT' and kode='PN';
  update ref_alergi set kode_pcare = '01' where id = v_obat;
  insert into pasien_alergi (pasien_id, jenis, nama, ref_alergi_id)
  values ('bbbbbbb1-0000-0000-0000-00000000000F','OBAT','Penisilin', v_obat);

  select * into v from v_pcare_kunjungan
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert v."alergiObat"  = '01', 'alergi obat harus memakai kode PCare-nya';
  assert v."alergiMakan" = '00', 'jenis lain tetap 00';
end $$;


\echo '--- 11. Tanda vital menjadi Observation berkode LOINC'
do $$
declare n int; v_loinc text;
begin
  select count(*) into n from v_satusehat_observasi
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2' and kelompok = 'VITAL';
  -- 11 nilai diisi di kajian awal: sistolik, diastolik, nadi, nafas, suhu,
  -- spo2, bb, tb, imt (terhitung sendiri), lingkar perut, skala nyeri.
  assert n = 11, 'seharusnya 11 observasi vital, bukan ' || n;

  select kode_loinc into v_loinc from v_satusehat_observasi
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2'
     and kode_internal = 'sistolik';
  assert v_loinc = '8480-6', 'LOINC sistolik salah: ' || coalesce(v_loinc,'null');

  assert (select nilai_angka from v_satusehat_observasi
           where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2'
             and kode_internal = 'suhu') = 37.8,
    'nilai suhu harus tetap angka pada sisi SatuSehat';
end $$;


\echo '--- 12. Nilai vital yang tidak diukur tidak dikarang jadi Observation'
do $$
declare n int;
begin
  update kajian_awal set spo2 = null, lingkar_perut = null
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  select count(*) into n from v_satusehat_observasi
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2' and kelompok = 'VITAL';
  assert n = 9, 'yang kosong tidak boleh terkirim sebagai nol; dapat ' || n;
  update kajian_awal set spo2 = 97, lingkar_perut = 84.0
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
end $$;


\echo '--- 13. Pemeriksaan fisik: yang normal berbunyi kalimat, yang tak diperiksa tidak terkirim'
do $$
declare v_teks text; n int;
begin
  update pemeriksaan set pemeriksaan_fisik = jsonb_build_object(
      'UMUM',    jsonb_build_object('status','NORMAL','temuan',null),
      'PARU',    jsonb_build_object('status','ABNORMAL','temuan','Ronki basah halus basal kanan'),
      'GENITAL', jsonb_build_object('status','TIDAK_DIPERIKSA','temuan',null))
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';

  select count(*) into n from v_satusehat_observasi
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2' and kelompok = 'FISIK';
  assert n = 2, 'sistem yang tidak diperiksa tidak boleh jadi Observation; dapat ' || n;

  select nilai_teks into v_teks from v_satusehat_observasi
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2' and kode_internal = 'UMUM';
  -- "NORMAL" bukan temuan medis. Yang dikirim harus kalimat yang bisa
  -- dibaca dokter lain, dan kalimat itu tersimpan di tabel rujukan supaya
  -- sama persis di layar, di cetakan, dan di SatuSehat.
  assert v_teks like 'Tampak sakit ringan%', 'sistem normal harus mengirim kalimat bakunya';

  select nilai_teks into v_teks from v_satusehat_observasi
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2' and kode_internal = 'PARU';
  assert v_teks = 'Ronki basah halus basal kanan', 'temuan abnormal harus terkirim apa adanya';
end $$;


\echo '--- 14. Resep terkirim sebagai signa1/signa2, bukan kalimat aturan pakai'
do $$
declare v record; v_resep uuid; v_obat uuid;
begin
  select id into v_obat from obat limit 1;
  insert into resep (kunjungan_id, dibuat_oleh)
  values ('ddddddd1-0000-0000-0000-0000000000C2','33333333-3333-3333-3333-333333333333')
  returning id into v_resep;

  insert into resep_item (resep_id, obat_id, nama_obat, jumlah, satuan, signa,
                          frekuensi, dosis, kode_pcare, obat_dpho)
  values (v_resep, v_obat, 'Parasetamol 500 mg', 10, 'Tablet',
          '3 x sehari 1 tablet', 3, 1, 'PCT500', true);

  select * into v from v_pcare_obat
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert v."signa1" = 3,  'signa1 = berapa kali sehari';
  assert v."signa2" = 1,  'signa2 = berapa satuan tiap kali';
  assert v."jmlObat" = 10, 'jmlObat salah';
  assert v."obatDPHO" = true, 'obat DPHO harus ditandai';
  assert v."nmObatNonDPHO" = '-', 'obat DPHO tidak mengirim nama bebas';
end $$;


\echo '--- 15. Obat di luar DPHO terkirim dengan namanya'
do $$
declare v record; v_resep uuid;
begin
  select id into v_resep from resep
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  update resep_item set obat_dpho = false, kode_pcare = null where resep_id = v_resep;

  select * into v from v_pcare_obat
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert v."nmObatNonDPHO" = 'Parasetamol 500 mg',
    'obat non-DPHO harus terkirim bernama, bukan sebagai tanda hubung';
end $$;


\echo '--- 16. Kekurangan data terstruktur terbaca manusia, bukan diam-diam kosong'
do $$
declare v_kurang text[];
begin
  update pemeriksaan set prognosa_kode = null, keluhan_utama = null
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  update kajian_awal set keluhan_utama = null, suhu = null
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';

  -- Menulis ke pemeriksaan mengembalikan status kunjungan ke PEMERIKSAAN
  -- (trigger maju_status_kunjungan), sedangkan view kesiapan hanya memuat
  -- kunjungan yang SELESAI. Urutannya: ubah dulu, baru tutup kunjungannya.
  update kunjungan set status = 'SELESAI'
   where id = 'ddddddd1-0000-0000-0000-0000000000C2';

  select kekurangan into v_kurang from v_kesiapan_kunjungan
   where id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert 'Prognosa belum dipilih' = any(v_kurang), 'prognosa kosong harus ketahuan';
  assert 'Keluhan utama belum diisi' = any(v_kurang), 'keluhan kosong harus ketahuan';
  assert 'Suhu belum diukur' = any(v_kurang), 'suhu kosong harus ketahuan';

  update kajian_awal set keluhan_utama = 'Batuk berdahak sejak 3 hari', suhu = 37.8
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  update pemeriksaan set prognosa_kode = 'BONAM', keluhan_utama = 'Batuk berdahak sejak 3 hari'
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
end $$;


\echo '--- 17. Pemetaan kode yang belum diisi terdaftar, bukan hilang'
do $$
declare n int;
begin
  -- ref_kesadaran.kode_pcare sengaja belum diisi: nilainya milik BPJS.
  -- Yang penting bukan isinya ada, melainkan ketiadaannya terhitung.
  select count(*) into n from v_kesiapan_kode where tabel = 'ref_kesadaran';
  assert n > 0, 'kode kesadaran yang belum dipetakan harus terdaftar';

  update ref_kesadaran set kode_pcare = '01' where kode = 'CM';
  select count(*) into n from v_kesiapan_kode
   where tabel = 'ref_kesadaran' and kode = 'CM';
  assert n = 0, 'yang sudah dipetakan harus hilang dari daftar kekurangan';

  assert (select "kdSadar" from v_pcare_kunjungan
           where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2') = '01',
    'kdSadar harus memakai pemetaan yang baru diisi';
end $$;


\echo '--- 18. Kesadaran menurut dokter mengalahkan catatan perawat'
do $$
begin
  update ref_kesadaran set kode_pcare = '02' where kode = 'SOMNOLEN';
  update pemeriksaan set kesadaran_kode = 'SOMNOLEN'
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  -- Kajian awal tetap 'CM'. Yang dikirim adalah penilaian dokter saat
  -- memeriksa, bukan angka yang diukur perawat setengah jam sebelumnya.
  assert (select "kdSadar" from v_pcare_kunjungan
           where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2') = '02',
    'kdSadar harus mengikuti penilaian dokter bila ada';

  update pemeriksaan set kesadaran_kode = null
   where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2';
  assert (select "kdSadar" from v_pcare_kunjungan
           where kunjungan_id = 'ddddddd1-0000-0000-0000-0000000000C2') = '01',
    'bila dokter tidak menilai ulang, catatan perawat yang dipakai';
end $$;


\echo '--- 19. Tabel dan view baru bisa dibaca sebagai authenticated, bukan hanya superuser'
do $$
begin
  -- Dua kali sebelumnya modul baru mati dengan "permission denied":
  -- sekali karena tabel baru tidak mewarisi GRANT, sekali karena view.
  -- Uji ini berjalan sebagai role authenticated, bukan sebagai pemilik.
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from ref_sistem_fisik') > 0, 'ref_sistem_fisik tidak terbaca staf';
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from ref_prognosa') > 0, 'ref_prognosa tidak terbaca staf';
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from ref_tacc') > 0, 'ref_tacc tidak terbaca staf';
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from ref_vital') > 0, 'ref_vital tidak terbaca staf';
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from ref_ppk') >= 0, 'ref_ppk tidak terbaca staf';
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from v_pcare_kunjungan') >= 0, 'v_pcare_kunjungan tidak terbaca staf';
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from v_satusehat_observasi') >= 0, 'v_satusehat_observasi tidak terbaca staf';
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from v_kesiapan_kode') >= 0, 'v_kesiapan_kode tidak terbaca staf';
end $$;


\echo '--- 20. Daftar rujukan dan pemetaan kode hanya boleh diubah admin'
do $$
begin
  assert uji_ditolak('33333333-3333-3333-3333-333333333333',
    'insert into ref_ppk (kode, nama) values (''9999X'',''RS Karangan'')'),
    'dokter tidak boleh menambah faskes rujukan sendiri';
  -- Untuk UPDATE, yang menahan perawat bukan galat melainkan nol baris:
  -- kebijakan RLS menyaringnya lebih dulu, jadi perintahnya "berhasil"
  -- tanpa mengubah apa pun. Karena itu yang dihitung barisnya.
  assert uji_terubah('22222222-2222-2222-2222-222222222222',
    'update ref_prognosa set kode_pcare = ''9'' where kode = ''BONAM''') = 0,
    'perawat tidak boleh mengubah pemetaan kode PCare';
  assert (select kode_pcare from ref_prognosa where kode = 'BONAM') is null,
    'pemetaan kode tidak boleh berubah oleh peran non-admin';
  assert not uji_ditolak('11111111-1111-1111-1111-111111111111',
    'insert into ref_ppk (kode, nama) values (''9999X'',''RS Karangan'')'),
    'admin harus boleh mengelola daftar faskes rujukan';
end $$;


-- ---------------------------------------------------------------------
-- Bersih-bersih
-- ---------------------------------------------------------------------
-- Lepaskan dulu acuannya: pemeriksaan masih menunjuk faskes rujukan uji,
-- dan foreign key tidak peduli bahwa ini cuma data uji.
update pemeriksaan set rujuk_ppk_kode = null,
                       rujuk_subspesialis_kode = null,
                       rujuk_sarana_kode = null
 where kunjungan_id in ('ddddddd1-0000-0000-0000-0000000000C1',
                        'ddddddd1-0000-0000-0000-0000000000C2');
delete from ref_ppk where kode in ('9999X','0123R001');
delete from pasien_alergi where pasien_id = 'bbbbbbb1-0000-0000-0000-00000000000F';
update ref_alergi set kode_pcare = null where kode_pcare is not null;
update ref_kesadaran set kode_pcare = null where kode in ('CM','SOMNOLEN');
drop function if exists uji_ditolak(uuid, text);
drop function if exists uji_terlihat(uuid, text);
drop function if exists uji_terubah(uuid, text);

\echo 'SEMUA UJI PEMERIKSAAN TERSTRUKTUR LULUS'

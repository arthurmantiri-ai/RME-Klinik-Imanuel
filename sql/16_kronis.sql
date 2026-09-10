-- =====================================================================
--  RME KLINIK IMANUEL — PEMANTAUAN PASIEN KRONIS (Tahap 1: dasar & migrasi)
--  Jalankan SETELAH 15_antrean.sql. Aman dijalankan di database berisi
--  data, dan aman dijalankan ulang.
--
--  APA YANG DIPINDAH DARI PORTAL, DAN APA YANG TIDAK
--  --------------------------------------------------
--  Portal sipantau menyimpan tiga hal yang diketik manusia:
--    kronis_terapi  — pendaftaran pemegang buku kronis
--    obat_kronis    — satu baris tiap kali pasien mengambil obat
--    lab_rutin      — satu baris tiap kali pasien periksa lab
--
--  Hanya YANG PERTAMA yang jadi tabel di sini. Dua sisanya TIDAK
--  disalin, karena di RME kejadiannya sudah tercatat sendiri:
--
--    ambil obat  = resep berstatus DISERAHKAN -> apotek_transaksi
--                  ('Resep Pasien', membawa pasien_id, kunjungan_id,
--                   resep_item_id, dan tanggal)
--    periksa lab = lab_permintaan status 'SELESAI' + lab_hasil
--
--  Log yang disalin jadi tabel kedua akan berselisih dengan apotek dalam
--  hitungan minggu — alasan yang sama persis dengan keputusan 1 Sep 2026
--  bahwa stok apotek tidak menumpang database portal. Pemantauannya dibuat
--  sebagai view di 17_kronis_pantau.sql, bukan sebagai tabel.
--
--  LALU RIWAYAT LAMA DISIMPAN DI MANA?
--  ------------------------------------
--  Di kronis_riwayat_luar. Pengambilan obat tahun lalu TIDAK BOLEH
--  dijadikan kunjungan + resep + apotek_transaksi palsu: kunjungan yang
--  tidak pernah terjadi akan ikut terhitung di laporan Dinkes, di rekap
--  kasir, dan (kelak) di klaim PCare. Riwayat lama disimpan sebagai
--  riwayat lama, ditandai sumbernya, lalu digabung dengan data RME hanya
--  pada saat ditampilkan.
--
--  KENAPA ADA TABEL TITIPAN (kronis_impor_*)
--  ------------------------------------------
--  Portal mengunci pasien dengan teks: nama + no BPJS. RME mengunci
--  dengan pasien.id, dan tabel pasien MEWAJIBKAN tanggal_lahir dan
--  jenis_kelamin — dua hal yang portal tidak pernah simpan.
--
--  Artinya pasien lama tidak bisa dibuatkan otomatis. Mengarangnya berarti
--  menerbitkan nomor rekam medis — identitas seumur hidup — dari data yang
--  belum pernah dilihat petugas, lalu mendapati pasien kembar saat orangnya
--  benar-benar datang dengan ejaan nama yang sedikit berbeda. Kesalahan itu
--  sudah dihindari sekali waktu memutuskan POST /peserta Antrol tidak
--  menerbitkan rekam medis; tidak ada alasan mengulanginya di sini.
--
--  Jadi seluruh baris portal mendarat lebih dulu di tabel titipan, dan
--  baru menempel ke rekam medis setelah seorang manusia menyetujui
--  pasangannya. Baris yang belum ada pasiennya tetap menunggu di situ —
--  dan menempel sendiri begitu pasiennya didaftarkan.
--
--  YANG SENGAJA TIDAK DIBUAT DI BERKAS INI
--  ----------------------------------------
--    * View pemantauan, jadwal, dan kepatuhan  -> 17_kronis_pantau.sql
--    * Panel laporan                            -> 18_laporan.sql
--    * Pengiriman WhatsApp otomatis — keputusan Arthur 4 Sep 2026:
--      cukup tautan wa.me, tidak ada Fonnte dan tidak ada Edge Function.
-- =====================================================================


-- =====================================================================
--  A. PINTASAN HAK AKSES
-- =====================================================================

-- Dua peran, dua kepentingan berbeda:
--
--   boleh_kronis_kelola() — mengubah pendaftaran buku kronis. Dokter dan
--     perawat ikut, karena penandaannya terjadi di ruang periksa, bukan
--     di meja admin. Kalau hanya admin yang boleh, dokter akan menyerah
--     dan penandaannya tidak pernah dilakukan.
--
--   boleh_kronis_migrasi() — menempelkan riwayat portal ke seorang
--     pasien. Admin saja. Salah tempel berarti riwayat penyakit orang
--     lain masuk ke rekam medis seseorang, dan itu tidak bisa dibereskan
--     dengan meminta maaf.
-- 9 Sep 2026: lewat tabel hak_akses (bisa diatur master), bukan daftar
-- peran tetap lagi — lihat sql/02_rls.sql bagian HAK AKSES. Isian awal
-- (kode `kronis_kelola`: dokter+perawat) menjaga perilaku persis sama
-- seperti sebelumnya; `kronis_migrasi` sengaja tidak diberi isian awal —
-- tetap seperti dulu (hanya admin lama / master sekarang).
create or replace function public.boleh_kronis_kelola() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('kronis_kelola') $$;

create or replace function public.boleh_kronis_migrasi() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('kronis_migrasi') $$;

grant execute on function public.boleh_kronis_kelola()  to authenticated;
grant execute on function public.boleh_kronis_migrasi() to authenticated;

insert into public.hak_akses (kode, peran, diizinkan) values
  ('kronis_kelola',     'dokter',  true),
  ('kronis_kelola',     'perawat', true),
  -- Dipakai js/pages/pantau_kronis.js (tab "Telepon H-1"), bukan RLS —
  -- lihat catatan di berkas itu.
  ('kronis_telpon_h1',  'admin',   true)
on conflict (kode, peran) do nothing;


-- =====================================================================
--  B. REFERENSI
-- =====================================================================

-- B1. Diagnosis kronis yang dipantau.
--
-- Dua kolom yang menentukan bentuk seluruh modul:
--
--   pantau_obat — pasien dengan diagnosis ini dipantau pengambilan
--                 obat bulanannya. Berlaku untuk kesepuluh diagnosis.
--
--   bulan_lab   — jarak kontrol lab dalam bulan. HANYA diisi untuk
--                 diagnosis yang punya jatah pemeriksaan lab. Per
--                 keputusan Arthur 4 Sep 2026 itu cuma HPT dan DM;
--                 delapan sisanya NULL, dan pasiennya tidak akan pernah
--                 muncul di daftar "terlambat lab" untuk pemeriksaan
--                 yang memang tidak dijatahkan padanya.
--
-- alias menyimpan tulisan yang dipakai portal ('Hipertensi', 'HPT',
-- 'Diabetes Melitus', 'DM'), supaya impor bisa memetakan sendiri tanpa
-- ada yang perlu mencocokkan sepuluh kata satu per satu.
create table if not exists ref_kronis_diagnosa (
  kode        text primary key,
  nama        text not null,
  pantau_obat boolean not null default true,
  bulan_lab   smallint check (bulan_lab is null or bulan_lab between 1 and 24),
  alias       text[] not null default '{}',
  -- Awalan kode ICD-10 yang menandakan diagnosis ini. Dipakai untuk
  -- MENGUSULKAN penandaan saat dokter memilih diagnosa — bukan untuk
  -- menandai sendiri. Awalan, bukan kode penuh: E11 harus mengenali
  -- E11.0 sampai E11.9 tanpa sepuluh baris.
  icd10_awal  text[] not null default '{}',
  urutan      smallint not null default 0,
  aktif       boolean not null default true
);

insert into ref_kronis_diagnosa (kode, nama, bulan_lab, alias, icd10_awal, urutan) values
  ('HPT',      'Hipertensi',        6, array['Hipertensi','HPT','HT'],        array['I10','I11','I12','I13','I15'], 1),
  ('DM',       'Diabetes Melitus',  3, array['Diabetes Melitus','DM','DMT2'], array['E10','E11','E13','E14'],       2),
  ('ASMA',     'Asma',           null, array['Asma'],                          array['J45','J46'],                   3),
  ('PPOK',     'PPOK',           null, array['PPOK'],                          array['J44'],                         4),
  ('JANTUNG',  'Jantung',        null, array['Jantung','PJK'],                 array['I20','I21','I25','I50'],       5),
  ('SKIZO',    'Skizofrenia',    null, array['Skizofrenia'],                   array['F20','F25'],                   6),
  ('EPILEPSI', 'Epilepsi',       null, array['Epilepsi'],                      array['G40'],                         7),
  ('STROKE',   'Stroke',         null, array['Stroke'],                        array['I63','I64','I69'],             8),
  ('CKD',      'CKD',            null, array['CKD','Gagal Ginjal Kronik'],     array['N18'],                         9),
  ('SLE',      'SLE',            null, array['SLE','Lupus'],                   array['M32'],                        10)
on conflict (kode) do update
   set nama = excluded.nama, bulan_lab = excluded.bulan_lab,
       alias = excluded.alias, icd10_awal = excluded.icd10_awal,
       urutan = excluded.urutan;


-- B2. Pemeriksaan lab yang MERESET jadwal kontrol.
--
-- Keputusan Arthur 4 Sep 2026: bukan sembarang lembar lab. Pasien DM yang
-- datang periksa Hb karena lemas tidak boleh terhitung sudah kontrol gula
-- — jadwalnya harus tetap jalan, dan dia harus tetap dihubungi.
create table if not exists ref_kronis_lab (
  kode_kronis text not null references ref_kronis_diagnosa(kode) on delete cascade,
  lab_id      uuid not null references ref_lab(id) on delete cascade,
  primary key (kode_kronis, lab_id)
);

-- HbA1c belum ada di master lab (11_penunjang.sql). Ditambahkan di sini
-- karena inilah pemeriksaan baku pemantauan DM; tanpa ini daftar reset
-- jadwal DM tinggal gula sesaat dan gula puasa saja.
insert into ref_lab (kode, nama, kelompok, satuan, jenis_nilai, desimal, urutan)
values ('HBA1C', 'HbA1c', 'KIMIA KLINIK', '%', 'ANGKA', 1, 46)
on conflict (kode) do nothing;

insert into ref_lab_rujukan (lab_id, batas_atas, teks)
select id, 5.7, '< 5,7' from ref_lab where kode = 'HBA1C'
  and not exists (select 1 from ref_lab_rujukan r where r.lab_id = ref_lab.id);

-- DM  : gula puasa, gula 2 jam PP, HbA1c
-- HPT : profil lipid + kreatinin + asam urat
--
-- Gula darah SEWAKTU (GDS) sengaja TIDAK dimasukkan. Nilainya tidak bisa
-- ditafsirkan tanpa tahu kapan pasien terakhir makan, sehingga lembar GDS
-- tidak layak dipakai menyatakan "pemantauan DM sudah dilakukan". Kalau
-- klinik memutuskan lain, tinggal dicentang di Master Data — daftar ini
-- memang dibuat sebagai tabel supaya bisa diubah tanpa mengubah kode.
insert into ref_kronis_lab (kode_kronis, lab_id)
select d.kode, l.id
  from (values
    ('DM',  array['GDP','GD2PP','HBA1C']),
    ('HPT', array['CHOL','HDL','LDL','TG','CR','UA'])
  ) as d(kode, kode_lab)
  join ref_lab l on l.kode = any (d.kode_lab)
on conflict do nothing;


-- B3. Obat berkuota — aturan statin BPJS.
--
-- Di portal aturan ini hidup sebagai dua baris tetap di dalam kode
-- halaman konfirmasi (STATIN_ATURAN), dan tanggal hasil lab LDL-nya
-- diketik tangan ke kolom statin_tanggal_lab.
--
-- Dua-duanya diperbaiki di sini. Aturannya jadi tabel supaya bisa diubah
-- ketika BPJS mengubah kuotanya, dan tanggal labnya diambil dari lab_hasil
-- — angka LDL-nya memang sudah ada di RME, tidak ada gunanya mengetik
-- ulang tanggal yang bisa salah ketik.
create table if not exists ref_kronis_kuota_obat (
  kunci   text primary key,          -- dicocokkan ke obat.nama, huruf kecil
  nama    text not null,
  maks    smallint not null check (maks > 0),
  -- Kuota dihitung sejak tanggal hasil pemeriksaan ini. NULL = dihitung
  -- sejak tanggal_mulai terapi.
  lab_id  uuid references ref_lab(id) on delete set null,
  aktif   boolean not null default true,
  catatan text
);

insert into ref_kronis_kuota_obat (kunci, nama, maks, lab_id, catatan)
select v.kunci, v.nama, v.maks, (select id from ref_lab where kode = 'LDL'), v.catatan
  from (values
    ('atorvastatin', 'Atorvastatin', 3::smallint, 'Maksimal 3 kali penebusan sejak hasil LDL terakhir.'),
    ('simvastatin',  'Simvastatin',  6::smallint, 'Maksimal 6 kali penebusan sejak hasil LDL terakhir.')
  ) as v(kunci, nama, maks, catatan)
on conflict (kunci) do update
   set nama = excluded.nama, maks = excluded.maks, catatan = excluded.catatan;


-- =====================================================================
--  C. PENDAFTARAN PEMEGANG BUKU KRONIS
-- =====================================================================

-- C1. Satu baris = satu pasien pemegang buku kronis.
create table if not exists kronis_terapi (
  id             uuid primary key default uuid_generate_v4(),
  pasien_id      uuid not null references pasien(id) on delete cascade,
  aktif          boolean not null default true,
  tanggal_mulai  date not null default public.tgl_klinik(),
  -- Diisi saat aktif dimatikan; muncul di riwayat supaya alasan berhenti
  -- tidak hilang bersama centangnya.
  tanggal_selesai date,
  alasan_selesai  text,
  catatan        text,
  -- Statin berkuota. statin_obat_id boleh kosong: portal menyimpan
  -- namanya sebagai teks, dan tidak semua teks itu akan ketemu padanannya
  -- di master obat saat migrasi.
  statin_kunci   text references ref_kronis_kuota_obat(kunci) on delete set null,
  statin_obat_id uuid references obat(id) on delete set null,
  statin_nama    text,
  -- Tanggal hasil LDL yang jadi titik nol kuota. Untuk pasien hasil
  -- migrasi ini disalin dari portal; untuk pasien baru dibiarkan kosong
  -- dan diambil dari lab_hasil.
  statin_tgl_lab date,
  created_at     timestamptz not null default now(),
  created_by     uuid references pegawai(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references pegawai(id)
);

-- Satu pasien hanya boleh punya SATU pendaftaran aktif. Yang lama
-- dinonaktifkan, tidak dihapus — riwayat berhenti dan mulai lagi itu
-- informasi klinis, bukan sampah.
create unique index if not exists uq_kronis_terapi_aktif
  on kronis_terapi (pasien_id) where aktif;
create index if not exists idx_kronis_terapi_pasien on kronis_terapi (pasien_id);

drop trigger if exists trg_updated_kronis_terapi on kronis_terapi;
create trigger trg_updated_kronis_terapi before update on kronis_terapi
for each row execute function set_updated_at();


-- C2. Diagnosis kronis pasien (boleh lebih dari satu).
create table if not exists kronis_terapi_diagnosa (
  terapi_id uuid not null references kronis_terapi(id) on delete cascade,
  kode      text not null references ref_kronis_diagnosa(kode),
  primary key (terapi_id, kode)
);


-- C3. Obat rutin bulanan pasien.
--
-- Di portal ini satu kotak teks bebas (resep_tetap). Di sini ia jadi
-- daftar baris bertaut ke master obat, dan itu bukan kerapian belaka:
-- inilah yang membuat "hanya resep berisi obat kronisnya" bisa dihitung.
-- Pasien hipertensi yang datang karena flu dan pulang membawa
-- parasetamol tidak boleh terhitung sudah menebus amlodipinnya.
--
-- obat_id boleh kosong (obat portal yang belum ketemu padanannya di
-- master). Baris tanpa obat_id TIDAK IKUT menghitung — dan justru karena
-- itu ia harus tetap disimpan dan ditampilkan sebagai peringatan, bukan
-- dibuang diam-diam.
create table if not exists kronis_obat (
  id         uuid primary key default uuid_generate_v4(),
  terapi_id  uuid not null references kronis_terapi(id) on delete cascade,
  obat_id    uuid references obat(id) on delete set null,
  nama_obat  text not null,
  signa      text,
  jumlah     numeric(8,2),
  satuan     text,
  urutan     smallint not null default 0
);
create index if not exists idx_kronis_obat_terapi on kronis_obat (terapi_id, urutan);
create index if not exists idx_kronis_obat_obat on kronis_obat (obat_id)
  where obat_id is not null;


-- =====================================================================
--  D. RIWAYAT DARI LUAR RME
-- =====================================================================

-- Pengambilan obat dan pemeriksaan lab yang terjadi SEBELUM RME dipakai.
-- Dibaca oleh view pemantauan bersama data RME, tetapi tidak pernah
-- bercampur dengannya: kolom `sumber` selalu ikut terbawa ke layar,
-- supaya siapa pun yang melihat angka kepatuhan tahu bagian mana yang
-- berasal dari catatan portal dan bagian mana yang dari rekam medis.
create table if not exists kronis_riwayat_luar (
  id            uuid primary key default uuid_generate_v4(),
  pasien_id     uuid not null references pasien(id) on delete cascade,
  jenis         text not null check (jenis in ('AMBIL_OBAT','LAB','KONTROL')),
  tanggal       date not null,
  -- AMBIL_OBAT
  resep_teks    text,
  -- LAB
  lab_diagnosa  text,          -- 'DM' | 'HPT' | 'HPT+DM' apa adanya dari portal
  lab_pemeriksa text,          -- nama lab luar
  -- KONTROL (jadwal kontrol portal yang tanggalnya masih di depan)
  kontrol_poli     text,
  kontrol_dokter   text,
  kontrol_instruksi text,
  catatan       text,
  sumber        text not null default 'PORTAL',
  sumber_id     text,          -- id baris asli di portal
  created_at    timestamptz not null default now(),
  created_by    uuid references pegawai(id)
);

-- Impor yang diulang tidak boleh menggandakan riwayat. Kuncinya id asli
-- di portal, bukan tanggal: pasien yang benar-benar mengambil obat dua
-- kali di bulan yang sama (obat hilang, dosis diubah) punya dua baris di
-- portal dengan dua id berbeda, dan keduanya memang harus masuk.
create unique index if not exists uq_kronis_riwayat_sumber
  on kronis_riwayat_luar (sumber, jenis, sumber_id)
  where sumber_id is not null;
create index if not exists idx_kronis_riwayat_pasien
  on kronis_riwayat_luar (pasien_id, jenis, tanggal desc);


-- =====================================================================
--  E. TABEL TITIPAN MIGRASI
-- =====================================================================

-- E1. Satu baris = satu ORANG menurut catatan portal.
--
-- Kuncinya persis mengikuti labKunciPasien() di portal:
--   'b:' + angka nomor BPJS bila ada, kalau tidak 'n:' + nama huruf kecil.
-- Dipakai sama supaya pasien yang di portal terhitung satu orang tidak
-- pecah jadi dua di sini — dan sebaliknya.
create table if not exists kronis_impor_pasien (
  id            bigserial primary key,
  kunci         text not null unique,
  nama_pasien   text not null,
  no_bpjs       text,
  no_telp       text,
  -- Ringkasan isi, supaya halaman pencocokan bisa mengurutkan yang
  -- paling banyak riwayatnya lebih dulu tanpa menghitung ulang.
  jml_obat      integer not null default 0,
  jml_lab       integer not null default 0,
  jml_kontrol   integer not null default 0,
  punya_terapi  boolean not null default false,
  diagnosis_teks text,
  status        text not null default 'MENUNGGU'
                check (status in ('MENUNGGU','COCOK','ABAIKAN')),
  pasien_id     uuid references pasien(id) on delete set null,
  alasan        text,
  dicocokkan_oleh uuid references pegawai(id),
  dicocokkan_pada timestamptz,
  created_at    timestamptz not null default now()
);

-- Satu pasien RME hanya boleh jadi tujuan satu baris titipan. Tanpa ini,
-- dua ejaan nama yang sama-sama ditempel ke orang yang sama akan
-- menggandakan seluruh riwayatnya, dan grafik kepatuhannya jadi mustahil
-- dibaca. Kalau memang dua baris portal adalah orang yang sama, yang
-- benar adalah menggabungnya di halaman pencocokan, bukan menempel dua kali.
create unique index if not exists uq_kronis_impor_pasien
  on kronis_impor_pasien (pasien_id) where pasien_id is not null;
create index if not exists idx_kronis_impor_status
  on kronis_impor_pasien (status, nama_pasien);


-- E2. Baris mentah dari portal, apa adanya.
--
-- isi disimpan sebagai jsonb utuh — bukan dipecah ke kolom — karena
-- tujuannya bertahan terhadap kolom portal yang tidak saya ketahui.
-- Sekali baris ini dituangkan, `dituang` menjadi true dan tidak pernah
-- dituangkan lagi, sehingga impor ulang aman.
create table if not exists kronis_impor_baris (
  id        bigserial primary key,
  impor_id  bigint not null references kronis_impor_pasien(id) on delete cascade,
  sumber    text not null check (sumber in
              ('KRONIS_TERAPI','OBAT_KRONIS','LAB_RUTIN','PASIEN_KONTROL')),
  sumber_id text,
  tanggal   date,
  isi       jsonb not null,
  dituang   boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_kronis_impor_baris
  on kronis_impor_baris (sumber, sumber_id) where sumber_id is not null;
create index if not exists idx_kronis_impor_baris_impor
  on kronis_impor_baris (impor_id, sumber, tanggal);


-- =====================================================================
--  F. FUNGSI BANTU
-- =====================================================================

-- F1. Kunci pasien versi portal. Ditulis sekali di sini dan dipakai
--     oleh impor maupun uji, supaya tidak ada dua definisi yang
--     perlahan menyimpang.
create or replace function public.kronis_kunci(p_nama text, p_bpjs text)
returns text language sql immutable as $$
  select case
    when coalesce(regexp_replace(coalesce(p_bpjs,''), '\D', '', 'g'), '') <> ''
      then 'b:' || regexp_replace(p_bpjs, '\D', '', 'g')
    else 'n:' || lower(btrim(coalesce(p_nama,'')))
  end
$$;

-- F2. Memetakan tulisan diagnosis portal ke kode ref_kronis_diagnosa.
--     Portal menulis 'Hipertensi, Diabetes Melitus' pada obat kronis dan
--     'HPT+DM' pada lab rutin. Keduanya dipecah di sini: koma, tanda
--     tambah, dan garis miring sama-sama dianggap pemisah.
create or replace function public.kronis_kode_diagnosa(p_teks text)
returns text[] language sql stable as $$
  select coalesce(array_agg(distinct d.kode order by d.kode), '{}')
    from unnest(string_to_array(
           regexp_replace(coalesce(p_teks,''), '[+/;]', ',', 'g'), ',')) as potong(kata)
    join ref_kronis_diagnosa d
      on exists (
        select 1 from unnest(d.alias) a
         where lower(btrim(a)) = lower(btrim(potong.kata))
      )
$$;

grant execute on function public.kronis_kunci(text, text)   to authenticated;
grant execute on function public.kronis_kode_diagnosa(text) to authenticated;


-- =====================================================================
--  G. MENAMPUNG DATA PORTAL
-- =====================================================================

-- Menerima satu larik jsonb berisi baris apa adanya dari portal.
-- Mengelompokkannya per orang, dan memulangkan berapa yang masuk.
--
-- Dipanggil berulang tidak menggandakan apa pun: baris dikenali dari
-- (sumber, sumber_id), dan id portal tidak pernah berubah.
create or replace function public.kronis_impor_tampung(
  p_sumber text,
  p_baris  jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row     jsonb;
  v_nama    text;
  v_bpjs    text;
  v_telp    text;
  v_kunci   text;
  v_impor   bigint;
  v_sid     text;
  v_tgl     date;
  v_masuk   int := 0;
  v_lewat   int := 0;
  v_orang   int := 0;
begin
  if not public.boleh_kronis_migrasi() then
    raise exception 'Hanya admin yang boleh memasukkan data migrasi.'
      using errcode = '42501';
  end if;
  if p_sumber not in ('KRONIS_TERAPI','OBAT_KRONIS','LAB_RUTIN','PASIEN_KONTROL') then
    raise exception 'Sumber "%" tidak dikenal.', p_sumber;
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_baris, '[]'::jsonb))
  loop
    v_nama := btrim(coalesce(v_row->>'nama_pasien', ''));
    if v_nama = '' then v_lewat := v_lewat + 1; continue; end if;

    v_bpjs := nullif(btrim(coalesce(v_row->>'no_bpjs','')), '');
    -- pasien_kontrol memakai no_wa, tiga tabel lain memakai no_telp.
    v_telp := nullif(btrim(coalesce(v_row->>'no_telp', v_row->>'no_wa', '')), '');
    v_kunci := public.kronis_kunci(v_nama, v_bpjs);
    v_sid  := nullif(btrim(coalesce(v_row->>'id','')), '');

    v_tgl := nullif(coalesce(
               v_row->>'tanggal_ambil', v_row->>'tanggal_lab',
               v_row->>'tanggal_kontrol', v_row->>'tanggal_ambil_terakhir'), '')::date;

    insert into kronis_impor_pasien (kunci, nama_pasien, no_bpjs, no_telp)
    values (v_kunci, v_nama, v_bpjs, v_telp)
    on conflict (kunci) do update
       set nama_pasien = case when kronis_impor_pasien.no_bpjs is null
                              then excluded.nama_pasien
                              else kronis_impor_pasien.nama_pasien end,
           no_telp = coalesce(kronis_impor_pasien.no_telp, excluded.no_telp)
    returning id into v_impor;

    if v_impor is null then
      select id into v_impor from kronis_impor_pasien where kunci = v_kunci;
    else
      v_orang := v_orang + 1;
    end if;

    begin
      insert into kronis_impor_baris (impor_id, sumber, sumber_id, tanggal, isi)
      values (v_impor, p_sumber, v_sid, v_tgl, v_row);
      v_masuk := v_masuk + 1;
    exception when unique_violation then
      v_lewat := v_lewat + 1;   -- baris ini sudah pernah masuk
    end;
  end loop;

  -- Ringkasan per orang dihitung ulang, bukan dinaikkan satu-satu: impor
  -- yang diulang sebagian tidak boleh membuat angkanya menggelembung.
  update kronis_impor_pasien p set
    jml_obat    = (select count(*) from kronis_impor_baris b
                    where b.impor_id = p.id and b.sumber = 'OBAT_KRONIS'),
    jml_lab     = (select count(*) from kronis_impor_baris b
                    where b.impor_id = p.id and b.sumber = 'LAB_RUTIN'),
    jml_kontrol = (select count(*) from kronis_impor_baris b
                    where b.impor_id = p.id and b.sumber = 'PASIEN_KONTROL'),
    punya_terapi = exists (select 1 from kronis_impor_baris b
                    where b.impor_id = p.id and b.sumber = 'KRONIS_TERAPI'),
    diagnosis_teks = coalesce(
      (select b.isi->>'diagnosis' from kronis_impor_baris b
        where b.impor_id = p.id and b.sumber = 'KRONIS_TERAPI' limit 1),
      (select b.isi->>'diagnosa' from kronis_impor_baris b
        where b.impor_id = p.id and b.sumber = 'LAB_RUTIN'
        order by b.tanggal desc nulls last limit 1),
      p.diagnosis_teks)
  where exists (select 1 from kronis_impor_baris b where b.impor_id = p.id);

  return jsonb_build_object(
    'sumber', p_sumber, 'masuk', v_masuk, 'dilewati', v_lewat, 'orang_baru', v_orang);
end $$;

grant execute on function public.kronis_impor_tampung(text, jsonb) to authenticated;


-- =====================================================================
--  H. MENCOCOKKAN & MENUANGKAN
-- =====================================================================

-- H1. Usulan pasangan untuk satu baris titipan.
--
-- Tiga tingkat, dan urutannya penting:
--   1. Nomor BPJS sama persis  -> skor 100
--   2. Nama sama persis        -> skor  90
--   3. Nama mirip (trigram)    -> skor  di bawah itu
--
-- Perhatikan yang TIDAK dilakukan: nomor BPJS yang cocok pun tetap hanya
-- jadi USULAN. pasien.no_bpjs tidak unik di RME, dan satu digit salah
-- ketik saat pendaftaran sudah cukup untuk menempelkan riwayat penyakit
-- seseorang ke orang lain.
create or replace function public.kronis_impor_usulan(p_impor_id bigint, p_batas int default 8)
returns table (
  pasien_id uuid, no_rm text, nama text, tanggal_lahir date,
  jenis_kelamin jenis_kelamin_t, no_bpjs text, nik text, alamat text,
  skor numeric, alasan text
)
language sql stable security definer set search_path = public as $$
  with t as (select * from kronis_impor_pasien where id = p_impor_id),
  bpjs as (select regexp_replace(coalesce((select no_bpjs from t),''), '\D', '', 'g') as n)
  select p.id, p.no_rm, p.nama, p.tanggal_lahir, p.jenis_kelamin,
         p.no_bpjs, p.nik, p.alamat,
         greatest(
           case when (select n from bpjs) <> ''
                 and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g') = (select n from bpjs)
                then 100 else 0 end,
           case when lower(btrim(p.nama)) = lower(btrim((select nama_pasien from t)))
                then 90 else 0 end,
           round(similarity(p.nama, (select nama_pasien from t))::numeric * 80, 1)
         ) as skor,
         case
           when (select n from bpjs) <> ''
            and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g') = (select n from bpjs)
             then 'Nomor BPJS sama'
           when lower(btrim(p.nama)) = lower(btrim((select nama_pasien from t)))
             then 'Nama sama persis'
           else 'Nama mirip'
         end as alasan
    from pasien p
   where p.aktif
     and (
       ((select n from bpjs) <> ''
         and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g') = (select n from bpjs))
       or similarity(p.nama, (select nama_pasien from t)) > 0.25
     )
     -- Pasien yang sudah jadi tujuan baris titipan lain tidak diusulkan lagi.
     and not exists (select 1 from kronis_impor_pasien k
                      where k.pasien_id = p.id and k.id <> p_impor_id)
   order by skor desc, p.nama
   limit greatest(1, coalesce(p_batas, 8));
$$;

grant execute on function public.kronis_impor_usulan(bigint, int) to authenticated;


-- H2. Menempelkan satu baris titipan ke seorang pasien, lalu menuangkan
--     isinya. Seluruhnya satu transaksi: kalau ada yang gagal di tengah,
--     tidak ada separuh riwayat yang tertinggal.
create or replace function public.kronis_impor_cocokkan(
  p_impor_id bigint,
  p_pasien_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_t        kronis_impor_pasien%rowtype;
  v_b        kronis_impor_baris%rowtype;
  v_terapi   uuid;
  v_kode     text[];
  v_k        text;
  v_obat     int := 0;
  v_lab      int := 0;
  v_kontrol  int := 0;
  v_kuota    ref_kronis_kuota_obat%rowtype;
  v_nama_st  text;
  v_hari_ini date := public.tgl_klinik();
begin
  if not public.boleh_kronis_migrasi() then
    raise exception 'Hanya admin yang boleh mencocokkan data migrasi.'
      using errcode = '42501';
  end if;

  select * into v_t from kronis_impor_pasien where id = p_impor_id for update;
  if not found then raise exception 'Baris titipan tidak ditemukan.'; end if;
  if v_t.status = 'COCOK' then
    raise exception 'Baris ini sudah dicocokkan ke pasien lain. Batalkan dulu bila keliru.';
  end if;
  if not exists (select 1 from pasien where id = p_pasien_id) then
    raise exception 'Pasien tidak ditemukan.';
  end if;
  if exists (select 1 from kronis_impor_pasien
              where pasien_id = p_pasien_id and id <> p_impor_id) then
    raise exception 'Pasien ini sudah jadi tujuan baris titipan lain. '
                    'Gabungkan dua barisnya dulu, jangan ditempel dua kali.';
  end if;

  update kronis_impor_pasien
     set status = 'COCOK', pasien_id = p_pasien_id,
         dicocokkan_oleh = auth.uid(), dicocokkan_pada = now(), alasan = null
   where id = p_impor_id;

  -- --- Pendaftaran buku kronis --------------------------------------
  select * into v_b from kronis_impor_baris
   where impor_id = p_impor_id and sumber = 'KRONIS_TERAPI' and not dituang
   order by id limit 1;

  if found then
    select id into v_terapi from kronis_terapi
     where pasien_id = p_pasien_id and aktif;

    if v_terapi is null then
      v_nama_st := nullif(btrim(coalesce(v_b.isi->>'statin_obat','')), '');
      if v_nama_st is not null then
        select * into v_kuota from ref_kronis_kuota_obat
         where aktif and position(kunci in lower(v_nama_st)) > 0 limit 1;
      end if;

      insert into kronis_terapi (
        pasien_id, aktif, tanggal_mulai, catatan,
        statin_kunci, statin_nama, statin_tgl_lab, created_by)
      values (
        p_pasien_id,
        coalesce((v_b.isi->>'aktif')::boolean, true),
        least(coalesce(nullif(v_b.isi->>'tanggal_ambil_terakhir','')::date, v_hari_ini), v_hari_ini),
        'Dipindahkan dari portal sipantau.',
        v_kuota.kunci, v_nama_st,
        nullif(v_b.isi->>'statin_tanggal_lab','')::date,
        auth.uid())
      returning id into v_terapi;

      -- Diagnosis
      v_kode := public.kronis_kode_diagnosa(v_b.isi->>'diagnosis');
      foreach v_k in array v_kode loop
        insert into kronis_terapi_diagnosa (terapi_id, kode) values (v_terapi, v_k)
        on conflict do nothing;
      end loop;

      -- Obat rutin: teks bebas portal dipecah per baris. Yang cocok
      -- namanya dengan master obat langsung bertaut; yang tidak, tetap
      -- disimpan tanpa taut dan akan muncul sebagai peringatan di layar.
      insert into kronis_obat (terapi_id, obat_id, nama_obat, urutan)
      select v_terapi,
             (select o.id from obat o
               where o.aktif and lower(o.nama) = lower(btrim(baris.teks)) limit 1),
             btrim(baris.teks), baris.urut
        from unnest(string_to_array(coalesce(v_b.isi->>'resep_tetap',''), E'\n'))
             with ordinality as baris(teks, urut)
       where btrim(coalesce(baris.teks,'')) <> '';
    end if;

    update kronis_impor_baris set dituang = true where id = v_b.id;
  end if;

  -- --- Riwayat pengambilan obat --------------------------------------
  insert into kronis_riwayat_luar (
    pasien_id, jenis, tanggal, resep_teks, catatan, sumber_id, created_by)
  select p_pasien_id, 'AMBIL_OBAT',
         (b.isi->>'tanggal_ambil')::date,
         nullif(btrim(coalesce(b.isi->>'resep_obat','')), ''),
         nullif(btrim(coalesce(b.isi->>'diagnosis','')), ''),
         b.sumber_id, auth.uid()
    from kronis_impor_baris b
   where b.impor_id = p_impor_id and b.sumber = 'OBAT_KRONIS'
     and not b.dituang and nullif(b.isi->>'tanggal_ambil','') is not null
  on conflict do nothing;
  get diagnostics v_obat = row_count;

  -- --- Riwayat pemeriksaan lab ---------------------------------------
  insert into kronis_riwayat_luar (
    pasien_id, jenis, tanggal, lab_diagnosa, lab_pemeriksa, catatan, sumber_id, created_by)
  select p_pasien_id, 'LAB',
         (b.isi->>'tanggal_lab')::date,
         nullif(btrim(coalesce(b.isi->>'diagnosa','')), ''),
         nullif(btrim(coalesce(b.isi->>'lab_pemeriksa','')), ''),
         nullif(btrim(coalesce(b.isi->>'catatan','')), ''),
         b.sumber_id, auth.uid()
    from kronis_impor_baris b
   where b.impor_id = p_impor_id and b.sumber = 'LAB_RUTIN'
     and not b.dituang and nullif(b.isi->>'tanggal_lab','') is not null
  on conflict do nothing;
  get diagnostics v_lab = row_count;

  -- --- Jadwal kontrol yang masih di depan -----------------------------
  --
  -- Hanya yang tanggalnya belum lewat. Jadwal kontrol yang sudah berlalu
  -- tidak ada gunanya dibawa: ia bukan riwayat penyakit, hanya pengingat
  -- yang sudah kedaluwarsa. Yang masih di depan justru wajib dibawa —
  -- kalau tidak, pasien yang seharusnya ditelepon minggu depan hilang
  -- begitu saja saat portal dipensiunkan.
  insert into kronis_riwayat_luar (
    pasien_id, jenis, tanggal, kontrol_poli, kontrol_dokter, kontrol_instruksi,
    catatan, sumber_id, created_by)
  select p_pasien_id, 'KONTROL',
         (b.isi->>'tanggal_kontrol')::date,
         nullif(btrim(coalesce(b.isi->>'poli_asal','')), ''),
         nullif(btrim(coalesce(b.isi->>'nama_dokter','')), ''),
         nullif(btrim(coalesce(b.isi->>'instruksi_petugas','')), ''),
         nullif(btrim(coalesce(b.isi->>'diagnosa','')), ''),
         b.sumber_id, auth.uid()
    from kronis_impor_baris b
   where b.impor_id = p_impor_id and b.sumber = 'PASIEN_KONTROL'
     and not b.dituang
     and nullif(b.isi->>'tanggal_kontrol','') is not null
     and (b.isi->>'tanggal_kontrol')::date >= v_hari_ini
  on conflict do nothing;
  get diagnostics v_kontrol = row_count;

  update kronis_impor_baris set dituang = true
   where impor_id = p_impor_id and not dituang;

  return jsonb_build_object(
    'impor_id', p_impor_id, 'pasien_id', p_pasien_id,
    'terapi', v_terapi is not null,
    'ambil_obat', v_obat, 'lab', v_lab, 'kontrol', v_kontrol);
end $$;

grant execute on function public.kronis_impor_cocokkan(bigint, uuid) to authenticated;


-- H3. Membatalkan pencocokan yang keliru.
--
-- Wajib ada. Halaman yang bisa menempel tapi tidak bisa melepas akan
-- membuat petugas ragu menekan tombolnya, lalu seluruh pencocokan
-- berhenti di baris pertama yang meragukan.
create or replace function public.kronis_impor_batal_cocok(p_impor_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_t       kronis_impor_pasien%rowtype;
  v_hapus   int := 0;
  v_terapi  uuid;
begin
  if not public.boleh_kronis_migrasi() then
    raise exception 'Hanya admin yang boleh membatalkan pencocokan.'
      using errcode = '42501';
  end if;

  select * into v_t from kronis_impor_pasien where id = p_impor_id for update;
  if not found then raise exception 'Baris titipan tidak ditemukan.'; end if;
  if v_t.status <> 'COCOK' or v_t.pasien_id is null then
    raise exception 'Baris ini belum dicocokkan.';
  end if;

  -- Hanya riwayat yang berasal dari baris titipan INI yang dicabut.
  delete from kronis_riwayat_luar r
   where r.pasien_id = v_t.pasien_id
     and r.sumber = 'PORTAL'
     and r.sumber_id in (select b.sumber_id from kronis_impor_baris b
                          where b.impor_id = p_impor_id and b.sumber_id is not null);
  get diagnostics v_hapus = row_count;

  -- Pendaftaran buku kronis ikut dicabut HANYA bila ia memang lahir dari
  -- migrasi ini dan belum dipakai sesudahnya.
  select id into v_terapi from kronis_terapi
   where pasien_id = v_t.pasien_id and aktif
     and catatan = 'Dipindahkan dari portal sipantau.';
  if v_terapi is not null then
    delete from kronis_terapi where id = v_terapi;
  end if;

  update kronis_impor_baris set dituang = false where impor_id = p_impor_id;
  update kronis_impor_pasien
     set status = 'MENUNGGU', pasien_id = null,
         dicocokkan_oleh = null, dicocokkan_pada = null
   where id = p_impor_id;

  return jsonb_build_object('impor_id', p_impor_id,
    'riwayat_dicabut', v_hapus, 'terapi_dicabut', v_terapi is not null);
end $$;

grant execute on function public.kronis_impor_batal_cocok(bigint) to authenticated;


-- H4. Menandai baris titipan sebagai tidak perlu dipindah.
create or replace function public.kronis_impor_abaikan(p_impor_id bigint, p_alasan text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.boleh_kronis_migrasi() then
    raise exception 'Hanya admin yang boleh mengubah data migrasi.'
      using errcode = '42501';
  end if;
  if exists (select 1 from kronis_impor_pasien where id = p_impor_id and status = 'COCOK') then
    raise exception 'Baris ini sudah dicocokkan. Batalkan pencocokannya lebih dulu.';
  end if;
  update kronis_impor_pasien
     set status = 'ABAIKAN', alasan = nullif(btrim(coalesce(p_alasan,'')), ''),
         dicocokkan_oleh = auth.uid(), dicocokkan_pada = now()
   where id = p_impor_id;
  if not found then raise exception 'Baris titipan tidak ditemukan.'; end if;
  return jsonb_build_object('impor_id', p_impor_id, 'status', 'ABAIKAN');
end $$;

grant execute on function public.kronis_impor_abaikan(bigint, text) to authenticated;


-- H5. Menempelkan ulang seluruh baris MENUNGGU yang nomor BPJS-nya kini
--     cocok persis dengan seorang pasien.
--
-- Inilah yang membuat "riwayat menempel sendiri begitu pasiennya
-- didaftarkan" benar-benar terjadi: dijalankan dari tombol di halaman
-- pencocokan setelah sekelompok pasien baru didaftarkan.
--
-- Hanya kecocokan BPJS PERSIS, dan hanya bila nomor itu menunjuk ke
-- SATU pasien. Nama mirip tidak pernah ditempel sendiri.
create or replace function public.kronis_impor_cocokkan_otomatis()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r        record;
  v_ok     int := 0;
  v_gagal  int := 0;
  v_pesan  text[] := '{}';
begin
  if not public.boleh_kronis_migrasi() then
    raise exception 'Hanya admin yang boleh mencocokkan data migrasi.'
      using errcode = '42501';
  end if;

  for r in
    select k.id as impor_id,
           -- limit 1 bukan kelalaian: berapa banyak yang cocok dijawab oleh
           -- kolom jml di bawah. Subquery skalar yang memulangkan dua baris
           -- meledak dengan "more than one row returned" — persis pada
           -- nomor BPJS ganda, yaitu keadaan yang justru harus ditangani
           -- dengan tenang, bukan dengan galat di tengah impor.
           (select p.id from pasien p
             where p.aktif
               and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g')
                 = regexp_replace(k.no_bpjs, '\D', '', 'g')
             limit 1) as pasien_id,
           (select count(*) from pasien p
             where p.aktif
               and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g')
                 = regexp_replace(k.no_bpjs, '\D', '', 'g')) as jml
      from kronis_impor_pasien k
     where k.status = 'MENUNGGU'
       and nullif(regexp_replace(coalesce(k.no_bpjs,''), '\D', '', 'g'), '') is not null
     order by k.id
  loop
    -- Nomor BPJS yang menunjuk ke dua pasien adalah tanda salah ketik di
    -- salah satunya. Ditinggalkan untuk dilihat manusia, bukan ditebak.
    if r.jml <> 1 or r.pasien_id is null then
      v_gagal := v_gagal + 1; continue;
    end if;
    begin
      perform public.kronis_impor_cocokkan(r.impor_id, r.pasien_id);
      v_ok := v_ok + 1;
    exception when others then
      v_gagal := v_gagal + 1;
      v_pesan := v_pesan || (r.impor_id::text || ': ' || sqlerrm);
    end;
  end loop;

  return jsonb_build_object('tertempel', v_ok, 'tersisa', v_gagal, 'pesan', to_jsonb(v_pesan));
end $$;

grant execute on function public.kronis_impor_cocokkan_otomatis() to authenticated;


-- H6. Membuang seluruh data titipan yang sudah selesai dikerjakan.
create or replace function public.kronis_impor_bersihkan(p_semua boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.boleh_kronis_migrasi() then
    raise exception 'Hanya admin yang boleh membersihkan data migrasi.'
      using errcode = '42501';
  end if;
  if p_semua then
    delete from kronis_impor_pasien;
  else
    delete from kronis_impor_pasien where status in ('COCOK','ABAIKAN');
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('dihapus', v_n);
end $$;

grant execute on function public.kronis_impor_bersihkan(boolean) to authenticated;


-- =====================================================================
--  I. KOLOM TAMBAHAN PADA TABEL YANG SUDAH ADA
-- =====================================================================

-- Instruksi untuk petugas yang menelepon pasien H-1 sebelum kontrol.
-- Padanan instruksi_petugas di portal.
--
-- Ditulis DOKTER saat memeriksa, dibaca PETUGAS saat menelepon. Tanpa
-- kolom ini petugas harus menebak sendiri apakah pasien perlu puasa —
-- dan tebakan yang salah membuat pasien datang, gagal diperiksa, dan
-- pulang lagi.
alter table pemeriksaan add column if not exists kontrol_instruksi text;

comment on column pemeriksaan.kontrol_instruksi is
  'Pesan untuk petugas yang menghubungi pasien H-1 sebelum tanggal_kontrol,
   mis. "ingatkan puasa 10 jam sebelum datang".';


-- =====================================================================
--  J. HAK AKSES TABEL
--
--  Tabel baru TIDAK mewarisi GRANT dari 02_rls.sql — dua kali tertimpa
--  pelajaran ini (apotek_batch, lalu view modul penunjang). Ditulis
--  eksplisit di sini untuk setiap tabel.
-- =====================================================================

grant select on ref_kronis_diagnosa, ref_kronis_lab, ref_kronis_kuota_obat to authenticated;
grant select, insert, update, delete on
  kronis_terapi, kronis_terapi_diagnosa, kronis_obat to authenticated;
grant select on kronis_riwayat_luar to authenticated;
grant select on kronis_impor_pasien, kronis_impor_baris to authenticated;
grant usage, select on sequence kronis_impor_pasien_id_seq to authenticated;
grant usage, select on sequence kronis_impor_baris_id_seq  to authenticated;

alter table ref_kronis_diagnosa    enable row level security;
alter table ref_kronis_lab         enable row level security;
alter table ref_kronis_kuota_obat  enable row level security;
alter table kronis_terapi          enable row level security;
alter table kronis_terapi_diagnosa enable row level security;
alter table kronis_obat            enable row level security;
alter table kronis_riwayat_luar    enable row level security;
alter table kronis_impor_pasien    enable row level security;
alter table kronis_impor_baris     enable row level security;

-- Referensi: dibaca semua staf, diubah kode `master_data`.
do $$
declare t text;
begin
  foreach t in array array['ref_kronis_diagnosa','ref_kronis_lab','ref_kronis_kuota_obat']
  loop
    execute format($f$drop policy if exists %I on %I$f$, t || '_baca', t);
    execute format($f$create policy %I on %I for select
                     to authenticated using (public.saya_staf())$f$, t || '_baca', t);
    execute format($f$drop policy if exists %I on %I$f$, t || '_kelola', t);
    execute format($f$create policy %I on %I for all to authenticated
                     using (public.boleh_master_data())
                     with check (public.boleh_master_data())$f$, t || '_kelola', t);
  end loop;
end $$;

-- Pendaftaran buku kronis: dibaca semua staf, ditulis admin/dokter/perawat.
drop policy if exists kronis_terapi_baca on kronis_terapi;
create policy kronis_terapi_baca on kronis_terapi for select
  to authenticated using (public.saya_staf());

drop policy if exists kronis_terapi_tulis on kronis_terapi;
create policy kronis_terapi_tulis on kronis_terapi for all
  to authenticated
  using (public.boleh_kronis_kelola())
  with check (public.boleh_kronis_kelola());

do $$
declare t text;
begin
  foreach t in array array['kronis_terapi_diagnosa','kronis_obat']
  loop
    execute format($f$drop policy if exists %I on %I$f$, t || '_baca', t);
    execute format($f$create policy %I on %I for select
                     to authenticated using (public.saya_staf())$f$, t || '_baca', t);
    execute format($f$drop policy if exists %I on %I$f$, t || '_tulis', t);
    execute format($f$create policy %I on %I for all to authenticated
                     using (public.boleh_kronis_kelola())
                     with check (public.boleh_kronis_kelola())$f$, t || '_tulis', t);
  end loop;
end $$;

-- Riwayat luar & tabel titipan: dibaca staf, ditulis HANYA lewat fungsi
-- security definer di atas. Tidak ada policy tulis sama sekali — bukan
-- kelalaian: menempelkan riwayat orang lain ke rekam medis seseorang
-- tidak boleh bisa dilakukan dengan satu permintaan PostgREST.
drop policy if exists kronis_riwayat_baca on kronis_riwayat_luar;
create policy kronis_riwayat_baca on kronis_riwayat_luar for select
  to authenticated using (public.saya_staf());

drop policy if exists kronis_impor_pasien_baca on kronis_impor_pasien;
create policy kronis_impor_pasien_baca on kronis_impor_pasien for select
  to authenticated using (public.boleh_kronis_migrasi());

drop policy if exists kronis_impor_baris_baca on kronis_impor_baris;
create policy kronis_impor_baris_baca on kronis_impor_baris for select
  to authenticated using (public.boleh_kronis_migrasi());


-- =====================================================================
--  K. RINGKASAN MIGRASI (untuk kepala halaman pencocokan)
-- =====================================================================

create or replace view v_kronis_impor_ringkas with (security_invoker = true) as
select
  count(*)                                              as total,
  count(*) filter (where status = 'MENUNGGU')           as menunggu,
  count(*) filter (where status = 'COCOK')              as cocok,
  count(*) filter (where status = 'ABAIKAN')            as abaikan,
  coalesce(sum(jml_obat), 0)                            as baris_obat,
  coalesce(sum(jml_lab), 0)                             as baris_lab,
  coalesce(sum(jml_kontrol), 0)                         as baris_kontrol,
  count(*) filter (where status = 'MENUNGGU'
                     and nullif(regexp_replace(coalesce(no_bpjs,''), '\D', '', 'g'),'') is null)
                                                        as menunggu_tanpa_bpjs
  from kronis_impor_pasien;

grant select on v_kronis_impor_ringkas to authenticated;

comment on view v_kronis_impor_ringkas is
  'Ringkasan pekerjaan pencocokan data portal. security_invoker: yang tidak
   boleh membaca kronis_impor_pasien tidak akan melihat angkanya juga.';

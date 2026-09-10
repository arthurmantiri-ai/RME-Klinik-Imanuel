-- =====================================================================
--  RME KLINIK IMANUEL - SKEMA DATABASE
--  Rekam Medis Elektronik Klinik Pratama (Rawat Jalan)
--  Target: Supabase (PostgreSQL 15+)
--  Versi   : 1.0
--  Catatan : Jalankan file ini LEBIH DULU, lalu 02_rls.sql, 03_audit.sql,
--            terakhir 04_seed.sql
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";     -- untuk pencarian nama/ICD cepat

-- ---------------------------------------------------------------------
-- ENUM / TIPE DATA
-- ---------------------------------------------------------------------
-- Nama peran (9 Sep 2026): 'master' = pemilik/pengelola tertinggi sistem
-- (dulu bernama 'admin'); 'admin' sekarang = staf loket/pendaftaran (dulu
-- bernama 'pendaftaran' — ini istilah yang dipakai staf sehari-hari untuk
-- petugas administrasi loket). Peran 'kasir' ditambah belakangan lewat
-- sql/07_peran_kasir.sql (lihat catatan di berkas itu soal kenapa terpisah).
do $$ begin
  create type peran_pegawai as enum ('master','admin','perawat','dokter','apoteker');
exception when duplicate_object then null; end $$;

do $$ begin
  create type jenis_kelamin_t as enum ('L','P');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cara_bayar_t as enum ('BPJS','UMUM','ASURANSI_LAIN','GRATIS');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_kunjungan_t as enum
    ('MENUNGGU','KAJIAN_AWAL','MENUNGGU_DOKTER','PEMERIKSAAN','SELESAI','BATAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type jenis_diagnosa_t as enum ('PRIMER','SEKUNDER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kasus_t as enum ('BARU','LAMA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tindak_lanjut_t as enum ('SELESAI','KONTROL','RUJUK_INTERNAL','RUJUK_LANJUT','RUJUK_IGD');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_bridging_t as enum ('BELUM','ANTRE','TERKIRIM','GAGAL','TIDAK_PERLU');
exception when duplicate_object then null; end $$;

-- =====================================================================
--  A. MASTER / REFERENSI
-- =====================================================================

-- A1. Profil fasilitas kesehatan (satu baris saja)
create table if not exists faskes (
  id                  smallint primary key default 1 check (id = 1),
  nama                text not null default 'Klinik Pratama Imanuel',
  jenis_faskes        text not null default 'Klinik Pratama',
  alamat              text,
  kelurahan           text,
  kecamatan           text,
  kabupaten           text,
  provinsi            text,
  kode_pos            text,
  telepon             text,
  email               text,
  -- Identitas resmi
  kode_faskes_bpjs    text,          -- kode PPK / kode faskes dari BPJS
  kode_registrasi_kemenkes text,     -- kode registrasi faskes (RS Online / Sarana)
  npwp                text,
  -- Bridging SatuSehat
  satusehat_org_id    text,          -- Organization IHS ID
  satusehat_location_id text,        -- Location IHS ID default
  logo_url            text,
  penanggung_jawab    text,
  no_izin             text,
  updated_at          timestamptz not null default now()
);
comment on table faskes is 'Profil klinik. Dipakai untuk kop surat, laporan, dan identitas bridging.';

-- A2. Poli / unit layanan
create table if not exists poli (
  id            uuid primary key default uuid_generate_v4(),
  kode          text not null unique,          -- mis. 'UMUM','GIGI','KIA'
  nama          text not null,
  kode_pcare    text,                          -- kdPoli dari referensi PCare
  satusehat_location_id text,                  -- Location IHS ID per poli
  urutan        smallint default 0,
  aktif         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- A3. Pegawai / pengguna sistem (profil dari auth.users)
create table if not exists pegawai (
  id                uuid primary key references auth.users(id) on delete cascade,
  nama              text not null,
  peran             peran_pegawai not null default 'admin',
  nik               text,
  jenis_kelamin     jenis_kelamin_t,
  no_hp             text,
  -- Kredensial profesi (untuk dokter/perawat/apoteker)
  no_str            text,
  no_sip            text,
  -- Bridging
  kode_dokter_pcare text,          -- kdDokter dari referensi PCare
  satusehat_practitioner_id text,  -- Practitioner IHS ID
  poli_default      uuid references poli(id),
  ttd_url           text,          -- tanda tangan digital (opsional)
  aktif             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table pegawai is 'Profil pengguna. id = auth.users.id (Supabase Auth).';

-- A4. Master ICD-10
create table if not exists icd10 (
  kode        text primary key,               -- mis. 'J06.9'
  nama_en     text,
  nama_id     text,
  kategori    text,
  sering_dipakai boolean not null default false,
  aktif       boolean not null default true
);
create index if not exists idx_icd10_nama_id  on icd10 using gin (nama_id gin_trgm_ops);
create index if not exists idx_icd10_nama_en  on icd10 using gin (nama_en gin_trgm_ops);
create index if not exists idx_icd10_kode     on icd10 using gin (kode gin_trgm_ops);
create index if not exists idx_icd10_favorit  on icd10 (sering_dipakai) where sering_dipakai;

-- A5. Master obat (siap kode KFA untuk SatuSehat & kode PCare)
create table if not exists obat (
  id              uuid primary key default uuid_generate_v4(),
  kode_internal   text unique,
  nama            text not null,
  nama_generik    text,
  bentuk_sediaan  text,                 -- Tablet, Kapsul, Sirup, Salep, Injeksi
  kekuatan        text,                 -- mis. '500 mg'
  satuan          text not null default 'Tablet',
  golongan        text,                 -- Bebas, Bebas Terbatas, Keras, Narkotika, Psikotropika
  kode_kfa        text,                 -- Kamus Farmasi & Alkes (SatuSehat)
  kode_pcare      text,                 -- kdObat dari PCare (obat program/DPHO)
  formularium     boolean not null default false,
  harga           numeric(12,2) default 0,
  aktif           boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_obat_nama on obat using gin (nama gin_trgm_ops);

-- A6. Master aturan pakai (signa) agar input resep cepat
create table if not exists signa (
  id        uuid primary key default uuid_generate_v4(),
  kode      text not null unique,      -- '3dd1'
  teks      text not null,             -- '3 x sehari 1 tablet'
  frekuensi smallint,                  -- 3
  dosis     numeric(6,2),              -- 1
  urutan    smallint default 0
);

-- =====================================================================
--  B. PASIEN
-- =====================================================================

create sequence if not exists seq_no_rm start 1;

create table if not exists pasien (
  id                uuid primary key default uuid_generate_v4(),
  no_rm             text not null unique,
  -- Identitas (PMK 24/2022 pasal identitas pasien)
  nik               text unique,
  no_bpjs           text,
  no_kk             text,
  nama              text not null,
  tempat_lahir      text,
  tanggal_lahir     date not null,
  jenis_kelamin     jenis_kelamin_t not null,
  gol_darah         text,
  agama             text,
  pendidikan        text,
  pekerjaan         text,
  status_kawin      text,
  suku              text,
  -- Alamat
  alamat            text,
  rt                text,
  rw                text,
  kelurahan         text,
  kecamatan         text,
  kabupaten         text,
  provinsi          text,
  kode_pos          text,
  -- Kontak
  no_hp             text,
  email             text,
  -- Penanggung jawab
  pj_nama           text,
  pj_hubungan       text,
  pj_no_hp          text,
  -- Data BPJS (hasil sinkron PCare)
  bpjs_jenis_peserta text,
  bpjs_kelas        text,
  bpjs_faskes       text,
  bpjs_status_aktif boolean,
  bpjs_sinkron_pada timestamptz,
  -- Bridging SatuSehat
  satusehat_patient_id text,           -- IHS number pasien
  satusehat_sinkron_pada timestamptz,
  -- Meta
  catatan_penting   text,              -- flag alergi berat, dsb
  aktif             boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references pegawai(id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references pegawai(id)
);
create index if not exists idx_pasien_nama  on pasien using gin (nama gin_trgm_ops);
create index if not exists idx_pasien_nik   on pasien (nik);
create index if not exists idx_pasien_bpjs  on pasien (no_bpjs);
create index if not exists idx_pasien_norm  on pasien (no_rm);

-- Riwayat alergi pasien (melekat ke pasien, bukan ke kunjungan)
create table if not exists pasien_alergi (
  id          uuid primary key default uuid_generate_v4(),
  pasien_id   uuid not null references pasien(id) on delete cascade,
  jenis       text not null default 'OBAT',   -- OBAT | MAKANAN | LAINNYA
  nama        text not null,
  reaksi      text,
  tingkat     text,                            -- RINGAN | SEDANG | BERAT
  dicatat_pada timestamptz not null default now(),
  dicatat_oleh uuid references pegawai(id)
);
create index if not exists idx_alergi_pasien on pasien_alergi (pasien_id);

-- =====================================================================
--  C. KUNJUNGAN (ENCOUNTER)
-- =====================================================================

create table if not exists kunjungan (
  id                uuid primary key default uuid_generate_v4(),
  no_kunjungan      text not null unique,        -- YYYYMMDD-0001
  pasien_id         uuid not null references pasien(id),
  tanggal           date not null default current_date,
  poli_id           uuid not null references poli(id),
  dokter_id         uuid references pegawai(id),
  cara_bayar        cara_bayar_t not null default 'BPJS',
  no_antrian        integer,
  jenis_kunjungan   kasus_t not null default 'BARU',   -- kunjungan baru / lama
  kunjungan_sakit   boolean not null default true,     -- sakit vs sehat (PCare)
  keluhan_singkat   text,
  status            status_kunjungan_t not null default 'MENUNGGU',
  -- Jejak waktu (untuk Encounter.statusHistory SatuSehat)
  waktu_daftar      timestamptz not null default now(),
  waktu_kajian      timestamptz,
  waktu_periksa     timestamptz,
  waktu_selesai     timestamptz,
  -- Bridging PCare
  pcare_no_kunjungan text,
  pcare_status      status_bridging_t not null default 'BELUM',
  pcare_pesan       text,
  pcare_sinkron_pada timestamptz,
  -- Bridging SatuSehat
  satusehat_encounter_id text,
  satusehat_status  status_bridging_t not null default 'BELUM',
  satusehat_pesan   text,
  satusehat_sinkron_pada timestamptz,
  -- Meta
  created_at        timestamptz not null default now(),
  created_by        uuid references pegawai(id),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_kunjungan_tanggal on kunjungan (tanggal desc);
create index if not exists idx_kunjungan_pasien  on kunjungan (pasien_id, tanggal desc);
create index if not exists idx_kunjungan_status  on kunjungan (status) where status <> 'SELESAI';

-- C1. Kajian awal perawat (TTV + skrining)
create table if not exists kajian_awal (
  kunjungan_id      uuid primary key references kunjungan(id) on delete cascade,
  keluhan_utama     text,
  riwayat_penyakit_sekarang text,
  riwayat_penyakit_dahulu   text,
  riwayat_alergi    text,
  riwayat_pengobatan text,
  -- Tanda vital
  sistolik          smallint,
  diastolik         smallint,
  nadi              smallint,
  nafas             smallint,
  suhu              numeric(4,1),
  spo2              smallint,
  berat_badan       numeric(5,2),
  tinggi_badan      numeric(5,1),
  lingkar_perut     numeric(5,1),
  imt               numeric(5,2) generated always as (
                      case when tinggi_badan is not null and tinggi_badan > 0 and berat_badan is not null
                      then round(berat_badan / ((tinggi_badan/100) * (tinggi_badan/100)), 2)
                      else null end) stored,
  -- Skrining wajib akreditasi
  kesadaran         text default 'Compos Mentis',
  skala_nyeri       smallint check (skala_nyeri between 0 and 10),
  lokasi_nyeri      text,
  risiko_jatuh      text,          -- RENDAH | SEDANG | TINGGI
  status_psikologis text,
  status_fungsional text,
  skrining_gizi     text,
  skrining_tb       boolean default false,
  catatan_perawat   text,
  dibuat_oleh       uuid references pegawai(id),
  dibuat_pada       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- C2. Pemeriksaan dokter (SOAP)
create table if not exists pemeriksaan (
  kunjungan_id      uuid primary key references kunjungan(id) on delete cascade,
  subjective        text,
  objective         text,
  assessment        text,
  plan              text,
  -- Detail pemeriksaan fisik terstruktur (opsional, JSON fleksibel)
  pemeriksaan_fisik jsonb default '{}'::jsonb,
  prognosa          text,
  terapi_non_obat   text,
  edukasi           text,
  tindak_lanjut     tindak_lanjut_t not null default 'SELESAI',
  tanggal_kontrol   date,
  -- Rujukan (disiapkan untuk fase 2)
  rujuk_ke_faskes   text,
  rujuk_spesialis   text,
  rujuk_alasan      text,
  status_pulang     text default 'Sembuh',
  dibuat_oleh       uuid references pegawai(id),
  dibuat_pada       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Kunci rekam medis: setelah difinalisasi tidak bisa diubah bebas (PMK 24/2022)
  final             boolean not null default false,
  final_pada        timestamptz
);

-- C3. Diagnosa (ICD-10)
create table if not exists diagnosa (
  id            uuid primary key default uuid_generate_v4(),
  kunjungan_id  uuid not null references kunjungan(id) on delete cascade,
  kode_icd10    text not null references icd10(kode),
  nama          text not null,
  jenis         jenis_diagnosa_t not null default 'PRIMER',
  kasus         kasus_t not null default 'BARU',
  catatan       text,
  urutan        smallint default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_diagnosa_kunjungan on diagnosa (kunjungan_id);
create index if not exists idx_diagnosa_kode on diagnosa (kode_icd10);
-- Hanya boleh ada satu diagnosa primer per kunjungan
create unique index if not exists uq_diagnosa_primer
  on diagnosa (kunjungan_id) where jenis = 'PRIMER';

-- C4. Resep
create table if not exists resep (
  id            uuid primary key default uuid_generate_v4(),
  kunjungan_id  uuid not null references kunjungan(id) on delete cascade,
  no_resep      text,
  catatan       text,
  status        text not null default 'DIBUAT',   -- DIBUAT | DISERAHKAN
  dibuat_oleh   uuid references pegawai(id),
  dibuat_pada   timestamptz not null default now(),
  diserahkan_oleh uuid references pegawai(id),
  diserahkan_pada timestamptz
);
create index if not exists idx_resep_kunjungan on resep (kunjungan_id);

create table if not exists resep_item (
  id            uuid primary key default uuid_generate_v4(),
  resep_id      uuid not null references resep(id) on delete cascade,
  obat_id       uuid references obat(id),
  nama_obat     text not null,          -- disalin agar riwayat tetap utuh
  kode_kfa      text,
  jumlah        numeric(8,2) not null default 1,
  satuan        text,
  signa         text,                   -- '3 x sehari 1 tablet'
  frekuensi     smallint,
  dosis         numeric(6,2),
  rute          text default 'Oral',
  keterangan    text,
  racikan_nama  text,                   -- jika bagian dari racikan
  urutan        smallint default 0
);
create index if not exists idx_resep_item_resep on resep_item (resep_id);

-- =====================================================================
--  D. AUDIT & BRIDGING LOG
-- =====================================================================

create table if not exists audit_log (
  id          bigserial primary key,
  waktu       timestamptz not null default now(),
  user_id     uuid,
  user_nama   text,
  aksi        text not null,            -- INSERT | UPDATE | DELETE | LOGIN | VIEW_RM
  tabel       text,
  record_id   text,
  data_lama   jsonb,
  data_baru   jsonb,
  keterangan  text
);
create index if not exists idx_audit_waktu on audit_log (waktu desc);
create index if not exists idx_audit_record on audit_log (tabel, record_id);

create table if not exists bridging_log (
  id            bigserial primary key,
  waktu         timestamptz not null default now(),
  sistem        text not null,           -- PCARE | SATUSEHAT
  operasi       text not null,           -- mis. 'POST /Encounter'
  kunjungan_id  uuid references kunjungan(id) on delete set null,
  pasien_id     uuid references pasien(id) on delete set null,
  request       jsonb,
  response      jsonb,
  http_status   integer,
  sukses        boolean not null default false,
  pesan_error   text,
  dijalankan_oleh uuid
);
create index if not exists idx_bridging_waktu on bridging_log (waktu desc);
create index if not exists idx_bridging_kunjungan on bridging_log (kunjungan_id);

-- Antrean kirim (agar bridging bisa dicoba ulang tanpa mengganggu pelayanan)
create table if not exists bridging_antrean (
  id            bigserial primary key,
  sistem        text not null,
  kunjungan_id  uuid not null references kunjungan(id) on delete cascade,
  payload       jsonb,
  percobaan     smallint not null default 0,
  status        status_bridging_t not null default 'ANTRE',
  pesan_error   text,
  dibuat_pada   timestamptz not null default now(),
  diproses_pada timestamptz
);
create index if not exists idx_antrean_status on bridging_antrean (status, sistem);

-- Penyimpanan kredensial bridging (hanya bisa dibaca service_role / Edge Function)
create table if not exists bridging_config (
  sistem        text primary key,        -- 'PCARE' | 'SATUSEHAT'
  aktif         boolean not null default false,
  mode          text not null default 'SANDBOX',  -- SANDBOX | PRODUKSI
  base_url      text,
  kredensial    jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- =====================================================================
--  E. FUNGSI PENOMORAN OTOMATIS
-- =====================================================================

-- E1. Nomor rekam medis: 6 digit berurutan
create or replace function gen_no_rm() returns trigger
language plpgsql as $$
begin
  if new.no_rm is null or new.no_rm = '' then
    new.no_rm := lpad(nextval('seq_no_rm')::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_gen_no_rm on pasien;
create trigger trg_gen_no_rm before insert on pasien
for each row execute function gen_no_rm();

-- E2. Nomor kunjungan + nomor antrian per poli per hari
create or replace function gen_no_kunjungan() returns trigger
language plpgsql as $$
declare
  urut integer;
begin
  if new.no_kunjungan is null or new.no_kunjungan = '' then
    select coalesce(max(substring(no_kunjungan from 10)::int), 0) + 1
      into urut from kunjungan where tanggal = new.tanggal;
    new.no_kunjungan := to_char(new.tanggal,'YYYYMMDD') || '-' || lpad(urut::text, 4, '0');
  end if;

  if new.no_antrian is null then
    select coalesce(max(no_antrian), 0) + 1 into new.no_antrian
    from kunjungan where tanggal = new.tanggal and poli_id = new.poli_id;
  end if;

  -- Tandai kunjungan baru / lama otomatis
  if exists (select 1 from kunjungan k where k.pasien_id = new.pasien_id) then
    new.jenis_kunjungan := 'LAMA';
  else
    new.jenis_kunjungan := 'BARU';
  end if;

  return new;
end $$;

drop trigger if exists trg_gen_no_kunjungan on kunjungan;
create trigger trg_gen_no_kunjungan before insert on kunjungan
for each row execute function gen_no_kunjungan();

-- E3. Nomor resep
create or replace function gen_no_resep() returns trigger
language plpgsql as $$
declare urut integer;
begin
  if new.no_resep is null or new.no_resep = '' then
    select coalesce(count(*), 0) + 1 into urut
      from resep where dibuat_pada::date = current_date;
    new.no_resep := 'R' || to_char(current_date,'YYMMDD') || lpad(urut::text, 3, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_gen_no_resep on resep;
create trigger trg_gen_no_resep before insert on resep
for each row execute function gen_no_resep();

-- E4. updated_at otomatis
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['faskes','pegawai','pasien','kunjungan','kajian_awal','pemeriksaan']
  loop
    execute format('drop trigger if exists trg_updated_%1$s on %1$s', t);
    execute format('create trigger trg_updated_%1$s before update on %1$s
                    for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- E5. Sinkronkan status kunjungan mengikuti progres pelayanan
create or replace function maju_status_kunjungan() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'kajian_awal' then
    update kunjungan
       set status = case when status in ('MENUNGGU','KAJIAN_AWAL') then 'MENUNGGU_DOKTER'::status_kunjungan_t else status end,
           waktu_kajian = coalesce(waktu_kajian, now())
     where id = new.kunjungan_id;
  elsif tg_table_name = 'pemeriksaan' then
    update kunjungan
       set status = case when new.final then 'SELESAI'::status_kunjungan_t else 'PEMERIKSAAN'::status_kunjungan_t end,
           waktu_periksa = coalesce(waktu_periksa, now()),
           waktu_selesai = case when new.final then coalesce(waktu_selesai, now()) else waktu_selesai end
     where id = new.kunjungan_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_status_kajian on kajian_awal;
create trigger trg_status_kajian after insert or update on kajian_awal
for each row execute function maju_status_kunjungan();

drop trigger if exists trg_status_periksa on pemeriksaan;
create trigger trg_status_periksa after insert or update on pemeriksaan
for each row execute function maju_status_kunjungan();

-- E6. Kunci rekam medis yang sudah final (amanat PMK 24/2022)
--     Perubahan setelah final hanya boleh lewat addendum, bukan menimpa data.
create table if not exists addendum (
  id            uuid primary key default uuid_generate_v4(),
  kunjungan_id  uuid not null references kunjungan(id) on delete cascade,
  isi           text not null,
  alasan        text,
  dibuat_oleh   uuid references pegawai(id),
  dibuat_pada   timestamptz not null default now()
);

create or replace function cegah_ubah_final() returns trigger
language plpgsql as $$
begin
  if old.final = true and new.final = true then
    raise exception 'Rekam medis kunjungan ini sudah difinalisasi. Gunakan Addendum untuk menambah catatan.';
  end if;
  return new;
end $$;

drop trigger if exists trg_cegah_ubah_final on pemeriksaan;
create trigger trg_cegah_ubah_final before update on pemeriksaan
for each row execute function cegah_ubah_final();

-- =====================================================================
--  F. VIEW BANTU
-- =====================================================================

create or replace view v_antrian_hari_ini with (security_invoker = true) as
select k.id, k.no_kunjungan, k.no_antrian, k.tanggal, k.status, k.cara_bayar,
       k.keluhan_singkat, k.waktu_daftar,
       p.id as pasien_id, p.no_rm, p.nama as nama_pasien, p.tanggal_lahir,
       p.jenis_kelamin, p.no_bpjs, p.no_hp,
       date_part('year', age(p.tanggal_lahir))::int as umur,
       po.nama as nama_poli, po.id as poli_id,
       d.nama as nama_dokter, k.dokter_id,
       (ka.kunjungan_id is not null) as sudah_kajian,
       (pm.kunjungan_id is not null) as sudah_periksa
from kunjungan k
join pasien p on p.id = k.pasien_id
join poli po on po.id = k.poli_id
left join pegawai d on d.id = k.dokter_id
left join kajian_awal ka on ka.kunjungan_id = k.id
left join pemeriksaan pm on pm.kunjungan_id = k.id
where k.tanggal = current_date
order by k.no_antrian;

create or replace view v_riwayat_kunjungan with (security_invoker = true) as
select k.id, k.no_kunjungan, k.tanggal, k.status, k.cara_bayar,
       p.id as pasien_id, p.no_rm, p.nama as nama_pasien,
       po.nama as nama_poli,
       d.nama as nama_dokter,
       (select string_agg(dg.kode_icd10 || ' - ' || dg.nama, '; ' order by dg.jenis)
          from diagnosa dg where dg.kunjungan_id = k.id) as daftar_diagnosa,
       (select dg.kode_icd10 from diagnosa dg
         where dg.kunjungan_id = k.id and dg.jenis = 'PRIMER' limit 1) as icd_primer,
       k.satusehat_status, k.pcare_status
from kunjungan k
join pasien p on p.id = k.pasien_id
join poli po on po.id = k.poli_id
left join pegawai d on d.id = k.dokter_id
order by k.tanggal desc, k.no_antrian desc;


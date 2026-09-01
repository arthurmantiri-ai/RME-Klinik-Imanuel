-- =====================================================================
--  RME KLINIK IMANUEL — MODUL POLI GIGI
--  Odontogram per bidang gigi, pemeriksaan gigi, dan tindakan ICD-9-CM.
--  Jalankan SETELAH 04_seed.sql
--
--  Yang ditambahkan:
--   - ref_gigi          : 52 gigi (32 tetap + 20 sulung) penomoran FDI
--   - ref_bidang_gigi   : 5 bidang gigi + kode SNOMED-nya
--   - ref_kondisi_gigi  : notasi odontogram standar Indonesia (sou, car, amf, …)
--   - odontogram        : keadaan gigi pasien saat ini
--   - odontogram_riwayat: perubahan tiap kunjungan, terekam otomatis
--   - pemeriksaan_gigi  : ekstra oral, intra oral, OHI, indeks DMF-T
--   - icd9cm            : master kode tindakan
--   - tindakan          : tindakan yang dilakukan pada satu kunjungan
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Penyesuaian tabel yang sudah ada
-- ---------------------------------------------------------------------
do $$ begin
  create type jenis_poli_t as enum ('UMUM','GIGI','KIA','LAINNYA');
exception when duplicate_object then null; end $$;

alter table poli    add column if not exists jenis jenis_poli_t not null default 'UMUM';
alter table pegawai add column if not exists jenis_dokter text;   -- 'UMUM' | 'GIGI'
comment on column pegawai.jenis_dokter is
  'Diisi untuk peran dokter: UMUM atau GIGI. Dipakai menyaring pilihan dokter sesuai poli.';

update poli set jenis = 'GIGI'  where kode = 'GIGI' and jenis = 'UMUM';
update poli set jenis = 'KIA'   where kode = 'KIA'  and jenis = 'UMUM';

-- =====================================================================
--  A. MASTER GIGI
-- =====================================================================

-- A1. 52 gigi, penomoran FDI dua digit
create table if not exists ref_gigi (
  fdi           text primary key,              -- '11' … '48', '51' … '85'
  nama          text not null,
  kuadran       smallint not null,             -- 1..8
  rahang        text not null,                 -- ATAS | BAWAH
  sisi          text not null,                 -- KANAN | KIRI
  jenis         text not null,                 -- TETAP | SULUNG
  posisi        smallint not null,             -- urutan dari garis tengah (1..8 / 1..5)
  -- Diisi belakangan dari Lampiran Terminologi Gigi SatuSehat (Tabel 1).
  -- Selama kosong, bodySite tidak dikirim dan sisa payload tetap valid.
  kode_snomed   text
);
comment on column ref_gigi.kode_snomed is
  'Kode SNOMED CT struktur gigi untuk Observation.bodySite SatuSehat. '
  'Isi dari Lampiran Terminologi Gigi (Tabel 1) setelah klinik terdaftar di SatuSehat.';

do $$
declare
  k smallint; p smallint; batas smallint;
  nm_tetap  text[] := array['Insisivus sentral','Insisivus lateral','Kaninus',
                            'Premolar pertama','Premolar kedua',
                            'Molar pertama','Molar kedua','Molar ketiga'];
  nm_sulung text[] := array['Insisivus sentral sulung','Insisivus lateral sulung',
                            'Kaninus sulung','Molar pertama sulung','Molar kedua sulung'];
  v_rahang text; v_sisi text; v_jenis text; v_nama text;
begin
  for k in 1..8 loop
    v_jenis  := case when k <= 4 then 'TETAP' else 'SULUNG' end;
    batas    := case when k <= 4 then 8 else 5 end;
    v_rahang := case when k in (1,2,5,6) then 'ATAS' else 'BAWAH' end;
    v_sisi   := case when k in (1,4,5,8) then 'KANAN' else 'KIRI' end;
    for p in 1..batas loop
      v_nama := case when v_jenis = 'TETAP' then nm_tetap[p] else nm_sulung[p] end
                || ' ' || lower(v_rahang) || ' ' || lower(v_sisi);
      insert into ref_gigi (fdi, nama, kuadran, rahang, sisi, jenis, posisi)
      values (k::text || p::text, v_nama, k, v_rahang, v_sisi, v_jenis, p)
      on conflict (fdi) do nothing;
    end loop;
  end loop;
end $$;

-- Dua kode SNOMED yang sudah terverifikasi dari dokumentasi SatuSehat,
-- sebagai contoh format pengisian sisanya.
update ref_gigi set kode_snomed = '422653006' where fdi = '11' and kode_snomed is null;
update ref_gigi set kode_snomed = '866005003' where fdi = '46' and kode_snomed is null;

-- A2. Bidang gigi
create table if not exists ref_bidang_gigi (
  kode        text primary key,      -- O, M, D, V, L
  nama        text not null,
  nama_lain   text,
  kode_snomed text,
  urutan      smallint
);
insert into ref_bidang_gigi (kode, nama, nama_lain, kode_snomed, urutan) values
  ('O', 'Oklusal',  'Insisal (gigi depan)',        '257885003', 1),
  ('M', 'Mesial',   'Sisi ke arah garis tengah',   '710099007', 2),
  ('D', 'Distal',   'Sisi menjauhi garis tengah',  '46053002',  3),
  ('V', 'Vestibular','Bukal / labial (sisi pipi)', '302990001', 4),
  ('L', 'Lingual',  'Palatal (sisi lidah/langit)', '255579002', 5)
on conflict (kode) do nothing;

-- A3. Kondisi gigi — notasi odontogram standar Indonesia
create table if not exists ref_kondisi_gigi (
  kode        text primary key,
  nama        text not null,
  kategori    text not null,           -- KONDISI | TAMBALAN | PERAWATAN | MAHKOTA | PROTESA
  per_bidang  boolean not null default false,  -- true = ditandai pada bidang tertentu
  -- eksklusif = menutup seluruh gigi, sehingga tanda per bidang tidak berlaku lagi
  -- (mis. gigi hilang). Kondisi non-eksklusif seperti perawatan saluran akar
  -- tetap membiarkan tambalan ditandai pada bidangnya.
  eksklusif   boolean not null default true,
  warna       text not null,           -- warna pada bagan
  perlu_rontgen boolean not null default false,
  kode_snomed text,
  komponen    text,                    -- kondisi | material | protesa (komponen Observation SatuSehat)
  urutan      smallint default 0,
  aktif       boolean not null default true
);

insert into ref_kondisi_gigi
  (kode, nama, kategori, per_bidang, eksklusif, warna, perlu_rontgen, kode_snomed, komponen, urutan) values
  -- Kondisi gigi
  ('sou','Sehat, tidak ada kelainan','KONDISI', true, true, '#FFFFFF', false,'162005007','kondisi', 1),
  ('car','Karies','KONDISI', true, true, '#DC2626', false,'80967001', 'kondisi', 2),
  ('cfr','Fraktur mahkota','KONDISI', false, false, '#EA580C', false, null,      'kondisi', 3),
  ('att','Atrisi / aus','KONDISI', false, false, '#D97706', false, null,      'kondisi', 4),
  ('ano','Anomali bentuk atau ukuran','KONDISI', false, false, '#DB2777', false,'OV000091', 'kondisi', 5),
  ('nvt','Gigi non-vital','KONDISI', false, false, '#7C3AED', true,  null,      'kondisi', 6),
  ('rrx','Sisa akar','KONDISI', false, true, '#991B1B', false, null,      'kondisi', 7),
  ('mis','Gigi hilang (dicabut)','KONDISI', false, true, '#94A3B8', false,'234948008','kondisi', 8),
  ('une','Belum erupsi','KONDISI', false, true, '#CBD5E1', true,  null,      'kondisi', 9),
  ('pre','Erupsi sebagian','KONDISI', false, false, '#A5B4FC', false, null,      'kondisi',10),
  ('non','Tidak ada keterangan','KONDISI', false, true, '#E2E8F0', false, null,      'kondisi',11),
  -- Tambalan
  ('amf','Tumpatan amalgam','TAMBALAN', true, true, '#1E293B', false,'256447001','material',20),
  ('cof','Tumpatan komposit','TAMBALAN', true, true, '#2563EB', false,'256452006','material',21),
  ('gif','Tumpatan glass ionomer','TAMBALAN', true, true, '#0EA5E9', false,'256454007','material',22),
  ('fis','Fissure sealant','TAMBALAN', true, true, '#16A34A', false, null,      'material',23),
  -- Perawatan
  ('rct','Perawatan saluran akar','PERAWATAN', false, false, '#7C3AED', true,  null,      'kondisi',30),
  -- Mahkota
  ('fmc','Mahkota logam penuh','MAHKOTA', false, true, '#64748B', false, null,      'protesa',40),
  ('poc','Mahkota porselen','MAHKOTA', false, true, '#A8A29E', false, null,      'protesa',41),
  ('mpc','Mahkota porselen-logam','MAHKOTA', false, true, '#78716C', false, null,      'protesa',42),
  ('gmc','Mahkota emas','MAHKOTA', false, true, '#CA8A04', false, null,      'protesa',43),
  -- Protesa & jembatan
  ('ipx','Implan','PROTESA', false, true, '#0F766E', false, null,      'protesa',50),
  ('abu','Abutment jembatan','PROTESA', false, true, '#475569', false, null,      'protesa',51),
  ('pon','Pontik jembatan','PROTESA', false, true, '#64748B', false, null,      'protesa',52),
  ('meb','Jembatan logam','PROTESA', false, true, '#475569', false, null,      'protesa',53),
  ('pob','Jembatan porselen','PROTESA', false, true, '#78716C', false, null,      'protesa',54),
  ('prd','Gigi tiruan sebagian lepasan','PROTESA', false, true, '#6366F1',false,'272256008','protesa',55),
  ('fld','Gigi tiruan penuh','PROTESA', false, true, '#4F46E5', false,'272253000','protesa',56)
on conflict (kode) do nothing;

-- =====================================================================
--  B. ODONTOGRAM
-- =====================================================================

-- B1. Keadaan gigi pasien saat ini — satu baris per gigi yang punya catatan.
--     Gigi tanpa baris dianggap sehat / belum diperiksa.
create table if not exists odontogram (
  pasien_id     uuid not null references pasien(id) on delete cascade,
  fdi           text not null references ref_gigi(fdi),
  kondisi       text references ref_kondisi_gigi(kode),   -- kondisi seluruh gigi
  bidang        jsonb not null default '{}'::jsonb,       -- {"O":"car","M":"amf"}
  catatan       text,
  kunjungan_id  uuid references kunjungan(id) on delete set null,
  diperbarui_pada timestamptz not null default now(),
  diperbarui_oleh uuid references pegawai(id),
  primary key (pasien_id, fdi)
);
create index if not exists idx_odontogram_pasien on odontogram (pasien_id);
comment on column odontogram.bidang is
  'Kondisi per bidang gigi. Kunci: O, M, D, V, L. Nilai: kode dari ref_kondisi_gigi.';

-- B2. Riwayat perubahan odontogram, diisi otomatis oleh trigger.
--     Ini yang membuat odontogram bisa dilihat "sebagaimana saat kunjungan itu".
create table if not exists odontogram_riwayat (
  id            bigserial primary key,
  pasien_id     uuid not null,
  fdi           text not null,
  kunjungan_id  uuid references kunjungan(id) on delete set null,
  kondisi_lama  text,  bidang_lama  jsonb,
  kondisi_baru  text,  bidang_baru  jsonb,
  waktu         timestamptz not null default now(),
  oleh          uuid
);
create index if not exists idx_odo_riwayat_pasien on odontogram_riwayat (pasien_id, waktu desc);
create index if not exists idx_odo_riwayat_kunjungan on odontogram_riwayat (kunjungan_id);

create or replace function catat_perubahan_odontogram()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into odontogram_riwayat (pasien_id, fdi, kunjungan_id,
                                    kondisi_lama, bidang_lama, kondisi_baru, bidang_baru, oleh)
    values (old.pasien_id, old.fdi, old.kunjungan_id,
            old.kondisi, old.bidang, null, null, auth.uid());
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.kondisi is not distinct from new.kondisi
     and old.bidang  is not distinct from new.bidang then
    return new;                                   -- tidak ada yang berubah
  end if;

  insert into odontogram_riwayat (pasien_id, fdi, kunjungan_id,
                                  kondisi_lama, bidang_lama, kondisi_baru, bidang_baru, oleh)
  values (new.pasien_id, new.fdi, new.kunjungan_id,
          case when tg_op = 'UPDATE' then old.kondisi end,
          case when tg_op = 'UPDATE' then old.bidang end,
          new.kondisi, new.bidang, auth.uid());
  return new;
end $$;

drop trigger if exists trg_riwayat_odontogram on odontogram;
create trigger trg_riwayat_odontogram
after insert or update or delete on odontogram
for each row execute function catat_perubahan_odontogram();

-- =====================================================================
--  C. PEMERIKSAAN GIGI
-- =====================================================================
create table if not exists pemeriksaan_gigi (
  kunjungan_id  uuid primary key references kunjungan(id) on delete cascade,
  -- Ekstra oral
  wajah             text,          -- Simetris | Asimetris
  kelenjar_limfe    text,          -- Tidak teraba | Teraba kiri | Teraba kanan | Teraba keduanya
  tmj               text,          -- Normal | Kliking | Nyeri
  bibir             text,
  ekstra_oral_lain  text,
  -- Intra oral
  mukosa_pipi   text,
  gusi          text,
  lidah         text,
  palatum       text,
  dasar_mulut   text,
  oklusi        text,              -- Normal bite | Cross bite | Deep bite | Open bite | Steep bite
  torus_palatinus    text,         -- Tidak ada | Kecil | Sedang | Besar | Multiple
  torus_mandibularis text,         -- Tidak ada | Sisi kiri | Sisi kanan | Kedua sisi
  supernumerary boolean default false,
  diastema      text,
  intra_oral_lain text,
  -- Kebersihan mulut & indeks
  kebersihan_mulut  text,          -- Baik | Sedang | Buruk
  ohis              numeric(4,2),
  -- Indeks DMF-T (gigi tetap) & def-t (gigi sulung) — dihitung dari odontogram
  d_decay       smallint,
  m_missing     smallint,
  f_filled      smallint,
  dmft          smallint generated always as
                  (coalesce(d_decay,0) + coalesce(m_missing,0) + coalesce(f_filled,0)) stored,
  d_sulung      smallint,
  e_sulung      smallint,
  f_sulung      smallint,
  deft          smallint generated always as
                  (coalesce(d_sulung,0) + coalesce(e_sulung,0) + coalesce(f_sulung,0)) stored,
  catatan       text,
  dibuat_oleh   uuid references pegawai(id),
  dibuat_pada   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_updated_pemeriksaan_gigi on pemeriksaan_gigi;
create trigger trg_updated_pemeriksaan_gigi before update on pemeriksaan_gigi
for each row execute function set_updated_at();

-- =====================================================================
--  D. TINDAKAN (ICD-9-CM)
-- =====================================================================
create table if not exists icd9cm (
  kode        text primary key,
  nama_id     text not null,
  nama_en     text,
  kategori    text,                          -- GIGI | UMUM | PENUNJANG
  sering_dipakai boolean not null default false,
  per_gigi    boolean not null default false, -- true = perlu menyebut nomor gigi
  aktif       boolean not null default true
);
create index if not exists idx_icd9_nama on icd9cm using gin (nama_id gin_trgm_ops);
create index if not exists idx_icd9_kode on icd9cm using gin (kode gin_trgm_ops);

create table if not exists tindakan (
  id            uuid primary key default uuid_generate_v4(),
  kunjungan_id  uuid not null references kunjungan(id) on delete cascade,
  kode_icd9     text not null references icd9cm(kode),
  nama          text not null,
  fdi           text references ref_gigi(fdi),   -- diisi untuk tindakan pada gigi tertentu
  jumlah        smallint not null default 1,
  catatan       text,
  dilakukan_oleh uuid references pegawai(id),
  dilakukan_pada timestamptz not null default now(),
  urutan        smallint default 0
);
create index if not exists idx_tindakan_kunjungan on tindakan (kunjungan_id);
create index if not exists idx_tindakan_kode on tindakan (kode_icd9);

-- ---------------------------------------------------------------------
-- Master tindakan — gigi dan tindakan umum yang lazim di klinik pratama
-- ---------------------------------------------------------------------
insert into icd9cm (kode, nama_id, nama_en, kategori, sering_dipakai, per_gigi) values
  -- Gigi: pencabutan
  ('23.01','Pencabutan gigi sulung','Extraction of deciduous tooth','GIGI', true, true),
  ('23.09','Pencabutan gigi tetap','Extraction of other tooth','GIGI', true, true),
  ('23.11','Pencabutan sisa akar','Removal of residual root','GIGI', true, true),
  ('23.19','Pencabutan gigi dengan penyulit (odontektomi)','Other surgical extraction of tooth','GIGI', false, true),
  -- Gigi: restorasi
  ('23.2', 'Penambalan gigi','Restoration of tooth by filling','GIGI', true, true),
  ('23.3', 'Restorasi gigi dengan inlay','Restoration of tooth by inlay','GIGI', false, true),
  ('23.41','Pemasangan mahkota gigi','Application of crown','GIGI', false, true),
  ('23.42','Pemasangan jembatan cekat','Insertion of fixed bridge','GIGI', false, true),
  ('23.43','Pemasangan jembatan lepasan','Insertion of removable bridge','GIGI', false, true),
  ('23.5', 'Implantasi gigi','Implantation of tooth','GIGI', false, true),
  ('23.6', 'Pemasangan implan gigi prostetik','Prosthetic dental implant','GIGI', false, true),
  -- Gigi: endodontik
  ('23.70','Perawatan saluran akar','Root canal, not otherwise specified','GIGI', true, true),
  ('23.71','Perawatan saluran akar dengan irigasi','Root canal therapy with irrigation','GIGI', false, true),
  ('23.72','Perawatan saluran akar dengan apikoektomi','Root canal therapy with apicoectomy','GIGI', false, true),
  ('23.73','Apikoektomi','Apicoectomy','GIGI', false, true),
  -- Gigi: gusi & jaringan lunak
  ('24.0', 'Insisi gusi atau tulang alveolar','Incision of gum or alveolar bone','GIGI', true, true),
  ('24.2', 'Gingivoplasti','Gingivoplasty','GIGI', false, true),
  ('24.31','Eksisi lesi atau jaringan gusi','Excision of lesion or tissue of gum','GIGI', false, true),
  ('24.32','Penjahitan luka gusi','Suture of laceration of gum','GIGI', false, true),
  ('24.39','Tindakan lain pada gusi','Other operations on gum','GIGI', false, true),
  ('24.5', 'Alveoloplasti','Alveoloplasty','GIGI', false, true),
  ('24.6', 'Membuka gigi terpendam','Exposure of tooth','GIGI', false, true),
  ('24.7', 'Pemasangan alat ortodonti','Application of orthodontic appliance','GIGI', false, false),
  ('24.99','Tindakan gigi lainnya','Other dental operations','GIGI', false, true),
  ('27.0', 'Drainase abses rongga mulut','Drainage of face and floor of mouth','GIGI', true, true),
  -- Gigi: pencegahan & pemeriksaan
  ('96.54','Skeling dan pembersihan karang gigi','Dental scaling, polishing and debridement','GIGI', true, false),
  ('89.31','Pemeriksaan gigi','Dental examination','GIGI', true, false),
  ('87.11','Rontgen gigi seluruh rahang','Full-mouth x-ray of teeth','PENUNJANG', false, false),
  ('87.12','Rontgen gigi (periapikal)','Other dental x-ray','PENUNJANG', false, true),
  -- Tindakan umum FKTP
  ('89.7', 'Pemeriksaan fisik umum','General physical examination','UMUM', true, false),
  ('86.59','Penjahitan luka (hecting)','Closure of skin and subcutaneous tissue','UMUM', true, false),
  ('86.28','Perawatan luka non-eksisi','Nonexcisional debridement of wound','UMUM', true, false),
  ('93.57','Penggantian balutan luka','Application of other wound dressing','UMUM', true, false),
  ('97.89','Pengangkatan jahitan','Removal of other therapeutic device','UMUM', true, false),
  ('86.04','Insisi dan drainase abses kulit','Incision with drainage of skin','UMUM', true, false),
  ('86.3', 'Eksisi lesi kulit','Local excision or destruction of lesion of skin','UMUM', false, false),
  ('96.52','Irigasi telinga (ekstraksi serumen)','Irrigation of ear','UMUM', true, false),
  ('93.94','Nebulisasi','Respiratory medication by nebulizer','UMUM', true, false),
  ('99.29','Injeksi obat lain','Injection of other therapeutic substance','UMUM', true, false),
  ('99.55','Imunisasi / vaksinasi','Prophylactic administration of vaccine','UMUM', true, false),
  ('89.52','Elektrokardiogram','Electrocardiogram','PENUNJANG', false, false),
  ('90.59','Pemeriksaan darah lainnya','Other microscopic examination of blood','PENUNJANG', true, false),
  ('91.89','Pemeriksaan urin lainnya','Other microscopic examination of urine','PENUNJANG', false, false)
on conflict (kode) do nothing;

-- Diagnosa gigi tambahan yang sering dipakai tapi belum ada di 04_seed.sql
insert into icd10 (kode, nama_en, nama_id, kategori, sering_dipakai) values
  ('K00.6','Disturbances in tooth eruption','Gangguan erupsi gigi','Gigi & Mulut', false),
  ('K01.1','Impacted teeth','Gigi impaksi','Gigi & Mulut', true),
  ('K03.6','Deposits on teeth','Karang gigi (kalkulus)','Gigi & Mulut', true),
  ('K04.1','Necrosis of pulp','Nekrosis pulpa','Gigi & Mulut', true),
  ('K04.4','Acute apical periodontitis of pulpal origin','Periodontitis apikalis akut','Gigi & Mulut', true),
  ('K04.5','Chronic apical periodontitis','Periodontitis apikalis kronis','Gigi & Mulut', false),
  ('K04.6','Periapical abscess with sinus','Abses periapikal dengan fistula','Gigi & Mulut', false),
  ('K05.0','Acute gingivitis','Gingivitis akut','Gigi & Mulut', true),
  ('K05.3','Chronic periodontitis','Periodontitis kronis','Gigi & Mulut', true),
  ('K06.8','Other specified disorders of gingiva','Kelainan gusi lainnya','Gigi & Mulut', false),
  ('K07.3','Anomalies of tooth position','Maloklusi / gigi berjejal','Gigi & Mulut', false),
  ('K08.3','Retained dental root','Sisa akar gigi','Gigi & Mulut', true),
  ('K08.8','Other specified disorders of teeth','Kelainan gigi lainnya','Gigi & Mulut', false),
  ('K12.1','Other forms of stomatitis','Stomatitis lainnya','Gigi & Mulut', false),
  ('K13.0','Diseases of lips','Kelainan bibir','Gigi & Mulut', false),
  ('S02.5','Fracture of tooth','Fraktur gigi','Gigi & Mulut', false)
on conflict (kode) do nothing;

-- =====================================================================
--  E. HAK AKSES (RLS) & AUDIT
-- =====================================================================
alter table ref_gigi           enable row level security;
alter table ref_bidang_gigi    enable row level security;
alter table ref_kondisi_gigi   enable row level security;
alter table icd9cm             enable row level security;
alter table odontogram         enable row level security;
alter table odontogram_riwayat enable row level security;
alter table pemeriksaan_gigi   enable row level security;
alter table tindakan           enable row level security;

grant select, insert, update, delete on ref_gigi, ref_bidang_gigi, ref_kondisi_gigi,
      icd9cm, odontogram, odontogram_riwayat, pemeriksaan_gigi, tindakan to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Master: semua staf boleh baca, hanya admin boleh ubah
do $$
declare t text;
begin
  foreach t in array array['ref_gigi','ref_bidang_gigi','ref_kondisi_gigi','icd9cm']
  loop
    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);
    execute format('drop policy if exists %1$s_kelola on %1$s', t);
    execute format($f$create policy %1$s_kelola on %1$s for all to authenticated
                     using (public.peran_saya() = 'admin')
                     with check (public.peran_saya() = 'admin')$f$, t);
  end loop;
end $$;

-- Odontogram & pemeriksaan gigi: ditulis dokter (termasuk dokter gigi) dan admin
do $$
declare t text;
begin
  foreach t in array array['odontogram','pemeriksaan_gigi','tindakan']
  loop
    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);
    execute format('drop policy if exists %1$s_tulis on %1$s', t);
    execute format($f$create policy %1$s_tulis on %1$s for all to authenticated
                     using (public.peran_saya_salah_satu('admin','dokter'))
                     with check (public.peran_saya_salah_satu('admin','dokter'))$f$, t);
  end loop;
end $$;

-- Riwayat odontogram hanya bisa dibaca; penulisannya lewat trigger SECURITY DEFINER
drop policy if exists odo_riwayat_baca on odontogram_riwayat;
create policy odo_riwayat_baca on odontogram_riwayat for select
  to authenticated using (public.saya_staf());
revoke insert, update, delete on odontogram_riwayat from authenticated;

-- Audit trail untuk tabel baru
drop trigger if exists trg_audit_tindakan on tindakan;
create trigger trg_audit_tindakan after insert or update or delete on tindakan
for each row execute function public.catat_audit();

drop trigger if exists trg_audit_pemeriksaan_gigi on pemeriksaan_gigi;
create trigger trg_audit_pemeriksaan_gigi after insert or update or delete on pemeriksaan_gigi
for each row execute function public.catat_audit_kunjungan();

-- =====================================================================
--  F. VIEW BANTU
-- =====================================================================

-- Odontogram lengkap: semua 52 gigi, digabung dengan kondisi yang tercatat
create or replace view v_odontogram with (security_invoker = true) as
select g.fdi, g.nama, g.kuadran, g.rahang, g.sisi, g.jenis, g.posisi, g.kode_snomed,
       o.pasien_id, o.kondisi, o.bidang, o.catatan, o.diperbarui_pada
from ref_gigi g
left join odontogram o on o.fdi = g.fdi;

-- Ringkasan tindakan per kunjungan
create or replace view v_tindakan_kunjungan with (security_invoker = true) as
select t.kunjungan_id, t.id, t.kode_icd9, t.nama, t.fdi, t.jumlah, t.catatan,
       t.dilakukan_pada, p.nama as nama_pelaksana, i.kategori
from tindakan t
join icd9cm i on i.kode = t.kode_icd9
left join pegawai p on p.id = t.dilakukan_oleh
order by t.urutan, t.dilakukan_pada;

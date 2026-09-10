-- =====================================================================
--  RME KLINIK IMANUEL — PEMERIKSAAN TERSTRUKTUR (siap PCare & SatuSehat)
--  Jalankan SETELAH 13_surat.sql. Aman dijalankan di database berisi data,
--  dan aman dijalankan ulang.
--
--  MENGAPA BERKAS INI ADA
--  ----------------------
--  Sampai sekarang pemeriksaan dokter disimpan sebagai empat kotak teks
--  bebas (S, O, A, P). Itu enak diketik, tetapi tidak ada satu pun field
--  yang bisa dikirim apa adanya ke PCare maupun SatuSehat:
--
--    * PCare  /kunjungan  meminta 30 field terpisah — keluhan, kdSadar,
--      sistole, diastole, suhu, kdStatusPulang, kdDiag1..3, kdPrognosa,
--      terapiObat, terapiNonObat, bmhp, kdTacc, alasanTacc, rujukLanjut,
--      alergiMakan/Udara/Obat. Tak satu pun berupa paragraf.
--    * SatuSehat meminta tiap tanda vital dan tiap temuan pemeriksaan
--      fisik sebagai Observation terpisah dengan kode LOINC.
--
--  Kalau perubahan ini ditunda sampai kredensial datang, yang harus
--  dikerjakan bukan "menyambungkan" melainkan MEMBACA ULANG ribuan
--  paragraf dan memecahnya jadi field — pekerjaan yang tidak bisa
--  dilakukan mesin dan tidak akan pernah selesai. Karena itu strukturnya
--  dibuat sekarang, selagi catatan yang ada masih sedikit.
--
--  YANG SENGAJA DIBIARKAN KOSONG
--  -----------------------------
--  Kolom `kode_pcare` pada tabel-tabel rujukan di bawah TIDAK diisi tebakan.
--  Nilainya milik BPJS dan hanya sah kalau diambil dari endpoint referensi
--  PCare sesudah klinik punya kredensial. Kode salah pada kdStatusPulang
--  atau kdPrognosa tidak menimbulkan galat apa pun — klaimnya terkirim,
--  diterima, dan isinya keliru. Yang dibangun sekarang justru satu-satunya
--  hal yang mahal kalau ditunda: TEMPAT kodenya, plus halaman pemetaan dan
--  view kesiapan supaya yang belum terisi kelihatan sejak hari pertama.
--
--  Yang DIISI sekarang hanya nilai yang memang baku dan tidak berubah:
--  kode LOINC tanda vital (dari profil FHIR vitalsigns) dan kdTkp/kdTacc
--  yang nilainya sudah tetap sejak PCare v1.
-- =====================================================================


-- =====================================================================
--  1. TABEL RUJUKAN BARU
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. Prognosa  →  PCare kdPrognosa
--     Nama Latin dipakai apa adanya karena itu yang ditulis dokter di
--     rekam medis; kolom kode yang menjembatani ke PCare.
-- ---------------------------------------------------------------------
create table if not exists ref_prognosa (
  kode        text primary key,
  nama        text not null,
  keterangan  text,
  kode_pcare  text,
  urutan      smallint default 0,
  aktif       boolean not null default true
);

insert into ref_prognosa (kode, nama, keterangan, urutan) values
  ('BONAM',        'Bonam',          'Baik — diperkirakan sembuh sempurna',      1),
  ('DUBIA_BONAM',  'Dubia ad bonam', 'Ragu, cenderung membaik',                  2),
  ('DUBIA',        'Dubia',          'Ragu — belum dapat ditentukan',             3),
  ('DUBIA_MALAM',  'Dubia ad malam', 'Ragu, cenderung memburuk',                 4),
  ('MALAM',        'Malam',          'Buruk',                                     5),
  ('AD_VITAM',     'Ad vitam',       'Menyangkut nyawa',                          6),
  ('AD_FUNCTIONAM','Ad functionam',  'Menyangkut fungsi organ',                   7),
  ('AD_SANATIONAM','Ad sanationam',  'Menyangkut kemungkinan kambuh',             8)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 1b. TACC  →  PCare kdTacc / alasanTacc
--     TACC = Time, Age, Complication, Comorbidity. Dipakai BPJS untuk
--     membenarkan rujukan atas diagnosa yang seharusnya tuntas di FKTP.
--     Nilai −1..3 sudah tetap sejak PCare v1, jadi kode_pcare-nya diisi.
-- ---------------------------------------------------------------------
create table if not exists ref_tacc (
  kode        text primary key,
  nama        text not null,
  keterangan  text,
  kode_pcare  text,
  perlu_alasan boolean not null default true,
  urutan      smallint default 0,
  aktif       boolean not null default true
);

insert into ref_tacc (kode, nama, keterangan, kode_pcare, perlu_alasan, urutan) values
  ('TIDAK', 'Tanpa TACC',   'Rujukan biasa, atau pasien tidak dirujuk',       '-1', false, 0),
  ('T',     'Time',         'Perjalanan penyakit sudah melewati waktu yang wajar ditangani FKTP', '0', true, 1),
  ('A',     'Age',          'Umur pasien menjadi pertimbangan rujukan',       '1',  true,  2),
  ('C1',    'Complication', 'Ada komplikasi yang tidak dapat ditangani FKTP', '2',  true,  3),
  ('C2',    'Comorbidity',  'Ada penyakit penyerta yang memerlukan rujukan',  '3',  true,  4)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 1c. Tingkat pelayanan (kdTkp). Klinik pratama rawat jalan selalu '10';
--     tabelnya tetap dibuat supaya nilainya tidak ditanam di dalam kode.
-- ---------------------------------------------------------------------
create table if not exists ref_tkp (
  kode        text primary key,
  nama        text not null,
  kode_pcare  text,
  urutan      smallint default 0,
  aktif       boolean not null default true
);

insert into ref_tkp (kode, nama, kode_pcare, urutan, aktif) values
  ('10', 'Rawat Jalan',          '10', 1, true),
  ('20', 'Rawat Inap',           '20', 2, false),
  ('50', 'Promotif Preventif',   '50', 3, true)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 1d. Alergi  →  PCare alergiMakan / alergiUdara / alergiObat
--     PCare meminta SATU kode per jenis, bukan daftar. Karena itu kolom
--     `kode` di sini adalah kode ringkas per jenis, sedangkan daftar
--     alergi pasien yang sebenarnya tetap di tabel pasien_alergi.
-- ---------------------------------------------------------------------
create table if not exists ref_alergi (
  id          uuid primary key default uuid_generate_v4(),
  jenis       text not null check (jenis in ('MAKANAN','UDARA','OBAT')),
  kode        text not null,
  nama        text not null,
  kode_pcare  text,
  urutan      smallint default 0,
  aktif       boolean not null default true,
  unique (jenis, kode)
);

insert into ref_alergi (jenis, kode, nama, urutan) values
  ('MAKANAN','00','Tidak ada alergi makanan',        0),
  ('MAKANAN','LT','Makanan laut / seafood',          1),
  ('MAKANAN','TL','Telur',                           2),
  ('MAKANAN','SS','Susu sapi',                       3),
  ('MAKANAN','KC','Kacang-kacangan',                 4),
  ('MAKANAN','LN','Makanan lain',                    9),
  ('UDARA',  '00','Tidak ada alergi udara',          0),
  ('UDARA',  'DB','Debu',                            1),
  ('UDARA',  'DG','Udara dingin',                    2),
  ('UDARA',  'SP','Serbuk sari / tepung sari',       3),
  ('UDARA',  'AS','Asap',                            4),
  ('UDARA',  'BH','Bulu hewan',                      5),
  ('UDARA',  'LN','Penyebab lain di udara',          9),
  ('OBAT',   '00','Tidak ada alergi obat',           0),
  ('OBAT',   'PN','Penisilin dan turunannya',        1),
  ('OBAT',   'SF','Sulfa',                           2),
  ('OBAT',   'AS','Asam salisilat / aspirin',        3),
  ('OBAT',   'NS','Antinyeri golongan NSAID',        4),
  ('OBAT',   'LN','Obat lain',                       9)
on conflict (jenis, kode) do nothing;

-- ---------------------------------------------------------------------
-- 1e. Faskes rujukan (kdppk), sub spesialis, dan sarana penunjang
--     → PCare rujukLanjut { kdppk, subSpesialis{ kdSubSpesialis1,
--       kdSarana }, tglEstRujuk, khusus }
--
--     Isi tabel ini datang dari BPJS (endpoint referensi faskes rujukan
--     dan spesialis). Sampai kredensial ada, klinik boleh mengisi sendiri
--     rumah sakit langganan lewat Pengaturan → Rujukan supaya dokter
--     tetap memilih dari daftar, bukan mengetik nama bebas.
-- ---------------------------------------------------------------------
create table if not exists ref_ppk (
  kode        text primary key,          -- kdppk dari BPJS
  nama        text not null,
  jenis       text default 'RS',         -- RS | KLINIK | LABORATORIUM | APOTEK
  alamat      text,
  telepon     text,
  sumber      text not null default 'MANUAL',   -- MANUAL | PCARE
  urutan      smallint default 0,
  aktif       boolean not null default true,
  updated_at  timestamptz not null default now()
);
comment on table ref_ppk is
  'Faskes tujuan rujukan. Kolom kode = kdppk BPJS. Baris bersumber MANUAL '
  'diketik klinik sendiri dan kodenya harus dicocokkan sebelum bridging aktif.';

create table if not exists ref_subspesialis (
  kode        text primary key,
  nama        text not null,
  kode_pcare  text,
  urutan      smallint default 0,
  aktif       boolean not null default true
);

-- Sub spesialis yang paling sering jadi tujuan rujukan klinik pratama.
-- Kode di bawah kode INTERNAL; kode_pcare menyusul dari referensi BPJS.
insert into ref_subspesialis (kode, nama, urutan) values
  ('PD',   'Penyakit Dalam',            1),
  ('ANAK', 'Anak',                      2),
  ('BEDAH','Bedah Umum',                3),
  ('OBGYN','Kebidanan & Kandungan',     4),
  ('MATA', 'Mata',                      5),
  ('THT',  'THT-KL',                    6),
  ('SARAF','Saraf',                     7),
  ('KULIT','Kulit & Kelamin',           8),
  ('JIWA', 'Kesehatan Jiwa',            9),
  ('JANTUNG','Jantung & Pembuluh Darah',10),
  ('PARU', 'Paru',                      11),
  ('ORTHO','Orthopedi',                 12),
  ('URO',  'Urologi',                   13),
  ('GIGI', 'Gigi & Mulut',              14),
  ('REHAB','Rehabilitasi Medik',        15)
on conflict (kode) do nothing;

create table if not exists ref_sarana (
  kode        text primary key,
  nama        text not null,
  kode_pcare  text,
  urutan      smallint default 0,
  aktif       boolean not null default true
);

insert into ref_sarana (kode, nama, urutan) values
  ('TANPA', 'Tanpa sarana khusus', 0),
  ('LAB',   'Laboratorium',        1),
  ('RAD',   'Radiologi',           2),
  ('USG',   'USG',                 3),
  ('CT',    'CT Scan',             4),
  ('MRI',   'MRI',                 5),
  ('EKG',   'EKG / Elektromedik',  6),
  ('HEMO',  'Hemodialisa',         7)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 1f. Sistem pemeriksaan fisik  →  SatuSehat Observation
--
--     Satu baris = satu sistem tubuh = satu Observation nanti. `normal_teks`
--     adalah kalimat yang dipakai saat dokter menekan "dalam batas normal",
--     supaya narasi O pada rekam medis tetap berbunyi seperti tulisan
--     dokter, bukan daftar centang.
--
--     kode_loinc dan kode_snomed sengaja kosong: kode pemeriksaan fisik
--     per sistem bukan bagian dari profil FHIR baku dan harus mengikuti
--     terminologi yang dipakai SatuSehat. Kode internal di kolom `kode`
--     sudah stabil, jadi catatan yang terkumpul hari ini tidak perlu diubah.
-- ---------------------------------------------------------------------
create table if not exists ref_sistem_fisik (
  kode          text primary key,
  nama          text not null,
  normal_teks   text not null,
  temuan_lazim  jsonb not null default '[]'::jsonb,
  kode_loinc    text,
  kode_snomed   text,
  poli_jenis    text,        -- null = semua poli, 'GIGI' = hanya poli gigi
  bawaan_periksa boolean not null default true,  -- ikut tombol "semua normal"
  urutan        smallint default 0,
  aktif         boolean not null default true
);

insert into ref_sistem_fisik (kode, nama, normal_teks, temuan_lazim, bawaan_periksa, urutan) values
  ('UMUM',    'Keadaan umum',
   'Tampak sakit ringan, kesadaran compos mentis, gizi cukup',
   '["Tampak sakit sedang","Tampak sakit berat","Tampak pucat","Tampak sesak","Tampak lemas","Gizi kurang"]', true, 1),
  ('KEPALA',  'Kepala & wajah',
   'Normosefali, wajah simetris, tidak ada deformitas',
   '["Nyeri tekan sinus","Wajah asimetris","Edema palpebra","Jejas / luka"]', true, 2),
  ('MATA',    'Mata',
   'Konjungtiva tidak anemis, sklera tidak ikterik, pupil isokor, refleks cahaya positif',
   '["Konjungtiva anemis","Sklera ikterik","Pupil anisokor","Mata cekung","Injeksi konjungtiva","Sekret mata"]', true, 3),
  ('THT',     'Telinga, hidung, tenggorokan',
   'Liang telinga lapang, tidak ada sekret; hidung tidak ada sekret maupun deviasi septum; faring tidak hiperemis, tonsil T1-T1 tenang',
   '["Faring hiperemis","Tonsil T2-T2","Tonsil T3-T3 dengan detritus","Sekret hidung serosa","Konka edema","Serumen obturans","Membran timpani suram","Nyeri tekan tragus"]', true, 4),
  ('MULUT',   'Mulut & gigi',
   'Mukosa mulut lembap, lidah tidak kotor, gigi geligi baik',
   '["Mukosa kering","Lidah kotor","Stomatitis","Karies gigi","Gusi berdarah"]', true, 5),
  ('LEHER',   'Leher',
   'Tidak ada pembesaran kelenjar getah bening maupun tiroid, JVP tidak meningkat',
   '["Pembesaran KGB leher","Pembesaran tiroid","JVP meningkat","Kaku kuduk"]', true, 6),
  ('PARU',    'Toraks — paru',
   'Gerak napas simetris, retraksi tidak ada, suara napas vesikuler, ronki tidak ada, wheezing tidak ada',
   '["Ronki basah halus","Ronki basah kasar","Wheezing ekspirasi","Suara napas melemah","Retraksi interkostal","Gerak napas asimetris","Hipersonor","Redup basal"]', true, 7),
  ('JANTUNG', 'Toraks — jantung',
   'Bunyi jantung I dan II reguler, murmur tidak ada, gallop tidak ada',
   '["Murmur sistolik","Gallop","Irama tidak teratur","Takikardia","Bradikardia","Batas jantung melebar"]', true, 8),
  ('ABDOMEN', 'Abdomen',
   'Datar, supel, bising usus normal, nyeri tekan tidak ada, hepar dan lien tidak teraba',
   '["Nyeri tekan epigastrium","Nyeri tekan McBurney","Nyeri ketok CVA","Distensi","Bising usus meningkat","Bising usus menurun","Hepatomegali","Splenomegali","Defans muskuler","Asites"]', true, 9),
  ('EKSTREMITAS','Ekstremitas',
   'Akral hangat, capillary refill kurang dari 2 detik, edema tidak ada, gerak bebas',
   '["Akral dingin","Edema tungkai","CRT lebih dari 2 detik","Nyeri sendi","Keterbatasan gerak","Deformitas","Krepitasi","Luka terbuka"]', true, 10),
  ('KULIT',   'Kulit',
   'Turgor baik, tidak ada ruam maupun lesi',
   '["Turgor menurun","Ruam makulopapular","Vesikel","Ikterik","Pucat","Sianosis","Ptekie","Ulkus","Gatal / ekskoriasi"]', true, 11),
  ('NEURO',   'Neurologis',
   'Kesadaran compos mentis, tidak ada defisit motorik maupun sensorik, refleks fisiologis normal, refleks patologis negatif',
   '["Hemiparesis","Parese nervus kranialis","Refleks patologis positif","Rangsang meningeal positif","Tremor","Penurunan sensorik"]', true, 12),
  ('GENITAL', 'Genitourinaria',
   'Tidak ada kelainan pada pemeriksaan luar',
   '["Nyeri tekan suprapubik","Sekret uretra","Pembesaran skrotum","Fluor albus"]', false, 13)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 1g. Kode LOINC tanda vital  →  SatuSehat Observation
--     Nilai di sini DIISI karena berasal dari profil FHIR vitalsigns
--     (hl7.org/fhir/R4/observation-vitalsigns.html) — baku lintas negara
--     dan tidak akan berubah oleh keputusan lokal mana pun.
-- ---------------------------------------------------------------------
create table if not exists ref_vital (
  kode        text primary key,    -- sama dengan nama kolom di kajian_awal
  nama        text not null,
  satuan      text,
  satuan_ucum text,                -- satuan versi UCUM untuk FHIR
  kode_loinc  text,
  urutan      smallint default 0
);

insert into ref_vital (kode, nama, satuan, satuan_ucum, kode_loinc, urutan) values
  ('sistolik',      'Tekanan darah sistolik',  'mmHg',  'mm[Hg]', '8480-6',  1),
  ('diastolik',     'Tekanan darah diastolik', 'mmHg',  'mm[Hg]', '8462-4',  2),
  ('tekanan_darah', 'Tekanan darah',           'mmHg',  'mm[Hg]', '85354-9', 3),
  ('nadi',          'Frekuensi nadi',          'x/menit','/min',  '8867-4',  4),
  ('nafas',         'Frekuensi napas',         'x/menit','/min',  '9279-1',  5),
  ('suhu',          'Suhu tubuh',              '°C',    'Cel',    '8310-5',  6),
  ('spo2',          'Saturasi oksigen',        '%',     '%',      '2708-6',  7),
  ('berat_badan',   'Berat badan',             'kg',    'kg',     '29463-7', 8),
  ('tinggi_badan',  'Tinggi badan',            'cm',    'cm',     '8302-2',  9),
  ('imt',           'Indeks massa tubuh',      'kg/m²', 'kg/m2',  '39156-5', 10),
  ('lingkar_perut', 'Lingkar perut',           'cm',    'cm',     '8280-0',  11),
  ('skala_nyeri',   'Skala nyeri',             '0-10',  '{score}','72514-3', 12)
on conflict (kode) do nothing;


-- =====================================================================
--  2. KOLOM BARU PADA TABEL YANG SUDAH ADA
--     Semua ditambah, tidak ada yang dibuang. Kolom teks lama (subjective,
--     objective, assessment, plan) tetap tinggal dan tetap terisi — kini
--     disusun otomatis dari isian terstruktur oleh aplikasi. Rekam medis
--     yang sudah terlanjur dibuat tetap terbaca persis seperti semula.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2a. pemeriksaan — anamnesis
-- ---------------------------------------------------------------------
alter table pemeriksaan add column if not exists keluhan_utama text;
comment on column pemeriksaan.keluhan_utama is 'PCare /kunjungan → keluhan';

alter table pemeriksaan add column if not exists anamnesis text;
comment on column pemeriksaan.anamnesis is
  'PCare /kunjungan → anamnesa. Disusun aplikasi dari riwayat_penyakit_sekarang '
  'dan riwayat lain; boleh disunting dokter.';

alter table pemeriksaan add column if not exists riwayat_penyakit_sekarang jsonb
  not null default '{}'::jsonb;
comment on column pemeriksaan.riwayat_penyakit_sekarang is
  'Tujuh butir anamnesis: onset, lokasi, kualitas, kuantitas, kronologi, '
  'memperberat, memperingan, penyerta.';

alter table pemeriksaan add column if not exists riwayat_penyakit_dahulu text;
alter table pemeriksaan add column if not exists riwayat_keluarga text;
alter table pemeriksaan add column if not exists riwayat_pengobatan text;
alter table pemeriksaan add column if not exists riwayat_sosial text;

-- ---------------------------------------------------------------------
-- 2b. pemeriksaan — objektif
-- ---------------------------------------------------------------------
alter table pemeriksaan add column if not exists keadaan_umum text;
alter table pemeriksaan add column if not exists kesadaran_kode text
  references ref_kesadaran(kode);
comment on column pemeriksaan.kesadaran_kode is
  'Penilaian dokter. Boleh berbeda dari kajian awal perawat — yang dikirim '
  'ke PCare sebagai kdSadar adalah nilai ini bila ada.';

-- pemeriksaan_fisik sudah ada sejak 01_schema.sql; isinya yang kini diatur:
--   { "PARU": { "status": "ABNORMAL", "temuan": "Ronki basah halus basal kanan" }, ... }
--   status ∈ NORMAL | ABNORMAL | TIDAK_DIPERIKSA
comment on column pemeriksaan.pemeriksaan_fisik is
  'Temuan per sistem tubuh, kunci = ref_sistem_fisik.kode, nilai = '
  '{status, temuan}. Satu sistem menjadi satu Observation SatuSehat.';

-- ---------------------------------------------------------------------
-- 2c. pemeriksaan — penilaian
-- ---------------------------------------------------------------------
alter table pemeriksaan add column if not exists diagnosis_banding jsonb
  not null default '[]'::jsonb;
comment on column pemeriksaan.diagnosis_banding is
  'Daftar [{kode, nama}] ICD-10 yang dipertimbangkan tapi belum ditegakkan. '
  'Tidak ikut dikirim sebagai diagnosa; hanya untuk rekam medis.';

-- ---------------------------------------------------------------------
-- 2d. pemeriksaan — rencana / tata laksana
-- ---------------------------------------------------------------------
alter table pemeriksaan add column if not exists terapi_obat text;
comment on column pemeriksaan.terapi_obat is
  'PCare /kunjungan → terapiObat. Disusun aplikasi dari daftar resep.';
-- terapi_non_obat sudah ada sejak 01_schema.sql  → PCare terapiNonObat
alter table pemeriksaan add column if not exists bmhp text;
comment on column pemeriksaan.bmhp is
  'PCare /kunjungan → bmhp. Bahan medis habis pakai: kasa, spuit, plester, dsb.';

alter table pemeriksaan add column if not exists prognosa_kode text
  references ref_prognosa(kode);

-- ---------------------------------------------------------------------
-- 2e. pemeriksaan — rujukan terstruktur
--     Kolom teks lama (rujuk_ke_faskes, rujuk_spesialis, rujuk_alasan)
--     tetap ada: surat rujukan mencetak nama, bukan kode.
-- ---------------------------------------------------------------------
alter table pemeriksaan add column if not exists rujuk_poli_internal_id uuid
  references poli(id);
alter table pemeriksaan add column if not exists rujuk_ppk_kode text
  references ref_ppk(kode);
alter table pemeriksaan add column if not exists rujuk_subspesialis_kode text
  references ref_subspesialis(kode);
alter table pemeriksaan add column if not exists rujuk_sarana_kode text
  references ref_sarana(kode);
alter table pemeriksaan add column if not exists rujuk_tgl_estimasi date;
alter table pemeriksaan add column if not exists rujuk_khusus_kode text;

alter table pemeriksaan add column if not exists tacc_kode text
  references ref_tacc(kode);
alter table pemeriksaan add column if not exists tacc_alasan text;

-- ---------------------------------------------------------------------
-- 2f. pasien_alergi — dikaitkan ke kode
--     PCare hanya menerima satu kode per jenis. Kolom ref_alergi_id
--     itulah yang menentukan kode mana yang dikirim.
-- ---------------------------------------------------------------------
alter table pasien_alergi add column if not exists ref_alergi_id uuid
  references ref_alergi(id);

-- Jenis 'UDARA' belum ada sebelumnya padahal PCare memintanya terpisah.
-- Kolomnya text tanpa check constraint, jadi cukup dicatat di komentar.
comment on column pasien_alergi.jenis is
  'OBAT | MAKANAN | UDARA | LAINNYA. Tiga yang pertama dikirim ke PCare '
  'sebagai alergiObat, alergiMakan, dan alergiUdara.';

-- ---------------------------------------------------------------------
-- 2g. resep_item — signa terpisah untuk PCare /obat/kunjungan
--     PCare tidak menerima kalimat "3 x sehari 1 tablet". Yang diminta
--     dua angka: signa1 (berapa kali sehari) dan signa2 (berapa tiap kali).
--     Kolom frekuensi dan dosis sudah ada sejak 01_schema.sql tetapi belum
--     pernah diisi aplikasi — mulai sekarang diisi, dan itulah signa1/signa2.
-- ---------------------------------------------------------------------
comment on column resep_item.frekuensi is 'PCare /obat/kunjungan → signa1 (berapa kali sehari)';
comment on column resep_item.dosis     is 'PCare /obat/kunjungan → signa2 (berapa satuan tiap kali minum)';

alter table resep_item add column if not exists kode_pcare text;
alter table resep_item add column if not exists obat_dpho boolean not null default false;
comment on column resep_item.obat_dpho is
  'true bila obat ada di DPHO BPJS dan dikirim dengan kdObat; false berarti '
  'dikirim sebagai nmObatNonDPHO.';

alter table obat add column if not exists dpho boolean not null default false;

-- ---------------------------------------------------------------------
-- 2h. Tindakan — kode PCare
-- ---------------------------------------------------------------------
alter table icd9cm  add column if not exists kode_pcare text;
alter table icd9cm  add column if not exists kode_snomed text;
alter table tindakan add column if not exists kode_pcare text;
alter table tindakan add column if not exists hasil text;
comment on column tindakan.hasil is 'PCare /tindakan → hasil. Kosong = 0 (tanpa hasil khusus).';

-- ---------------------------------------------------------------------
-- 2i. Signa master — supaya pilihan cepat ikut mengisi frekuensi & dosis
--     Kolom frekuensi dan dosis sudah ada di tabel signa sejak awal;
--     nilainya yang belum terisi.
-- ---------------------------------------------------------------------
update signa set frekuensi = 3, dosis = 1 where kode = '3dd1' and frekuensi is null;
update signa set frekuensi = 2, dosis = 1 where kode = '2dd1' and frekuensi is null;
update signa set frekuensi = 1, dosis = 1 where kode = '1dd1' and frekuensi is null;


-- =====================================================================
--  3. PENJAGA ISI
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3a. Nama menyusul kode, bukan sebaliknya.
--     Kolom teks `prognosa` dan `status_pulang` dipakai surat, resume, dan
--     cetakan rekam medis. Kalau aplikasi lupa mengisinya sementara kodenya
--     terisi, surat keluar tanpa prognosa dan tidak ada yang tahu sampai
--     ada yang membacanya. Diisi database supaya tidak bisa lupa.
-- ---------------------------------------------------------------------
create or replace function samakan_nama_kode_pemeriksaan() returns trigger
language plpgsql as $$
begin
  if new.prognosa_kode is not null then
    select nama into new.prognosa from ref_prognosa where kode = new.prognosa_kode;
  end if;
  if new.status_pulang_kode is not null then
    select nama into new.status_pulang from ref_status_pulang where kode = new.status_pulang_kode;
  end if;
  return new;
end $$;

drop trigger if exists trg_samakan_nama_kode on pemeriksaan;
create trigger trg_samakan_nama_kode before insert or update on pemeriksaan
for each row execute function samakan_nama_kode_pemeriksaan();

-- ---------------------------------------------------------------------
-- 3b. Alasan TACC wajib bila TACC dipilih.
--     BPJS menolak rujukan ber-TACC tanpa alasan. Ditolak di sini supaya
--     ketahuan saat dokter menyimpan, bukan berminggu-minggu kemudian
--     saat klaimnya dikembalikan.
-- ---------------------------------------------------------------------
create or replace function cek_tacc() returns trigger
language plpgsql as $$
declare perlu boolean;
begin
  if new.tacc_kode is null then return new; end if;
  select perlu_alasan into perlu from ref_tacc where kode = new.tacc_kode;
  if perlu and coalesce(btrim(new.tacc_alasan), '') = '' then
    raise exception 'Alasan TACC wajib diisi bila TACC dipilih (kode %).', new.tacc_kode;
  end if;
  if not perlu then new.tacc_alasan := null; end if;
  return new;
end $$;

drop trigger if exists trg_cek_tacc on pemeriksaan;
create trigger trg_cek_tacc before insert or update on pemeriksaan
for each row execute function cek_tacc();


-- =====================================================================
--  4. VIEW PAYLOAD — bentuk data persis seperti yang diminta PCare
--
--     View ini BUKAN sekadar kenyamanan. Ia adalah bukti bahwa perubahan
--     hari ini benar-benar cukup: kalau ada field PCare yang tidak bisa
--     disusun di sini, berarti masih ada kolom yang kurang, dan itu
--     ketahuan sekarang — bukan pada hari kredensial datang.
--
--     Kolom kode PCare yang belum dipetakan akan muncul sebagai NULL.
--     Itu memang keadaannya, dan v_kesiapan_kode di bawah menghitungnya.
-- =====================================================================

create or replace view v_pcare_kunjungan with (security_invoker = true) as
select
  k.id                                              as kunjungan_id,
  k.no_kunjungan,
  k.tanggal,
  k.pcare_no_kunjungan                              as "noKunjungan",
  p.no_bpjs                                         as "noKartu",
  to_char(k.tanggal, 'DD-MM-YYYY')                  as "tglDaftar",
  po.kode_pcare                                     as "kdPoli",
  coalesce(nullif(btrim(pm.keluhan_utama), ''),
           nullif(btrim(ka.keluhan_utama), ''),
           nullif(btrim(k.keluhan_singkat), ''),
           'Tidak Ada')                             as "keluhan",
  rk.kode_pcare                                     as "kdSadar",
  ka.sistolik                                       as "sistole",
  ka.diastolik                                      as "diastole",
  ka.berat_badan                                    as "beratBadan",
  ka.tinggi_badan                                   as "tinggiBadan",
  ka.nafas                                          as "respRate",
  ka.nadi                                           as "heartRate",
  ka.lingkar_perut                                  as "lingkarPerut",
  replace(ka.suhu::text, '.', ',')                  as "suhu",
  rsp.kode_pcare                                    as "kdStatusPulang",
  to_char(coalesce(k.waktu_selesai::date, k.tanggal), 'DD-MM-YYYY') as "tglPulang",
  dr.kode_dokter_pcare                              as "kdDokter",
  (select d.kode_icd10 from diagnosa d
    where d.kunjungan_id = k.id order by d.jenis, d.urutan offset 0 limit 1) as "kdDiag1",
  (select d.kode_icd10 from diagnosa d
    where d.kunjungan_id = k.id order by d.jenis, d.urutan offset 1 limit 1) as "kdDiag2",
  (select d.kode_icd10 from diagnosa d
    where d.kunjungan_id = k.id order by d.jenis, d.urutan offset 2 limit 1) as "kdDiag3",
  pin.kode_pcare                                    as "kdPoliRujukInternal",
  case when pm.rujuk_ppk_kode is null then null else
    jsonb_build_object(
      'tglEstRujuk', to_char(coalesce(pm.rujuk_tgl_estimasi, k.tanggal), 'DD-MM-YYYY'),
      'kdppk',       pm.rujuk_ppk_kode,
      'subSpesialis', jsonb_build_object(
        'kdSubSpesialis1', rsub.kode_pcare,
        'kdSarana',        rsar.kode_pcare),
      'khusus', pm.rujuk_khusus_kode)
  end                                               as "rujukLanjut",
  coalesce(rt.kode_pcare, '-1')                     as "kdTacc",
  pm.tacc_alasan                                    as "alasanTacc",
  coalesce(nullif(btrim(pm.anamnesis), ''),
           nullif(btrim(pm.subjective), ''), 'Tidak Ada')            as "anamnesa",
  coalesce(am.kode_pcare, '00')                     as "alergiMakan",
  coalesce(au.kode_pcare, '00')                     as "alergiUdara",
  coalesce(ao.kode_pcare, '00')                     as "alergiObat",
  rpg.kode_pcare                                    as "kdPrognosa",
  coalesce(nullif(btrim(pm.terapi_obat), ''), 'Tidak Ada')     as "terapiObat",
  coalesce(nullif(btrim(pm.terapi_non_obat), ''), 'Tidak Ada') as "terapiNonObat",
  coalesce(nullif(btrim(pm.bmhp), ''), 'Tidak Ada')            as "bmhp",
  -- untuk /pendaftaran
  k.kunjungan_sakit                                 as "kunjSakit",
  '10'::text                                        as "kdTkp",
  0                                                 as "rujukBalik"
from kunjungan k
join pasien p                on p.id  = k.pasien_id
join poli po                 on po.id = k.poli_id
left join kajian_awal ka     on ka.kunjungan_id = k.id
left join pemeriksaan pm     on pm.kunjungan_id = k.id
left join pegawai dr         on dr.id = k.dokter_id
left join poli pin           on pin.id = pm.rujuk_poli_internal_id
left join ref_kesadaran rk   on rk.kode  = coalesce(pm.kesadaran_kode, ka.kesadaran_kode)
left join ref_status_pulang rsp on rsp.kode = pm.status_pulang_kode
left join ref_prognosa rpg   on rpg.kode = pm.prognosa_kode
left join ref_tacc rt        on rt.kode  = pm.tacc_kode
left join ref_subspesialis rsub on rsub.kode = pm.rujuk_subspesialis_kode
left join ref_sarana rsar    on rsar.kode = pm.rujuk_sarana_kode
left join lateral (
  select ra.kode_pcare from pasien_alergi pa
    join ref_alergi ra on ra.id = pa.ref_alergi_id
   where pa.pasien_id = p.id and ra.jenis = 'MAKANAN' and ra.kode <> '00'
   order by pa.dicatat_pada desc limit 1) am on true
left join lateral (
  select ra.kode_pcare from pasien_alergi pa
    join ref_alergi ra on ra.id = pa.ref_alergi_id
   where pa.pasien_id = p.id and ra.jenis = 'UDARA' and ra.kode <> '00'
   order by pa.dicatat_pada desc limit 1) au on true
left join lateral (
  select ra.kode_pcare from pasien_alergi pa
    join ref_alergi ra on ra.id = pa.ref_alergi_id
   where pa.pasien_id = p.id and ra.jenis = 'OBAT' and ra.kode <> '00'
   order by pa.dicatat_pada desc limit 1) ao on true
where k.cara_bayar = 'BPJS';

comment on view v_pcare_kunjungan is
  'Satu baris per kunjungan BPJS, kolomnya bernama persis seperti field '
  'payload PCare /kunjungan. Kolom yang NULL berarti datanya atau pemetaan '
  'kodenya belum ada — bukan berarti field-nya tidak dibutuhkan.';

-- Obat  →  PCare POST /obat/kunjungan
create or replace view v_pcare_obat with (security_invoker = true) as
select
  r.kunjungan_id,
  k.pcare_no_kunjungan                    as "noKunjungan",
  0                                       as "kdObatSK",
  coalesce(ri.racikan_nama is not null, false) as "racikan",
  null::text                              as "kdRacikan",
  ri.obat_dpho                            as "obatDPHO",
  ri.kode_pcare                           as "kdObat",
  coalesce(ri.frekuensi, 1)               as "signa1",
  coalesce(ri.dosis, 1)                   as "signa2",
  ri.jumlah                               as "jmlObat",
  ri.jumlah                               as "jmlPermintaan",
  case when ri.obat_dpho then '-' else ri.nama_obat end as "nmObatNonDPHO"
from resep_item ri
join resep r    on r.id = ri.resep_id
join kunjungan k on k.id = r.kunjungan_id
where k.cara_bayar = 'BPJS';

-- Tindakan  →  PCare POST /tindakan
create or replace view v_pcare_tindakan with (security_invoker = true) as
select
  t.kunjungan_id,
  k.pcare_no_kunjungan       as "noKunjungan",
  0                          as "kdTindakanSK",
  coalesce(t.kode_pcare, i.kode_pcare) as "kdTindakan",
  0                          as "biaya",
  t.catatan                  as "keterangan",
  coalesce(t.hasil, '0')     as "hasil"
from tindakan t
join kunjungan k on k.id = t.kunjungan_id
left join icd9cm i on i.kode = t.kode_icd9
where k.cara_bayar = 'BPJS';


-- =====================================================================
--  5. VIEW OBSERVASI  →  SatuSehat
--     Setiap tanda vital dan setiap sistem pemeriksaan fisik menjadi satu
--     baris, siap dibungkus jadi resource Observation. Nilai numerik dan
--     teks dipisah karena FHIR memisahkannya (valueQuantity vs valueString).
-- =====================================================================

create or replace view v_satusehat_observasi with (security_invoker = true) as
-- Tanda vital: nilai angka, kode LOINC baku
select
  ka.kunjungan_id,
  'VITAL'::text        as kelompok,
  v.kode               as kode_internal,
  v.nama,
  v.kode_loinc,
  x.nilai              as nilai_angka,
  null::text           as nilai_teks,
  v.satuan,
  v.satuan_ucum,
  v.urutan
from kajian_awal ka
cross join lateral (values
  ('sistolik',      ka.sistolik::numeric),
  ('diastolik',     ka.diastolik::numeric),
  ('nadi',          ka.nadi::numeric),
  ('nafas',         ka.nafas::numeric),
  ('suhu',          ka.suhu),
  ('spo2',          ka.spo2::numeric),
  ('berat_badan',   ka.berat_badan),
  ('tinggi_badan',  ka.tinggi_badan),
  ('imt',           ka.imt),
  ('lingkar_perut', ka.lingkar_perut),
  ('skala_nyeri',   ka.skala_nyeri::numeric)
) as x(kode, nilai)
join ref_vital v on v.kode = x.kode
where x.nilai is not null

union all

-- Pemeriksaan fisik: nilai teks per sistem tubuh
select
  pm.kunjungan_id,
  'FISIK'::text,
  s.kode,
  s.nama,
  s.kode_loinc,
  null::numeric,
  case when f.value->>'status' = 'NORMAL' then s.normal_teks
       else nullif(btrim(coalesce(f.value->>'temuan', '')), '') end,
  null, null,
  s.urutan
from pemeriksaan pm
cross join lateral jsonb_each(coalesce(pm.pemeriksaan_fisik, '{}'::jsonb)) as f(key, value)
join ref_sistem_fisik s on s.kode = f.key
where f.value->>'status' in ('NORMAL','ABNORMAL');

comment on view v_satusehat_observasi is
  'Tanda vital dan temuan pemeriksaan fisik dalam bentuk satu baris per '
  'Observation SatuSehat. Baris FISIK dengan kode_loinc NULL belum bisa '
  'dikirim — kodenya menyusul dari terminologi SatuSehat.';


-- =====================================================================
--  6. VIEW KESIAPAN — apa yang masih harus diisi manusia
-- =====================================================================

-- 6a. Pemetaan kode yang belum terisi
create or replace view v_kesiapan_kode with (security_invoker = true) as
select 'ref_kesadaran'    as tabel, 'kdSadar'      as field_pcare, kode, nama from ref_kesadaran     where aktif and coalesce(kode_pcare,'') = ''
union all
select 'ref_status_pulang','kdStatusPulang', kode, nama from ref_status_pulang where aktif and coalesce(kode_pcare,'') = ''
union all
select 'ref_prognosa',     'kdPrognosa',     kode, nama from ref_prognosa      where aktif and coalesce(kode_pcare,'') = ''
union all
select 'ref_subspesialis', 'kdSubSpesialis1',kode, nama from ref_subspesialis  where aktif and coalesce(kode_pcare,'') = ''
union all
select 'ref_sarana',       'kdSarana',       kode, nama from ref_sarana        where aktif and coalesce(kode_pcare,'') = ''
union all
select 'ref_alergi',       'alergi',         kode, nama from ref_alergi        where aktif and coalesce(kode_pcare,'') = ''
union all
select 'ref_sistem_fisik', 'LOINC Observation', kode, nama from ref_sistem_fisik where aktif and coalesce(kode_loinc,'') = '';

comment on view v_kesiapan_kode is
  'Baris di sini = satu pemetaan kode yang belum diisi. Kosong berarti '
  'seluruh nilai berkode sudah siap dikirim.';

-- 6b. Kesiapan kunjungan — versi yang tahu field terstruktur baru
create or replace view v_kesiapan_kunjungan with (security_invoker = true) as
select
  k.id, k.no_kunjungan, k.tanggal, k.status, k.cara_bayar,
  k.satusehat_status, k.pcare_status,
  p.id as pasien_id, p.no_rm, p.nama as nama_pasien,
  po.nama as nama_poli, d.nama as nama_dokter,
  array_remove(array[
    case when p.nik is null or p.nik !~ '^[0-9]{16}$'
         then 'NIK pasien belum benar' end,
    case when k.dokter_id is null
         then 'Dokter pemeriksa belum ditentukan' end,
    case when k.dokter_id is not null and coalesce(d.satusehat_practitioner_id, '') = ''
         then 'Nomor IHS dokter belum diisi' end,
    case when coalesce(po.satusehat_location_id, '') = ''
         then 'Location ID poli belum diisi' end,
    case when not exists (select 1 from diagnosa dg where dg.kunjungan_id = k.id)
         then 'Belum ada diagnosa ICD-10' end,
    case when (select count(*) from diagnosa dg where dg.kunjungan_id = k.id) > 3
         then 'Lebih dari 3 diagnosa — PCare hanya menerima kdDiag1..3' end,
    case when k.cara_bayar = 'BPJS' and coalesce(d.kode_dokter_pcare, '') = ''
         then 'Kode dokter PCare belum diisi' end,
    case when k.cara_bayar = 'BPJS' and coalesce(po.kode_pcare, '') = ''
         then 'Kode poli PCare belum diisi' end,
    case when k.cara_bayar = 'BPJS' and (p.no_bpjs is null or p.no_bpjs !~ '^[0-9]{13}$')
         then 'Nomor kartu BPJS belum benar' end,
    -- Field terstruktur yang PCare minta dan tidak punya pengganti
    case when coalesce(btrim(pm.keluhan_utama), coalesce(btrim(ka.keluhan_utama), '')) = ''
         then 'Keluhan utama belum diisi' end,
    case when coalesce(pm.kesadaran_kode, ka.kesadaran_kode) is null
         then 'Tingkat kesadaran belum dicatat' end,
    case when pm.status_pulang_kode is null
         then 'Keadaan pasien saat pulang belum dipilih' end,
    case when pm.prognosa_kode is null
         then 'Prognosa belum dipilih' end,
    case when ka.sistolik is null or ka.diastolik is null
         then 'Tekanan darah belum diukur' end,
    case when ka.nadi is null or ka.nafas is null
         then 'Nadi atau frekuensi napas belum diukur' end,
    case when ka.suhu is null
         then 'Suhu belum diukur' end,
    case when ka.berat_badan is null or ka.tinggi_badan is null
         then 'Berat atau tinggi badan belum diukur' end,
    case when pm.tindak_lanjut = 'RUJUK_LANJUT' and pm.rujuk_ppk_kode is null
         then 'Faskes tujuan rujukan belum dipilih dari daftar' end,
    case when pm.tindak_lanjut = 'RUJUK_INTERNAL' and pm.rujuk_poli_internal_id is null
         then 'Poli tujuan rujukan internal belum dipilih' end
  ], null) as kekurangan
from kunjungan k
join pasien p on p.id = k.pasien_id
join poli po on po.id = k.poli_id
left join pegawai d on d.id = k.dokter_id
left join kajian_awal ka on ka.kunjungan_id = k.id
left join pemeriksaan pm on pm.kunjungan_id = k.id
where k.status = 'SELESAI';

comment on view v_kesiapan_kunjungan is
  'Kunjungan selesai beserta data yang masih kurang untuk bridging. '
  'Dipakai halaman Pengaturan → Bridging.';


-- =====================================================================
--  7. HAK AKSES
--     Tabel dan view baru TIDAK mewarisi GRANT dari yang lama. Dua kali
--     sebelumnya modul baru mati dengan "permission denied for table ..."
--     karena bagian ini terlewat — sekali untuk tabel (apotek_batch),
--     sekali untuk view. Karena itu keduanya ditulis lengkap di sini.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['ref_prognosa','ref_tacc','ref_tkp','ref_alergi',
                           'ref_ppk','ref_subspesialis','ref_sarana',
                           'ref_sistem_fisik','ref_vital']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);

    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);

    execute format('drop policy if exists %1$s_kelola on %1$s', t);
    execute format($f$create policy %1$s_kelola on %1$s for all to authenticated
                     using (public.boleh_master_data())
                     with check (public.boleh_master_data())$f$, t);
  end loop;
end $$;

grant select on v_pcare_kunjungan, v_pcare_obat, v_pcare_tindakan,
                v_satusehat_observasi, v_kesiapan_kode, v_kesiapan_kunjungan
  to authenticated;

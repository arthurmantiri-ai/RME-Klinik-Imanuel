-- =====================================================================
--  RME KLINIK IMANUEL — NILAI BERKODE & KESIAPAN BRIDGING
--  Jalankan SETELAH 05_gigi.sql
--
--  Berkas ini tidak menambah fitur baru untuk pemakaian harian. Isinya
--  hal-hal yang murah dikerjakan sekarang tapi mahal kalau ditunda:
--
--   1. Kesadaran dan status pulang disimpan sebagai kode, bukan teks bebas.
--      Kalau nanti dipetakan ke kode PCare, yang perlu diisi hanya satu
--      tabel rujukan — bukan membersihkan ribuan catatan yang sudah ada.
--   2. Tanggal mulai bridging, supaya saat go-live sistem tahu data sejak
--      kapan yang perlu dikirim dan tidak membanjiri SatuSehat dengan
--      riwayat lama.
--   3. Dua view kesiapan data, supaya kekurangan data ketahuan sejak hari
--      pertama dan diperbaiki sambil jalan.
--
--  Semua perintah aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tanggal mulai bridging
-- ---------------------------------------------------------------------
alter table faskes add column if not exists bridging_mulai_tanggal date;
comment on column faskes.bridging_mulai_tanggal is
  'Kunjungan sejak tanggal ini yang akan dikirim ke SatuSehat/PCare. '
  'Dikosongkan selama bridging belum aktif. Diisi saat go-live agar riwayat '
  'sebelum tanggal itu tidak ikut terkirim.';

-- ---------------------------------------------------------------------
-- 2. Rujukan tingkat kesadaran
--    Kolom kode_pcare dan kode_snomed sengaja kosong: nilainya diambil dari
--    referensi resmi (PCare /kesadaran dan terminologi SatuSehat) yang baru
--    bisa diakses setelah klinik terdaftar. Kode internal di kolom `kode`
--    sudah stabil, jadi data yang terkumpul hari ini tidak perlu diubah.
-- ---------------------------------------------------------------------
create table if not exists ref_kesadaran (
  kode        text primary key,
  nama        text not null,
  keterangan  text,
  kode_pcare  text,
  kode_snomed text,
  urutan      smallint default 0,
  aktif       boolean not null default true
);

insert into ref_kesadaran (kode, nama, keterangan, urutan) values
  ('CM',          'Compos Mentis',  'Sadar penuh, orientasi baik', 1),
  ('APATIS',      'Apatis',         'Acuh tak acuh terhadap sekitar', 2),
  ('SOMNOLEN',    'Somnolen',       'Mengantuk, mudah dibangunkan', 3),
  ('DELIRIUM',    'Delirium',       'Gelisah, disorientasi, kadang halusinasi', 4),
  ('SOPOR',       'Sopor',          'Hanya bereaksi terhadap rangsang kuat', 5),
  ('SOPORO_KOMA', 'Soporo-koma',    'Reaksi sangat minimal', 6),
  ('KOMA',        'Koma',           'Tidak ada reaksi terhadap rangsang', 7)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 3. Rujukan status pulang
-- ---------------------------------------------------------------------
create table if not exists ref_status_pulang (
  kode        text primary key,
  nama        text not null,
  kode_pcare  text,
  urutan      smallint default 0,
  aktif       boolean not null default true
);

insert into ref_status_pulang (kode, nama, urutan) values
  ('SEMBUH',       'Sembuh',                  1),
  ('MEMBAIK',      'Membaik',                 2),
  ('BELUM_SEMBUH', 'Belum sembuh',            3),
  ('RUJUK',        'Dirujuk',                 4),
  ('APS',          'Atas permintaan sendiri', 5),
  ('MENINGGAL',    'Meninggal',               6)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 4. Kolom berkode pada tabel yang sudah ada
--    Kolom teks lama tetap disimpan agar catatan yang sudah terlanjur
--    dibuat tidak hilang; aplikasi mengisi keduanya sejak sekarang.
-- ---------------------------------------------------------------------
alter table kajian_awal add column if not exists kesadaran_kode text
  references ref_kesadaran(kode);
alter table pemeriksaan add column if not exists status_pulang_kode text
  references ref_status_pulang(kode);

-- Isi kode untuk catatan lama yang masih berupa teks
update kajian_awal ka set kesadaran_kode = r.kode
from ref_kesadaran r
where ka.kesadaran_kode is null and lower(trim(ka.kesadaran)) = lower(r.nama);

update pemeriksaan pm set status_pulang_kode = r.kode
from ref_status_pulang r
where pm.status_pulang_kode is null and lower(trim(pm.status_pulang)) = lower(r.nama);

-- ---------------------------------------------------------------------
-- 5. Kesiapan data pasien
--    SatuSehat mencari pasien berdasarkan NIK, jadi NIK yang benar adalah
--    syarat mutlak. Nomor BPJS hanya diperlukan bila pasien pernah berobat
--    dengan cara bayar BPJS.
-- ---------------------------------------------------------------------
create or replace view v_kesiapan_pasien with (security_invoker = true) as
select
  p.id, p.no_rm, p.nama, p.nik, p.no_bpjs, p.no_hp, p.tanggal_lahir,
  (select count(*) from kunjungan k where k.pasien_id = p.id) as jml_kunjungan,
  (select max(k.tanggal) from kunjungan k where k.pasien_id = p.id) as kunjungan_terakhir,
  array_remove(array[
    case when p.nik is null or p.nik !~ '^[0-9]{16}$'
         then 'NIK belum diisi atau bukan 16 angka' end,
    case when exists (select 1 from kunjungan k
                       where k.pasien_id = p.id and k.cara_bayar = 'BPJS')
              and (p.no_bpjs is null or p.no_bpjs !~ '^[0-9]{13}$')
         then 'Nomor BPJS belum diisi atau bukan 13 angka' end
  ], null) as kekurangan
from pasien p
where p.aktif;

comment on view v_kesiapan_pasien is
  'Pasien beserta data yang nanti dibutuhkan bridging tapi belum lengkap. '
  'Kolom kekurangan kosong berarti data pasien itu sudah siap.';

-- ---------------------------------------------------------------------
-- 6. Kesiapan data kunjungan
-- ---------------------------------------------------------------------
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
    case when k.cara_bayar = 'BPJS' and coalesce(d.kode_dokter_pcare, '') = ''
         then 'Kode dokter PCare belum diisi' end,
    case when k.cara_bayar = 'BPJS' and coalesce(po.kode_pcare, '') = ''
         then 'Kode poli PCare belum diisi' end
  ], null) as kekurangan
from kunjungan k
join pasien p on p.id = k.pasien_id
join poli po on po.id = k.poli_id
left join pegawai d on d.id = k.dokter_id
where k.status = 'SELESAI';

comment on view v_kesiapan_kunjungan is
  'Kunjungan yang sudah selesai beserta data yang masih kurang untuk bridging. '
  'Dipakai halaman Pengaturan → Bridging untuk menunjukkan apa yang perlu dibereskan.';

-- ---------------------------------------------------------------------
-- 7. Hak akses
-- ---------------------------------------------------------------------
alter table ref_kesadaran     enable row level security;
alter table ref_status_pulang enable row level security;

grant select, insert, update, delete on ref_kesadaran, ref_status_pulang to authenticated;

do $$
declare t text;
begin
  foreach t in array array['ref_kesadaran','ref_status_pulang']
  loop
    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);
    execute format('drop policy if exists %1$s_kelola on %1$s', t);
    execute format($f$create policy %1$s_kelola on %1$s for all to authenticated
                     using (public.boleh_master_data())
                     with check (public.boleh_master_data())$f$, t);
  end loop;
end $$;

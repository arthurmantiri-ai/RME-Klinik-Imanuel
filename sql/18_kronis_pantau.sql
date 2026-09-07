-- =====================================================================
--  RME KLINIK IMANUEL — PEMANTAUAN PASIEN KRONIS (Tahap 2: pemantauan)
--  Jalankan SETELAH 17_apotek_kolam.sql. Aman dijalankan di database
--  berisi data, dan aman dijalankan ulang.
--
--  SYARAT MATI SEBELUM BERKAS INI BERGUNA (bukan sebelum bisa DIPASANG)
--  ----------------------------------------------------------------------
--  apotek_serahkan_resep() menolak bila stok batch kurang. Selama saldo
--  awal stok apotek belum diisi, resep tidak pernah berstatus DISERAHKAN,
--  tidak ada baris apotek_transaksi, dan seluruh view di berkas ini akan
--  melapor "belum ambil obat" untuk SEMUA pasien — itu bukan bug pada
--  berkas ini, melainkan akibat langsung dari prasyarat yang belum
--  terpenuhi. Lihat claude/rancangan-kronis.md di project Claude.
--
--  TIDAK ADA TABEL BARU DI BERKAS INI
--  ----------------------------------------------------------------------
--  Seluruhnya fungsi dan view di atas tabel yang sudah ada sejak Tahap 1
--  (16_kronis.sql) dan tabel rekam medis inti. Alasannya sama persis
--  dengan alasan riwayat obat/lab tidak disalin jadi tabel di Tahap 1:
--  catatan yang sama disimpan dua tempat pasti berselisih.
--
--  KEPUTUSAN TAMPILAN vs FAKTA
--  ----------------------------------------------------------------------
--  View di sini sengaja HANYA memulangkan fakta mentah (tanggal, jumlah,
--  boolean terdaftar/tidak) — bukan label "Aman/Terlambat" yang sudah
--  diwarnai. Label dan warna dihitung di js/kronis_pantau_core.js.
--  Kelasnya beda dengan penandaan Tinggi/Rendah/Kritis di modul lab: di
--  situ SQL benar-benar MENYIMPAN tandanya (lab_hitung_tanda menulis ke
--  kolom `tanda`), sehingga ada dua sumber yang wajib disamakan dan diuji
--  berpasangan. Di sini SQL tidak pernah menyimpan status pemantauan —
--  hanya satu sumber fakta, satu sumber label. Tidak ada yang bisa
--  berselisih diam-diam karena tidak ada salinan kedua.
--
--  DUA PERINGATAN YANG BERBEDA DI APOTEK — JANGAN TERTUKAR
--  ----------------------------------------------------------------------
--  "H-3"   = pasien mengambil obat kronisnya TERLALU CEPAT (mencegah
--            obat menumpuk di rumah pasien / dijual kembali). Berlaku
--            untuk SEMUA obat rutin pasien kronis, jadwalnya 1 bulan.
--  "Kuota" = obat TERTENTU (statin) yang jatahnya dibatasi BPJS per
--            hasil lab LDL, terlepas dari jadwal bulanan di atas.
--  Keduanya peringatan, bukan penolakan (keputusan Arthur 4 Sep 2026):
--  titik itu adalah apoteker/dokter berhadapan dengan pasien yang sudah
--  di depannya. Menolak di situ akan disiasati dengan cara yang merusak
--  data, bukan mendidik siapa pun.
-- =====================================================================


-- =====================================================================
--  A. FUNGSI BANTU TANGGAL
-- =====================================================================

-- Menambah N bulan ke sebuah tanggal. Ditulis sebagai fungsi (bukan
-- ditulis ulang di tiap view) supaya definisi "satu bulan" hanya ada di
-- satu tempat — Postgres sendiri yang menangani ujung bulan (31 Jan + 1
-- bulan = 28/29 Feb, bukan 3 Maret).
create or replace function public.kronis_tambah_bulan(p_dasar date, p_bulan int)
returns date language sql immutable as $$
  select (p_dasar + (coalesce(p_bulan, 0) || ' months')::interval)::date
$$;

grant execute on function public.kronis_tambah_bulan(date, int) to authenticated;


-- =====================================================================
--  B. DIAGNOSA & OBAT AKTIF PASIEN — dipakai berulang di bawah
-- =====================================================================

-- B1. Kode diagnosa kronis aktif seorang pasien (bisa lebih dari satu).
create or replace function public.kronis_diagnosa_pasien(p_pasien_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(td.kode order by td.kode), '{}')
    from kronis_terapi t
    join kronis_terapi_diagnosa td on td.terapi_id = t.id
   where t.pasien_id = p_pasien_id and t.aktif
$$;

grant execute on function public.kronis_diagnosa_pasien(uuid) to authenticated;


-- B2. Tanggal pengambilan obat kronis TERAKHIR seorang pasien —
--     dipakai baik oleh view "belum ambil obat" maupun oleh peringatan
--     H-3 di apotek, supaya keduanya tidak bisa berselisih.
--
--     Definisi "ambil" (keputusan 4 Sep 2026): resep yang berisi
--     SALAH SATU obat rutin buku kronisnya — bukan berarti kunjungan
--     itu harus berisi SEMUA obatnya, dan bukan berarti resep dengan
--     obat lain (mis. parasetamol untuk flu) ikut terhitung.
create or replace function public.kronis_terakhir_ambil(p_pasien_id uuid)
returns date language sql stable security definer set search_path = public as $$
  select greatest(
    (select max(x.tanggal) from apotek_transaksi x
      join kronis_terapi t on t.pasien_id = x.pasien_id and t.aktif
      join kronis_obat ko on ko.terapi_id = t.id and ko.obat_id = x.obat_id
     where x.pasien_id = p_pasien_id
       and x.kategori = 'Resep Pasien'
       and not x.dibatalkan),
    (select max(r.tanggal) from kronis_riwayat_luar r
     where r.pasien_id = p_pasien_id and r.jenis = 'AMBIL_OBAT')
  )
$$;

grant execute on function public.kronis_terakhir_ambil(uuid) to authenticated;


-- B3. Tanggal pemeriksaan lab TERAKHIR yang boleh mereset jadwal kontrol
--     lab pasien ini — hanya lembar dari daftar ref_kronis_lab yang
--     ditautkan ke diagnosanya (lihat 16_kronis.sql bagian B2: GDS
--     sengaja tidak dihitung, HbA1c dihitung).
create or replace function public.kronis_terakhir_lab(p_pasien_id uuid)
returns date language sql stable security definer set search_path = public as $$
  select greatest(
    (select max(lp.tanggal) from lab_permintaan lp
      join lab_hasil lh on lh.permintaan_id = lp.id
      join ref_kronis_lab rkl on rkl.lab_id = lh.lab_id
     where lp.pasien_id = p_pasien_id
       and lp.status = 'SELESAI'
       and rkl.kode_kronis = any (public.kronis_diagnosa_pasien(p_pasien_id))),
    (select max(r.tanggal) from kronis_riwayat_luar r
     where r.pasien_id = p_pasien_id and r.jenis = 'LAB')
  )
$$;

grant execute on function public.kronis_terakhir_lab(uuid) to authenticated;


-- =====================================================================
--  C. "BELUM AMBIL OBAT BULAN INI"
-- =====================================================================

-- Satu baris per pasien pemegang buku kronis aktif. `bulan_ini_ambil`
-- dihitung dari BULAN KALENDER berjalan (persis definisi portal), bukan
-- dari jarak 30 hari — supaya sejalan dengan cara klinik sudah terbiasa
-- membaca laporan ini bertahun-tahun.
--
-- security_invoker: yang tidak boleh membaca kronis_terapi (staf) tidak
-- akan melihat baris apa pun di sini juga — mengikuti pola
-- v_kronis_impor_ringkas di 16_kronis.sql.
create or replace view v_kronis_obat_bulan_ini with (security_invoker = true) as
select
  t.id as terapi_id,
  p.id as pasien_id,
  p.no_rm, p.nama, p.no_hp, p.tanggal_lahir, p.jenis_kelamin,
  public.kronis_diagnosa_pasien(p.id) as diagnosa,
  t.tanggal_mulai,
  public.kronis_terakhir_ambil(p.id) as terakhir_ambil,
  -- coalesce ke false: tanpa ini, pasien yang BELUM PERNAH ambil sama
  -- sekali memulangkan NULL (date_trunc atas NULL = NULL), bukan false.
  -- Kolom boolean yang diam-diam bisa NULL adalah jebakan — `where not
  -- bulan_ini_ambil` akan diam-diam MELEWATKAN pasien yang justru paling
  -- perlu dihubungi.
  coalesce(date_trunc('month', public.kronis_terakhir_ambil(p.id))
     = date_trunc('month', public.tgl_klinik()), false) as bulan_ini_ambil,
  -- Selisih bulan kalender sejak terakhir ambil (atau sejak terdaftar,
  -- bila belum pernah sama sekali). Dipakai layar mengurutkan yang
  -- paling lama tertinggal lebih dulu.
  (extract(year from age(public.tgl_klinik(),
     coalesce(public.kronis_terakhir_ambil(p.id), t.tanggal_mulai))) * 12
   + extract(month from age(public.tgl_klinik(),
     coalesce(public.kronis_terakhir_ambil(p.id), t.tanggal_mulai))))::int
     as bulan_tertinggal
  from kronis_terapi t
  join pasien p on p.id = t.pasien_id
 where t.aktif
   -- pantau_obat: kalau SEMUA diagnosa pasien ini punya pantau_obat =
   -- false, ia tidak ikut dipantau. Per 16_kronis.sql kesepuluh
   -- diagnosa dasar semuanya pantau_obat = true, tapi kolomnya memang
   -- dibuat supaya klinik bisa mematikan satu diagnosis tanpa mengubah
   -- kode — lihat catatan yang sama pada ref_kronis_lab.
   and exists (
     select 1 from kronis_terapi_diagnosa td
     join ref_kronis_diagnosa d on d.kode = td.kode
    where td.terapi_id = t.id and d.pantau_obat and d.aktif);

grant select on v_kronis_obat_bulan_ini to authenticated;

comment on view v_kronis_obat_bulan_ini is
  'Fakta mentah pemantauan obat kronis per pasien. Label "Sudah/Belum/Terlambat"
   dihitung di js/kronis_pantau_core.js, bukan di sini — lihat catatan di kepala berkas.';


-- =====================================================================
--  D. JADWAL & KEPATUHAN LAB
-- =====================================================================

-- Hanya pasien dengan MINIMAL satu diagnosa yang punya jatah lab
-- (bulan_lab tidak null — per keputusan 4 Sep 2026 itu cuma HPT dan DM).
-- Kalau pasien punya keduanya, jadwalnya ikut yang PALING KETAT
-- (bulan_lab terkecil = 3, milik DM) — pasien DM+HPT tidak boleh
-- terhitung "sudah kontrol" memakai jadwal 6 bulan milik HPT saja.
create or replace view v_kronis_lab_jadwal with (security_invoker = true) as
select
  t.id as terapi_id,
  p.id as pasien_id,
  p.no_rm, p.nama, p.no_hp, p.tanggal_lahir, p.jenis_kelamin,
  public.kronis_diagnosa_pasien(p.id) as diagnosa,
  t.tanggal_mulai,
  interval_bulan.n as interval_bulan,
  public.kronis_terakhir_lab(p.id) as terakhir_lab,
  public.kronis_tambah_bulan(
    coalesce(public.kronis_terakhir_lab(p.id), t.tanggal_mulai),
    interval_bulan.n) as jadwal_berikutnya,
  -- Positif = sudah lewat jadwal sekian hari; negatif/nol = belum jatuh
  -- tempo. Toleransi 14 hari DITERAPKAN DI JS, bukan di sini — angka di
  -- sini murni "jadwal dikurangi hari ini", supaya toleransinya bisa
  -- diubah tanpa memasang ulang SQL.
  (public.tgl_klinik() - public.kronis_tambah_bulan(
     coalesce(public.kronis_terakhir_lab(p.id), t.tanggal_mulai),
     interval_bulan.n))::int as hari_lewat_jadwal
  from kronis_terapi t
  join pasien p on p.id = t.pasien_id
  cross join lateral (
    select min(d.bulan_lab) as n
      from kronis_terapi_diagnosa td
      join ref_kronis_diagnosa d on d.kode = td.kode
     where td.terapi_id = t.id and d.bulan_lab is not null and d.aktif
  ) as interval_bulan
 where t.aktif and interval_bulan.n is not null;

grant select on v_kronis_lab_jadwal to authenticated;

comment on view v_kronis_lab_jadwal is
  'Fakta mentah jadwal kontrol lab kronis. Toleransi 14 hari dan label
   Aman/Mendekati/Terlambat ada di js/kronis_pantau_core.js.';


-- =====================================================================
--  E. KUOTA OBAT BERKUOTA (STATIN)
-- =====================================================================

-- Satu baris per pasien yang punya statin terdaftar di buku kronisnya.
-- Titik nol kuota diambil dari hasil LDL TERBARU di lab_hasil bila ada
-- (keputusan 4 Sep: "tanggal lab diambil dari lab_hasil, tidak diketik
-- ulang") — kalau belum pernah periksa LDL di RME sama sekali, jatuh
-- kembali ke statin_tgl_lab yang dibawa dari migrasi portal.
create or replace view v_kronis_statin with (security_invoker = true) as
select
  t.id as terapi_id,
  p.id as pasien_id,
  p.no_rm, p.nama, p.no_hp,
  t.statin_kunci, t.statin_nama, t.statin_obat_id,
  k.maks,
  greatest(t.statin_tgl_lab, ldl.tgl) as tgl_dasar,
  ldl.tgl as tgl_ldl_terbaru,
  coalesce((
    select count(*) from apotek_transaksi x
     where x.pasien_id = p.id
       and x.kategori = 'Resep Pasien'
       and not x.dibatalkan
       and (
         (t.statin_obat_id is not null and x.obat_id = t.statin_obat_id)
         or (t.statin_obat_id is null
             and position(t.statin_kunci in lower(x.nama_obat)) > 0)
       )
       and x.tanggal > coalesce(greatest(t.statin_tgl_lab, ldl.tgl), t.tanggal_mulai)
  ), 0) as terpakai
  from kronis_terapi t
  join pasien p on p.id = t.pasien_id
  join ref_kronis_kuota_obat k on k.kunci = t.statin_kunci and k.aktif
  left join lateral (
    select max(lp.tanggal) as tgl
      from lab_permintaan lp
      join lab_hasil lh on lh.permintaan_id = lp.id
     where lp.pasien_id = p.id and lp.status = 'SELESAI' and lh.lab_id = k.lab_id
  ) as ldl on true
 where t.aktif and t.statin_kunci is not null;

grant select on v_kronis_statin to authenticated;

comment on view v_kronis_statin is
  'terpakai dihitung SEJAK tgl_dasar (LDL terbaru bila ada, kalau tidak
   tanggal migrasi). sisa/peringatan dihitung di JS: sisa = maks - terpakai.';


-- =====================================================================
--  F. PERINGATAN H-3 (pengambilan obat kronis terlalu cepat)
-- =====================================================================

-- Dipanggil apotek SEBELUM menyerahkan resep pasien yang terdaftar di
-- buku kronis. Bukan pengganti apotek_serahkan_resep() — resep TETAP
-- diserahkan meski hasilnya "terlalu cepat"; ini murni bahan tampilan
-- peringatan (keputusan 4 Sep: peringatan, bukan penolakan).
create or replace function public.kronis_h3_cek(p_pasien_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not exists (
           select 1 from kronis_terapi where pasien_id = p_pasien_id and aktif)
         then null
         else jsonb_build_object(
           'terakhir_ambil', public.kronis_terakhir_ambil(p_pasien_id),
           'jadwal_berikutnya', public.kronis_tambah_bulan(
             coalesce(public.kronis_terakhir_ambil(p_pasien_id),
               (select tanggal_mulai from kronis_terapi
                 where pasien_id = p_pasien_id and aktif limit 1)), 1),
           'hari_menuju_jadwal', (public.kronis_tambah_bulan(
             coalesce(public.kronis_terakhir_ambil(p_pasien_id),
               (select tanggal_mulai from kronis_terapi
                 where pasien_id = p_pasien_id and aktif limit 1)), 1)
             - public.tgl_klinik())::int
         )
         end
$$;

grant execute on function public.kronis_h3_cek(uuid) to authenticated;


-- =====================================================================
--  G. PENANDAAN KRONIS DI HALAMAN PERIKSA
-- =====================================================================

-- G1. Usulan diagnosis mana yang layak ditawarkan masuk buku kronis,
--     dari kode ICD-10 yang BARU SAJA ditulis dokter di kunjungan ini.
--     Hanya MENGUSULKAN — dokter tetap yang memutuskan lewat
--     kronis_daftar_simpan(). Yang sudah aktif terdaftar tidak diusulkan
--     ulang.
create or replace function public.kronis_usulan_diagnosa(
  p_pasien_id uuid, p_kode_icd10 text[]
) returns table (kode text, nama text)
language sql stable security definer set search_path = public as $$
  select d.kode, d.nama
    from ref_kronis_diagnosa d
   where d.aktif
     and exists (
       select 1 from unnest(coalesce(p_kode_icd10, '{}')) as icd(kode)
       where icd.kode like any (
         array(select awal || '%' from unnest(d.icd10_awal) as awal)))
     and not (d.kode = any (public.kronis_diagnosa_pasien(p_pasien_id)))
   order by d.urutan
$$;

grant execute on function public.kronis_usulan_diagnosa(uuid, text[]) to authenticated;


-- G2. Menyimpan / memperbarui buku kronis pasien dari halaman periksa.
--     Menempel-atau-membuat: kalau pasien sudah punya pendaftaran aktif,
--     diagnosa dan obatnya DIGANTI SET (bukan ditambah) — inilah cara
--     dokter menghapus diagnosa/obat yang sudah tidak relevan tanpa
--     menghapus seluruh pendaftaran dan kehilangan riwayatnya.
create or replace function public.kronis_daftar_simpan(
  p_pasien_id     uuid,
  p_diagnosa      text[],
  p_obat          jsonb default '[]'::jsonb,
  p_statin_kunci  text default null,
  p_statin_obat_id uuid default null,
  p_statin_nama   text default null,
  p_statin_tgl_lab date default null,
  p_catatan       text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_terapi  uuid;
  v_kode    text;
  r         record;
begin
  if not public.boleh_kronis_kelola() then
    raise exception 'Hanya admin, dokter, dan perawat yang boleh mengubah buku kronis.'
      using errcode = '42501';
  end if;
  if coalesce(array_length(p_diagnosa, 1), 0) = 0 then
    raise exception 'Pilih minimal satu diagnosis kronis.';
  end if;
  if not exists (select 1 from pasien where id = p_pasien_id) then
    raise exception 'Pasien tidak ditemukan.';
  end if;
  if p_statin_kunci is not null
     and not exists (select 1 from ref_kronis_kuota_obat where kunci = p_statin_kunci and aktif) then
    raise exception 'Obat berkuota "%" tidak dikenal.', p_statin_kunci;
  end if;

  select id into v_terapi from kronis_terapi where pasien_id = p_pasien_id and aktif;

  if v_terapi is null then
    insert into kronis_terapi (
      pasien_id, aktif, tanggal_mulai, catatan,
      statin_kunci, statin_obat_id, statin_nama, statin_tgl_lab, created_by)
    values (
      p_pasien_id, true, public.tgl_klinik(), p_catatan,
      p_statin_kunci, p_statin_obat_id, p_statin_nama, p_statin_tgl_lab, auth.uid())
    returning id into v_terapi;
  else
    update kronis_terapi set
      catatan = p_catatan,
      statin_kunci = p_statin_kunci, statin_obat_id = p_statin_obat_id,
      statin_nama = p_statin_nama, statin_tgl_lab = p_statin_tgl_lab,
      updated_by = auth.uid()
     where id = v_terapi;
  end if;

  delete from kronis_terapi_diagnosa where terapi_id = v_terapi;
  foreach v_kode in array p_diagnosa loop
    if not exists (select 1 from ref_kronis_diagnosa where kode = v_kode) then
      raise exception 'Kode diagnosis kronis "%" tidak dikenal.', v_kode;
    end if;
    insert into kronis_terapi_diagnosa (terapi_id, kode) values (v_terapi, v_kode)
    on conflict do nothing;
  end loop;

  delete from kronis_obat where terapi_id = v_terapi;
  for r in
    select elem, ord from jsonb_array_elements(coalesce(p_obat, '[]'::jsonb))
      with ordinality as x(elem, ord)
  loop
    continue when nullif(btrim(coalesce(r.elem->>'nama_obat', '')), '') is null;
    insert into kronis_obat (terapi_id, obat_id, nama_obat, signa, jumlah, satuan, urutan)
    values (
      v_terapi,
      nullif(r.elem->>'obat_id', '')::uuid,
      btrim(r.elem->>'nama_obat'),
      nullif(r.elem->>'signa', ''),
      nullif(r.elem->>'jumlah', '')::numeric,
      nullif(r.elem->>'satuan', ''),
      coalesce((r.elem->>'urutan')::int, r.ord::int - 1));
  end loop;

  return v_terapi;
end $$;

grant execute on function
  public.kronis_daftar_simpan(uuid, text[], jsonb, text, uuid, text, date, text)
  to authenticated;


-- G3. Menghentikan pendaftaran buku kronis (pasien sembuh, pindah
--     klinik, salah tandai, dsb). Riwayatnya TETAP ada — hanya
--     `aktif` yang berubah, persis pola kronis_terapi lainnya.
create or replace function public.kronis_terapi_selesai(p_terapi_id uuid, p_alasan text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.boleh_kronis_kelola() then
    raise exception 'Hanya admin, dokter, dan perawat yang boleh mengubah buku kronis.'
      using errcode = '42501';
  end if;
  update kronis_terapi
     set aktif = false, tanggal_selesai = public.tgl_klinik(),
         alasan_selesai = p_alasan, updated_by = auth.uid()
   where id = p_terapi_id and aktif;
  if not found then raise exception 'Pendaftaran kronis tidak ditemukan atau sudah tidak aktif.'; end if;
end $$;

grant execute on function public.kronis_terapi_selesai(uuid, text) to authenticated;


-- G4. Bacaan lengkap buku kronis SATU pasien untuk halaman periksa —
--     terapi, diagnosa, dan daftar obat dalam satu panggilan, supaya
--     halaman periksa tidak perlu tiga round-trip tiap kali dibuka.
create or replace view v_kronis_pasien with (security_invoker = true) as
select
  t.id as terapi_id, t.pasien_id, t.aktif, t.tanggal_mulai, t.catatan,
  t.statin_kunci, t.statin_obat_id, t.statin_nama, t.statin_tgl_lab,
  public.kronis_diagnosa_pasien(t.pasien_id) as diagnosa,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', ko.id, 'obat_id', ko.obat_id, 'nama_obat', ko.nama_obat,
             'signa', ko.signa, 'jumlah', ko.jumlah, 'satuan', ko.satuan)
           order by ko.urutan)
      from kronis_obat ko where ko.terapi_id = t.id
  ), '[]'::jsonb) as obat
  from kronis_terapi t
 where t.aktif;

grant select on v_kronis_pasien to authenticated;


-- =====================================================================
--  H. DAFTAR TELEPON H-1
-- =====================================================================

-- Pasien dengan jadwal kontrol BESOK (tgl_klinik() + 1). Terbuka untuk
-- SEMUA staf lewat RLS (sama seperti riwayat kunjungan biasa) — yang
-- membatasinya ke admin + pendaftaran adalah menu di js/app.js, bukan
-- baris ini. Kalau dibatasi di sini juga, dokter yang ingin tahu daftar
-- pasien kontrol besok dari halaman lain akan ikut tertutup tanpa perlu.
create or replace view v_kronis_telpon_h1 with (security_invoker = true) as
select
  k.id as kunjungan_id, p.id as pasien_id,
  p.no_rm, p.nama, p.no_hp,
  pm.tanggal_kontrol, pm.kontrol_instruksi,
  dok.nama as nama_dokter, pl.nama as nama_poli
  from pemeriksaan pm
  join kunjungan k on k.id = pm.kunjungan_id
  join pasien p on p.id = k.pasien_id
  join poli pl on pl.id = k.poli_id
  left join pegawai dok on dok.id = k.dokter_id
 where pm.tindak_lanjut = 'KONTROL'
   and pm.tanggal_kontrol = public.tgl_klinik() + 1
 order by p.nama;

grant select on v_kronis_telpon_h1 to authenticated;

comment on view v_kronis_telpon_h1 is
  'Dibatasi ke admin+pendaftaran di menu (js/app.js), bukan di RLS —
   lihat komentar di atas view ini.';

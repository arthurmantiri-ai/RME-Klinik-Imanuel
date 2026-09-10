-- =====================================================================
--  RME KLINIK IMANUEL - PEMERIKSAAN PENUNJANG
--  Laboratorium, bacaan rontgen gigi, EKG/USG, dan register arsip berkas.
--  Jalankan SETELAH 10_apotek_impor.sql
--
--  ---------------------------------------------------------------------
--  KEPUTUSAN PENTING: MODUL INI TIDAK MENYIMPAN SATU BYTE GAMBAR PUN.
--  ---------------------------------------------------------------------
--  Supabase paket gratis memberi 1 GB penyimpanan berkas dan 5 GB unduhan
--  per bulan. Satu foto rontgen dari kamera HP berukuran 3-5 MB; seratus
--  foto sebulan menghabiskan kuota setahun dalam dua tahun, dan saat penuh
--  unggahan gagal di tengah jam praktek.
--
--  Karena itu yang disimpan di sini adalah ISI MEDISNYA, bukan gambarnya:
--    - Hasil lab disimpan sebagai ANGKA per pemeriksaan, bukan foto lembar
--      hasil. Angka bisa ditandai Tinggi/Rendah otomatis, bisa ditren antar
--      kunjungan, dan kelak bisa dikirim ke SatuSehat sebagai Observation.
--      Foto lembar hasil tidak bisa satu pun dari ketiganya.
--    - Rontgen gigi disimpan sebagai BACAAN: temuan, kesan, dan saran,
--      terkait ke nomor gigi. Inilah yang dibaca dokter berikutnya; film
--      aslinya jarang dibuka ulang.
--    - Berkas fisik (film, lembar hasil lab luar, surat) dicatat di tabel
--      `lampiran` beserta NOMOR ARSIP yang dibuat otomatis. Nomor itu
--      ditulis di berkasnya, berkasnya disimpan berurutan di klinik. Nol
--      byte, tetap ketemu saat dicari.
--
--  Ukuran satu hasil lab lengkap kira-kira 2 KB di database. Kuota database
--  500 MB baru habis setelah sekitar 250.000 pemeriksaan.
--
--  Kalau suatu hari klinik pindah ke paket berbayar dan ingin menyimpan
--  gambarnya juga: kolom `berkas_*` di tabel `lampiran` sudah disiapkan dan
--  dibiarkan kosong. Yang perlu ditambah hanya unggahan di sisi aplikasi —
--  skema, RLS, dan laporan tidak berubah. Lihat catatan di bagian E.
-- =====================================================================


-- =====================================================================
--  A. HAK AKSES
-- =====================================================================

-- Siapa yang boleh MENGISI hasil lab.
-- Sengaja tidak dibuat peran baru "analis": di klinik pratama laboratorium
-- umumnya dikerjakan perawat atau analis yang terdaftar sebagai perawat.
-- Menambah nilai enum peran berarti satu berkas migrasi yang harus
-- dijalankan sendirian (lihat 07_peran_kasir.sql) — risiko pasang yang
-- tidak sebanding dengan manfaatnya sekarang.
-- 9 Sep 2026: lewat tabel hak_akses (bisa diatur master), bukan daftar
-- peran tetap lagi — lihat sql/02_rls.sql bagian HAK AKSES.
create or replace function public.boleh_lab() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('lab') $$;

-- Siapa yang boleh MEMBACA/menafsirkan penunjang (rontgen, EKG, USG).
-- Menafsirkan gambaran radiologis adalah tindakan medis, bukan tugas
-- administratif. Karena itu bawaannya hanya dokter.
create or replace function public.boleh_bacaan() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('bacaan') $$;

-- Register arsip berkas fisik: pendaftaran (sekarang 'admin'), perawat, dokter.
create or replace function public.boleh_lampiran() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('lampiran') $$;

grant execute on function public.boleh_lab()      to authenticated;
grant execute on function public.boleh_bacaan()   to authenticated;
grant execute on function public.boleh_lampiran() to authenticated;

insert into public.hak_akses (kode, peran, diizinkan) values
  ('lab',      'perawat', true),
  ('lab',      'dokter',  true),
  ('bacaan',   'dokter',  true),
  ('lampiran', 'admin',   true),
  ('lampiran', 'perawat', true),
  ('lampiran', 'dokter',  true)
on conflict (kode, peran) do nothing;


-- =====================================================================
--  B. MASTER PEMERIKSAAN LABORATORIUM
-- =====================================================================

create table if not exists ref_lab (
  id            uuid primary key default uuid_generate_v4(),
  kode          text not null unique,          -- kode internal, mis. 'HB'
  nama          text not null,
  kelompok      text not null default 'Lainnya',
  -- HEMATOLOGI | KIMIA KLINIK | URINALISIS | IMUNOSEROLOGI | MIKROBIOLOGI |
  -- FESES | LAINNYA — bebas, dipakai untuk mengelompokkan di layar & cetakan
  satuan        text,
  jenis_nilai   text not null default 'ANGKA'
                check (jenis_nilai in ('ANGKA','TEKS','PILIHAN')),
  -- Untuk jenis_nilai = 'PILIHAN': daftar jawaban yang boleh dipilih.
  pilihan       text[],
  -- Jawaban yang dianggap normal untuk TEKS/PILIHAN, mis. 'Negatif'.
  teks_normal   text,
  desimal       smallint not null default 1 check (desimal between 0 and 4),
  -- Kode LOINC untuk SatuSehat. Dibiarkan kosong sampai klinik terdaftar;
  -- selama kosong, Observation.code tidak dikirim dan sisa payload tetap
  -- valid — pola yang sama dengan ref_gigi.kode_snomed.
  kode_loinc    text,
  urutan        smallint not null default 0,
  aktif         boolean not null default true,
  keterangan    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ref_lab_kelompok on ref_lab (kelompok, urutan)
  where aktif;

-- Nilai rujukan. Satu pemeriksaan boleh punya beberapa baris: laki-laki,
-- perempuan, dan beberapa rentang umur. Yang paling khusus yang dipakai.
create table if not exists ref_lab_rujukan (
  id             uuid primary key default uuid_generate_v4(),
  lab_id         uuid not null references ref_lab(id) on delete cascade,
  -- NULL = berlaku untuk kedua jenis kelamin
  jenis_kelamin  jenis_kelamin_t,
  -- Rentang umur dalam BULAN. NULL = tanpa batas di sisi itu.
  -- Batas bawah inklusif, batas atas eksklusif: [umur_min, umur_max)
  umur_min_bulan integer,
  umur_max_bulan integer,
  batas_bawah    numeric(14,4),
  batas_atas     numeric(14,4),
  -- Nilai kritis: hasil yang harus segera diberitahukan ke dokter,
  -- bukan sekadar "di luar normal". Kosongkan bila tidak dipakai.
  kritis_bawah   numeric(14,4),
  kritis_atas    numeric(14,4),
  -- Teks yang dicetak di kolom "Nilai rujukan" pada lembar hasil.
  -- Bila kosong, dibentuk otomatis dari batas_bawah/batas_atas.
  teks           text,
  catatan        text
);

create index if not exists idx_ref_lab_rujukan_lab on ref_lab_rujukan (lab_id);

-- Paket pemeriksaan. Dokter jarang meminta "Hemoglobin" sendirian; yang
-- diminta "Darah Rutin". Paket menghemat lima klik menjadi satu.
create table if not exists ref_lab_paket (
  id       uuid primary key default uuid_generate_v4(),
  kode     text not null unique,
  nama     text not null,
  urutan   smallint not null default 0,
  aktif    boolean not null default true
);

create table if not exists ref_lab_paket_item (
  paket_id uuid not null references ref_lab_paket(id) on delete cascade,
  lab_id   uuid not null references ref_lab(id) on delete cascade,
  urutan   smallint not null default 0,
  primary key (paket_id, lab_id)
);


-- =====================================================================
--  C. PERMINTAAN & HASIL LABORATORIUM
-- =====================================================================

-- Satu permintaan = satu lembar hasil. Boleh berisi banyak pemeriksaan.
create table if not exists lab_permintaan (
  id             uuid primary key default uuid_generate_v4(),
  no_lab         text not null unique,             -- LAB-YYYY-NNNN
  pasien_id      uuid not null references pasien(id),
  -- Boleh kosong: hasil lab luar yang dibawa pasien dari sebelum ia
  -- terdaftar di sini tetap perlu tempat, tanpa harus mengarang kunjungan.
  kunjungan_id   uuid references kunjungan(id) on delete set null,
  tanggal        date not null default public.tgl_klinik(),
  -- INTERNAL = dikerjakan di klinik; EKSTERNAL = hasil dari lab luar yang
  -- angkanya diketik ulang di sini agar ikut tertren.
  asal           text not null default 'INTERNAL'
                 check (asal in ('INTERNAL','EKSTERNAL')),
  nama_lab_luar  text,                             -- diisi bila asal = EKSTERNAL
  no_lembar_luar text,                             -- nomor pada lembar hasil lab luar
  catatan_klinis text,                             -- keterangan dari dokter peminta
  status         text not null default 'DIMINTA'
                 check (status in ('DIMINTA','DIKERJAKAN','SELESAI','BATAL')),
  alasan_batal   text,
  diminta_oleh   uuid references pegawai(id),
  diminta_pada   timestamptz not null default now(),
  dikerjakan_oleh uuid references pegawai(id),
  selesai_oleh   uuid references pegawai(id),
  waktu_selesai  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_lab_permintaan_pasien on lab_permintaan (pasien_id, tanggal desc);
create index if not exists idx_lab_permintaan_kunjungan on lab_permintaan (kunjungan_id);
create index if not exists idx_lab_permintaan_antrean on lab_permintaan (tanggal, status)
  where status in ('DIMINTA','DIKERJAKAN');

create sequence if not exists seq_no_lab;

create or replace function public.gen_no_lab() returns trigger
language plpgsql as $$
begin
  if new.no_lab is null or new.no_lab = '' then
    new.no_lab := 'LAB-' || to_char(coalesce(new.tanggal, public.tgl_klinik()),'YYYY')
                  || '-' || lpad(nextval('seq_no_lab')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_gen_no_lab on lab_permintaan;
create trigger trg_gen_no_lab before insert on lab_permintaan
for each row execute function public.gen_no_lab();

drop trigger if exists trg_updated_lab_permintaan on lab_permintaan;
create trigger trg_updated_lab_permintaan before update on lab_permintaan
for each row execute function set_updated_at();


-- Satu baris = satu pemeriksaan pada satu lembar.
create table if not exists lab_hasil (
  id             uuid primary key default uuid_generate_v4(),
  permintaan_id  uuid not null references lab_permintaan(id) on delete cascade,
  lab_id         uuid not null references ref_lab(id),
  -- Potret nama & satuan saat diperiksa. Master boleh berubah nanti;
  -- lembar hasil tahun lalu tidak boleh ikut berubah karenanya — prinsip
  -- yang sama dengan tarif di modul kasir.
  nama           text not null,
  satuan         text,
  nilai_angka    numeric(14,4),
  nilai_teks     text,
  -- Nilai rujukan yang BERLAKU SAAT ITU, disalin dari master oleh trigger.
  rujukan_bawah  numeric(14,4),
  rujukan_atas   numeric(14,4),
  rujukan_kritis_bawah numeric(14,4),
  rujukan_kritis_atas  numeric(14,4),
  rujukan_teks   text,
  tanda          text not null default 'BELUM'
                 check (tanda in ('BELUM','NORMAL','RENDAH','TINGGI',
                                  'KRITIS_RENDAH','KRITIS_TINGGI','ABNORMAL')),
  catatan        text,
  urutan         smallint not null default 0,
  diisi_oleh     uuid references pegawai(id),
  diisi_pada     timestamptz,
  unique (permintaan_id, lab_id)
);

create index if not exists idx_lab_hasil_permintaan on lab_hasil (permintaan_id, urutan);
create index if not exists idx_lab_hasil_tren on lab_hasil (lab_id);


-- =====================================================================
--  D. BACAAN PENUNJANG — RONTGEN GIGI, EKG, USG
-- =====================================================================

-- Yang disimpan adalah hasil bacanya, bukan gambarnya. Bentuk isiannya
-- mengikuti kebiasaan penulisan radiologi: temuan (apa yang terlihat),
-- kesan (kesimpulan), saran (tindak lanjut).
create table if not exists penunjang (
  id            uuid primary key default uuid_generate_v4(),
  pasien_id     uuid not null references pasien(id),
  kunjungan_id  uuid references kunjungan(id) on delete set null,
  tanggal       date not null default public.tgl_klinik(),
  jenis         text not null
                check (jenis in ('RO_PERIAPIKAL','RO_BITEWING','RO_PANORAMIK',
                                 'RO_OKLUSAL','RO_SEFALOMETRI','RO_THORAX',
                                 'RO_LAIN','EKG','USG','LAINNYA')),
  -- Nama pemeriksaan versi bebas, mis. "Rontgen periapikal regio 36-37"
  judul         text,
  asal          text not null default 'INTERNAL'
                check (asal in ('INTERNAL','EKSTERNAL')),
  nama_tempat   text,                     -- diisi bila asal = EKSTERNAL
  no_film       text,                     -- nomor film / nomor ekspertise dari luar
  temuan        text,                     -- deskripsi gambaran radiologis
  kesan         text not null,            -- kesimpulan — bagian yang wajib
  saran         text,
  dibaca_oleh   uuid references pegawai(id),
  dibaca_pada   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_penunjang_pasien on penunjang (pasien_id, tanggal desc);
create index if not exists idx_penunjang_kunjungan on penunjang (kunjungan_id);

-- Kaitan bacaan ke nomor gigi. Satu foto periapikal biasanya memuat dua
-- sampai tiga gigi, jadi hubungannya banyak-ke-banyak.
-- Inilah yang membuat odontogram bisa menandai gigi yang pernah dirontgen,
-- dan membuka riwayat bacaannya saat gigi itu diklik.
create table if not exists penunjang_gigi (
  penunjang_id uuid not null references penunjang(id) on delete cascade,
  fdi          text not null references ref_gigi(fdi),
  primary key (penunjang_id, fdi)
);

create index if not exists idx_penunjang_gigi_fdi on penunjang_gigi (fdi);


-- =====================================================================
--  E. REGISTER ARSIP BERKAS
-- =====================================================================
--  Film rontgen, lembar hasil lab luar, surat rujukan, dan informed consent
--  tetap ada wujud fisiknya. PMK 24/2022 mewajibkan rekam medis disimpan
--  25 tahun; yang tidak diwajibkan adalah menyimpannya dalam bentuk digital.
--
--  Tabel ini memberi setiap berkas satu NOMOR ARSIP. Alurnya:
--    1. Petugas mencatat berkasnya di sini → sistem memberi ARS-2026-0001
--    2. Nomor itu ditulis di pojok berkasnya dengan spidol
--    3. Berkasnya disimpan berurutan menurut nomor
--  Mencari film gigi 36 dari dua tahun lalu berubah dari membongkar lemari
--  menjadi membaca satu nomor di layar.
--
--  Kolom berkas_* dibiarkan kosong dan tanpa arti selama klinik memakai
--  paket gratis. Bila kelak berlangganan dan ingin mengunggah gambarnya:
--  isi berkas_path dengan lokasi di Supabase Storage, dan `bentuk` akan
--  ikut berubah menjadi DIGITAL dengan sendirinya. Tidak ada satu pun
--  tabel, kebijakan RLS, atau laporan yang perlu diubah.
create table if not exists lampiran (
  id             uuid primary key default uuid_generate_v4(),
  no_arsip       text not null unique,          -- ARS-YYYY-NNNN
  pasien_id      uuid not null references pasien(id),
  kunjungan_id   uuid references kunjungan(id) on delete set null,
  -- Penunjuk balik ke bacaan/lab yang berkasnya ini, bila ada.
  penunjang_id   uuid references penunjang(id) on delete set null,
  lab_permintaan_id uuid references lab_permintaan(id) on delete set null,
  jenis          text not null default 'LAINNYA'
                 check (jenis in ('FILM_RONTGEN','HASIL_LAB_LUAR','SURAT_RUJUKAN',
                                  'HASIL_EKG','HASIL_USG','INFORMED_CONSENT',
                                  'RESUME_LUAR','IDENTITAS','LAINNYA')),
  judul          text not null,
  tanggal_dokumen date,
  asal           text,                          -- nama lab / RS / klinik penerbit
  no_dokumen     text,                          -- nomor pada dokumen aslinya
  lokasi_simpan  text,                          -- mis. "Lemari B, laci 2"
  catatan        text,
  -- ---- Disiapkan untuk berkas digital, tidak dipakai pada paket gratis ----
  berkas_path    text,
  berkas_mime    text,
  berkas_ukuran  bigint,
  berkas_sha256  text,
  -- ------------------------------------------------------------------------
  bentuk         text generated always as
                   (case when berkas_path is null then 'FISIK' else 'DIGITAL' end) stored,
  dibuat_oleh    uuid references pegawai(id),
  dibuat_pada    timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_lampiran_pasien on lampiran (pasien_id, tanggal_dokumen desc);
create index if not exists idx_lampiran_kunjungan on lampiran (kunjungan_id);

create sequence if not exists seq_no_arsip;

create or replace function public.gen_no_arsip() returns trigger
language plpgsql as $$
begin
  if new.no_arsip is null or new.no_arsip = '' then
    new.no_arsip := 'ARS-' || to_char(coalesce(new.tanggal_dokumen, public.tgl_klinik()),'YYYY')
                    || '-' || lpad(nextval('seq_no_arsip')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_gen_no_arsip on lampiran;
create trigger trg_gen_no_arsip before insert on lampiran
for each row execute function public.gen_no_arsip();

drop trigger if exists trg_updated_lampiran on lampiran;
create trigger trg_updated_lampiran before update on lampiran
for each row execute function set_updated_at();

drop trigger if exists trg_updated_penunjang on penunjang;
create trigger trg_updated_penunjang before update on penunjang
for each row execute function set_updated_at();


-- =====================================================================
--  F. FUNGSI
-- =====================================================================

-- F1. Nilai rujukan yang paling cocok untuk seorang pasien.
--     Urutan kekhususan: baris berjenis kelamin tepat menang atas baris
--     tanpa jenis kelamin; di antara yang sama, rentang umur tersempit
--     yang menang. Tanpa aturan ini, "Hb 12,5 pada laki-laki dewasa" bisa
--     terbaca normal hanya karena baris umum kebetulan ditemukan lebih dulu.
create or replace function public.lab_rujukan_untuk(
  p_lab_id       uuid,
  p_jenis_kelamin jenis_kelamin_t,
  p_umur_bulan   integer
) returns ref_lab_rujukan
language sql stable security definer set search_path = public
as $$
  select r.* from ref_lab_rujukan r
   where r.lab_id = p_lab_id
     and (r.jenis_kelamin is null or r.jenis_kelamin = p_jenis_kelamin)
     and (r.umur_min_bulan is null or p_umur_bulan is null or p_umur_bulan >= r.umur_min_bulan)
     and (r.umur_max_bulan is null or p_umur_bulan is null or p_umur_bulan <  r.umur_max_bulan)
   order by (r.jenis_kelamin is not null) desc,
            coalesce(r.umur_max_bulan, 2147483647) - coalesce(r.umur_min_bulan, 0) asc
   limit 1
$$;

grant execute on function public.lab_rujukan_untuk(uuid, jenis_kelamin_t, integer) to authenticated;


-- F2. Menentukan tanda dari sebuah nilai.
create or replace function public.lab_tanda(
  p_nilai        numeric,
  p_bawah        numeric,
  p_atas         numeric,
  p_kritis_bawah numeric,
  p_kritis_atas  numeric
) returns text
language sql immutable
as $$
  select case
    when p_nilai is null then 'BELUM'
    when p_kritis_bawah is not null and p_nilai <= p_kritis_bawah then 'KRITIS_RENDAH'
    when p_kritis_atas  is not null and p_nilai >= p_kritis_atas  then 'KRITIS_TINGGI'
    when p_bawah is not null and p_nilai < p_bawah then 'RENDAH'
    when p_atas  is not null and p_nilai > p_atas  then 'TINGGI'
    when p_bawah is null and p_atas is null then 'BELUM'
    else 'NORMAL'
  end
$$;

grant execute on function public.lab_tanda(numeric, numeric, numeric, numeric, numeric) to authenticated;


-- F3. Menyalin nilai rujukan dan menghitung tanda, otomatis, di database.
--     Ditaruh di trigger dan bukan di JavaScript dengan sengaja: hasil lab
--     yang masuk lewat impor, lewat halaman lain, atau lewat dasbor Supabase
--     harus ditandai dengan aturan yang sama persis. Aturan yang hanya ada
--     di satu halaman akan berbeda begitu ada halaman kedua.
create or replace function public.lab_hitung_tanda() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_lab    ref_lab%rowtype;
  v_lp     lab_permintaan%rowtype;
  v_pasien pasien%rowtype;
  v_ruj    ref_lab_rujukan%rowtype;
  v_umur   integer;
begin
  select * into v_lab from ref_lab where id = new.lab_id;
  if not found then raise exception 'Pemeriksaan lab tidak dikenal.'; end if;

  select * into v_lp from lab_permintaan where id = new.permintaan_id;
  select * into v_pasien from pasien where id = v_lp.pasien_id;

  -- Nilai rujukan disalin SEKALI saja, saat barisnya dibuat. Setelah itu
  -- ia milik lembar ini selamanya.
  --
  -- Kalau salinan ini diperbarui juga pada UPDATE, koreksi satu angka
  -- pada lembar bulan lalu akan diam-diam menarik rentang alat yang
  -- BARU ke lembar lama — dan janji "memperbaiki master tidak mengubah
  -- hasil yang sudah keluar" jadi bohong tanpa ada yang menyadarinya.
  if tg_op = 'INSERT' then
    new.nama   := coalesce(nullif(new.nama, ''), v_lab.nama);
    new.satuan := coalesce(new.satuan, v_lab.satuan);

    -- Umur dihitung pada TANGGAL PEMERIKSAAN, bukan hari ini. Bedanya
    -- menentukan: hasil lab luar bertanggal saat pasien masih bayi harus
    -- dinilai dengan rujukan bayi, bukan rujukan umurnya sekarang.
    v_umur := case when v_pasien.tanggal_lahir is null then null
                   else (extract(year  from age(v_lp.tanggal, v_pasien.tanggal_lahir)) * 12
                       + extract(month from age(v_lp.tanggal, v_pasien.tanggal_lahir)))::int end;

    v_ruj := public.lab_rujukan_untuk(new.lab_id, v_pasien.jenis_kelamin, v_umur);

    new.rujukan_bawah        := v_ruj.batas_bawah;
    new.rujukan_atas         := v_ruj.batas_atas;
    new.rujukan_kritis_bawah := v_ruj.kritis_bawah;
    new.rujukan_kritis_atas  := v_ruj.kritis_atas;
    new.rujukan_teks := coalesce(
        v_ruj.teks,
        case
          when v_ruj.batas_bawah is not null and v_ruj.batas_atas is not null
            then trim(to_char(v_ruj.batas_bawah,'FM999999990.0999')) || ' - ' ||
                 trim(to_char(v_ruj.batas_atas ,'FM999999990.0999'))
          when v_ruj.batas_atas  is not null
            then '< ' || trim(to_char(v_ruj.batas_atas ,'FM999999990.0999'))
          when v_ruj.batas_bawah is not null
            then '> ' || trim(to_char(v_ruj.batas_bawah,'FM999999990.0999'))
          else v_lab.teks_normal
        end);
  else
    -- Salinan tidak boleh diganti lewat UPDATE biasa.
    new.rujukan_bawah        := old.rujukan_bawah;
    new.rujukan_atas         := old.rujukan_atas;
    new.rujukan_kritis_bawah := old.rujukan_kritis_bawah;
    new.rujukan_kritis_atas  := old.rujukan_kritis_atas;
    new.rujukan_teks         := old.rujukan_teks;
    new.nama                 := old.nama;
  end if;

  -- Tanda selalu dihitung dari SALINAN di baris ini, bukan dari master.
  if v_lab.jenis_nilai = 'ANGKA' then
    new.tanda := public.lab_tanda(new.nilai_angka, new.rujukan_bawah, new.rujukan_atas,
                                  new.rujukan_kritis_bawah, new.rujukan_kritis_atas);
  else
    new.tanda := case
      when new.nilai_teks is null or new.nilai_teks = '' then 'BELUM'
      when v_lab.teks_normal is null then 'NORMAL'
      when lower(trim(new.nilai_teks)) = lower(trim(v_lab.teks_normal)) then 'NORMAL'
      else 'ABNORMAL' end;
  end if;

  if (new.nilai_angka is not null or nullif(new.nilai_teks,'') is not null) then
    if new.diisi_pada is null then
      new.diisi_pada := now();
      new.diisi_oleh := coalesce(new.diisi_oleh, auth.uid());
    end if;
    -- Lembar yang mulai diisi otomatis naik dari Diminta ke Dikerjakan.
    -- Ditaruh di sini, bukan di JavaScript: statusnya harus benar walau
    -- hasilnya masuk lewat jalan lain.
    update lab_permintaan
       set status = 'DIKERJAKAN',
           dikerjakan_oleh = coalesce(dikerjakan_oleh, auth.uid())
     where id = new.permintaan_id and status = 'DIMINTA';
  end if;

  return new;
end $$;

drop trigger if exists trg_lab_hitung_tanda on lab_hasil;
create trigger trg_lab_hitung_tanda before insert or update on lab_hasil
for each row execute function public.lab_hitung_tanda();


-- F4. Mengunci lembar hasil yang sudah selesai.
--     Hasil lab yang sudah keluar dan dibaca dokter adalah dokumen medis.
--     Mengoreksinya diam-diam sama saja menghapus jejak; yang benar adalah
--     admin membuka kuncinya, dan perubahannya tercatat di audit_log.
create or replace function public.lab_cegah_ubah_selesai() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from lab_permintaan
   where id = coalesce(new.permintaan_id, old.permintaan_id);
  if v_status = 'SELESAI' and public.peran_teks_saya() <> 'master' then
    raise exception 'Lembar hasil ini sudah selesai dan terkunci. Minta master membuka kuncinya bila ada koreksi.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_lab_cegah_ubah_selesai on lab_hasil;
create trigger trg_lab_cegah_ubah_selesai before update or delete on lab_hasil
for each row execute function public.lab_cegah_ubah_selesai();


-- F5. Membuat lembar pemeriksaan. Satu panggilan, satu transaksi.
--
--     Dua hal berbeda yang kebetulan berbagi satu tabel:
--       INTERNAL  = dokter MEMINTA pemeriksaan dikerjakan. Itu keputusan
--                   klinis, jadi hanya dokter.
--       EKSTERNAL = petugas MENCATAT hasil jadi dari lab luar. Itu entri
--                   data, jadi petugas lab pun boleh.
--     Kalau keduanya disamakan sebagai kewenangan dokter, perawat tidak
--     bisa memasukkan lembar hasil yang dibawa pasien dari lab luar — dan
--     angkanya akan berakhir sebagai selembar kertas yang tidak tertren.
--
--     Kunjungan boleh kosong: hasil lab luar bertanggal sebelum pasien
--     terdaftar di sini tetap perlu tempat. Bila kunjungan kosong, pasien
--     wajib disebut.
drop function if exists public.lab_minta(uuid, uuid[], text, text, text);

create or replace function public.lab_minta(
  p_kunjungan_id   uuid,
  p_lab_ids        uuid[],
  p_catatan        text default null,
  p_asal           text default 'INTERNAL',
  p_nama_lab_luar  text default null,
  p_pasien_id      uuid default null,
  p_tanggal        date default null,
  p_no_lembar_luar text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_k       kunjungan%rowtype;
  v_pasien  uuid;
  v_tanggal date;
  v_id      uuid;
  v_urut    smallint := 0;
  r         record;
begin
  if coalesce(p_asal,'INTERNAL') = 'EKSTERNAL' then
    if not (public.boleh_lab() or public.boleh_bacaan()) then
      raise exception 'Anda tidak berhak mencatat hasil laboratorium.' using errcode = '42501';
    end if;
  elsif not public.boleh_bacaan() then
    raise exception 'Hanya dokter dan admin yang boleh meminta pemeriksaan penunjang.'
      using errcode = '42501';
  end if;

  if p_lab_ids is null or array_length(p_lab_ids, 1) is null then
    raise exception 'Tidak ada pemeriksaan yang dipilih.';
  end if;

  if p_kunjungan_id is not null then
    select * into v_k from kunjungan where id = p_kunjungan_id;
    if not found then raise exception 'Kunjungan tidak ditemukan.'; end if;
    v_pasien  := v_k.pasien_id;
    v_tanggal := coalesce(p_tanggal, v_k.tanggal);
  else
    if p_pasien_id is null then
      raise exception 'Hasil lab tanpa kunjungan tetap harus menyebut pasiennya.';
    end if;
    if not exists (select 1 from pasien where id = p_pasien_id) then
      raise exception 'Pasien tidak ditemukan.';
    end if;
    v_pasien  := p_pasien_id;
    v_tanggal := coalesce(p_tanggal, public.tgl_klinik());
  end if;

  insert into lab_permintaan (pasien_id, kunjungan_id, tanggal, asal, nama_lab_luar,
                              no_lembar_luar, catatan_klinis, diminta_oleh)
  values (v_pasien, p_kunjungan_id, v_tanggal, coalesce(p_asal,'INTERNAL'), p_nama_lab_luar,
          p_no_lembar_luar, p_catatan, auth.uid())
  returning id into v_id;

  -- Urutan mengikuti master supaya lembar hasil selalu tersusun sama:
  -- hematologi dulu, kimia klinik, lalu urinalisis. Petugas membaca lembar
  -- yang bentuknya tetap jauh lebih cepat daripada yang urutannya berubah.
  for r in select l.id, l.nama, l.satuan from ref_lab l
            where l.id = any(p_lab_ids) and l.aktif
            order by l.kelompok, l.urutan, l.nama
  loop
    v_urut := v_urut + 1;
    insert into lab_hasil (permintaan_id, lab_id, nama, satuan, urutan)
    values (v_id, r.id, r.nama, r.satuan, v_urut);
  end loop;

  return v_id;
end $$;


-- F6. Menutup lembar hasil.
create or replace function public.lab_selesaikan(p_permintaan_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_kosong integer;
begin
  if not public.boleh_lab() then
    raise exception 'Anda tidak berhak menutup lembar hasil laboratorium.'
      using errcode = '42501';
  end if;

  select count(*) into v_kosong from lab_hasil
   where permintaan_id = p_permintaan_id
     and nilai_angka is null and nullif(nilai_teks,'') is null;
  if v_kosong > 0 then
    raise exception 'Masih ada % pemeriksaan yang belum diisi hasilnya.', v_kosong;
  end if;

  update lab_permintaan
     set status = 'SELESAI', selesai_oleh = auth.uid(), waktu_selesai = now()
   where id = p_permintaan_id and status <> 'BATAL';
end $$;


-- F7. Membuka kunci untuk koreksi. Admin saja, dan alasannya wajib —
--     itulah yang membedakan koreksi dari penghapusan jejak.
create or replace function public.lab_buka_kunci(p_permintaan_id uuid, p_alasan text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.peran_teks_saya() <> 'master' then
    raise exception 'Hanya master yang boleh membuka kunci lembar hasil.'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan membuka kunci wajib diisi.';
  end if;
  update lab_permintaan
     set status = 'DIKERJAKAN',
         catatan_klinis = coalesce(catatan_klinis || E'\n', '')
                          || '[Dibuka kembali ' || to_char(now(),'DD-MM-YYYY HH24:MI')
                          || '] ' || p_alasan
   where id = p_permintaan_id;
end $$;


-- F8. Membatalkan permintaan yang salah.
create or replace function public.lab_batalkan(p_permintaan_id uuid, p_alasan text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not (public.boleh_lab() or public.boleh_bacaan()) then
    raise exception 'Anda tidak berhak membatalkan permintaan laboratorium.'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi.';
  end if;

  select status into v_status from lab_permintaan where id = p_permintaan_id;
  if v_status = 'SELESAI' and public.peran_teks_saya() <> 'master' then
    raise exception 'Lembar hasil yang sudah selesai hanya bisa dibatalkan master.'
      using errcode = '42501';
  end if;

  update lab_permintaan set status = 'BATAL', alasan_batal = p_alasan
   where id = p_permintaan_id;
end $$;


-- F9. Menyimpan bacaan penunjang beserta gigi yang terkait, satu transaksi.
create or replace function public.penunjang_simpan(
  p_id           uuid,
  p_pasien_id    uuid,
  p_kunjungan_id uuid,
  p_tanggal      date,
  p_jenis        text,
  p_judul        text,
  p_asal         text,
  p_nama_tempat  text,
  p_no_film      text,
  p_temuan       text,
  p_kesan        text,
  p_saran        text,
  p_gigi         text[]
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.boleh_bacaan() then
    raise exception 'Hanya dokter dan admin yang boleh menulis bacaan pemeriksaan penunjang.'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_kesan), '') = '' then
    raise exception 'Kesan wajib diisi. Bacaan tanpa kesimpulan tidak berguna bagi dokter berikutnya.';
  end if;

  if p_id is null then
    insert into penunjang (pasien_id, kunjungan_id, tanggal, jenis, judul, asal,
                           nama_tempat, no_film, temuan, kesan, saran, dibaca_oleh)
    values (p_pasien_id, p_kunjungan_id, coalesce(p_tanggal, public.tgl_klinik()),
            p_jenis, p_judul, coalesce(p_asal,'INTERNAL'), p_nama_tempat, p_no_film,
            p_temuan, p_kesan, p_saran, auth.uid())
    returning id into v_id;
  else
    update penunjang
       set tanggal = coalesce(p_tanggal, tanggal), jenis = p_jenis, judul = p_judul,
           asal = coalesce(p_asal,'INTERNAL'), nama_tempat = p_nama_tempat,
           no_film = p_no_film, temuan = p_temuan, kesan = p_kesan, saran = p_saran
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Bacaan tidak ditemukan.'; end if;
    delete from penunjang_gigi where penunjang_id = v_id;
  end if;

  if p_gigi is not null then
    insert into penunjang_gigi (penunjang_id, fdi)
    select v_id, g from unnest(p_gigi) g
     where exists (select 1 from ref_gigi where fdi = g)
    on conflict do nothing;
  end if;

  return v_id;
end $$;


grant execute on function public.lab_minta(uuid, uuid[], text, text, text,
                                           uuid, date, text)              to authenticated;
grant execute on function public.lab_selesaikan(uuid)                      to authenticated;
grant execute on function public.lab_buka_kunci(uuid, text)                to authenticated;
grant execute on function public.lab_batalkan(uuid, text)                  to authenticated;
grant execute on function public.penunjang_simpan(uuid, uuid, uuid, date, text, text,
                                                  text, text, text, text, text, text, text[])
                                                                           to authenticated;


-- =====================================================================
--  G. VIEW
-- =====================================================================

create or replace view v_lab_antrean with (security_invoker = true) as
select lp.id, lp.no_lab, lp.tanggal, lp.status, lp.asal, lp.nama_lab_luar,
       lp.catatan_klinis, lp.diminta_pada, lp.kunjungan_id,
       p.id as pasien_id, p.no_rm, p.nama as nama_pasien, p.jenis_kelamin,
       p.tanggal_lahir,
       date_part('year', age(p.tanggal_lahir))::int as umur,
       k.no_kunjungan, k.cara_bayar,
       po.nama as nama_poli,
       d.nama as nama_dokter,
       (select count(*) from lab_hasil h where h.permintaan_id = lp.id) as jml_pemeriksaan,
       (select count(*) from lab_hasil h where h.permintaan_id = lp.id
         and (h.nilai_angka is not null or nullif(h.nilai_teks,'') is not null)) as jml_terisi,
       (select count(*) from lab_hasil h where h.permintaan_id = lp.id
         and h.tanda in ('KRITIS_RENDAH','KRITIS_TINGGI')) as jml_kritis,
       (select count(*) from lab_hasil h where h.permintaan_id = lp.id
         and h.tanda in ('RENDAH','TINGGI','ABNORMAL','KRITIS_RENDAH','KRITIS_TINGGI')) as jml_tak_normal
  from lab_permintaan lp
  join pasien p on p.id = lp.pasien_id
  left join kunjungan k on k.id = lp.kunjungan_id
  left join poli po on po.id = k.poli_id
  left join pegawai d on d.id = lp.diminta_oleh;

create or replace view v_penunjang_lengkap with (security_invoker = true) as
select pn.*, p.no_rm, p.nama as nama_pasien, k.no_kunjungan,
       dk.nama as nama_pembaca,
       (select string_agg(pg.fdi, ', ' order by pg.fdi)
          from penunjang_gigi pg where pg.penunjang_id = pn.id) as daftar_gigi
  from penunjang pn
  join pasien p on p.id = pn.pasien_id
  left join kunjungan k on k.id = pn.kunjungan_id
  left join pegawai dk on dk.id = pn.dibaca_oleh;

-- Riwayat satu jenis pemeriksaan pada satu pasien, untuk melihat tren.
create or replace view v_lab_tren with (security_invoker = true) as
select lp.pasien_id, h.lab_id, rl.kode, h.nama, h.satuan,
       lp.tanggal, lp.id as permintaan_id, lp.no_lab,
       h.nilai_angka, h.nilai_teks, h.tanda,
       h.rujukan_bawah, h.rujukan_atas, h.rujukan_teks
  from lab_hasil h
  join lab_permintaan lp on lp.id = h.permintaan_id
  join ref_lab rl on rl.id = h.lab_id
 where lp.status = 'SELESAI'
   and (h.nilai_angka is not null or nullif(h.nilai_teks,'') is not null);

-- View pun tidak mewarisi GRANT dari 02_rls.sql, sama seperti tabel baru —
-- dan gejalanya lebih membingungkan lagi: "permission denied for view
-- v_lab_antrean" muncul di halaman yang tabel-tabelnya jelas boleh dibaca.
-- Karena view ini security_invoker, RLS tabel di baliknya tetap berlaku;
-- GRANT di sini hanya membuka pintunya, bukan membuka datanya.
grant select on v_lab_antrean, v_penunjang_lengkap, v_lab_tren to authenticated;


-- =====================================================================
--  H. HAK AKSES TABEL & ROW LEVEL SECURITY
-- =====================================================================
--  GRANT ditulis untuk tiap tabel baru dan tidak diwariskan dari 02_rls.sql:
--  `grant ... on all tables` di sana hanya mengenai tabel yang sudah ada
--  saat berkas itu dijalankan. Gejala bila ini terlewat adalah
--  "permission denied for table lab_hasil" yang tidak menyebut RLS sama
--  sekali — bikin salah cari selama setengah jam.
grant select, insert, update, delete on
  ref_lab, ref_lab_rujukan, ref_lab_paket, ref_lab_paket_item,
  lab_permintaan, lab_hasil, penunjang, penunjang_gigi, lampiran
  to authenticated;
grant usage, select on seq_no_lab, seq_no_arsip to authenticated;

alter table ref_lab            enable row level security;
alter table ref_lab_rujukan    enable row level security;
alter table ref_lab_paket      enable row level security;
alter table ref_lab_paket_item enable row level security;
alter table lab_permintaan     enable row level security;
alter table lab_hasil          enable row level security;
alter table penunjang          enable row level security;
alter table penunjang_gigi     enable row level security;
alter table lampiran           enable row level security;

do $$
declare t text;
begin
  -- Master data: semua staf boleh baca, kode `master_data` boleh ubah.
  foreach t in array array['ref_lab','ref_lab_rujukan','ref_lab_paket','ref_lab_paket_item']
  loop
    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);
    execute format('drop policy if exists %1$s_tulis on %1$s', t);
    execute format($f$create policy %1$s_tulis on %1$s for all to authenticated
                     using (public.boleh_master_data())
                     with check (public.boleh_master_data())$f$, t);
  end loop;
end $$;

-- Permintaan lab: dibaca semua staf.
drop policy if exists lab_permintaan_baca on lab_permintaan;
create policy lab_permintaan_baca on lab_permintaan for select
  to authenticated using (public.saya_staf());

-- Menulis lembar lewat tangan tidak diizinkan sama sekali, bahkan untuk
-- dokter. Satu-satunya jalan masuk adalah fungsi di §F, yang menjaga
-- aturannya — pola yang sama dengan apotek_transaksi di 08_apotek.sql.
--
-- Kalau kolom `status` boleh ditulis langsung, seluruh penguncian lembar
-- bisa dilewati dengan tiga permintaan biasa: putar SELESAI menjadi
-- DIKERJAKAN, betulkan angkanya, putar kembali ke SELESAI. Aturan "hanya
-- master, dan alasannya wajib" jadi hiasan, dan koreksinya tidak
-- meninggalkan jejak alasan sama sekali.
drop policy if exists lab_permintaan_tulis on lab_permintaan;
create policy lab_permintaan_tulis on lab_permintaan for all
  to authenticated
  using (public.peran_teks_saya() = 'master')
  with check (public.peran_teks_saya() = 'master');

-- Hasil lab: dibaca semua staf; ditulis hanya oleh yang berhak mengisi lab.
-- Kasir dan pendaftaran ditolak menulis di sini — mereka hanya perlu
-- melihat bahwa pemeriksaannya dikerjakan, untuk menagihkannya.
drop policy if exists lab_hasil_baca on lab_hasil;
create policy lab_hasil_baca on lab_hasil for select
  to authenticated using (public.saya_staf());

drop policy if exists lab_hasil_tulis on lab_hasil;
create policy lab_hasil_tulis on lab_hasil for all
  to authenticated
  using (public.boleh_lab())
  with check (public.boleh_lab());

-- Bacaan penunjang: dibaca semua staf, ditulis hanya dokter.
drop policy if exists penunjang_baca on penunjang;
create policy penunjang_baca on penunjang for select
  to authenticated using (public.saya_staf());

drop policy if exists penunjang_tulis on penunjang;
create policy penunjang_tulis on penunjang for all
  to authenticated
  using (public.boleh_bacaan())
  with check (public.boleh_bacaan());

drop policy if exists penunjang_gigi_baca on penunjang_gigi;
create policy penunjang_gigi_baca on penunjang_gigi for select
  to authenticated using (public.saya_staf());

drop policy if exists penunjang_gigi_tulis on penunjang_gigi;
create policy penunjang_gigi_tulis on penunjang_gigi for all
  to authenticated
  using (public.boleh_bacaan())
  with check (public.boleh_bacaan());

-- Register arsip: dibaca semua staf. Ditulis oleh admin (loket), perawat,
-- dokter — merekalah yang memegang berkas fisiknya saat masuk. Kode
-- `lampiran`, lihat isian awal di atas.
drop policy if exists lampiran_baca on lampiran;
create policy lampiran_baca on lampiran for select
  to authenticated using (public.saya_staf());

drop policy if exists lampiran_tulis on lampiran;
create policy lampiran_tulis on lampiran for all
  to authenticated
  using (public.boleh_lampiran())
  with check (public.boleh_lampiran());


-- =====================================================================
--  I. AUDIT
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['lab_permintaan','lab_hasil','penunjang','lampiran']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format($f$create trigger trg_audit_%1$s
                       after insert or update or delete on %1$s
                       for each row execute function public.catat_audit()$f$, t);
  end loop;
end $$;


-- =====================================================================
--  J. ISIAN AWAL MASTER PEMERIKSAAN
-- =====================================================================
--  PERINGATAN YANG PERLU DIBACA SEBELUM DIPAKAI:
--  Nilai rujukan di bawah ini adalah nilai umum yang lazim dipakai di
--  Indonesia, BUKAN nilai rujukan alat yang dipakai klinik ini. Setiap alat
--  dan setiap reagen punya rentangnya sendiri, dan yang sah adalah yang
--  tercetak pada sisipan reagen alat Anda.
--
--  Buka Master Data → Lab, cocokkan dengan buku alat, lalu perbaiki yang
--  berbeda SEBELUM lab dipakai melayani pasien. Nilai yang dipakai untuk
--  menandai sebuah hasil disalin ke barisnya saat hasil diisi, jadi
--  memperbaiki master hari ini tidak akan mengubah hasil kemarin.

insert into ref_lab (kode, nama, kelompok, satuan, jenis_nilai, teks_normal, desimal, urutan)
values
  -- Hematologi
  ('HB',    'Hemoglobin',            'Hematologi', 'g/dL',    'ANGKA', null, 1, 10),
  ('LEU',   'Leukosit',              'Hematologi', '/µL',     'ANGKA', null, 0, 20),
  ('ERI',   'Eritrosit',             'Hematologi', 'juta/µL', 'ANGKA', null, 2, 30),
  ('HCT',   'Hematokrit',            'Hematologi', '%',       'ANGKA', null, 1, 40),
  ('TRO',   'Trombosit',             'Hematologi', '/µL',     'ANGKA', null, 0, 50),
  ('LED',   'Laju Endap Darah',      'Hematologi', 'mm/jam',  'ANGKA', null, 0, 60),
  ('GOLDA', 'Golongan Darah',        'Hematologi', null,      'PILIHAN', null, 0, 70),
  ('RH',    'Rhesus',                'Hematologi', null,      'PILIHAN', 'Positif', 0, 80),
  -- Kimia klinik
  ('GDS',   'Glukosa Darah Sewaktu', 'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 110),
  ('GDP',   'Glukosa Darah Puasa',   'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 120),
  ('GD2PP', 'Glukosa 2 Jam PP',      'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 130),
  ('CHOL',  'Kolesterol Total',      'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 140),
  ('HDL',   'Kolesterol HDL',        'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 150),
  ('LDL',   'Kolesterol LDL',        'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 160),
  ('TG',    'Trigliserida',          'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 170),
  ('UA',    'Asam Urat',             'Kimia Klinik', 'mg/dL', 'ANGKA', null, 1, 180),
  ('UR',    'Ureum',                 'Kimia Klinik', 'mg/dL', 'ANGKA', null, 0, 190),
  ('CR',    'Kreatinin',             'Kimia Klinik', 'mg/dL', 'ANGKA', null, 2, 200),
  ('SGOT',  'SGOT (AST)',            'Kimia Klinik', 'U/L',   'ANGKA', null, 0, 210),
  ('SGPT',  'SGPT (ALT)',            'Kimia Klinik', 'U/L',   'ANGKA', null, 0, 220),
  -- Urinalisis
  ('UWAR',  'Urine - Warna',         'Urinalisis', null, 'TEKS',    null,      0, 310),
  ('UPH',   'Urine - pH',            'Urinalisis', null, 'ANGKA',   null,      1, 320),
  ('UBJ',   'Urine - Berat Jenis',   'Urinalisis', null, 'ANGKA',   null,      3, 330),
  ('UPRO',  'Urine - Protein',       'Urinalisis', null, 'PILIHAN', 'Negatif', 0, 340),
  ('UGLU',  'Urine - Reduksi',       'Urinalisis', null, 'PILIHAN', 'Negatif', 0, 350),
  ('UKET',  'Urine - Keton',         'Urinalisis', null, 'PILIHAN', 'Negatif', 0, 360),
  ('UBLD',  'Urine - Darah Samar',   'Urinalisis', null, 'PILIHAN', 'Negatif', 0, 370),
  ('USEL',  'Urine - Sedimen Leukosit','Urinalisis','/LPB','ANGKA',  null,      0, 380),
  ('USER',  'Urine - Sedimen Eritrosit','Urinalisis','/LPB','ANGKA', null,      0, 390),
  -- Imunoserologi
  ('HCG',   'Tes Kehamilan (HCG)',   'Imunoserologi', null, 'PILIHAN', 'Negatif', 0, 410),
  ('HBSAG', 'HBsAg',                 'Imunoserologi', null, 'PILIHAN', 'Non Reaktif', 0, 420),
  ('HIV',   'Anti-HIV',              'Imunoserologi', null, 'PILIHAN', 'Non Reaktif', 0, 430),
  ('SIF',   'Sifilis (TPHA/VDRL)',   'Imunoserologi', null, 'PILIHAN', 'Non Reaktif', 0, 440),
  ('WIDAL', 'Widal',                 'Imunoserologi', null, 'TEKS',    null,      0, 450),
  ('NS1',   'Dengue NS1',            'Imunoserologi', null, 'PILIHAN', 'Negatif', 0, 460),
  ('DENGI', 'Dengue IgG/IgM',        'Imunoserologi', null, 'TEKS',    null,      0, 470),
  ('MAL',   'Malaria (RDT)',         'Imunoserologi', null, 'PILIHAN', 'Negatif', 0, 480),
  -- Mikrobiologi & feses
  ('BTA',   'BTA Sputum',            'Mikrobiologi', null, 'TEKS',    null,      0, 510),
  ('FDS',   'Feses - Darah Samar',   'Feses',        null, 'PILIHAN', 'Negatif', 0, 610),
  ('FTC',   'Feses - Telur Cacing',  'Feses',        null, 'PILIHAN', 'Negatif', 0, 620)
on conflict (kode) do nothing;

update ref_lab set pilihan = array['A','B','AB','O']                where kode = 'GOLDA';
update ref_lab set pilihan = array['Positif','Negatif']             where kode = 'RH';
update ref_lab set pilihan = array['Negatif','+1','+2','+3','+4']   where kode in
  ('UPRO','UGLU','UKET','UBLD');
update ref_lab set pilihan = array['Negatif','Positif']             where kode in
  ('HCG','NS1','MAL','FDS','FTC');
update ref_lab set pilihan = array['Non Reaktif','Reaktif']         where kode in
  ('HBSAG','HIV','SIF');

-- Nilai rujukan dewasa (umur >= 15 tahun = 180 bulan) dan anak seperlunya.
insert into ref_lab_rujukan (lab_id, jenis_kelamin, umur_min_bulan, umur_max_bulan,
                             batas_bawah, batas_atas, kritis_bawah, kritis_atas, teks)
select l.id, v.jk, v.umin, v.umax, v.bb, v.ba, v.kb, v.ka, v.teks
  from (values
    -- kode,   jenis kelamin,        umur min, umur max, bawah, atas,  kritis bawah, kritis atas, teks
    ('HB',   'L'::jenis_kelamin_t,  180, null,   13.0,  17.0,   7.0,   20.0, null),
    ('HB',   'P'::jenis_kelamin_t,  180, null,   12.0,  15.0,   7.0,   20.0, null),
    ('HB',   null,                    0,   1,    14.0,  22.0,   9.0,   24.0, null),
    ('HB',   null,                    1,  12,    10.5,  13.5,   7.0,   20.0, null),
    ('HB',   null,                   12,  72,    11.5,  13.5,   7.0,   20.0, null),
    ('HB',   null,                   72, 180,    11.5,  15.5,   7.0,   20.0, null),
    ('LEU',  null,                  180, null, 4000.0,10000.0,2000.0,30000.0, null),
    ('LEU',  null,                    0, 180,  5000.0,15000.0,2000.0,30000.0, null),
    ('ERI',  'L'::jenis_kelamin_t,  180, null,    4.5,   5.5,  null,   null, null),
    ('ERI',  'P'::jenis_kelamin_t,  180, null,    4.0,   5.0,  null,   null, null),
    ('HCT',  'L'::jenis_kelamin_t,  180, null,   40.0,  50.0,  null,   null, null),
    ('HCT',  'P'::jenis_kelamin_t,  180, null,   37.0,  43.0,  null,   null, null),
    ('TRO',  null,                    0, null,150000.0,400000.0,50000.0,1000000.0, null),
    ('LED',  'L'::jenis_kelamin_t,    0, null,   null,  15.0,  null,   null, '< 15'),
    ('LED',  'P'::jenis_kelamin_t,    0, null,   null,  20.0,  null,   null, '< 20'),
    ('GDS',  null,                    0, null,   70.0, 140.0,  45.0,  450.0, null),
    ('GDP',  null,                    0, null,   70.0, 100.0,  45.0,  450.0, null),
    ('GD2PP',null,                    0, null,   null, 140.0,  null,  450.0, '< 140'),
    ('CHOL', null,                    0, null,   null, 200.0,  null,   null, '< 200'),
    ('HDL',  'L'::jenis_kelamin_t,    0, null,   40.0,  null,  null,   null, '> 40'),
    ('HDL',  'P'::jenis_kelamin_t,    0, null,   50.0,  null,  null,   null, '> 50'),
    ('LDL',  null,                    0, null,   null, 130.0,  null,   null, '< 130'),
    ('TG',   null,                    0, null,   null, 150.0,  null,   null, '< 150'),
    ('UA',   'L'::jenis_kelamin_t,    0, null,    3.4,   7.0,  null,   null, null),
    ('UA',   'P'::jenis_kelamin_t,    0, null,    2.4,   6.0,  null,   null, null),
    ('UR',   null,                    0, null,   10.0,  50.0,  null,   null, null),
    ('CR',   'L'::jenis_kelamin_t,    0, null,    0.7,   1.3,  null,   null, null),
    ('CR',   'P'::jenis_kelamin_t,    0, null,    0.6,   1.1,  null,   null, null),
    ('SGOT', 'L'::jenis_kelamin_t,    0, null,   null,  37.0,  null,   null, '< 37'),
    ('SGOT', 'P'::jenis_kelamin_t,    0, null,   null,  31.0,  null,   null, '< 31'),
    ('SGPT', 'L'::jenis_kelamin_t,    0, null,   null,  42.0,  null,   null, '< 42'),
    ('SGPT', 'P'::jenis_kelamin_t,    0, null,   null,  32.0,  null,   null, '< 32'),
    ('UPH',  null,                    0, null,    4.5,   8.0,  null,   null, null),
    ('UBJ',  null,                    0, null,  1.005, 1.030,  null,   null, null),
    ('USEL', null,                    0, null,   null,   5.0,  null,   null, '0 - 5'),
    ('USER', null,                    0, null,   null,   2.0,  null,   null, '0 - 2')
  ) as v(kode, jk, umin, umax, bb, ba, kb, ka, teks)
  join ref_lab l on l.kode = v.kode
 where not exists (
   select 1 from ref_lab_rujukan x
    where x.lab_id = l.id
      and x.jenis_kelamin is not distinct from v.jk
      and x.umur_min_bulan is not distinct from v.umin
      and x.umur_max_bulan is not distinct from v.umax);

-- Paket yang paling sering diminta.
insert into ref_lab_paket (kode, nama, urutan) values
  ('DR',   'Darah Rutin',            10),
  ('GD',   'Gula Darah',             20),
  ('LIPID','Profil Lipid',           30),
  ('FUNGI','Fungsi Ginjal',          40),
  ('FUHAT','Fungsi Hati',            50),
  ('UL',   'Urine Lengkap',          60),
  ('ANC',  'Skrining Ibu Hamil',     70)
on conflict (kode) do nothing;

insert into ref_lab_paket_item (paket_id, lab_id, urutan)
select pk.id, l.id, v.urut
  from (values
    ('DR','HB',1),('DR','LEU',2),('DR','ERI',3),('DR','HCT',4),('DR','TRO',5),('DR','LED',6),
    ('GD','GDS',1),('GD','GDP',2),('GD','GD2PP',3),
    ('LIPID','CHOL',1),('LIPID','HDL',2),('LIPID','LDL',3),('LIPID','TG',4),
    ('FUNGI','UR',1),('FUNGI','CR',2),('FUNGI','UA',3),
    ('FUHAT','SGOT',1),('FUHAT','SGPT',2),
    ('UL','UWAR',1),('UL','UPH',2),('UL','UBJ',3),('UL','UPRO',4),('UL','UGLU',5),
    ('UL','UKET',6),('UL','UBLD',7),('UL','USEL',8),('UL','USER',9),
    ('ANC','HB',1),('ANC','GOLDA',2),('ANC','RH',3),('ANC','HBSAG',4),('ANC','HIV',5),
    ('ANC','SIF',6),('ANC','UPRO',7)
  ) as v(paket, kode, urut)
  join ref_lab_paket pk on pk.kode = v.paket
  join ref_lab l        on l.kode  = v.kode
on conflict do nothing;


-- Kode ICD-9-CM untuk pemeriksaan penunjang. Gunanya PELAPORAN — PCare dan
-- SatuSehat memintanya — bukan penarifan: yang menagihkan rontgen adalah
-- bacaannya (lihat E5 di 12_kasir_penunjang.sql).
--
-- Karena itu semuanya sengaja `sering_dipakai = false`, supaya tidak naik ke
-- baris teratas saat dokter mencari tindakan. Dokter yang mencatat "87.12
-- Rontgen gigi lainnya" DAN menulis bacaannya akan membuat dua baris untuk
-- satu film; §E5 di berkas 12 sudah menolak baris keduanya, tetapi tidak
-- menyodorkannya sejak awal jauh lebih baik daripada menyaringnya di ujung.
insert into icd9cm (kode, nama_id, nama_en, kategori, sering_dipakai, per_gigi, aktif) values
  ('90.59', 'Pemeriksaan darah lainnya',        'Other microscopic examination of blood', 'PENUNJANG', true,  false, true),
  ('90.59-1','Pemeriksaan kimia darah',         'Blood chemistry',                        'PENUNJANG', true,  false, true),
  ('91.39', 'Pemeriksaan urine lainnya',        'Other microscopic examination of urine', 'PENUNJANG', true,  false, true),
  ('87.11', 'Rontgen gigi menyeluruh',          'Full-mouth X-ray of teeth',              'PENUNJANG', false, true,  true),
  ('87.12', 'Rontgen gigi lainnya',             'Other dental X-ray',                     'PENUNJANG', false, true,  true),
  ('87.44', 'Rontgen toraks rutin',             'Routine chest X-ray',                    'PENUNJANG', false, false, true),
  ('89.52', 'Elektrokardiogram',                'Electrocardiogram',                      'PENUNJANG', false, false, true),
  ('88.79', 'Ultrasonografi lainnya',           'Other diagnostic ultrasound',            'PENUNJANG', false, false, true)
on conflict (kode) do nothing;


comment on table  lampiran is
  'Register berkas fisik rekam medis. Kolom berkas_* disiapkan untuk berkas digital dan sengaja dibiarkan kosong selama klinik memakai Supabase paket gratis.';
comment on table  penunjang is
  'Bacaan pemeriksaan penunjang (rontgen gigi, EKG, USG). Menyimpan hasil bacanya, bukan gambarnya.';
comment on column lab_hasil.rujukan_teks is
  'Salinan nilai rujukan saat hasil diisi. Master boleh berubah kemudian; lembar hasil lama tidak ikut berubah.';

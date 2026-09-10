-- =====================================================================
--  RME KLINIK IMANUEL — ANTREAN ONLINE (Mobile JKN / Antrol) + LAYAR TUNGGU
--  Jalankan SETELAH 14_periksa_terstruktur.sql. Aman dijalankan di
--  database berisi data, dan aman dijalankan ulang.
--
--  ARAH PANGGILANNYA TERBALIK — INI YANG PALING PENTING DIPAHAMI
--  -------------------------------------------------------------
--  Pada PCare, klinik adalah KLIEN: kita yang memanggil server BPJS.
--  Pada Antrean FKTP, klinik adalah SERVER: aplikasi Mobile JKN milik
--  BPJS yang memanggil web service KITA, memakai username dan password
--  yang klinik serahkan ke BPJS saat UAT.
--
--  Konsekuensinya besar dan menentukan seluruh bentuk berkas ini:
--    * Harus ada alamat publik yang bisa diakses BPJS tanpa login
--      Supabase (Edge Function `antrol`, tanpa verifikasi JWT).
--    * Yang menjaga pintu itu bukan RLS, melainkan username/password
--      di tabel antrol_akun — karena BPJS tidak punya akun Supabase.
--    * Seluruh aturan (kuota, jadwal, duplikat, format nomor kartu)
--      harus hidup DI DATABASE, bukan di Deno. Alasannya bukan
--      keindahan: aturan yang ditulis di Edge Function tidak bisa diuji
--      tanpa menjalankan server, sehingga tidak akan pernah diuji.
--      Semua fungsi antrol_* di bawah diuji langsung oleh
--      test/uji_antrean.sql, persis dengan kode metadata yang akan
--      dilihat BPJS saat UAT.
--
--  BELUM BRIDGING — LALU KENAPA DIBANGUN SEKARANG?
--  ------------------------------------------------
--  Karena yang mahal bukan menyambungkannya. Yang mahal adalah nomor
--  antrean. Hari ini nomor antrean lahir dari trigger kunjungan: ia baru
--  ada ketika pasien SUDAH berdiri di loket. Antrean online lahir sehari
--  sebelumnya, dari pasien yang belum tentu datang, yang mungkin bukan
--  pasien klinik ini, dan yang boleh membatalkan. Dua hal itu tidak bisa
--  ditampung satu tabel yang sama tanpa merusak rekam medis.
--
--  Karena itu antrean dipisah dari kunjungan sekarang, selagi datanya
--  masih sedikit. Kunjungan tetap lahir saat pasien hadir — hanya saja
--  nomornya kini diwarisi dari antrean, bukan dihitung ulang.
--
--  YANG SENGAJA TIDAK DIBUAT
--  --------------------------
--  Tidak ada satu pun kredensial BPJS di berkas ini. Username dan
--  password yang dipakai BPJS memanggil kita dibuat oleh admin lewat
--  halaman Pengaturan dan disimpan sebagai hash — tidak pernah bisa
--  dibaca kembali oleh peramban, bahkan oleh admin.
-- =====================================================================


-- =====================================================================
--  1. TIPE DATA
-- =====================================================================

-- Dari mana nomor antrean itu lahir.
--
-- 'ANJUNGAN' sengaja dimasukkan sekarang meskipun mesin anjungan mandiri
-- belum dibuat. Menambah nilai enum di kemudian hari memaksa satu migrasi
-- yang harus dijalankan sendirian di luar transaksi — pelajaran dari
-- sql/07_peran_kasir.sql. Nilai yang belum terpakai tidak memakan apa pun.
do $$ begin
  create type antrean_sumber_t as enum ('LOKET','ONLINE','ANJUNGAN');
exception when duplicate_object then null; end $$;

-- Pasien sedang menunggu dipanggil ke mana.
do $$ begin
  create type antrean_tahap_t as enum ('LOKET','POLI','SELESAI');
exception when duplicate_object then null; end $$;

-- Keadaan satu nomor antrean.
--   BELUM_HADIR  dipesan lewat Mobile JKN, pasiennya belum datang
--   MENUNGGU     sudah hadir (atau daftar di loket), menunggu dipanggil
--   DIPANGGIL    namanya sedang disebut layar
--   DILAYANI     sedang di loket / di ruang periksa
--   SELESAI      pelayanan tuntas
--   TIDAK_HADIR  dipanggil berkali-kali tetapi tidak muncul
--   BATAL        dibatalkan pasien lewat Mobile JKN, atau oleh petugas
do $$ begin
  create type antrean_status_t as enum
    ('BELUM_HADIR','MENUNGGU','DIPANGGIL','DILAYANI','SELESAI','TIDAK_HADIR','BATAL');
exception when duplicate_object then null; end $$;


-- =====================================================================
--  2. JAM KLINIK
--  tgl_klinik() sudah ada sejak modul apotek. Jadwal buka-tutup poli
--  butuh pasangannya: jam menurut WITA, bukan jam UTC milik server.
--  Tanpa ini, "poli tutup pukul 12.00" akan dievaluasi pukul 04.00 WITA
--  dan Mobile JKN menolak pendaftaran sepanjang pagi.
-- =====================================================================

create or replace function public.jam_klinik() returns time
language sql stable as $$ select (now() at time zone 'Asia/Makassar')::time $$;

comment on function public.jam_klinik() is
  'Jam sekarang menurut WITA (Asia/Makassar). Pasangan tgl_klinik().';

grant execute on function public.jam_klinik() to authenticated, anon, service_role;


-- =====================================================================
--  3. TAMBAHAN PADA TABEL YANG SUDAH ADA
-- =====================================================================

-- Awalan huruf nomor antrean per poli: A-012, B-004, ...
-- Huruf inilah yang membedakan antrean umum dan gigi di layar tunggu.
alter table poli add column if not exists prefix_antrean text;

update poli set prefix_antrean = upper(left(kode, 1))
 where prefix_antrean is null;

alter table poli alter column prefix_antrean set default 'A';
alter table poli alter column prefix_antrean set not null;

-- Kunjungan mewarisi nomornya dari antrean, bukan menghitung sendiri.
-- Kunci asingnya dipasang setelah tabel antrean dibuat (bagian 5).
alter table kunjungan add column if not exists antrean_id uuid;


-- =====================================================================
--  4. JADWAL & KUOTA
--  Spesifikasi BPJS: "Pengambilan antrean hanya bisa dilakukan
--  berdasarkan jadwal operasional FKTP." Tanpa tabel ini, Mobile JKN
--  akan menerima pendaftaran untuk hari Minggu.
-- =====================================================================

create table if not exists poli_jadwal (
  id            uuid primary key default uuid_generate_v4(),
  poli_id       uuid not null references poli(id) on delete cascade,
  hari          smallint not null check (hari between 0 and 6),  -- 0 = Minggu
  sesi          smallint not null default 1 check (sesi between 1 and 3),
  jam_buka      time not null default '08:00',
  jam_tutup     time not null default '12:00',
  -- Batas jam terakhir Mobile JKN boleh menerbitkan nomor untuk HARI INI.
  -- Dibuat terpisah supaya klinik bisa menutup pendaftaran online lebih
  -- awal daripada pintunya sendiri — pasien yang baru memesan pukul 11.55
  -- untuk poli yang tutup 12.00 hampir pasti tidak terlayani, dan nomor
  -- yang terbit lalu hangus lebih merepotkan daripada nomor yang ditolak.
  jam_tutup_online time,
  kuota         integer not null default 40 check (kuota >= 0),
  kuota_online  integer not null default 20 check (kuota_online >= 0),
  aktif         boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (poli_id, hari, sesi)
);
comment on table poli_jadwal is
  'Jam buka dan kuota per poli per hari dalam seminggu. Dipakai Antrol
   untuk menolak pemesanan di hari/jam poli tutup.';

create table if not exists poli_libur (
  id          uuid primary key default uuid_generate_v4(),
  tanggal     date not null,
  poli_id     uuid references poli(id) on delete cascade,  -- null = semua poli
  keterangan  text,
  dibuat_pada timestamptz not null default now(),
  dibuat_oleh uuid references pegawai(id)
);

-- unique nulls not distinct baru ada di PG15. Indeks berikut memberi
-- hasil sama dan tetap sah di PostgreSQL mana pun.
create unique index if not exists uq_poli_libur
  on poli_libur (tanggal, coalesce(poli_id, '00000000-0000-0000-0000-000000000000'::uuid));


-- =====================================================================
--  5. ANTREAN
-- =====================================================================

create table if not exists antrean (
  id            uuid primary key default uuid_generate_v4(),
  tanggal       date not null default public.tgl_klinik(),
  poli_id       uuid not null references poli(id),
  no_urut       integer not null,
  -- Tanpa DEFAULT dengan sengaja. Kalau kolom ini punya nilai bawaan,
  -- trigger tidak bisa lagi membedakan "pemanggil memang mau huruf A"
  -- dari "pemanggil tidak menyebut apa-apa" — dan seluruh antrean poli
  -- gigi akan terbit berhuruf A. Trigger BEFORE INSERT berjalan sebelum
  -- pemeriksaan NOT NULL, jadi kolom ini tetap boleh wajib isi.
  prefix        text not null,

  -- Nomor yang dilihat manusia. Dihitung database supaya nomor di layar
  -- tunggu, di struk antrean, dan di Mobile JKN tidak mungkin berbeda.
  --
  -- greatest(3, length(...)) bukan hiasan: lpad('1234', 3, '0') di
  -- PostgreSQL memulangkan '123' — MEMOTONG, tidak seperti padStart di
  -- JavaScript. Bug persis ini pernah lolos di penomoran surat dan baru
  -- ketahuan pada surat ke-100.
  nomor         text generated always as
                (prefix || '-' || lpad(no_urut::text, greatest(3, length(no_urut::text)), '0')) stored,

  kode_booking  text not null,
  sumber        antrean_sumber_t not null default 'LOKET',

  -- Identitas. pasien_id kosong untuk pemesanan online dari orang yang
  -- belum pernah berobat di sini; nomor kartu dan NIK-nya tetap disimpan
  -- supaya petugas bisa mencocokkannya saat pasien datang.
  pasien_id     uuid references pasien(id),
  no_kartu      text,
  nik           text,
  nama_snapshot text,

  tahap         antrean_tahap_t   not null default 'LOKET',
  status        antrean_status_t  not null default 'MENUNGGU',
  kunjungan_id  uuid references kunjungan(id) on delete set null,

  -- Jejak waktu: dipakai laporan waktu tunggu dan estimasi di layar
  waktu_ambil        timestamptz not null default now(),
  waktu_hadir        timestamptz,
  waktu_panggil      timestamptz,      -- panggilan terakhir, tahap mana pun
  waktu_mulai_layan  timestamptz,
  waktu_selesai      timestamptz,

  jumlah_panggil smallint not null default 0,
  tujuan_terakhir text,                -- 'Loket 1' / 'Poli Umum'
  alasan_batal   text,
  catatan        text,

  dibuat_oleh   uuid references pegawai(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint antrean_urut_positif check (no_urut > 0)
);

-- Bila berkas ini pernah dijalankan versi sebelumnya yang masih memasang
-- nilai bawaan, lepaskan sekarang.
alter table antrean alter column prefix drop default;

create unique index if not exists uq_antrean_nomor
  on antrean (tanggal, poli_id, no_urut);
create unique index if not exists uq_antrean_booking
  on antrean (kode_booking);
create index if not exists idx_antrean_tanggal on antrean (tanggal, poli_id, no_urut);
create index if not exists idx_antrean_status  on antrean (tanggal, status)
  where status in ('BELUM_HADIR','MENUNGGU','DIPANGGIL','DILAYANI');
create index if not exists idx_antrean_kartu   on antrean (no_kartu, tanggal);
create index if not exists idx_antrean_pasien  on antrean (pasien_id, tanggal desc);

-- Satu peserta, satu nomor online, per poli, per hari.
--
-- Perhatikan `sumber = 'ONLINE'`. Aturan BPJS berlaku untuk pemesanan
-- lewat Mobile JKN; ia TIDAK boleh menghalangi loket. Petugas yang
-- sedang berhadapan dengan pasien harus selalu bisa mendaftarkannya —
-- sistem yang menolak akan disiasati dengan mengosongkan nomor BPJS,
-- dan yang rusak kemudian adalah data klaim, bukan antreannya.
--
-- Pemeriksaan "sudah punya nomor dari mana pun" tetap dilakukan, tetapi
-- di dalam fungsi antrol_ambil() yang hanya dipakai jalur online.
create unique index if not exists uq_antrean_online_peserta
  on antrean (tanggal, poli_id, no_kartu)
  where sumber = 'ONLINE' and no_kartu is not null
        and status not in ('BATAL','TIDAK_HADIR');

comment on table antrean is
  'Satu baris = satu nomor antrean. Lahir di loket atau dari Mobile JKN.
   Kunjungan (encounter) baru dibuat saat pasien benar-benar hadir.';

-- Tautan balik dari kunjungan. Dipasang di sini karena kedua tabel saling
-- menunjuk: antrean.kunjungan_id sudah bisa dibuat bersama tabelnya
-- (kunjungan sudah ada sejak 01_schema.sql), tetapi arah sebaliknya
-- harus menunggu antrean lahir.
do $$ begin
  alter table kunjungan add constraint kunjungan_antrean_fk
    foreign key (antrean_id) references antrean(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists idx_kunjungan_antrean on kunjungan (antrean_id);


-- Riwayat panggilan. Bukan sekadar catatan: inilah yang dibaca layar
-- tunggu untuk tahu nomor mana yang sedang disebut, dan id-nya yang
-- dipakai layar membedakan panggilan baru dari panggilan yang sudah
-- terlanjur dibunyikan. Tanpa tabel ini, layar akan mengulang bunyi
-- setiap kali menyegarkan data.
create table if not exists antrean_panggilan (
  id          bigserial primary key,
  antrean_id  uuid not null references antrean(id) on delete cascade,
  tanggal     date not null default public.tgl_klinik(),
  tahap       antrean_tahap_t not null,
  tujuan      text,
  urutan      smallint not null default 1,     -- panggilan ke berapa
  waktu       timestamptz not null default now(),
  oleh        uuid references pegawai(id)
);
create index if not exists idx_panggilan_tanggal on antrean_panggilan (tanggal, id desc);
create index if not exists idx_panggilan_antrean on antrean_panggilan (antrean_id, id desc);


-- =====================================================================
--  6. PENGATURAN ANTREAN & LAYAR
--  Satu baris jsonb, pola yang sama dengan sys_surat_pengaturan.
-- =====================================================================

create table if not exists sys_antrean_pengaturan (
  id           smallint primary key default 1 check (id = 1),
  konfigurasi  jsonb not null default '{}'::jsonb,
  -- Token layar disimpan di kolom sendiri, bukan di dalam jsonb, supaya
  -- bisa dicabut hak bacanya secara terpisah. Peramban staf tidak perlu
  -- membacanya untuk apa pun kecuali menyalin tautannya sekali.
  token_layar  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references pegawai(id)
);

insert into sys_antrean_pengaturan (id, konfigurasi) values (1, '{}'::jsonb)
on conflict (id) do nothing;

comment on column sys_antrean_pengaturan.konfigurasi is
  'judul_layar, teks_berjalan, keterangan_antrol (kalimat yang dikirim ke
   Mobile JKN), suara_aktif, ulang_panggil_detik, tampilkan_estimasi,
   menit_per_pasien.';


-- =====================================================================
--  7. AKUN WEB SERVICE ANTROL
--  Kredensial yang dipakai BPJS untuk memanggil KITA. Password tidak
--  pernah disimpan apa adanya dan tidak pernah bisa dibaca kembali —
--  admin hanya bisa membuat yang baru.
-- =====================================================================

create table if not exists antrol_akun (
  username         text primary key,
  sandi_hash       text not null,
  salt             text not null,
  keterangan       text,
  aktif            boolean not null default true,
  dibuat_pada      timestamptz not null default now(),
  dibuat_oleh      uuid references pegawai(id),
  terakhir_dipakai timestamptz,
  jumlah_dipakai   bigint not null default 0
);

-- Peramban tidak boleh menyentuh tabel ini sama sekali. Admin mengelola
-- akun lewat fungsi antrol_akun_simpan() / antrol_akun_hapus() dan
-- melihat daftarnya lewat view v_antrol_akun yang tidak memuat hash.
revoke all on antrol_akun from authenticated, anon;

create table if not exists antrol_log (
  id           bigserial primary key,
  waktu        timestamptz not null default now(),
  jalur        text not null,          -- 'antrean/status/001/2026-09-05'
  metode       text not null,
  username     text,
  request      jsonb,
  response     jsonb,
  http_status  integer,
  sukses       boolean not null default false,
  ip           text
);
create index if not exists idx_antrol_log_waktu on antrol_log (waktu desc);

comment on table antrol_log is
  'Setiap permintaan masuk dari Mobile JKN. Dipakai saat UAT bersama BPJS
   untuk membuktikan apa yang kita jawab, dan mencari sebab bila ditolak.';


-- =====================================================================
--  8. PENOMORAN ANTREAN
-- =====================================================================

-- Nomor urut berikutnya untuk satu poli pada satu tanggal.
--
-- pg_advisory_xact_lock membuat dua permintaan Mobile JKN yang datang
-- pada detik yang sama mengantre, bukan sama-sama membaca max()+1 lalu
-- menghasilkan nomor kembar. Indeks unik di atas adalah jaring terakhir;
-- kunci ini yang membuat jaring itu hampir tidak pernah terpakai.
create or replace function public.antrean_urut_berikut(p_poli uuid, p_tanggal date)
returns integer
language plpgsql as $$
declare v_urut integer;
begin
  perform pg_advisory_xact_lock(hashtext('antrean:' || p_tanggal::text || ':' || p_poli::text));
  select coalesce(max(no_urut), 0) + 1 into v_urut
    from antrean where tanggal = p_tanggal and poli_id = p_poli;
  return v_urut;
end $$;

-- Kode booking: ANT-YYYYMMDD-XXXXXX. Tidak dipakai BPJS pada spesifikasi
-- FKTP (itu milik FKRTL), tapi dibuat tetap karena gratis dan menjadi
-- satu-satunya cara mencari kembali satu nomor antrean tanpa menyebut
-- nama pasien — misalnya dari struk yang dibawa pasien.
create or replace function public.antrean_kode_booking(p_tanggal date)
returns text
language plpgsql as $$
declare v_kode text; v_coba int := 0;
begin
  loop
    v_kode := 'ANT-' || to_char(p_tanggal, 'YYYYMMDD') || '-' ||
              upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from antrean where kode_booking = v_kode);
    v_coba := v_coba + 1;
    if v_coba > 20 then
      raise exception 'Gagal membuat kode booking yang unik.';
    end if;
  end loop;
  return v_kode;
end $$;

create or replace function public.antrean_sebelum_simpan() returns trigger
language plpgsql as $$
begin
  if new.tanggal is null then new.tanggal := public.tgl_klinik(); end if;

  if new.prefix is null or new.prefix = '' then
    select coalesce(prefix_antrean, 'A') into new.prefix from poli where id = new.poli_id;
    new.prefix := coalesce(new.prefix, 'A');
  end if;

  if new.no_urut is null then
    new.no_urut := public.antrean_urut_berikut(new.poli_id, new.tanggal);
  end if;

  if new.kode_booking is null or new.kode_booking = '' then
    new.kode_booking := public.antrean_kode_booking(new.tanggal);
  end if;

  return new;
end $$;

drop trigger if exists trg_antrean_sebelum on antrean;
create trigger trg_antrean_sebelum before insert on antrean
for each row execute function public.antrean_sebelum_simpan();

drop trigger if exists trg_updated_antrean on antrean;
create trigger trg_updated_antrean before update on antrean
for each row execute function public.set_updated_at();

drop trigger if exists trg_updated_poli_jadwal on poli_jadwal;
create trigger trg_updated_poli_jadwal before update on poli_jadwal
for each row execute function public.set_updated_at();


-- =====================================================================
--  9. JADWAL: apakah poli buka?
-- =====================================================================

-- Memulangkan satu baris jadwal yang berlaku, atau tidak sama sekali.
-- Dipakai jalur online (menolak) dan halaman antrean (memberi tahu).
create or replace function public.poli_jadwal_berlaku(p_poli uuid, p_tanggal date)
returns table (
  jam_buka time, jam_tutup time, jam_tutup_online time,
  kuota integer, kuota_online integer
)
language sql stable as $$
  select min(j.jam_buka),
         max(j.jam_tutup),
         max(coalesce(j.jam_tutup_online, j.jam_tutup)),
         sum(j.kuota)::integer,
         sum(j.kuota_online)::integer
    from poli_jadwal j
   where j.poli_id = p_poli
     and j.aktif
     and j.hari = extract(dow from p_tanggal)::smallint
     and not exists (
       select 1 from poli_libur l
        where l.tanggal = p_tanggal
          and (l.poli_id is null or l.poli_id = p_poli))
  having count(*) > 0
$$;

comment on function public.poli_jadwal_berlaku(uuid, date) is
  'Gabungan seluruh sesi poli pada hari itu: jam buka paling awal, jam
   tutup paling akhir, dan jumlah kuota. Kosong bila poli libur atau
   tidak punya jadwal hari itu.';

-- Berapa nomor yang sudah terpakai. Nomor yang dibatalkan dan yang tidak
-- hadir dikembalikan ke kuota — kursinya memang kosong.
create or replace function public.antrean_terpakai(p_poli uuid, p_tanggal date, p_online boolean default false)
returns integer
language sql stable as $$
  select count(*)::integer from antrean a
   where a.tanggal = p_tanggal and a.poli_id = p_poli
     and a.status not in ('BATAL','TIDAK_HADIR')
     and (not p_online or a.sumber = 'ONLINE')
$$;


-- =====================================================================
--  10. TINDAKAN PETUGAS
--  Semua SECURITY INVOKER: RLS di bawah yang memutuskan siapa boleh apa.
-- =====================================================================

-- Panggil satu nomor. Menaikkan hitungan panggilan dan mencatat riwayat.
create or replace function public.antrean_panggil(
  p_antrean uuid,
  p_tujuan  text default null
) returns antrean
language plpgsql as $$
declare a antrean; v_tujuan text; v_urut smallint;
begin
  select * into a from antrean where id = p_antrean for update;
  if not found then raise exception 'Nomor antrean tidak ditemukan.'; end if;

  if a.status in ('SELESAI','BATAL') then
    raise exception 'Nomor % sudah % dan tidak bisa dipanggil lagi.',
      a.nomor, lower(a.status::text);
  end if;

  -- Tujuan bawaan mengikuti tahap: loket untuk verifikasi berkas,
  -- nama poli untuk pemeriksaan.
  v_tujuan := coalesce(
    nullif(trim(coalesce(p_tujuan, '')), ''),
    case when a.tahap = 'LOKET' then 'Loket Pendaftaran'
         else (select nama from poli where id = a.poli_id) end);

  v_urut := a.jumlah_panggil + 1;

  update antrean set
      status          = 'DIPANGGIL',
      jumlah_panggil  = v_urut,
      waktu_panggil   = now(),
      tujuan_terakhir = v_tujuan,
      -- Pasien yang dipanggil jelas sudah hadir. Menandainya di sini
      -- menyelamatkan pemesanan online yang petugasnya lupa check-in.
      waktu_hadir     = coalesce(a.waktu_hadir, now())
    where id = p_antrean
    returning * into a;

  insert into antrean_panggilan (antrean_id, tanggal, tahap, tujuan, urutan, oleh)
  values (p_antrean, a.tanggal, a.tahap, v_tujuan, v_urut, auth.uid());

  return a;
end $$;

-- Pasien datang ke loket. Membuat kunjungan dan menautkannya.
--
-- Digabung dalam satu fungsi supaya tidak mungkin ada antrean yang
-- berstatus "sudah dilayani" tanpa kunjungan, atau kunjungan tanpa nomor
-- antrean — dua keadaan yang sama-sama membuat rekap harian tidak cocok.
create or replace function public.antrean_checkin(
  p_antrean    uuid,
  p_pasien     uuid,
  p_dokter     uuid default null,
  p_cara_bayar cara_bayar_t default 'BPJS',
  p_keluhan    text default null
) returns kunjungan
language plpgsql as $$
declare a antrean; k kunjungan;
begin
  select * into a from antrean where id = p_antrean for update;
  if not found then raise exception 'Nomor antrean tidak ditemukan.'; end if;
  if a.status = 'BATAL' then
    raise exception 'Nomor % sudah dibatalkan.', a.nomor;
  end if;
  if a.kunjungan_id is not null then
    select * into k from kunjungan where id = a.kunjungan_id;
    return k;                              -- sudah pernah check-in
  end if;
  if p_pasien is null then
    raise exception 'Pilih dulu data pasiennya sebelum check-in.';
  end if;

  insert into kunjungan (pasien_id, tanggal, poli_id, dokter_id, cara_bayar,
                         no_antrian, keluhan_singkat, antrean_id, created_by)
  values (p_pasien, a.tanggal, a.poli_id, p_dokter, p_cara_bayar,
          a.no_urut, p_keluhan, a.id, auth.uid())
  returning * into k;

  update antrean set
      pasien_id    = p_pasien,
      kunjungan_id = k.id,
      tahap        = 'POLI',
      status       = 'MENUNGGU',
      waktu_hadir  = coalesce(a.waktu_hadir, now())
    where id = p_antrean;

  return k;
end $$;

-- Pasien masuk ruang periksa / mulai dilayani di loket.
create or replace function public.antrean_mulai_layan(p_antrean uuid)
returns antrean
language plpgsql as $$
declare a antrean;
begin
  update antrean set
      status            = 'DILAYANI',
      waktu_mulai_layan = coalesce(waktu_mulai_layan, now()),
      waktu_hadir       = coalesce(waktu_hadir, now())
    where id = p_antrean and status not in ('SELESAI','BATAL')
    returning * into a;
  if not found then raise exception 'Nomor antrean tidak bisa dilayani.'; end if;
  return a;
end $$;

-- Dipanggil berkali-kali, tidak muncul. Nomornya dilewati, kuotanya
-- kembali, dan pasien masih boleh mengambil nomor baru — persis kalimat
-- yang dikirim ke Mobile JKN.
create or replace function public.antrean_lewat(p_antrean uuid, p_alasan text default null)
returns antrean
language plpgsql as $$
declare a antrean;
begin
  update antrean set
      status       = 'TIDAK_HADIR',
      alasan_batal = coalesce(nullif(trim(coalesce(p_alasan,'')),''), 'Tidak hadir saat dipanggil'),
      waktu_selesai= now()
    where id = p_antrean and status not in ('SELESAI','BATAL')
    returning * into a;
  if not found then raise exception 'Nomor antrean tidak bisa dilewati.'; end if;
  return a;
end $$;

create or replace function public.antrean_batal(p_antrean uuid, p_alasan text default null)
returns antrean
language plpgsql as $$
declare a antrean;
begin
  select * into a from antrean where id = p_antrean for update;
  if not found then raise exception 'Nomor antrean tidak ditemukan.'; end if;
  if a.kunjungan_id is not null then
    raise exception 'Nomor % sudah menjadi kunjungan. Batalkan kunjungannya lebih dulu.', a.nomor;
  end if;

  update antrean set
      status       = 'BATAL',
      alasan_batal = nullif(trim(coalesce(p_alasan,'')),''),
      waktu_selesai= now()
    where id = p_antrean
    returning * into a;
  return a;
end $$;

-- Kunjungan selesai → antreannya ikut selesai.
-- Tanpa ini, layar tunggu akan terus menghitung pasien yang sudah pulang
-- sebagai "sisa antrean", dan angka yang dilihat pasien tidak pernah turun.
create or replace function public.antrean_ikut_kunjungan() returns trigger
language plpgsql as $$
begin
  if new.antrean_id is null then return new; end if;

  if new.status = 'SELESAI' then
    update antrean set status = 'SELESAI', tahap = 'SELESAI',
           waktu_selesai = coalesce(waktu_selesai, now())
     where id = new.antrean_id and status <> 'BATAL';
  elsif new.status = 'BATAL' then
    update antrean set status = 'BATAL', waktu_selesai = coalesce(waktu_selesai, now())
     where id = new.antrean_id;
  elsif new.status = 'PEMERIKSAAN' then
    update antrean set status = 'DILAYANI',
           waktu_mulai_layan = coalesce(waktu_mulai_layan, now())
     where id = new.antrean_id and status not in ('SELESAI','BATAL');
  end if;
  return new;
end $$;

drop trigger if exists trg_antrean_ikut_kunjungan on kunjungan;
create trigger trg_antrean_ikut_kunjungan after update of status on kunjungan
for each row execute function public.antrean_ikut_kunjungan();

-- Kunjungan yang dibuat langsung dari halaman Pendaftaran (tanpa lewat
-- antrean online) tetap harus punya nomor antrean, kalau tidak ia tidak
-- akan pernah muncul di layar tunggu.
--
-- Ditulis BEFORE INSERT, bukan AFTER. Perbedaannya bukan gaya:
-- trigger AFTER ROW di PostgreSQL DIANTRIKAN sampai seluruh statement
-- selesai. Pada `insert into kunjungan values (...), (...)` — dua baris
-- satu perintah, persis yang dilakukan berkas uji dan impor — kedua
-- baris menghitung nomor antrean SEBELUM satu pun antrean tertulis,
-- lalu sama-sama meminta nomor yang sama dan pendaftaran gagal dengan
-- unique_violation mentah.
--
-- BEFORE INSERT menulis antreannya saat itu juga, jadi baris kedua
-- sudah melihat nomor baris pertama. Tautan baliknya (antrean →
-- kunjungan) menyusul di trigger AFTER, karena kunjungannya memang
-- belum punya id yang sah untuk ditunjuk kunci asing.
create or replace function public.kunjungan_siapkan_antrean() returns trigger
language plpgsql as $$
declare a antrean;
begin
  if new.antrean_id is not null then
    if new.no_antrian is null then
      select no_urut into new.no_antrian from antrean where id = new.antrean_id;
    end if;
    return new;
  end if;

  insert into antrean (tanggal, poli_id, pasien_id, sumber, tahap, status,
                       waktu_hadir, no_kartu, nik, nama_snapshot, dibuat_oleh)
  select coalesce(new.tanggal, public.tgl_klinik()), new.poli_id, new.pasien_id,
         'LOKET', 'POLI', 'MENUNGGU', now(), p.no_bpjs, p.nik, p.nama, new.created_by
    from pasien p where p.id = new.pasien_id
  returning * into a;

  if a.id is null then
    raise exception 'Pasien kunjungan tidak ditemukan; nomor antrean tidak bisa diterbitkan.';
  end if;

  new.antrean_id := a.id;
  new.no_antrian := a.no_urut;
  return new;
end $$;

drop trigger if exists trg_kunjungan_buat_antrean on kunjungan;
drop trigger if exists trg_kunjungan_antrean on kunjungan;
create trigger trg_kunjungan_antrean before insert on kunjungan
for each row execute function public.kunjungan_siapkan_antrean();

create or replace function public.kunjungan_tautkan_antrean() returns trigger
language plpgsql as $$
begin
  update antrean set kunjungan_id = new.id
   where id = new.antrean_id and kunjungan_id is distinct from new.id;
  return new;
end $$;

drop trigger if exists trg_kunjungan_taut_antrean on kunjungan;
create trigger trg_kunjungan_taut_antrean after insert on kunjungan
for each row when (new.antrean_id is not null)
execute function public.kunjungan_tautkan_antrean();


-- ---------------------------------------------------------------------
-- PERBAIKAN gen_no_kunjungan() — dua bug, keduanya baru bisa terjadi
-- setelah antrean online ada.
--
-- (1) NOMOR ANTRIAN BERTABRAKAN.
--     Versi lama menghitung no_antrian dari tabel KUNJUNGAN:
--       max(no_antrian) + 1 where tanggal = ... and poli_id = ...
--     Selama semua pasien mendaftar di loket, itu benar. Begitu ada
--     pemesanan online, tidak lagi: lima pesanan Mobile JKN untuk hari
--     ini sudah memegang nomor 1–5, tetapi belum satu pun punya
--     kunjungan. Pasien pertama yang datang langsung ke loket akan
--     diberi nomor 1 — nomor yang sudah dipegang orang lain — dan
--     pendaftarannya gagal dengan galat unique_violation mentah di
--     tengah jam sibuk.
--
--     Sekarang no_antrian tidak lagi dihitung di sini sama sekali:
--     pemiliknya tabel antrean, yang memegang kunci serialisasinya.
--
-- (2) SATU NOMOR CACAT MEMATIKAN SELURUH PENDAFTARAN HARI ITU.
--     substring(no_kunjungan from 10)::int mengandaikan SETIAP baris
--     hari itu bernomor YYYYMMDD-NNNN. Satu baris bernomor lain — hasil
--     impor, perbaikan manual lewat dasbor, atau penggabungan dengan
--     portal sipantau nanti — membuat seluruh pendaftaran hari itu
--     gagal dengan "invalid input syntax for type integer". Baris yang
--     tidak berbentuk sekarang dilewati, bukan meruntuhkan loket.
-- ---------------------------------------------------------------------
create or replace function public.gen_no_kunjungan() returns trigger
language plpgsql as $$
declare urut integer;
begin
  if new.tanggal is null then new.tanggal := current_date; end if;

  if new.no_kunjungan is null or new.no_kunjungan = '' then
    select coalesce(max(substring(no_kunjungan from 10)::int), 0) + 1
      into urut from kunjungan
     where tanggal = new.tanggal
       and no_kunjungan ~ '^[0-9]{8}-[0-9]+$';
    new.no_kunjungan := to_char(new.tanggal,'YYYYMMDD') || '-' || lpad(urut::text, 4, '0');
  end if;

  -- no_antrian SENGAJA tidak dihitung di sini lagi. Pemiliknya sekarang
  -- tabel antrean, lewat trg_kunjungan_antrean di atas — supaya nomor
  -- loket dan nomor Mobile JKN lahir dari satu deret yang sama.

  if exists (select 1 from kunjungan k where k.pasien_id = new.pasien_id) then
    new.jenis_kunjungan := 'LAMA';
  else
    new.jenis_kunjungan := 'BARU';
  end if;

  return new;
end $$;


-- =====================================================================
--  11. VIEW UNTUK PETUGAS
-- =====================================================================

create or replace view v_antrean_hari_ini with (security_invoker = true) as
select a.id, a.tanggal, a.nomor, a.no_urut, a.prefix, a.kode_booking,
       a.sumber, a.tahap, a.status, a.jumlah_panggil, a.tujuan_terakhir,
       a.waktu_ambil, a.waktu_hadir, a.waktu_panggil, a.waktu_mulai_layan,
       a.waktu_selesai, a.alasan_batal, a.catatan,
       a.poli_id, po.nama as nama_poli, po.kode as kode_poli, po.jenis as jenis_poli,
       a.pasien_id, a.kunjungan_id,
       coalesce(p.nama, a.nama_snapshot)            as nama_pasien,
       p.no_rm, p.tanggal_lahir, p.jenis_kelamin,
       coalesce(p.no_bpjs, a.no_kartu)              as no_kartu,
       coalesce(p.nik, a.nik)                       as nik,
       k.cara_bayar, k.status as status_kunjungan, k.dokter_id,
       d.nama as nama_dokter,
       (k.id is not null)                           as sudah_checkin,
       -- Berapa lama sudah menunggu, dalam menit. Dipakai halaman antrean
       -- untuk menyorot pasien yang tertinggal.
       (extract(epoch from (now() - coalesce(a.waktu_hadir, a.waktu_ambil))) / 60)::integer
                                                    as menit_menunggu
  from antrean a
  join poli po on po.id = a.poli_id
  left join pasien p    on p.id = a.pasien_id
  left join kunjungan k on k.id = a.kunjungan_id
  left join pegawai d   on d.id = k.dokter_id
 where a.tanggal = public.tgl_klinik()
 order by po.urutan, a.no_urut;

-- Kuota hari ini per poli. Satu baris per poli aktif, juga untuk poli
-- yang belum punya satu pun antrean — kalau tidak, poli yang sepi hilang
-- dari layar dan petugas mengira sistemnya rusak.
create or replace view v_antrean_kuota with (security_invoker = true) as
select po.id                                  as poli_id,
       po.nama                                as nama_poli,
       po.kode                                as kode_poli,
       po.kode_pcare,
       po.prefix_antrean,
       po.urutan,
       t.tanggal,
       (j.jam_buka is not null)               as buka,
       j.jam_buka, j.jam_tutup, j.jam_tutup_online,
       coalesce(j.kuota, 0)                   as kuota,
       coalesce(j.kuota_online, 0)            as kuota_online,
       public.antrean_terpakai(po.id, t.tanggal, false) as terpakai,
       public.antrean_terpakai(po.id, t.tanggal, true)  as terpakai_online,
       greatest(coalesce(j.kuota, 0) - public.antrean_terpakai(po.id, t.tanggal, false), 0)
                                              as sisa_kuota,
       greatest(coalesce(j.kuota_online, 0) - public.antrean_terpakai(po.id, t.tanggal, true), 0)
                                              as sisa_kuota_online
  from poli po
 cross join lateral (select public.tgl_klinik() as tanggal) t
  left join lateral public.poli_jadwal_berlaku(po.id, t.tanggal) j on true
 where po.aktif
 order by po.urutan;

create or replace view v_antrol_akun with (security_invoker = true) as
select username, keterangan, aktif, dibuat_pada, terakhir_dipakai, jumlah_dipakai
  from antrol_akun;

comment on view v_antrol_akun is
  'Daftar akun web service Antrol TANPA hash sandinya. Sandi tidak pernah
   bisa dibaca kembali — kalau lupa, buat yang baru.';


-- =====================================================================
--  12. AKUN ANTROL — dikelola lewat fungsi, bukan tabel
-- =====================================================================

-- 9 Sep 2026: pintasan hak akses modul antrean, lewat tabel hak_akses
-- (bisa diatur master) — lihat sql/02_rls.sql bagian HAK AKSES. Tidak ada
-- isian awal untuk kode ini: perilakunya sama seperti sebelumnya (hanya
-- admin lama / master sekarang), sampai master membukanya untuk peran lain.
create or replace function public.boleh_antrean_pengaturan() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('antrean_pengaturan') $$;

create or replace function public.boleh_antrean_buat() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('antrean_buat') $$;

create or replace function public.boleh_antrean_hapus() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('antrean_hapus') $$;

grant execute on function
  public.boleh_antrean_pengaturan(), public.boleh_antrean_buat(), public.boleh_antrean_hapus()
  to authenticated;

insert into public.hak_akses (kode, peran, diizinkan) values
  ('antrean_buat', 'admin',   true),
  ('antrean_buat', 'perawat', true),
  ('antrean_buat', 'dokter',  true)
on conflict (kode, peran) do nothing;

create or replace function public.antrol_akun_simpan(
  p_username text, p_sandi text, p_keterangan text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_salt text; v_user text;
begin
  if not public.boleh_antrean_pengaturan() then
    raise exception 'Anda tidak punya izin mengatur akun Antrol.';
  end if;

  v_user := lower(trim(coalesce(p_username, '')));
  if v_user = '' then raise exception 'Username tidak boleh kosong.'; end if;
  if length(coalesce(p_sandi, '')) < 12 then
    -- Ini bukan sandi yang diketik manusia. Ia disalin sekali ke formulir
    -- BPJS dan tidak pernah diketik ulang, jadi tidak ada alasan untuk
    -- membuatnya pendek — dan pintunya menghadap internet terbuka.
    raise exception 'Sandi web service minimal 12 karakter.';
  end if;

  v_salt := md5(random()::text || clock_timestamp()::text);

  insert into antrol_akun (username, sandi_hash, salt, keterangan, dibuat_oleh)
  values (v_user, encode(sha256(convert_to(v_salt || p_sandi, 'utf8')), 'hex'),
          v_salt, p_keterangan, auth.uid())
  on conflict (username) do update set
    sandi_hash = excluded.sandi_hash,
    salt       = excluded.salt,
    keterangan = coalesce(excluded.keterangan, antrol_akun.keterangan),
    aktif      = true;

  return v_user;
end $$;

create or replace function public.antrol_akun_hapus(p_username text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.boleh_antrean_pengaturan() then
    raise exception 'Anda tidak punya izin mengatur akun Antrol.';
  end if;
  delete from antrol_akun where username = lower(trim(p_username));
  return found;
end $$;

-- Dipakai Edge Function (service_role) untuk memeriksa header
-- x-username / x-password yang dikirim BPJS.
create or replace function public.antrol_auth(p_username text, p_sandi text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r antrol_akun;
begin
  select * into r from antrol_akun
   where username = lower(trim(coalesce(p_username,''))) and aktif;

  if not found
     or r.sandi_hash <> encode(sha256(convert_to(r.salt || coalesce(p_sandi,''), 'utf8')), 'hex')
  then
    return jsonb_build_object('metadata',
      jsonb_build_object('message', 'Username atau password tidak sesuai', 'code', 201));
  end if;

  update antrol_akun set terakhir_dipakai = now(), jumlah_dipakai = jumlah_dipakai + 1
   where username = r.username;

  return jsonb_build_object('metadata',
    jsonb_build_object('message', 'Ok', 'code', 200));
end $$;


-- =====================================================================
--  13. WEB SERVICE ANTROL — logika lengkap, di database
--
--  Bentuk jawaban mengikuti spesifikasi "Integrasi Sistem Antrean" FKTP:
--    sukses  { "response": {...}, "metadata": { "message":"Ok", "code":200 } }
--    gagal   {                    "metadata": { "message":"...",  "code":201 } }
--    pasien baru                                                     code 202
--
--  Perhatikan huruf kecil semua pada "metadata" — berbeda dari PCare
--  yang memakai "metaData". Salah satu huruf itu membuat BPJS membaca
--  jawaban kita sebagai gagal.
-- =====================================================================

create or replace function public.antrol_gagal(p_pesan text, p_kode int default 201)
returns jsonb
language sql immutable as $$
  select jsonb_build_object('metadata',
    jsonb_build_object('message', p_pesan, 'code', p_kode))
$$;

-- Kalimat yang dibaca pasien di Mobile JKN. Bisa diubah lewat Pengaturan.
create or replace function public.antrol_keterangan()
returns text
language sql stable as $$
  select coalesce(
    nullif(trim(konfigurasi->>'keterangan_antrol'), ''),
    'Harap datang 30 menit sebelum jam praktek. Bila nomor antrean Anda '
    'terlewat, silakan lapor ke loket pendaftaran.')
  from sys_antrean_pengaturan where id = 1
$$;

-- Pemeriksaan yang dipakai berulang oleh hampir semua endpoint.
-- Memulangkan poli_id, atau melempar pesan yang sudah berbentuk jawaban.
create or replace function public.antrol_periksa_poli_tanggal(
  p_kode_poli text, p_tanggal text, out v_poli uuid, out v_tgl date, out v_galat jsonb)
language plpgsql stable as $$
begin
  v_galat := null;

  select id into v_poli from poli
   where kode_pcare = trim(coalesce(p_kode_poli,'')) and aktif;
  if v_poli is null then
    -- Kode poli yang dikirim BPJS adalah kdPoli PCare, bukan kode kita.
    -- Selama Pengaturan → Master Poli belum diisi kode PCare-nya, jalur
    -- ini akan selalu berakhir di sini — dan pesannya harus mengatakan
    -- itu, bukan "poli tidak ditemukan" yang membuat orang mencari di
    -- daftar poli klinik.
    v_galat := public.antrol_gagal('Poli tidak ditemukan');
    return;
  end if;

  if coalesce(p_tanggal,'') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
    v_galat := public.antrol_gagal(
      'Format tanggal tidak sesuai, format yang benar adalah yyyy-mm-dd');
    return;
  end if;

  begin
    v_tgl := p_tanggal::date;
  exception when others then
    v_galat := public.antrol_gagal('Tanggal periksa tidak valid');
    return;
  end;

  if v_tgl < public.tgl_klinik() then
    v_galat := public.antrol_gagal('Tanggal periksa tidak berlaku mundur');
    return;
  end if;
end $$;

create or replace function public.antrol_periksa_kartu(p_no_kartu text)
returns jsonb
language sql immutable as $$
  select case
    when coalesce(trim(p_no_kartu), '') = ''      then public.antrol_gagal('Nomor kartu tidak boleh kosong')
    when trim(p_no_kartu) !~ '^[0-9]+$'           then public.antrol_gagal('Format nomor kartu tidak sesuai')
    when length(trim(p_no_kartu)) <> 13           then public.antrol_gagal('Nomor kartu harus 13 digit')
    else null end
$$;

create or replace function public.antrol_periksa_nik(p_nik text)
returns jsonb
language sql immutable as $$
  select case
    when coalesce(trim(p_nik), '') = ''  then public.antrol_gagal('NIK tidak boleh kosong')
    when trim(p_nik) !~ '^[0-9]+$'       then public.antrol_gagal('Format NIK tidak sesuai')
    when length(trim(p_nik)) <> 16       then public.antrol_gagal('NIK harus 16 digit')
    else null end
$$;

-- Nomor yang sedang dipanggil di satu poli, dalam bentuk teks untuk
-- Mobile JKN. Kosong (bukan null) bila belum ada panggilan — BPJS
-- membaca field ini apa adanya dan null membuatnya menampilkan "null".
create or replace function public.antrol_antrean_panggil(p_poli uuid, p_tanggal date)
returns text
language sql stable as $$
  select coalesce(
    (select a.nomor from antrean_panggilan pg
       join antrean a on a.id = pg.antrean_id
      where pg.tanggal = p_tanggal and a.poli_id = p_poli
      order by pg.id desc limit 1),
    '')
$$;


-- ---------------------------------------------------------------------
-- 13a. GET /antrean/status/{kodepoli}/{tanggal}
-- ---------------------------------------------------------------------
create or replace function public.antrol_status(p_kode_poli text, p_tanggal text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; j record; v_total int; v_sisa int; v_nama text;
begin
  select * into c from public.antrol_periksa_poli_tanggal(p_kode_poli, p_tanggal);
  if c.v_galat is not null then return c.v_galat; end if;

  select nama into v_nama from poli where id = c.v_poli;
  select * into j from public.poli_jadwal_berlaku(c.v_poli, c.v_tgl);
  if not found then
    return public.antrol_gagal('Poli ' || v_nama || ' tidak melayani pada tanggal tersebut');
  end if;

  select count(*) filter (where status not in ('BATAL','TIDAK_HADIR')),
         count(*) filter (where status in ('BELUM_HADIR','MENUNGGU','DIPANGGIL'))
    into v_total, v_sisa
    from antrean where tanggal = c.v_tgl and poli_id = c.v_poli;

  return jsonb_build_object(
    'response', jsonb_build_object(
      'namapoli',      v_nama,
      'totalantrean',  v_total::text,
      'sisaantrean',   v_sisa::text,
      'antreanpanggil', public.antrol_antrean_panggil(c.v_poli, c.v_tgl),
      'keterangan',    public.antrol_keterangan()),
    'metadata', jsonb_build_object('message', 'Ok', 'code', 200));
end $$;


-- ---------------------------------------------------------------------
-- 13b. POST /antrean  — pengambilan nomor dari Mobile JKN
--
-- Ini satu-satunya fungsi di seluruh RME yang menulis data atas perintah
-- pihak luar tanpa ada petugas klinik yang menekan tombol. Karena itu
-- setiap penolakan di bawah ditulis lengkap dengan alasannya.
-- ---------------------------------------------------------------------
create or replace function public.antrol_ambil(
  p_no_kartu text, p_nik text, p_kode_poli text, p_tanggal text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record; j record; g jsonb; a antrean;
  v_pasien uuid; v_nama_poli text; v_nama_pasien text;
  v_sisa int; v_terpakai_online int; v_jam time;
begin
  g := public.antrol_periksa_kartu(p_no_kartu); if g is not null then return g; end if;
  g := public.antrol_periksa_nik(p_nik);        if g is not null then return g; end if;

  select * into c from public.antrol_periksa_poli_tanggal(p_kode_poli, p_tanggal);
  if c.v_galat is not null then return c.v_galat; end if;

  select nama into v_nama_poli from poli where id = c.v_poli;

  -- Jadwal
  select * into j from public.poli_jadwal_berlaku(c.v_poli, c.v_tgl);
  if not found then
    return public.antrol_gagal('Pendaftaran ke ' || v_nama_poli || ' sedang tutup pada tanggal tersebut');
  end if;

  -- Jam tutup hanya berlaku untuk pemesanan HARI INI. Pemesanan untuk
  -- besok tidak boleh ditolak karena poli sudah tutup sore ini.
  if c.v_tgl = public.tgl_klinik() then
    v_jam := public.jam_klinik();
    if v_jam > j.jam_tutup_online then
      return public.antrol_gagal(
        'Pendaftaran online ke ' || v_nama_poli || ' hari ini sudah ditutup pukul ' ||
        to_char(j.jam_tutup_online, 'HH24:MI'));
    end if;
  end if;

  -- Sudah punya nomor?
  --
  -- Sengaja memeriksa SEMUA sumber, bukan hanya ONLINE. Kalau pasien
  -- sudah mengambil nomor di loket pagi ini, nomor kedua dari Mobile JKN
  -- akan membuatnya dipanggil dua kali dan menghabiskan dua kuota.
  -- Indeks unik di tabel hanya menjaga jalur online; pemeriksaan inilah
  -- yang menutup celah antar-jalur.
  if exists (
    select 1 from antrean
     where tanggal = c.v_tgl and poli_id = c.v_poli
       and no_kartu = trim(p_no_kartu)
       and status not in ('BATAL','TIDAK_HADIR'))
  then
    return public.antrol_gagal(
      'Nomor antrean hanya dapat diambil satu kali pada tanggal dan poli yang sama');
  end if;

  -- Kuota online
  v_terpakai_online := public.antrean_terpakai(c.v_poli, c.v_tgl, true);
  if v_terpakai_online >= j.kuota_online then
    return public.antrol_gagal('Kuota antrean online ke ' || v_nama_poli || ' sudah penuh');
  end if;

  -- Pasien dikenal? Dicari lewat nomor BPJS dulu, lalu NIK.
  select id, nama into v_pasien, v_nama_pasien
    from pasien
   where aktif and (no_bpjs = trim(p_no_kartu) or nik = trim(p_nik))
   order by (no_bpjs = trim(p_no_kartu)) desc
   limit 1;

  insert into antrean (tanggal, poli_id, sumber, status, tahap,
                       pasien_id, no_kartu, nik, nama_snapshot)
  values (c.v_tgl, c.v_poli, 'ONLINE', 'BELUM_HADIR', 'LOKET',
          v_pasien, trim(p_no_kartu), trim(p_nik), v_nama_pasien)
  returning * into a;

  select count(*) into v_sisa from antrean
   where tanggal = c.v_tgl and poli_id = c.v_poli
     and status in ('BELUM_HADIR','MENUNGGU','DIPANGGIL')
     and no_urut < a.no_urut;

  return jsonb_build_object(
    'response', jsonb_build_object(
      'nomorantrean',  a.nomor,
      'angkaantrean',  a.no_urut::text,
      'namapoli',      v_nama_poli,
      'sisaantrean',   v_sisa::text,
      'antreanpanggil', public.antrol_antrean_panggil(c.v_poli, c.v_tgl),
      'keterangan',    public.antrol_keterangan(),
      'kodebooking',   a.kode_booking),
    'metadata', jsonb_build_object(
      'message', 'Ok',
      -- 202 = peserta belum terdaftar sebagai pasien di sini. Nomornya
      -- TETAP terbit — pasien yang sudah berangkat tidak boleh disuruh
      -- pulang. Kode 202-lah yang memberi tahu Mobile JKN agar mengirim
      -- data dirinya lewat POST /peserta, dan petugas loket melihat
      -- nomor ini bertanda "pasien baru" di papan antrean.
      'code', case when v_pasien is null then 202 else 200 end));
end $$;


-- ---------------------------------------------------------------------
-- 13c. GET /antrean/sisapeserta/{nokartu}/{kodepoli}/{tanggal}
-- ---------------------------------------------------------------------
create or replace function public.antrol_sisa_peserta(
  p_no_kartu text, p_kode_poli text, p_tanggal text
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; g jsonb; a antrean; v_sisa int;
begin
  g := public.antrol_periksa_kartu(p_no_kartu); if g is not null then return g; end if;

  select * into c from public.antrol_periksa_poli_tanggal(p_kode_poli, p_tanggal);
  if c.v_galat is not null then return c.v_galat; end if;

  select * into a from antrean
   where tanggal = c.v_tgl and poli_id = c.v_poli
     and no_kartu = trim(p_no_kartu)
     and status not in ('BATAL','TIDAK_HADIR')
   order by no_urut limit 1;

  if not found then return public.antrol_gagal('Antrean tidak ditemukan'); end if;

  select count(*) into v_sisa from antrean
   where tanggal = c.v_tgl and poli_id = c.v_poli
     and status in ('BELUM_HADIR','MENUNGGU','DIPANGGIL')
     and no_urut < a.no_urut;

  return jsonb_build_object(
    'response', jsonb_build_object(
      'nomorantrean',  a.nomor,
      'namapoli',      (select nama from poli where id = c.v_poli),
      'sisaantrean',   v_sisa::text,
      'antreanpanggil', public.antrol_antrean_panggil(c.v_poli, c.v_tgl),
      'keterangan',    public.antrol_keterangan()),
    'metadata', jsonb_build_object('message', 'Ok', 'code', 200));
end $$;


-- ---------------------------------------------------------------------
-- 13d. PUT /antrean/batal
-- ---------------------------------------------------------------------
create or replace function public.antrol_batal(
  p_no_kartu text, p_kode_poli text, p_tanggal text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; g jsonb; a antrean;
begin
  g := public.antrol_periksa_kartu(p_no_kartu); if g is not null then return g; end if;

  select * into c from public.antrol_periksa_poli_tanggal(p_kode_poli, p_tanggal);
  if c.v_galat is not null then return c.v_galat; end if;

  select * into a from antrean
   where tanggal = c.v_tgl and poli_id = c.v_poli
     and no_kartu = trim(p_no_kartu)
     and status not in ('BATAL','TIDAK_HADIR')
   order by no_urut limit 1;

  if not found then return public.antrol_gagal('Antrean tidak ditemukan'); end if;

  -- Pasien yang sudah berdiri di loket tidak boleh dihapus dari sistem
  -- oleh ponselnya sendiri. Kalau ia benar-benar ingin batal, petugaslah
  -- yang membatalkan — dan kunjungannya juga harus dibereskan.
  if a.kunjungan_id is not null or a.status in ('DILAYANI','SELESAI') then
    return public.antrol_gagal(
      'Antrean sudah dilayani di faskes dan tidak dapat dibatalkan dari aplikasi');
  end if;

  update antrean set status = 'BATAL',
         alasan_batal = 'Dibatalkan peserta lewat Mobile JKN',
         waktu_selesai = now()
   where id = a.id;

  return jsonb_build_object('metadata',
    jsonb_build_object('message', 'Ok', 'code', 200));
end $$;


-- ---------------------------------------------------------------------
-- 13e. POST /peserta  — data pasien baru dari Mobile JKN
--
-- Sengaja TIDAK membuat baris pasien secara otomatis. Nomor rekam medis
-- adalah identitas seumur hidup di klinik ini; menerbitkannya dari data
-- yang belum pernah dilihat petugas adalah cara tercepat melahirkan
-- pasien kembar — satu dari Mobile JKN, satu lagi saat orangnya datang
-- dan petugas tidak menemukan namanya karena ejaannya beda.
--
-- Yang dilakukan: menyimpan datanya di antrean sebagai calon, supaya
-- petugas loket melihatnya lengkap dan tinggal menekan "Daftarkan
-- sebagai pasien baru" — satu klik, dengan mata manusia di atasnya.
-- ---------------------------------------------------------------------
create or replace function public.antrol_peserta_baru(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare g jsonb; v_kartu text; v_nik text; v_nama text; v_ada int;
begin
  v_kartu := trim(coalesce(p_data->>'nomorkartu',''));
  v_nik   := trim(coalesce(p_data->>'nik',''));
  v_nama  := nullif(trim(coalesce(p_data->>'nama','')), '');

  g := public.antrol_periksa_kartu(v_kartu); if g is not null then return g; end if;
  g := public.antrol_periksa_nik(v_nik);     if g is not null then return g; end if;
  if v_nama is null then return public.antrol_gagal('Nama tidak boleh kosong'); end if;

  update antrean set
      nama_snapshot = coalesce(nama_snapshot, v_nama),
      nik           = coalesce(nullif(nik,''), v_nik),
      catatan       = coalesce(catatan, 'Data peserta dari Mobile JKN: ' ||
                        v_nama || ', ' || coalesce(p_data->>'jeniskelamin','-') || ', ' ||
                        coalesce(p_data->>'tanggallahir','-') || '. ' ||
                        coalesce(p_data->>'alamat',''))
    where no_kartu = v_kartu
      and tanggal >= public.tgl_klinik()
      and status not in ('BATAL','TIDAK_HADIR')
      and pasien_id is null;
  get diagnostics v_ada = row_count;

  if v_ada = 0 then
    return public.antrol_gagal('Antrean untuk peserta ini tidak ditemukan');
  end if;

  return jsonb_build_object('metadata',
    jsonb_build_object('message', 'Ok', 'code', 200));
end $$;


-- =====================================================================
--  14. LAYAR TUNGGU
--
--  Layar dipasang di ruang tunggu dan menyala seharian. Ia TIDAK login.
--  Yang dibawanya hanya token panjang di URL, dan fungsi di bawah adalah
--  satu-satunya hal yang bisa dilakukannya.
--
--  Keputusan Arthur: layar hanya menampilkan NOMOR — tidak ada nama,
--  tidak ada nomor rekam medis, tidak ada diagnosa. Itu bukan sekadar
--  sopan santun, itu yang membuat token ini nyaris tidak berisiko:
--  seandainya tautannya tersebar pun, yang bocor adalah "A-014 sedang
--  dipanggil ke Poli Umum" — kalimat yang memang diteriakkan di ruang
--  tunggu. Karena itu fungsi ini secara struktural tidak menyentuh
--  tabel pasien sama sekali.
-- =====================================================================

create or replace function public.antrean_layar(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_token text; v_tgl date; v_konf jsonb; v_hasil jsonb;
begin
  select token_layar, konfigurasi into v_token, v_konf
    from sys_antrean_pengaturan where id = 1;

  -- Token kosong berarti fitur layar belum dinyalakan. Tanpa penjagaan
  -- ini, memanggil fungsi dengan token '' akan cocok dengan token yang
  -- belum diisi — dan layar terbuka untuk siapa saja.
  if coalesce(v_token, '') = '' or length(coalesce(p_token,'')) < 16
     or p_token is distinct from v_token then
    return jsonb_build_object('galat', 'Token layar tidak dikenal.');
  end if;

  v_tgl := public.tgl_klinik();

  select jsonb_build_object(
    'tanggal',   v_tgl,
    'waktu',     to_char(now() at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'klinik',    (select nama from faskes where id = 1),
    'judul',     coalesce(nullif(v_konf->>'judul_layar',''), 'Antrean Pasien'),
    'teks_berjalan', coalesce(v_konf->>'teks_berjalan', ''),

    -- Panggilan terbaru, urut dari yang paling akhir. Layar membunyikan
    -- yang id-nya lebih besar daripada yang sudah pernah dibunyikan.
    'panggilan', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'nomor', x.nomor, 'tujuan', x.tujuan,
               'poli', x.nama_poli, 'waktu', x.waktu, 'ulang', x.urutan))
        from (select pg.id, a.nomor, pg.tujuan, po.nama as nama_poli,
                     to_char(pg.waktu at time zone 'Asia/Makassar', 'HH24:MI') as waktu,
                     pg.urutan
                from antrean_panggilan pg
                join antrean a on a.id = pg.antrean_id
                join poli po   on po.id = a.poli_id
               where pg.tanggal = v_tgl
               order by pg.id desc limit 8) x), '[]'::jsonb),

    'poli', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nama',      po.nama,
               'prefix',    po.prefix_antrean,
               'dipanggil', public.antrol_antrean_panggil(po.id, v_tgl),
               'berikut',   coalesce((
                 select jsonb_agg(n.nomor order by n.no_urut)
                   from (select nomor, no_urut from antrean
                          where tanggal = v_tgl and poli_id = po.id
                            and status in ('MENUNGGU','BELUM_HADIR')
                          order by no_urut limit 4) n), '[]'::jsonb),
               'sisa',      (select count(*) from antrean
                              where tanggal = v_tgl and poli_id = po.id
                                and status in ('MENUNGGU','BELUM_HADIR','DIPANGGIL')),
               'selesai',   (select count(*) from antrean
                              where tanggal = v_tgl and poli_id = po.id
                                and status = 'SELESAI'))
             order by po.urutan)
        from poli po where po.aktif), '[]'::jsonb)
  ) into v_hasil;

  return v_hasil;
end $$;

comment on function public.antrean_layar(text) is
  'Data layar tunggu. Hanya nomor antrean — tidak pernah memulangkan nama,
   nomor rekam medis, atau data medis apa pun. Boleh dipanggil tanpa login.';

-- Inilah satu-satunya hak yang diberikan kepada pengunjung tanpa login.
--
-- `usage on schema public` untuk anon ditulis ulang di sini dengan sengaja.
-- Supabase memberikannya secara bawaan, tetapi 02_rls.sql hanya menyebut
-- `authenticated` — dan berkas SQL ini harus tetap benar bila dijalankan di
-- PostgreSQL lain, atau di project yang haknya pernah dirapikan. Tanpa baris
-- ini layar tunggu gagal dengan "permission denied for schema public": kelas
-- galat yang sama dengan "permission denied for table apotek_batch" dulu,
-- dan yang muncul di TV ruang tunggu, bukan di layar siapa pun yang menguji.
grant usage on schema public to anon;
grant execute on function public.antrean_layar(text) to anon, authenticated;
grant execute on function public.tgl_klinik() to anon;
grant execute on function public.antrol_antrean_panggil(uuid, date) to anon;

-- Membuat / mengganti token layar. Tautan lama langsung mati.
create or replace function public.antrean_token_baru(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.boleh_antrean_pengaturan() then
    raise exception 'Anda tidak punya izin mengganti token layar.';
  end if;
  if length(coalesce(p_token,'')) < 24 then
    raise exception 'Token layar minimal 24 karakter.';
  end if;
  update sys_antrean_pengaturan
     set token_layar = p_token, updated_at = now(), updated_by = auth.uid()
   where id = 1;
  return p_token;
end $$;


-- =====================================================================
--  15. HAK AKSES
--
--  Tabel dan view BARU tidak mewarisi GRANT dari 02_rls.sql — pelajaran
--  dari "permission denied for table apotek_batch" dan uji 20b pada
--  modul pemeriksaan. Ditulis eksplisit di sini.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['poli_jadwal','poli_libur','antrean','antrean_panggilan']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);

    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);
  end loop;
end $$;

grant usage, select on sequence antrean_panggilan_id_seq to authenticated;

-- Jadwal & kuota: kode `antrean_pengaturan`.
do $$
declare t text;
begin
  foreach t in array array['poli_jadwal','poli_libur']
  loop
    execute format('drop policy if exists %1$s_kelola on %1$s', t);
    execute format($f$create policy %1$s_kelola on %1$s for all to authenticated
                     using (public.boleh_antrean_pengaturan())
                     with check (public.boleh_antrean_pengaturan())$f$, t);
  end loop;
end $$;

-- Antrean: siapa pun yang melayani pasien boleh menggerakkannya.
-- Apoteker dan kasir sengaja ikut — merekalah yang paling sering melihat
-- pasien menunggu tanpa ada yang memanggil.
drop policy if exists antrean_tulis on antrean;
create policy antrean_tulis on antrean for insert
  to authenticated
  with check (public.boleh_antrean_buat());

drop policy if exists antrean_ubah on antrean;
create policy antrean_ubah on antrean for update
  to authenticated
  using (public.saya_staf()) with check (public.saya_staf());

drop policy if exists antrean_hapus on antrean;
create policy antrean_hapus on antrean for delete
  to authenticated using (public.boleh_antrean_hapus());

drop policy if exists panggilan_tulis on antrean_panggilan;
create policy panggilan_tulis on antrean_panggilan for insert
  to authenticated with check (public.saya_staf());

-- Riwayat panggilan tidak boleh disunting: ia bukti bahwa pasien memang
-- pernah dipanggil sebelum dinyatakan tidak hadir.
drop policy if exists panggilan_kunci on antrean_panggilan;
create policy panggilan_kunci on antrean_panggilan for update
  to authenticated using (false) with check (false);

-- Pengaturan antrean: dibaca semua staf (halaman antrean butuh
-- keterangan & estimasi), diubah kode `antrean_pengaturan`.
alter table sys_antrean_pengaturan enable row level security;
grant select, insert, update on sys_antrean_pengaturan to authenticated;

drop policy if exists antrean_atur_baca on sys_antrean_pengaturan;
create policy antrean_atur_baca on sys_antrean_pengaturan for select
  to authenticated using (public.saya_staf());

drop policy if exists antrean_atur_kelola on sys_antrean_pengaturan;
create policy antrean_atur_kelola on sys_antrean_pengaturan for all
  to authenticated
  using (public.boleh_antrean_pengaturan())
  with check (public.boleh_antrean_pengaturan());

-- Log Antrol: kode `antrol_log`, ditulis hanya Edge Function.
alter table antrol_log enable row level security;
grant select on antrol_log to authenticated;
revoke insert, update, delete on antrol_log from authenticated, anon;

drop policy if exists antrol_log_baca on antrol_log;
create policy antrol_log_baca on antrol_log for select
  to authenticated using (public.boleh_antrol_log());

-- Akun Antrol: hanya lewat fungsi. Tabelnya sudah di-revoke di atas;
-- view-nya perlu RLS sendiri karena security_invoker meneruskan hak
-- pemanggil ke tabel yang tidak boleh dibacanya. Karena itu view ini
-- dibuat security definer — satu-satunya di modul ini — dan isinya
-- memang tidak memuat rahasia apa pun.
drop view if exists v_antrol_akun;
create view v_antrol_akun with (security_invoker = false) as
select username, keterangan, aktif, dibuat_pada, terakhir_dipakai, jumlah_dipakai
  from antrol_akun
 where public.boleh_antrean_pengaturan();

grant select on v_antrol_akun to authenticated;
grant select on v_antrean_hari_ini, v_antrean_kuota to authenticated;

grant execute on function public.antrean_panggil(uuid, text)          to authenticated;
grant execute on function public.antrean_checkin(uuid, uuid, uuid, cara_bayar_t, text) to authenticated;
grant execute on function public.antrean_mulai_layan(uuid)            to authenticated;
grant execute on function public.antrean_lewat(uuid, text)            to authenticated;
grant execute on function public.antrean_batal(uuid, text)            to authenticated;
grant execute on function public.antrean_urut_berikut(uuid, date)     to authenticated;
grant execute on function public.antrean_terpakai(uuid, date, boolean) to authenticated;
grant execute on function public.poli_jadwal_berlaku(uuid, date)      to authenticated;
grant execute on function public.antrol_akun_simpan(text, text, text) to authenticated;
grant execute on function public.antrol_akun_hapus(text)              to authenticated;
grant execute on function public.antrean_token_baru(text)             to authenticated;
grant execute on function public.antrol_keterangan()                  to authenticated;

-- Fungsi antrol_* lainnya SENGAJA tidak diberikan ke authenticated:
-- yang memakainya hanya Edge Function dengan service_role. Peramban staf
-- tidak punya alasan menerbitkan nomor antrean "atas nama Mobile JKN".


-- =====================================================================
--  16. ISIAN AWAL
--  Jadwal bawaan: Senin–Sabtu pagi, Senin–Jumat sore, Minggu tutup.
--  Angka kuota sengaja dibuat longgar — kuota yang terlalu ketat pada
--  hari pertama membuat pasien ditolak Mobile JKN sebelum ada seorang
--  pun di klinik yang tahu halaman pengaturannya di mana.
-- =====================================================================

insert into poli_jadwal (poli_id, hari, sesi, jam_buka, jam_tutup, jam_tutup_online, kuota, kuota_online)
select po.id, h.hari, 1, '08:00'::time, '12:00'::time, '11:00'::time, 40, 20
  from poli po cross join (select generate_series(1, 6) as hari) h
 where po.aktif
on conflict (poli_id, hari, sesi) do nothing;

insert into poli_jadwal (poli_id, hari, sesi, jam_buka, jam_tutup, jam_tutup_online, kuota, kuota_online)
select po.id, h.hari, 2, '16:00'::time, '20:00'::time, '19:00'::time, 30, 15
  from poli po cross join (select generate_series(1, 5) as hari) h
 where po.aktif
on conflict (poli_id, hari, sesi) do nothing;

update sys_antrean_pengaturan
   set konfigurasi = konfigurasi || jsonb_build_object(
     'judul_layar',         'Antrean Pasien',
     'teks_berjalan',       'Selamat datang di Klinik Pratama Imanuel. '
                            'Mohon menunggu nomor antrean Anda dipanggil.',
     'suara_aktif',         true,
     'menit_per_pasien',    10,
     'tampilkan_estimasi',  true)
 where id = 1 and not (konfigurasi ? 'judul_layar');

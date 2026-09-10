-- =====================================================================
--  RME KLINIK IMANUEL - ROW LEVEL SECURITY & HAK AKSES
--  Jalankan SETELAH 01_schema.sql
--
--  Prinsip:
--   - Tidak ada data medis yang bisa dibaca tanpa login.
--   - Hak tulis dibatasi sesuai peran (admin/perawat/dokter/apoteker/master).
--   - Kredensial bridging TIDAK disimpan di tabel yang bisa dibaca browser.
--
--  9 Sep 2026 — HAK AKSES JADI BISA DIATUR (bukan lagi tetap di kode):
--  peran diganti nama (dulu 'admin' -> 'master', dulu 'pendaftaran' ->
--  'admin' — lihat sql/20_ganti_nama_peran.sql untuk migrasi database yang
--  sudah berjalan), dan setiap pemeriksaan "peran X boleh Y" yang dulu
--  ditulis tetap di kebijakan (`peran_saya_salah_satu('admin','pendaftaran',...)`)
--  sekarang lewat satu fungsi generik `hak_akses_cek(kode)` yang membaca
--  tabel `hak_akses` — bisa diubah master lewat Pengaturan -> Hak Akses,
--  tanpa perlu SQL baru. `master` SELALU lolos apa pun isi tabelnya (jaring
--  pengaman: master tidak boleh bisa mengunci dirinya sendiri).
--
--  Pola penamaan fungsi `boleh_<kode>()` dipertahankan sama seperti yang
--  sudah ada di proyek ini (boleh_apotek, boleh_kasir, boleh_surat, dst di
--  berkas modul masing-masing) — hanya ISI fungsinya yang berubah dari
--  daftar peran tetap menjadi `hak_akses_cek('<kode>')`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fungsi bantu: ambil peran pengguna yang sedang login.
-- SECURITY DEFINER agar tidak terjadi rekursi saat mengevaluasi policy.
-- ---------------------------------------------------------------------
create or replace function public.peran_saya()
returns peran_pegawai
language sql stable security definer set search_path = public
as $$ select peran from public.pegawai where id = auth.uid() and aktif $$;

create or replace function public.saya_staf()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.pegawai where id = auth.uid() and aktif) $$;

create or replace function public.peran_saya_salah_satu(variadic peran_pegawai[])
returns boolean
language sql stable security definer set search_path = public
as $$ select public.peran_saya() = any($1) $$;

grant execute on function public.peran_saya()   to authenticated;
grant execute on function public.saya_staf()    to authenticated;
grant execute on function public.peran_saya_salah_satu(variadic peran_pegawai[]) to authenticated;

-- ---------------------------------------------------------------------
-- HAK AKSES — tabel & fungsi generik.
--
-- Satu baris = satu peran boleh/tidak boleh melakukan satu kode aksi.
-- Tidak ada baris untuk `master` sama sekali — master selalu lolos lewat
-- jaring pengaman di hak_akses_cek(), supaya isi tabel ini tidak pernah
-- bisa mengunci satu-satunya akun yang bisa memperbaikinya.
-- ---------------------------------------------------------------------
create table if not exists public.hak_akses (
  kode        text not null,
  peran       peran_pegawai not null,
  diizinkan   boolean not null default false,
  diubah_oleh uuid references public.pegawai(id),
  diubah_pada timestamptz not null default now(),
  primary key (kode, peran)
);

comment on table public.hak_akses is
  'Matriks kode-aksi x peran, diatur master lewat Pengaturan -> Hak Akses. '
  'Diisi lewat hak_akses_cek(kode) di dalam fungsi boleh_<kode>() masing-masing '
  'modul. master tidak butuh baris di sini — selalu lolos.';

alter table public.hak_akses enable row level security;

-- Tabel baru tidak mewarisi GRANT dari sini kalau dibuat SETELAH baris
-- "grant ... on all tables" di bawah — pelajaran yang sudah berkali-kali
-- terjadi di proyek ini. Ditulis eksplisit supaya aman di urutan mana pun.
grant select, insert, update, delete on public.hak_akses to authenticated;

drop policy if exists hak_akses_baca on public.hak_akses;
create policy hak_akses_baca on public.hak_akses for select
  to authenticated using (public.saya_staf());

-- Mengubah matriks: SENGAJA hardcode master saja, TIDAK lewat hak_akses_cek.
-- Kalau ini sendiri bisa diatur lewat matriks yang diaturnya sendiri, master
-- bisa tidak sengaja mencabut akses dirinya ke satu-satunya tempat
-- memperbaikinya, dan jalan keluarnya hanya lewat SQL Editor Supabase.
drop policy if exists hak_akses_kelola on public.hak_akses;
create policy hak_akses_kelola on public.hak_akses for all
  to authenticated
  using (public.peran_saya() = 'master')
  with check (public.peran_saya() = 'master');

create or replace function public.hak_akses_cek(p_kode text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.peran_saya() = 'master'
      or exists (
        select 1 from public.hak_akses
         where kode = p_kode and peran = public.peran_saya() and diizinkan
      )
$$;

grant execute on function public.hak_akses_cek(text) to authenticated;

-- View tipis untuk klien: daftar kode yang diizinkan untuk peran SENDIRI
-- (dimuat sekali saat masuk, lihat js/db.js -> hakAksesSaya()). Untuk
-- master, isinya sengaja kosong — App.boleh() di klien juga punya jaring
-- pengaman "master selalu boleh", sama seperti di database.
create or replace view public.v_hak_akses_saya with (security_invoker = true) as
select kode from public.hak_akses
 where peran = public.peran_saya() and diizinkan;

grant select on public.v_hak_akses_saya to authenticated;

-- ---------------------------------------------------------------------
-- Pintasan hak akses per aksi/modul yang dipakai kebijakan di berkas ini.
-- Pola nama & bentuk SAMA seperti boleh_apotek()/boleh_kasir()/dkk di
-- berkas modul masing-masing (08,09,11,13,16) — supaya satu pola dipakai
-- di seluruh proyek, bukan dua cara berbeda.
-- ---------------------------------------------------------------------
create or replace function public.boleh_master_data() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('master_data') $$;

create or replace function public.boleh_pasien_simpan() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('pasien_simpan') $$;

create or replace function public.boleh_pasien_hapus() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('pasien_hapus') $$;

create or replace function public.boleh_pasien_alergi() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('pasien_alergi') $$;

create or replace function public.boleh_kunjungan_daftar() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('kunjungan_daftar') $$;

create or replace function public.boleh_kunjungan_ubah() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('kunjungan_ubah') $$;

create or replace function public.boleh_kunjungan_hapus() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('kunjungan_hapus') $$;

create or replace function public.boleh_kajian() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('kajian') $$;

create or replace function public.boleh_periksa() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('periksa') $$;

create or replace function public.boleh_audit_lihat() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('audit_lihat') $$;

create or replace function public.boleh_antrol_log() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('antrol_log') $$;

grant execute on function
  public.boleh_master_data(), public.boleh_pasien_simpan(), public.boleh_pasien_hapus(),
  public.boleh_pasien_alergi(), public.boleh_kunjungan_daftar(), public.boleh_kunjungan_ubah(),
  public.boleh_kunjungan_hapus(), public.boleh_kajian(), public.boleh_periksa(),
  public.boleh_audit_lihat(), public.boleh_antrol_log()
  to authenticated;

-- ---------------------------------------------------------------------
-- Hak akses tabel.
-- Supabase biasanya memberi GRANT ini otomatis, tetapi kita tulis eksplisit
-- agar skrip tetap benar bila dijalankan di PostgreSQL lain.
-- RLS di bawahlah yang benar-benar menyaring baris mana yang boleh dilihat.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Kredensial bridging: browser tidak boleh menyentuhnya sama sekali.
revoke all on bridging_config from authenticated, anon;

-- Audit log hanya boleh dibaca (ditulis oleh trigger SECURITY DEFINER),
-- dan RLS membatasi pembacanya lewat kode `audit_lihat`.
revoke insert, update, delete on audit_log from authenticated;

-- Master ICD-10 & obat boleh dibaca semua staf; mengubah butuh kode `master_data`.

-- ---------------------------------------------------------------------
-- Aktifkan RLS di semua tabel
-- ---------------------------------------------------------------------
alter table faskes            enable row level security;
alter table poli              enable row level security;
alter table pegawai           enable row level security;
alter table icd10             enable row level security;
alter table obat              enable row level security;
alter table signa             enable row level security;
alter table pasien            enable row level security;
alter table pasien_alergi     enable row level security;
alter table kunjungan         enable row level security;
alter table kajian_awal       enable row level security;
alter table pemeriksaan       enable row level security;
alter table diagnosa          enable row level security;
alter table resep             enable row level security;
alter table resep_item        enable row level security;
alter table addendum          enable row level security;
alter table audit_log         enable row level security;
alter table bridging_log      enable row level security;
alter table bridging_antrean  enable row level security;
alter table bridging_config   enable row level security;

-- ---------------------------------------------------------------------
-- A. MASTER: semua staf boleh baca, kode `master_data` boleh ubah
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['faskes','poli','icd10','obat','signa']
  loop
    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);

    execute format('drop policy if exists %1$s_kelola on %1$s', t);
    execute format($f$create policy %1$s_kelola on %1$s for all
                     to authenticated
                     using (public.boleh_master_data())
                     with check (public.boleh_master_data())$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- B. PEGAWAI
--    Kelola akun & ubah peran SENGAJA hardcode master, TIDAK lewat kode
--    hak akses yang bisa diatur — sama alasannya dengan hak_akses_kelola
--    di atas: peran mana pun yang diberi izin ini bisa menaikkan dirinya
--    sendiri jadi master lewat halaman Pengguna.
-- ---------------------------------------------------------------------
drop policy if exists pegawai_baca on pegawai;
create policy pegawai_baca on pegawai for select
  to authenticated using (public.saya_staf() or id = auth.uid());

drop policy if exists pegawai_ubah_diri on pegawai;
create policy pegawai_ubah_diri on pegawai for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists pegawai_kelola on pegawai;
create policy pegawai_kelola on pegawai for all
  to authenticated
  using (public.peran_saya() = 'master')
  with check (public.peran_saya() = 'master');

-- ---------------------------------------------------------------------
-- C. PASIEN: semua staf klinis boleh baca; tulis diatur kode hak akses
-- ---------------------------------------------------------------------
drop policy if exists pasien_baca on pasien;
create policy pasien_baca on pasien for select
  to authenticated using (public.saya_staf());

drop policy if exists pasien_tulis on pasien;
create policy pasien_tulis on pasien for insert
  to authenticated
  with check (public.boleh_pasien_simpan());

drop policy if exists pasien_ubah on pasien;
create policy pasien_ubah on pasien for update
  to authenticated
  using (public.boleh_pasien_simpan())
  with check (public.boleh_pasien_simpan());

drop policy if exists pasien_hapus on pasien;
create policy pasien_hapus on pasien for delete
  to authenticated using (public.boleh_pasien_hapus());

drop policy if exists alergi_baca on pasien_alergi;
create policy alergi_baca on pasien_alergi for select
  to authenticated using (public.saya_staf());

drop policy if exists alergi_tulis on pasien_alergi;
create policy alergi_tulis on pasien_alergi for all
  to authenticated
  using (public.boleh_pasien_alergi())
  with check (public.boleh_pasien_alergi());

-- ---------------------------------------------------------------------
-- D. KUNJUNGAN
-- ---------------------------------------------------------------------
drop policy if exists kunjungan_baca on kunjungan;
create policy kunjungan_baca on kunjungan for select
  to authenticated using (public.saya_staf());

drop policy if exists kunjungan_daftar on kunjungan;
create policy kunjungan_daftar on kunjungan for insert
  to authenticated
  with check (public.boleh_kunjungan_daftar());

drop policy if exists kunjungan_ubah on kunjungan;
create policy kunjungan_ubah on kunjungan for update
  to authenticated
  using (public.boleh_kunjungan_ubah())
  with check (public.boleh_kunjungan_ubah());

drop policy if exists kunjungan_hapus on kunjungan;
create policy kunjungan_hapus on kunjungan for delete
  to authenticated using (public.boleh_kunjungan_hapus());

-- ---------------------------------------------------------------------
-- E. KAJIAN AWAL: kode `kajian` (perawat & dokter secara bawaan)
-- ---------------------------------------------------------------------
drop policy if exists kajian_baca on kajian_awal;
create policy kajian_baca on kajian_awal for select
  to authenticated using (public.saya_staf());

drop policy if exists kajian_tulis on kajian_awal;
create policy kajian_tulis on kajian_awal for all
  to authenticated
  using (public.boleh_kajian())
  with check (public.boleh_kajian());

-- ---------------------------------------------------------------------
-- F. PEMERIKSAAN, DIAGNOSA, RESEP: kode `periksa` (dokter secara bawaan)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pemeriksaan','diagnosa','resep','resep_item','addendum']
  loop
    execute format('drop policy if exists %1$s_baca on %1$s', t);
    execute format($f$create policy %1$s_baca on %1$s for select
                     to authenticated using (public.saya_staf())$f$, t);

    execute format('drop policy if exists %1$s_tulis on %1$s', t);
    execute format($f$create policy %1$s_tulis on %1$s for all
                     to authenticated
                     using (public.boleh_periksa())
                     with check (public.boleh_periksa())$f$, t);
  end loop;
end $$;

-- Apoteker menandai resep sudah diserahkan: kebijakannya sendiri dipindah
-- ke sql/08_apotek.sql (bersebelahan dengan boleh_apotek(), yang baru ada
-- setelah berkas ini) supaya sekalian konsisten pakai kode `apotek` —
-- lihat catatan di sana soal kenapa ini dulu memakai 'apoteker' saja.

-- ---------------------------------------------------------------------
-- G. AUDIT & BRIDGING
-- ---------------------------------------------------------------------
drop policy if exists audit_baca on audit_log;
create policy audit_baca on audit_log for select
  to authenticated using (public.boleh_audit_lihat());
-- Penulisan audit_log dilakukan oleh trigger SECURITY DEFINER, bukan oleh klien.

drop policy if exists bridging_log_baca on bridging_log;
create policy bridging_log_baca on bridging_log for select
  to authenticated using (public.boleh_antrol_log());

drop policy if exists antrean_baca on bridging_antrean;
create policy antrean_baca on bridging_antrean for select
  to authenticated using (public.saya_staf());

drop policy if exists antrean_tulis on bridging_antrean;
create policy antrean_tulis on bridging_antrean for insert
  to authenticated with check (public.saya_staf());

-- PENTING: bridging_config sengaja TIDAK diberi policy untuk role `authenticated`.
-- Artinya browser tidak akan pernah bisa membacanya. Hanya Edge Function
-- (service_role) yang bisa. Kredensial PCare/SatuSehat disimpan sebagai
-- Secret di Edge Function, bukan di dalam tabel ini.

-- ---------------------------------------------------------------------
-- H. Otomatis buat baris `pegawai` saat user baru dibuat di Supabase Auth
--    Peran bawaan sekarang 'admin' (dulu 'pendaftaran') — staf loket,
--    peran paling umum untuk akun yang baru dibuat sebelum diatur manual.
-- ---------------------------------------------------------------------
create or replace function public.buat_profil_pegawai()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.pegawai (id, nama, peran)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nama', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'peran')::peran_pegawai, 'admin')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_auth_user_baru on auth.users;
create trigger trg_auth_user_baru after insert on auth.users
for each row execute function public.buat_profil_pegawai();

-- =====================================================================
--  I. ISIAN AWAL MATRIKS HAK AKSES
--
--  Mencerminkan PERSIS perilaku yang berlaku sebelum fitur ini ada, supaya
--  tidak ada perubahan perilaku di hari pertama migrasi. `on conflict do
--  nothing` supaya AMAN dijalankan ulang — tidak menimpa perubahan yang
--  sudah dibuat master lewat Pengaturan -> Hak Akses.
--
--  master TIDAK perlu baris di sini sama sekali (selalu lolos).
-- =====================================================================
insert into public.hak_akses (kode, peran, diizinkan) values
  ('pasien_simpan',     'admin',    true),
  ('pasien_simpan',     'perawat',  true),
  ('pasien_simpan',     'dokter',   true),
  ('pasien_alergi',     'perawat',  true),
  ('pasien_alergi',     'dokter',   true),
  ('pasien_alergi',     'apoteker', true),
  ('kunjungan_daftar',  'admin',    true),
  ('kunjungan_daftar',  'perawat',  true),
  ('kunjungan_daftar',  'dokter',   true),
  ('kunjungan_ubah',    'admin',    true),
  ('kunjungan_ubah',    'perawat',  true),
  ('kunjungan_ubah',    'dokter',   true),
  ('kunjungan_ubah',    'apoteker', true),
  ('kajian',            'perawat',  true),
  ('kajian',            'dokter',   true),
  ('periksa',           'dokter',   true),
  ('antrol_log',        'admin',    true),
  -- Menu (js/app.js) — sama seperti tabel di atas: hanya kode yang dulu
  -- terbuka untuk peran selain admin lama yang perlu baris di sini.
  ('menu_pendaftaran',  'admin',    true),
  ('menu_pendaftaran',  'perawat',  true),
  ('menu_pendaftaran',  'dokter',   true),
  ('menu_kasir',        'admin',    true),
  ('menu_laporan',      'dokter',   true),
  ('menu_laporan',      'admin',    true)
on conflict (kode, peran) do nothing;
-- Catatan: baris ('menu_kasir','kasir') SENGAJA tidak di sini — nilai enum
-- 'kasir' belum ada sampai sql/07_peran_kasir.sql dijalankan (nomor urut
-- SETELAH berkas ini). Baris itu ada di sql/09_kasir.sql, ditambahkan
-- setelah 07 dijalankan.

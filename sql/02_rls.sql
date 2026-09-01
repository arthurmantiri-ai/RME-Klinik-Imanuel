-- =====================================================================
--  RME KLINIK IMANUEL - ROW LEVEL SECURITY & HAK AKSES
--  Jalankan SETELAH 01_schema.sql
--
--  Prinsip:
--   - Tidak ada data medis yang bisa dibaca tanpa login.
--   - Hak tulis dibatasi sesuai peran (pendaftaran/perawat/dokter/apoteker/admin).
--   - Kredensial bridging TIDAK disimpan di tabel yang bisa dibaca browser.
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
-- dan RLS membatasi pembacanya hanya admin.
revoke insert, update, delete on audit_log from authenticated;

-- Master ICD-10 & obat boleh dibaca, tapi hanya admin yang mengubah (diatur RLS).

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
-- A. MASTER: semua staf boleh baca, hanya admin boleh ubah
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
                     using (public.peran_saya() = 'admin')
                     with check (public.peran_saya() = 'admin')$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- B. PEGAWAI
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
  using (public.peran_saya() = 'admin')
  with check (public.peran_saya() = 'admin');

-- ---------------------------------------------------------------------
-- C. PASIEN: semua staf klinis boleh baca; tulis oleh pendaftaran/perawat/dokter/admin
-- ---------------------------------------------------------------------
drop policy if exists pasien_baca on pasien;
create policy pasien_baca on pasien for select
  to authenticated using (public.saya_staf());

drop policy if exists pasien_tulis on pasien;
create policy pasien_tulis on pasien for insert
  to authenticated
  with check (public.peran_saya_salah_satu('admin','pendaftaran','perawat','dokter'));

drop policy if exists pasien_ubah on pasien;
create policy pasien_ubah on pasien for update
  to authenticated
  using (public.peran_saya_salah_satu('admin','pendaftaran','perawat','dokter'))
  with check (public.peran_saya_salah_satu('admin','pendaftaran','perawat','dokter'));

drop policy if exists pasien_hapus on pasien;
create policy pasien_hapus on pasien for delete
  to authenticated using (public.peran_saya() = 'admin');

drop policy if exists alergi_baca on pasien_alergi;
create policy alergi_baca on pasien_alergi for select
  to authenticated using (public.saya_staf());

drop policy if exists alergi_tulis on pasien_alergi;
create policy alergi_tulis on pasien_alergi for all
  to authenticated
  using (public.peran_saya_salah_satu('admin','perawat','dokter','apoteker'))
  with check (public.peran_saya_salah_satu('admin','perawat','dokter','apoteker'));

-- ---------------------------------------------------------------------
-- D. KUNJUNGAN
-- ---------------------------------------------------------------------
drop policy if exists kunjungan_baca on kunjungan;
create policy kunjungan_baca on kunjungan for select
  to authenticated using (public.saya_staf());

drop policy if exists kunjungan_daftar on kunjungan;
create policy kunjungan_daftar on kunjungan for insert
  to authenticated
  with check (public.peran_saya_salah_satu('admin','pendaftaran','perawat','dokter'));

drop policy if exists kunjungan_ubah on kunjungan;
create policy kunjungan_ubah on kunjungan for update
  to authenticated
  using (public.peran_saya_salah_satu('admin','pendaftaran','perawat','dokter','apoteker'))
  with check (public.peran_saya_salah_satu('admin','pendaftaran','perawat','dokter','apoteker'));

drop policy if exists kunjungan_hapus on kunjungan;
create policy kunjungan_hapus on kunjungan for delete
  to authenticated using (public.peran_saya() = 'admin');

-- ---------------------------------------------------------------------
-- E. KAJIAN AWAL: perawat & dokter
-- ---------------------------------------------------------------------
drop policy if exists kajian_baca on kajian_awal;
create policy kajian_baca on kajian_awal for select
  to authenticated using (public.saya_staf());

drop policy if exists kajian_tulis on kajian_awal;
create policy kajian_tulis on kajian_awal for all
  to authenticated
  using (public.peran_saya_salah_satu('admin','perawat','dokter'))
  with check (public.peran_saya_salah_satu('admin','perawat','dokter'));

-- ---------------------------------------------------------------------
-- F. PEMERIKSAAN, DIAGNOSA, RESEP: kewenangan dokter
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
                     using (public.peran_saya_salah_satu('admin','dokter'))
                     with check (public.peran_saya_salah_satu('admin','dokter'))$f$, t);
  end loop;
end $$;

-- Apoteker boleh menandai resep sudah diserahkan
drop policy if exists resep_serah_apoteker on resep;
create policy resep_serah_apoteker on resep for update
  to authenticated
  using (public.peran_saya() = 'apoteker')
  with check (public.peran_saya() = 'apoteker');

-- ---------------------------------------------------------------------
-- G. AUDIT & BRIDGING
-- ---------------------------------------------------------------------
drop policy if exists audit_baca on audit_log;
create policy audit_baca on audit_log for select
  to authenticated using (public.peran_saya() = 'admin');
-- Penulisan audit_log dilakukan oleh trigger SECURITY DEFINER, bukan oleh klien.

drop policy if exists bridging_log_baca on bridging_log;
create policy bridging_log_baca on bridging_log for select
  to authenticated using (public.peran_saya_salah_satu('admin','pendaftaran'));

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
    coalesce((new.raw_user_meta_data->>'peran')::peran_pegawai, 'pendaftaran')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_auth_user_baru on auth.users;
create trigger trg_auth_user_baru after insert on auth.users
for each row execute function public.buat_profil_pegawai();

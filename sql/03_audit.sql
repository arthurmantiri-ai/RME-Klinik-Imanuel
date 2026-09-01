-- =====================================================================
--  RME KLINIK IMANUEL - AUDIT TRAIL
--  Amanat PMK 24/2022: setiap akses & perubahan rekam medis harus terekam.
--  Jalankan SETELAH 02_rls.sql
-- =====================================================================

create or replace function public.catat_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_nama text;
  v_id   text;
begin
  select nama into v_nama from public.pegawai where id = auth.uid();

  if tg_op = 'DELETE' then
    v_id := coalesce(old.id::text, '-');
    insert into public.audit_log (user_id, user_nama, aksi, tabel, record_id, data_lama)
    values (auth.uid(), coalesce(v_nama,'sistem'), 'DELETE', tg_table_name, v_id, to_jsonb(old));
    return old;

  elsif tg_op = 'UPDATE' then
    v_id := coalesce(new.id::text, '-');
    -- hanya catat kalau memang ada yang berubah
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.audit_log (user_id, user_nama, aksi, tabel, record_id, data_lama, data_baru)
      values (auth.uid(), coalesce(v_nama,'sistem'), 'UPDATE', tg_table_name, v_id,
              to_jsonb(old), to_jsonb(new));
    end if;
    return new;

  else
    v_id := coalesce(new.id::text, '-');
    insert into public.audit_log (user_id, user_nama, aksi, tabel, record_id, data_baru)
    values (auth.uid(), coalesce(v_nama,'sistem'), 'INSERT', tg_table_name, v_id, to_jsonb(new));
    return new;
  end if;
end $$;

-- Versi khusus untuk tabel yang primary key-nya kunjungan_id
create or replace function public.catat_audit_kunjungan()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_nama text;
begin
  select nama into v_nama from public.pegawai where id = auth.uid();
  if tg_op = 'DELETE' then
    insert into public.audit_log (user_id, user_nama, aksi, tabel, record_id, data_lama)
    values (auth.uid(), coalesce(v_nama,'sistem'), 'DELETE', tg_table_name, old.kunjungan_id::text, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.audit_log (user_id, user_nama, aksi, tabel, record_id, data_lama, data_baru)
      values (auth.uid(), coalesce(v_nama,'sistem'), 'UPDATE', tg_table_name, new.kunjungan_id::text,
              to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    insert into public.audit_log (user_id, user_nama, aksi, tabel, record_id, data_baru)
    values (auth.uid(), coalesce(v_nama,'sistem'), 'INSERT', tg_table_name, new.kunjungan_id::text, to_jsonb(new));
    return new;
  end if;
end $$;

-- Pasang trigger pada tabel bertabel id
do $$
declare t text;
begin
  foreach t in array array['pasien','kunjungan','diagnosa','resep','resep_item','pasien_alergi','pegawai','addendum']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s
                    for each row execute function public.catat_audit()', t);
  end loop;
end $$;

-- Pasang trigger pada tabel ber-PK kunjungan_id
do $$
declare t text;
begin
  foreach t in array array['kajian_awal','pemeriksaan']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s
                    for each row execute function public.catat_audit_kunjungan()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Pencatatan AKSES (siapa membuka rekam medis siapa) — dipanggil dari aplikasi
-- ---------------------------------------------------------------------
create or replace function public.catat_akses_rm(p_pasien_id uuid, p_keterangan text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_nama text;
begin
  select nama into v_nama from public.pegawai where id = auth.uid();
  insert into public.audit_log (user_id, user_nama, aksi, tabel, record_id, keterangan)
  values (auth.uid(), coalesce(v_nama,'sistem'), 'VIEW_RM', 'pasien', p_pasien_id::text,
          coalesce(p_keterangan, 'Membuka rekam medis pasien'));
end $$;

grant execute on function public.catat_akses_rm(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Retensi: rekam medis wajib disimpan minimal 25 tahun (PMK 24/2022 Pasal 39).
-- Karena itu TIDAK ada job penghapusan otomatis di sistem ini. Penghapusan
-- hanya bisa dilakukan manual oleh admin dan tetap terekam di audit_log.
-- ---------------------------------------------------------------------

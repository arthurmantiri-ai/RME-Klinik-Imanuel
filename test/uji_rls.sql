-- =====================================================================
--  UJI ROW LEVEL SECURITY — modul apotek & kasir
--
--  Uji fungsional di uji_apotek.sql dan uji_kasir.sql berjalan sebagai
--  superuser, sehingga RLS dilewati sepenuhnya. Yang teruji di sana
--  hanyalah pemeriksaan peran DI DALAM fungsi. Berkas ini menutup celah
--  itu: setiap pemeriksaan dijalankan sebagai role `authenticated`,
--  persis seperti permintaan yang datang dari browser lewat PostgREST.
--
--  Dijalankan SETELAH uji_apotek.sql dan uji_kasir.sql.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- Fungsi bantu: jalankan sebuah perintah sebagai pengguna tertentu dengan
-- role `authenticated`, kembalikan true bila DITOLAK.
create or replace function uji_ditolak(p_user uuid, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute p_sql;
    reset role;
    return false;                       -- berhasil = TIDAK ditolak
  exception when others then
    reset role;
    return true;
  end;
end $$;

-- Menghitung baris yang TERLIHAT oleh seorang pengguna.
create or replace function uji_terlihat(p_user uuid, p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text,''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

\echo '--- 1. Apoteker boleh membaca dan menulis batch'
do $$
begin
  assert uji_terlihat('22222222-2222-2222-2222-222222222222',
    'select count(*) from apotek_batch') > 0,
    'apoteker harus bisa melihat stok';
  assert not uji_ditolak('22222222-2222-2222-2222-222222222222',
    'update apotek_batch set keterangan = ''uji rls'' where true'),
    'apoteker harus bisa mengoreksi keterangan batch';
end $$;

\echo '--- 2. Dokter boleh melihat stok, tidak boleh mengubahnya'
do $$
declare n int;
begin
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from apotek_batch') > 0,
    'dokter perlu melihat stok sebelum meresepkan';
  -- RLS pada UPDATE tidak melempar galat; ia hanya membuat 0 baris cocok.
  -- Jadi yang diperiksa adalah jumlah baris yang benar-benar berubah.
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', true);
  set local role authenticated;
  begin
    with x as (update apotek_batch set keterangan = 'dokter menulis' where true returning 1)
      select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0, format('dokter tidak boleh mengubah batch, tapi %s baris berubah', n);
end $$;

\echo '--- 3. Riwayat transaksi tidak bisa ditulis langsung, bahkan oleh apoteker'
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
  set local role authenticated;
  begin
    with x as (
      insert into apotek_transaksi (batch_id, obat_id, nama_obat, satuan, jenis,
                                    kategori, jumlah, tanggal, grup_id)
      select id, obat_id, 'Palsu', 'Tablet', 'MASUK', 'Pembelian', 999,
             public.tgl_klinik(), gen_random_uuid()
        from apotek_batch limit 1
      returning 1)
    select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0,
    'riwayat harus tertutup untuk penulisan langsung — satu-satunya jalan masuk '
    'adalah fungsi apotek_masuk / apotek_keluar yang menjaga stok tetap sejalan';
end $$;

\echo '--- 4. Pengguna tanpa baris pegawai tidak melihat apa pun'
do $$
begin
  assert uji_terlihat('99999999-9999-9999-9999-999999999999',
    'select count(*) from apotek_batch') = 0, 'orang asing tidak boleh melihat stok';
  assert uji_terlihat('99999999-9999-9999-9999-999999999999',
    'select count(*) from kasir_tagihan') = 0, 'orang asing tidak boleh melihat tagihan';
  assert uji_terlihat('99999999-9999-9999-9999-999999999999',
    'select count(*) from kasir_pembayaran') = 0, 'orang asing tidak boleh melihat pembayaran';
end $$;

\echo '--- 5. Kasir boleh menyusun tagihan, apoteker tidak'
do $$
declare n int;
begin
  assert uji_terlihat('44444444-4444-4444-4444-444444444444',
    'select count(*) from kasir_tagihan') > 0, 'kasir harus melihat tagihan';

  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
  set local role authenticated;
  begin
    with x as (insert into kasir_tagihan (nama_pembayar) values ('Apoteker nakal') returning 1)
      select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0, 'apoteker tidak boleh membuat tagihan';
end $$;

\echo '--- 6. Pembayaran tidak bisa ditulis langsung, bahkan oleh kasir'
do $$
declare n int; v_id uuid;
begin
  select id into v_id from kasir_tagihan limit 1;
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', true);
  set local role authenticated;
  begin
    with x as (insert into kasir_pembayaran (tagihan_id, jumlah, tanggal, metode)
               values (v_id, 1, public.tgl_klinik(), 'tunai') returning 1)
      select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0,
    'pembayaran harus lewat kasir_catat_pembayaran(), yang memeriksa sisa tagihan '
    'dan uang yang diterima';
end $$;

\echo '--- 7. Template invoice: semua staf membaca, hanya admin menulis'
do $$
declare n int;
begin
  assert uji_terlihat('44444444-4444-4444-4444-444444444444',
    'select count(*) from sys_template_invoice') = 1,
    'kasir harus bisa membaca template untuk mencetak';

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', true);
  set local role authenticated;
  begin
    with x as (update sys_template_invoice set konfigurasi = '{"pdf":{"judulLunas":"NAKAL"}}'::jsonb
               where id = 1 returning 1)
      select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0, 'kasir tidak boleh mengubah template invoice';

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  begin
    with x as (update sys_template_invoice set konfigurasi = '{}'::jsonb
               where id = 1 returning 1)
      select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 1, 'admin harus bisa mengubah template invoice';
end $$;

\echo '--- 8. Tarif: semua staf membaca, hanya admin menulis'
do $$
declare n int;
begin
  assert uji_terlihat('33333333-3333-3333-3333-333333333333',
    'select count(*) from kasir_tarif') > 0,
    'dokter perlu tahu biaya tindakan sebelum menyarankannya';

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', true);
  set local role authenticated;
  begin
    with x as (update kasir_tarif set tarif = 1 where true returning 1)
      select count(*) into n from x;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0, 'kasir tidak boleh mengubah tarif';
end $$;

\echo '--- 9. Fungsi RPC tetap menegakkan peran walau dipanggil authenticated'
do $$
begin
  assert uji_ditolak('33333333-3333-3333-3333-333333333333',
    'select public.apotek_keluar(''aaaaaaa1-0000-0000-0000-000000000001'', 1, ''Penjualan Bebas'')'),
    'dokter tidak boleh mengeluarkan obat lewat RPC';
  assert uji_ditolak('22222222-2222-2222-2222-222222222222',
    'select public.kasir_catat_pembayaran((select id from kasir_tagihan limit 1), 1)'),
    'apoteker tidak boleh mencatat pembayaran lewat RPC';
  assert uji_ditolak('44444444-4444-4444-4444-444444444444',
    'select public.kasir_hapus_pembayaran(gen_random_uuid())'),
    'kasir tidak boleh menghapus pembayaran lewat RPC';
end $$;

drop function uji_ditolak(uuid, text);
drop function uji_terlihat(uuid, text);

\echo 'SEMUA UJI RLS LULUS'

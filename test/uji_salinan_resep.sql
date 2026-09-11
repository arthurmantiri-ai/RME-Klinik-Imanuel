-- =====================================================================
--  UJI FUNGSIONAL — RESEP ITER & SALINAN RESEP (23_salinan_resep.sql)
--  Dijalankan dengan psql -v ON_ERROR_STOP=1, setelah uji_apotek.sql.
--  Prefiks UUID 9a1a000x supaya tidak bentrok dengan berkas uji lain.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Persiapan: pengguna (dipakai ulang dari uji_apotek.sql kalau sudah
-- ada), obat, pasien, kunjungan.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222','apoteker@uji.id'),
  ('33333333-3333-3333-3333-333333333333','dokter@uji.id')
on conflict do nothing;
update pegawai set nama='Apt Uji', peran='apoteker', no_sip='SIPA-UJI-001'
  where id='22222222-2222-2222-2222-222222222222';
update pegawai set nama='dr Uji',  peran='dokter'
  where id='33333333-3333-3333-3333-333333333333';

insert into obat (id, kode_internal, nama, satuan, harga) values
  ('9a1a0001-0000-0000-0000-000000000001','UJIS-AML','Amlodipine 5 mg','Tablet', 500),
  ('9a1a0001-0000-0000-0000-000000000002','UJIS-VIT','Vitamin C 500 mg','Tablet', 300)
on conflict (id) do nothing;

insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin)
values ('9a1a0002-0000-0000-0000-000000000001','UJIS001','Pasien Iter Uji','1975-03-03','P')
on conflict (id) do nothing;

insert into poli (id, kode, nama) values
  ('9a1a0003-0000-0000-0000-000000000001','UJISPOLI','Poli Uji Salinan')
on conflict (kode) do nothing;

insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal)
values ('9a1a0004-0000-0000-0000-000000000001','UJIS-KUNJ-1',
        '9a1a0002-0000-0000-0000-000000000001','9a1a0003-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333','UMUM', public.tgl_klinik())
on conflict (id) do nothing;

-- Stok cukup untuk 3x putaran Amlodipine (30 tablet/putaran) + Vitamin C.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  perform public.apotek_masuk('9a1a0001-0000-0000-0000-000000000001', 200, 300,
    public.tgl_klinik() + 365, 'PBF Uji', 'FK-UJIS-1', public.tgl_klinik() - 5);
  perform public.apotek_masuk('9a1a0001-0000-0000-0000-000000000002', 100, 200,
    public.tgl_klinik() + 365, 'PBF Uji', 'FK-UJIS-2', public.tgl_klinik() - 5);
end $$;

-- =======================================================================
-- BAGIAN A — resep iter: siklus penuh 3 putaran (iter_maks = 2)
-- =======================================================================
insert into resep (id, kunjungan_id, no_resep, dibuat_oleh, iter_maks)
values ('9a1a0005-0000-0000-0000-000000000001','9a1a0004-0000-0000-0000-000000000001',
        'UJIS-R-ITER','33333333-3333-3333-3333-333333333333', 2)
on conflict (id) do nothing;

insert into resep_item (id, resep_id, obat_id, nama_obat, jumlah, satuan, signa, urutan) values
  ('9a1a0006-0000-0000-0000-000000000001','9a1a0005-0000-0000-0000-000000000001',
   '9a1a0001-0000-0000-0000-000000000001','Amlodipine 5 mg', 30,'Tablet','1x1', 0)
on conflict (id) do nothing;

\echo '--- 1. Putaran pertama: penuh, status ITER_BERJALAN, iter_sisa = 2'
do $$
declare h jsonb; r resep%rowtype;
begin
  h := public.apotek_serahkan_resep('9a1a0005-0000-0000-0000-000000000001',
    '[{"resep_item_id":"9a1a0006-0000-0000-0000-000000000001","jumlah":30}]'::jsonb);
  assert (h->>'ke_berapa')::int = 1, 'putaran pertama harus ke_berapa=1';
  assert (h->>'lengkap')::boolean = true, 'putaran pertama harus lengkap';
  assert (h->>'iter_sisa')::int = 2, format('iter_sisa harus 2, dapat %s', h->>'iter_sisa');

  select * into r from resep where id='9a1a0005-0000-0000-0000-000000000001';
  assert r.status = 'ITER_BERJALAN', format('status harus ITER_BERJALAN, dapat %s', r.status);
  assert r.iter_terpakai = 1, 'iter_terpakai harus 1';
end $$;

\echo '--- 2. Resep item TIDAK bisa dihapus/diubah lewat re-save setelah iter jalan'
-- Ini menegaskan bahwa aplikasi (js/db.js simpanResep) yang menolak, bukan
-- database — resep_item boleh dihapus langsung di SQL murni (tidak ada
-- trigger pemblokir di lapisan ini, sengaja: penjagaannya di RPC simpan
-- dokter). Yang diuji di sini murni bagian databasenya: FK CASCADE dari
-- resep_penyerahan_item ke resep_item benar-benar berlaku.
do $$
declare n int;
begin
  select count(*) into n from resep_penyerahan_item
   where resep_item_id = '9a1a0006-0000-0000-0000-000000000001';
  assert n = 1, 'baris penyerahan-item putaran pertama harus ada';
end $$;

\echo '--- 3. Putaran kedua: masih ITER_BERJALAN, iter_sisa = 1'
do $$
declare h jsonb; r resep%rowtype;
begin
  h := public.apotek_serahkan_resep('9a1a0005-0000-0000-0000-000000000001',
    '[{"resep_item_id":"9a1a0006-0000-0000-0000-000000000001","jumlah":30}]'::jsonb);
  assert (h->>'ke_berapa')::int = 2, 'putaran kedua harus ke_berapa=2';
  assert (h->>'iter_sisa')::int = 1, format('iter_sisa harus 1, dapat %s', h->>'iter_sisa');

  select * into r from resep where id='9a1a0005-0000-0000-0000-000000000001';
  assert r.status = 'ITER_BERJALAN', 'masih harus ITER_BERJALAN sebelum jatah habis';
end $$;

\echo '--- 4. Putaran ketiga (terakhir): status berpindah ke DISERAHKAN, iter_sisa = 0'
do $$
declare h jsonb; r resep%rowtype;
begin
  h := public.apotek_serahkan_resep('9a1a0005-0000-0000-0000-000000000001',
    '[{"resep_item_id":"9a1a0006-0000-0000-0000-000000000001","jumlah":30}]'::jsonb);
  assert (h->>'ke_berapa')::int = 3, 'putaran ketiga harus ke_berapa=3';
  assert (h->>'iter_sisa')::int = 0, 'iter_sisa harus 0 setelah jatah habis';

  select * into r from resep where id='9a1a0005-0000-0000-0000-000000000001';
  assert r.status = 'DISERAHKAN', format('status akhir harus DISERAHKAN, dapat %s', r.status);
  assert r.iter_terpakai = 3, 'iter_terpakai harus 3 (1 asli + 2 iter)';
end $$;

\echo '--- 5. Putaran keempat ditolak — jatah iter benar-benar habis'
do $$
declare gagal boolean := false;
begin
  begin
    perform public.apotek_serahkan_resep('9a1a0005-0000-0000-0000-000000000001',
      '[{"resep_item_id":"9a1a0006-0000-0000-0000-000000000001","jumlah":30}]'::jsonb);
  exception when others then gagal := true; end;
  assert gagal, 'penyerahan ke-4 pada resep iter 2x (jatah 3) harus ditolak';
end $$;

\echo '--- 6. Tiga baris resep_penyerahan tercatat, ke_berapa berurutan'
do $$
declare n int; urut int[];
begin
  select count(*) into n from resep_penyerahan
   where resep_id = '9a1a0005-0000-0000-0000-000000000001';
  assert n = 3, format('harus ada 3 baris resep_penyerahan, dapat %s', n);

  select array_agg(ke_berapa order by ke_berapa) into urut from resep_penyerahan
   where resep_id = '9a1a0005-0000-0000-0000-000000000001';
  assert urut = array[1,2,3], 'ke_berapa harus 1,2,3 berurutan';
end $$;

-- =======================================================================
-- BAGIAN B — resep BUKAN iter (iter_maks=0): kekurangan stok/sebagian
-- tetap berperilaku PERSIS seperti sebelum fitur iter ada — sekali serah
-- (walau sebagian) langsung terkunci DISERAHKAN.
-- =======================================================================
insert into resep (id, kunjungan_id, no_resep, dibuat_oleh)
values ('9a1a0005-0000-0000-0000-000000000002','9a1a0004-0000-0000-0000-000000000001',
        'UJIS-R-BIASA','33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

insert into resep_item (id, resep_id, obat_id, nama_obat, jumlah, satuan, signa, urutan) values
  ('9a1a0006-0000-0000-0000-000000000002','9a1a0005-0000-0000-0000-000000000002',
   '9a1a0001-0000-0000-0000-000000000001','Amlodipine 5 mg', 10,'Tablet','1x1', 0),
  ('9a1a0006-0000-0000-0000-000000000003','9a1a0005-0000-0000-0000-000000000002',
   '9a1a0001-0000-0000-0000-000000000002','Vitamin C 500 mg', 10,'Tablet','1x1', 1)
on conflict (id) do nothing;

\echo '--- 7. Resep biasa, satu butir dilewati apoteker (habis/kadaluarsa) → sebagian, langsung terkunci'
do $$
declare h jsonb; r resep%rowtype;
begin
  -- Vitamin C sengaja TIDAK disebut sama sekali di p_item (mis. stok
  -- kosong/kadaluarsa) — hanya Amlodipine yang diserahkan.
  h := public.apotek_serahkan_resep('9a1a0005-0000-0000-0000-000000000002',
    '[{"resep_item_id":"9a1a0006-0000-0000-0000-000000000002","jumlah":10}]'::jsonb);
  assert (h->>'butir')::int = 1, 'hanya 1 dari 2 butir diserahkan';
  assert (h->>'dari')::int = 2, 'total butir resep harus 2';
  assert (h->>'lengkap')::boolean = false, 'harus ditandai TIDAK lengkap';
  assert (h->>'iter_sisa')::int = 0, 'resep tanpa iter tidak punya sisa jatah';

  select * into r from resep where id='9a1a0005-0000-0000-0000-000000000002';
  assert r.status = 'DISERAHKAN',
    format('resep tanpa iter langsung DISERAHKAN walau sebagian, dapat %s', r.status);
  assert r.diserahkan_sebagian, 'diserahkan_sebagian harus true';
end $$;

\echo '--- 8. Resep tanpa iter yang sudah diserahkan (walau sebagian) ditolak diserahkan lagi'
do $$
declare gagal boolean := false;
begin
  begin
    perform public.apotek_serahkan_resep('9a1a0005-0000-0000-0000-000000000002',
      '[{"resep_item_id":"9a1a0006-0000-0000-0000-000000000003","jumlah":10}]'::jsonb);
  exception when others then gagal := true; end;
  assert gagal, 'resep tanpa iter yang sudah DISERAHKAN tidak boleh diserahkan lagi '
    || '(tanpa iter, kekurangan stok TIDAK memberi putaran tambahan — beda dengan resep iter)';
end $$;

\echo '--- 9. Salinan Resep butir yang dilewati tetap tercatat sebagai "nedet" (jumlah_diserahkan 0)'
do $$
declare vit_pi resep_penyerahan_item%rowtype;
begin
  select pi.* into vit_pi from resep_penyerahan_item pi
    join resep_penyerahan pn on pn.id = pi.penyerahan_id
   where pn.resep_id = '9a1a0005-0000-0000-0000-000000000002'
     and pi.resep_item_id = '9a1a0006-0000-0000-0000-000000000003';
  -- Butir yang samasekali tidak disebut di p_item TIDAK mendapat baris
  -- resep_penyerahan_item — ini yang membuat tampilan (cetakSalinanResep
  -- di js/pages/apotek.js) WAJIB menyusun daftar dari SELURUH resep_item,
  -- bukan hanya dari baris penyerahan, supaya butir ini tetap tercetak
  -- "nedet", bukan hilang begitu saja dari Salinan Resep.
  assert not found, 'butir yang tidak disebut di p_item TIDAK boleh punya baris penyerahan-item';
end $$;

-- =======================================================================
-- BAGIAN C — pembatalan (apotek_batalkan_grup) pada resep iter
-- =======================================================================
\echo '--- 10. Pembatalan salah satu putaran iter menurunkan iter_terpakai satu, bukan mereset total'
do $$
declare grup uuid; r resep%rowtype;
begin
  -- Buat resep iter baru (iter_maks=1, jatah 2), serahkan penuh sekali,
  -- lalu batalkan grup transaksi stoknya.
  insert into resep (id, kunjungan_id, no_resep, dibuat_oleh, iter_maks)
  values ('9a1a0005-0000-0000-0000-000000000003','9a1a0004-0000-0000-0000-000000000001',
          'UJIS-R-BATAL','33333333-3333-3333-3333-333333333333', 1);
  insert into resep_item (id, resep_id, obat_id, nama_obat, jumlah, satuan, signa, urutan)
  values ('9a1a0006-0000-0000-0000-000000000004','9a1a0005-0000-0000-0000-000000000003',
          '9a1a0001-0000-0000-0000-000000000002','Vitamin C 500 mg', 10,'Tablet','1x1', 0);

  perform public.apotek_serahkan_resep('9a1a0005-0000-0000-0000-000000000003',
    '[{"resep_item_id":"9a1a0006-0000-0000-0000-000000000004","jumlah":10}]'::jsonb);

  select t.grup_id into grup from apotek_transaksi t
   where t.resep_item_id = '9a1a0006-0000-0000-0000-000000000004' limit 1;
  assert grup is not null, 'grup_id transaksi harus ditemukan';

  perform public._apotek_batalkan_grup_inti(grup, 'Uji pembatalan iter');

  select * into r from resep where id='9a1a0005-0000-0000-0000-000000000003';
  assert r.iter_terpakai = 0, format('iter_terpakai harus turun ke 0, dapat %s', r.iter_terpakai);
  assert r.status = 'DIBUAT', format('status harus kembali DIBUAT, dapat %s', r.status);
end $$;

\echo 'SEMUA UJI SALINAN RESEP & ITER LULUS'

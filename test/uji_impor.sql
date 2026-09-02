-- =====================================================================
--  UJI IMPOR STOK APOTEK
--  Dijalankan SETELAH uji_apotek.sql, uji_kasir.sql, uji_rls.sql
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);

\echo '--- 1. Impor pembelian: batch masuk dengan kategori Pembelian'
do $$
declare h jsonb; n int;
begin
  h := public.apotek_impor(('[
    {"obat_id":"aaaaaaa1-0000-0000-0000-000000000001","jumlah":50,"harga_beli":1300,
     "tgl_expired":"2028-01-31","pbf":"PT Impor Satu","no_faktur":"IMP-001"},
    {"obat_id":"aaaaaaa1-0000-0000-0000-000000000002","jumlah":80,"harga_beli":600,
     "tgl_expired":"2028-02-28","pbf":"PT Impor Satu","no_faktur":"IMP-001"}
  ]')::jsonb, 'Pembelian');

  assert (h->>'baris')::int = 2, format('harus 2 baris, dapat %s', h->>'baris');
  assert (h->>'batch_baru')::int = 2, 'dua batch baru';
  assert (h->>'obat_baru')::int = 0, 'tidak ada obat baru dibuat';
  assert (h->>'total_nilai')::numeric = 50*1300 + 80*600,
    format('nilai harus 113000, dapat %s', h->>'total_nilai');

  select count(*) into n from apotek_transaksi
   where no_faktur = 'IMP-001' and kategori = 'Pembelian';
  assert n = 2, format('dua transaksi berkategori Pembelian, dapat %s', n);
end $$;

\echo '--- 2. Impor saldo awal tercatat terpisah dari pembelian'
do $$
declare h jsonb; n int;
begin
  h := public.apotek_impor(('[
    {"obat_id":"aaaaaaa1-0000-0000-0000-000000000001","jumlah":200,"harga_beli":1000,
     "tgl_expired":"2028-06-30","pbf":"Opname Awal","keterangan":"stok fisik 1 Sep"}
  ]')::jsonb, 'Saldo Awal');

  assert (h->>'jenis') = 'Saldo Awal', 'jenis harus terbawa ke hasil';
  select count(*) into n from apotek_transaksi where kategori = 'Saldo Awal';
  assert n = 1, format('satu transaksi Saldo Awal, dapat %s', n);

  -- Inti pemisahan ini: nilai persediaan lama tidak boleh terhitung
  -- sebagai pembelian bulan berjalan.
  select count(*) into n from apotek_transaksi
   where kategori = 'Pembelian' and pbf = 'Opname Awal';
  assert n = 0, 'saldo awal tidak boleh tercatat sebagai pembelian';
end $$;

\echo '--- 3. Kategori pemasukan di luar dua itu ditolak'
do $$
declare gagal boolean := false;
begin
  begin
    perform public.apotek_impor(('[
      {"obat_id":"aaaaaaa1-0000-0000-0000-000000000001","jumlah":1,"harga_beli":1,
       "tgl_expired":"2028-01-01","pbf":"X"}]')::jsonb, 'Hadiah');
  exception when others then gagal := true; end;
  assert gagal, 'jenis impor asing harus ditolak';
end $$;

\echo '--- 4. Obat baru dibuat sekali walau muncul di beberapa baris'
do $$
declare h jsonb; n int; v_id uuid;
begin
  h := public.apotek_impor(('[
    {"obat_baru":{"nama":"Cefixime 100 mg","satuan":"Kapsul","kode_internal":"UJI-CFX","harga":4500},
     "jumlah":30,"harga_beli":3000,"tgl_expired":"2028-03-31","pbf":"PT Impor Dua"},
    {"obat_baru":{"nama":"Cefixime 100 mg","satuan":"Kapsul","kode_internal":"UJI-CFX","harga":4500},
     "jumlah":20,"harga_beli":3100,"tgl_expired":"2028-09-30","pbf":"PT Impor Dua"}
  ]')::jsonb, 'Pembelian');

  assert (h->>'obat_baru')::int = 1,
    format('obat yang sama di dua baris harus dibuat SEKALI, dapat %s', h->>'obat_baru');

  select count(*) into n from obat where kode_internal = 'UJI-CFX';
  assert n = 1, format('master obat tidak boleh kembar, dapat %s baris', n);

  select id into v_id from obat where kode_internal = 'UJI-CFX';
  select count(*) into n from apotek_batch where obat_id = v_id;
  assert n = 2, format('dua batch berbeda expired untuk satu obat, dapat %s', n);
end $$;

\echo '--- 5. Obat baru yang ternyata sudah ada dipakai ulang, bukan digandakan'
do $$
declare h jsonb; n int;
begin
  h := public.apotek_impor(('[
    {"obat_baru":{"nama":"Cefixime 100 mg","satuan":"Kapsul","kode_internal":"UJI-CFX"},
     "jumlah":10,"harga_beli":3000,"tgl_expired":"2029-01-31","pbf":"PT Impor Tiga"}
  ]')::jsonb, 'Pembelian');

  assert (h->>'obat_baru')::int = 0, 'obat yang sudah ada tidak boleh dihitung sebagai baru';
  select count(*) into n from obat where kode_internal = 'UJI-CFX';
  assert n = 1, 'tetap satu baris di master obat';
end $$;

\echo '--- 6. Pembuatan obat lewat impor meninggalkan jejak audit'
do $$
declare n int;
begin
  select count(*) into n from audit_log
   where tabel = 'obat' and aksi = 'INSERT'
     and keterangan like 'Dibuat otomatis lewat impor%';
  assert n >= 1, 'penambahan master obat lewat impor wajib tercatat di audit log';
end $$;

\echo '--- 7. Satu baris gagal membatalkan SELURUH impor'
do $$
declare sebelum int; sesudah int; obat_sebelum int; obat_sesudah int; gagal boolean := false;
begin
  select count(*) into sebelum from apotek_batch;
  select count(*) into obat_sebelum from obat;

  begin
    perform public.apotek_impor(('[
      {"obat_id":"aaaaaaa1-0000-0000-0000-000000000001","jumlah":10,"harga_beli":1000,
       "tgl_expired":"2028-04-30","pbf":"PT Gagal"},
      {"obat_baru":{"nama":"Obat Yang Tak Boleh Lahir","satuan":"Tablet"},
       "jumlah":10,"harga_beli":1000,"tgl_expired":"2028-04-30","pbf":"PT Gagal"},
      {"obat_id":"aaaaaaa1-0000-0000-0000-000000000001","jumlah":-5,"harga_beli":1000,
       "tgl_expired":"2028-04-30","pbf":"PT Gagal"}
    ]')::jsonb, 'Pembelian');
  exception when others then
    gagal := true;
    -- Nomor baris wajib disebut; tanpa itu berkas 80 baris tidak bisa diperbaiki.
    assert sqlerrm like 'Baris 3:%', format('pesan harus menyebut baris ke-3, dapat: %s', sqlerrm);
  end;
  assert gagal, 'baris dengan jumlah negatif harus menggagalkan impor';

  select count(*) into sesudah from apotek_batch;
  select count(*) into obat_sesudah from obat;
  assert sebelum = sesudah,
    format('dua baris pertama harus ikut dibatalkan: %s -> %s batch', sebelum, sesudah);
  assert obat_sebelum = obat_sesudah,
    'obat yang sempat dibuat di baris kedua harus ikut dibatalkan';
end $$;

\echo '--- 8. Batch identik digabung, bukan digandakan, lewat impor'
do $$
declare h jsonb; n int; sisa numeric;
begin
  h := public.apotek_impor(('[
    {"obat_id":"aaaaaaa1-0000-0000-0000-000000000001","jumlah":25,"harga_beli":1300,
     "tgl_expired":"2028-01-31","pbf":"pt impor satu","no_faktur":"IMP-001"}
  ]')::jsonb, 'Pembelian');

  assert (h->>'batch_digabung')::int = 1,
    'batch dengan expired, faktur, PBF, dan harga sama harus digabung';
  select count(*), max(stok_sisa) into n, sisa from apotek_batch
   where no_faktur = 'IMP-001' and harga_beli = 1300;
  assert n = 1, format('tetap satu batch, dapat %s', n);
  assert sisa = 75, format('stok jadi 50 + 25 = 75, dapat %s', sisa);
end $$;

\echo '--- 9. Peran non-apoteker ditolak'
do $$
declare gagal boolean := false;
begin
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  begin
    perform public.apotek_impor(('[
      {"obat_id":"aaaaaaa1-0000-0000-0000-000000000001","jumlah":1,"harga_beli":1,
       "tgl_expired":"2028-01-01","pbf":"X"}]')::jsonb, 'Pembelian');
  exception when others then
    gagal := true;
    assert sqlerrm like '%apoteker%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'dokter tidak boleh mengimpor stok';
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
end $$;

\echo '--- 10. Berkas kosong dan berkas raksasa ditolak dengan pesan jelas'
do $$
declare gagal boolean := false;
begin
  begin perform public.apotek_impor('[]'::jsonb, 'Pembelian');
  exception when others then
    gagal := true;
    assert sqlerrm like '%Tidak ada baris%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'berkas tanpa baris harus ditolak';

  gagal := false;
  begin
    perform public.apotek_impor(
      (select jsonb_agg(jsonb_build_object(
         'obat_id','aaaaaaa1-0000-0000-0000-000000000001','jumlah',1,'harga_beli',1,
         'tgl_expired','2028-01-01','pbf','X'))
       from generate_series(1, 2001)), 'Pembelian');
  exception when others then
    gagal := true;
    assert sqlerrm like '%2.000 baris%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'berkas di atas batas harus ditolak sebelum diproses';
end $$;

\echo '--- 11. Stok hasil impor benar-benar bisa dikeluarkan'
do $$
declare h jsonb; v_id uuid;
begin
  select id into v_id from obat where kode_internal = 'UJI-CFX';
  -- FEFO: batch expired 2028-03-31 harus keluar sebelum 2028-09-30.
  h := public.apotek_keluar(v_id, 5, 'Penjualan Bebas');
  assert (h->'potongan'->0->>'tgl_expired') = '2028-03-31',
    format('FEFO harus ambil batch Maret, dapat %s', h->'potongan'->0->>'tgl_expired');
end $$;

\echo 'SEMUA UJI IMPOR LULUS'

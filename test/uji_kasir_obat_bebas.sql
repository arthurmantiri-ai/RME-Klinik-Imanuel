-- =====================================================================
--  UJI FUNGSIONAL — OBAT DI PENJUALAN BEBAS KASIR + KODE TARIF OTOMATIS
--  (sql/21_kasir_obat_bebas.sql)
--  Dijalankan SETELAH uji_kasir.sql (memakai pengguna dari sana: master
--  11111111, apoteker 22222222, dokter 33333333, kasir 44444444).
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Persiapan: obat & stok sendiri, supaya tidak bergantung pada sisa
-- stok yang dipakai berkas uji lain.
-- ---------------------------------------------------------------------
insert into obat (id, kode_internal, nama, satuan, harga, aktif) values
  ('0bebe000-0000-0000-0000-000000000001','UJI-BEBAS','Vitamin C 500 mg','Tablet', 2000, true),
  ('0bebe000-0000-0000-0000-000000000002','UJI-NONAKT','Obat Nonaktif','Tablet', 1000, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  perform public.apotek_masuk('0bebe000-0000-0000-0000-000000000001', 50, 1200,
    public.tgl_klinik() + 300, 'PBF Uji Bebas', 'FK-BEBAS-1');
end $$;

select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);


\echo '--- 1. Kode internal Tarif dibuat otomatis untuk jenis TINDAKAN kalau dikosongkan'
do $$
declare v_id uuid; v_kode text;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  insert into kasir_tarif (jenis, nama, tarif, kode) values
    ('LAIN','Uji kode otomatis A', 10000, null)
  returning id into v_id;
  select kode into v_kode from kasir_tarif where id = v_id;
  assert v_kode like 'LAIN-%', format('kode harus berawalan LAIN-, dapat %s', v_kode);

  insert into kasir_tarif (jenis, nama, tarif, kode) values
    ('TINDAKAN','Uji kode otomatis B', 20000, '')
  returning id into v_id;
  select kode into v_kode from kasir_tarif where id = v_id;
  assert v_kode like 'TND-%', format('kode kosong ('''') harus tetap digenerate, dapat %s', v_kode);
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
end $$;

\echo '--- 2. Kode yang diisi manual tidak ditimpa'
do $$
declare v_id uuid; v_kode text;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  insert into kasir_tarif (jenis, nama, tarif, kode) values
    ('LAYANAN','Uji kode manual', 5000, 'KODE-SAYA-SENDIRI')
  returning id into v_id;
  select kode into v_kode from kasir_tarif where id = v_id;
  assert v_kode = 'KODE-SAYA-SENDIRI', format('kode manual tidak boleh ditimpa, dapat %s', v_kode);
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
end $$;

\echo '--- 3. Dua kode otomatis berturutan tidak pernah sama (sequence, bukan hitung baris)'
do $$
declare v1 text; v2 text;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  insert into kasir_tarif (jenis, nama, tarif) values ('LAIN','Uji beruntun 1', 1000)
    returning kode into v1;
  insert into kasir_tarif (jenis, nama, tarif) values ('LAIN','Uji beruntun 2', 1000)
    returning kode into v2;
  assert v1 <> v2, format('dua kode otomatis berturutan harus beda, dapat %s dan %s', v1, v2);
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
end $$;


\echo '--- 4. Kasir menjual obat langsung: stok terpotong, harga dari master obat'
do $$
declare
  v_tagihan uuid; v_item kasir_tagihan_item%rowtype;
  v_stok_sebelum numeric; v_stok_sesudah numeric;
  v_grup_tx int;
begin
  select coalesce(sum(stok_sisa),0) into v_stok_sebelum from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';

  insert into kasir_tagihan (nama_pembayar, penjamin, dibuat_oleh)
  values ('Pembeli Bebas Uji','UMUM','44444444-4444-4444-4444-444444444444')
  returning id into v_tagihan;

  v_item := public.kasir_jual_obat_bebas(v_tagihan, '0bebe000-0000-0000-0000-000000000001', 7);

  assert v_item.sumber = 'OBAT', format('sumber harus OBAT, dapat %s', v_item.sumber);
  assert v_item.ref_id = '0bebe000-0000-0000-0000-000000000001', 'ref_id harus obat_id';
  assert v_item.ref_kode = 'UJI-BEBAS', format('ref_kode harus kode_internal obat, dapat %s', v_item.ref_kode);
  assert v_item.qty = 7, format('qty harus 7, dapat %s', v_item.qty);
  assert v_item.harga_satuan = 2000, format('harga harus ikut obat.harga (2000), dapat %s', v_item.harga_satuan);
  assert v_item.total_baris = 14000, format('total baris harus 7x2000=14000, dapat %s', v_item.total_baris);
  assert v_item.apotek_grup_id is not null, 'apotek_grup_id wajib terisi untuk baris obat-bebas';
  assert v_item.nama like '%Vitamin C 500 mg%(7 Tablet)%',
    format('nama harus menyebut jumlah & satuan, dapat %s', v_item.nama);

  select coalesce(sum(stok_sisa),0) into v_stok_sesudah from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';
  assert v_stok_sesudah = v_stok_sebelum - 7,
    format('stok harus berkurang 7 (dari %s jadi %s), dapat %s', v_stok_sebelum, v_stok_sebelum - 7, v_stok_sesudah);

  select count(*) into v_grup_tx from apotek_transaksi
   where grup_id = v_item.apotek_grup_id and kategori = 'Penjualan Bebas'
     and jenis = 'KELUAR' and not dibatalkan;
  assert v_grup_tx = 1, format('harus ada 1 baris apotek_transaksi Penjualan Bebas, dapat %s', v_grup_tx);

  -- Tagihan ikut terhitung ulang lewat trigger yang sudah ada.
  perform 1 from kasir_tagihan where id = v_tagihan and total = 14000;
  assert found, 'total tagihan harus ikut naik lewat trigger kasir_hitung_tagihan';

  -- simpan untuk pemeriksaan berikutnya lewat tabel sementara
  create temp table if not exists _uji_bebas (kunci text primary key, nilai text);
  insert into _uji_bebas values ('tagihan', v_tagihan::text) on conflict (kunci) do update set nilai = excluded.nilai;
  insert into _uji_bebas values ('item', v_item.id::text) on conflict (kunci) do update set nilai = excluded.nilai;
  insert into _uji_bebas values ('grup', v_item.apotek_grup_id::text) on conflict (kunci) do update set nilai = excluded.nilai;
end $$;

\echo '--- 5. Obat nonaktif tidak boleh dijual'
do $$
declare v_tagihan uuid; gagal boolean := false;
begin
  insert into kasir_tagihan (nama_pembayar, penjamin, dibuat_oleh)
  values ('Uji Nonaktif','UMUM','44444444-4444-4444-4444-444444444444')
  returning id into v_tagihan;
  begin
    perform public.kasir_jual_obat_bebas(v_tagihan, '0bebe000-0000-0000-0000-000000000002', 1);
  exception when others then
    gagal := true;
    assert sqlerrm like '%tidak ditemukan%' or sqlerrm like '%nonaktif%',
      format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'obat nonaktif harus ditolak';
end $$;

\echo '--- 6. Stok tidak cukup: ditolak, tidak ada yang tersimpan sama sekali'
do $$
declare v_tagihan uuid; gagal boolean := false; n int;
  v_stok_sebelum numeric; v_stok_sesudah numeric;
begin
  select coalesce(sum(stok_sisa),0) into v_stok_sebelum from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';

  insert into kasir_tagihan (nama_pembayar, penjamin, dibuat_oleh)
  values ('Uji Stok Kurang','UMUM','44444444-4444-4444-4444-444444444444')
  returning id into v_tagihan;

  begin
    perform public.kasir_jual_obat_bebas(v_tagihan, '0bebe000-0000-0000-0000-000000000001', 999999);
  exception when others then
    gagal := true;
    assert sqlerrm like '%tidak cukup%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'stok tidak cukup harus ditolak';

  select count(*) into n from kasir_tagihan_item where tagihan_id = v_tagihan;
  assert n = 0, 'tidak boleh ada baris tersimpan saat penjualan gagal';

  select coalesce(sum(stok_sisa),0) into v_stok_sesudah from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';
  assert v_stok_sesudah = v_stok_sebelum, 'stok tidak boleh berubah sama sekali saat gagal';
end $$;

\echo '--- 7. Bukan kasir (dokter) ditolak, tidak memotong stok'
do $$
declare v_tagihan uuid; gagal boolean := false;
  v_stok_sebelum numeric; v_stok_sesudah numeric;
begin
  select id into v_tagihan from kasir_tagihan where nama_pembayar = 'Pembeli Bebas Uji';

  select coalesce(sum(stok_sisa),0) into v_stok_sebelum from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';

  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  begin
    perform public.kasir_jual_obat_bebas(v_tagihan, '0bebe000-0000-0000-0000-000000000001', 1);
  exception when others then
    gagal := true;
    assert sqlerrm like '%kasir%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'dokter tidak boleh menjual obat lewat kasir';
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);

  select coalesce(sum(stok_sisa),0) into v_stok_sesudah from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';
  assert v_stok_sesudah = v_stok_sebelum, 'stok tidak boleh berubah saat peran ditolak';
end $$;

\echo '--- 8. Menghapus baris obat-bebas mengembalikan stoknya (trigger, bukan kode klien)'
do $$
declare
  v_tagihan uuid; v_item_id uuid; v_grup uuid;
  v_stok_sebelum numeric; v_stok_sesudah numeric; n int;
begin
  select nilai::uuid into v_tagihan from _uji_bebas where kunci = 'tagihan';
  select nilai::uuid into v_item_id from _uji_bebas where kunci = 'item';
  select nilai::uuid into v_grup    from _uji_bebas where kunci = 'grup';

  select coalesce(sum(stok_sisa),0) into v_stok_sebelum from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';

  delete from kasir_tagihan_item where id = v_item_id;

  select coalesce(sum(stok_sisa),0) into v_stok_sesudah from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';
  assert v_stok_sesudah = v_stok_sebelum + 7,
    format('stok harus kembali +7 (dari %s), dapat %s', v_stok_sebelum, v_stok_sesudah);

  select count(*) into n from apotek_transaksi where grup_id = v_grup and not dibatalkan;
  assert n = 0, 'seluruh baris apotek_transaksi grup ini harus tertandai dibatalkan';

  -- Tagihan ikut turun kembali ke 0 lewat trigger total yang sudah ada.
  perform 1 from kasir_tagihan where id = v_tagihan and total = 0;
  assert found, 'total tagihan harus turun ke 0 setelah baris obatnya dihapus';
end $$;

\echo '--- 9. Baris biasa (bukan hasil kasir_jual_obat_bebas) tidak memicu pembatalan apa pun'
do $$
declare v_tagihan uuid; v_item_id uuid; n_sebelum int; n_sesudah int;
begin
  insert into kasir_tagihan (nama_pembayar, penjamin, dibuat_oleh)
  values ('Uji Baris Biasa','UMUM','44444444-4444-4444-4444-444444444444')
  returning id into v_tagihan;
  insert into kasir_tagihan_item (tagihan_id, sumber, nama, qty, harga_satuan)
  values (v_tagihan, 'MANUAL', 'Biaya lain-lain', 1, 5000)
  returning id into v_item_id;

  select count(*) into n_sebelum from apotek_transaksi where dibatalkan;
  delete from kasir_tagihan_item where id = v_item_id;
  select count(*) into n_sesudah from apotek_transaksi where dibatalkan;

  assert n_sesudah = n_sebelum,
    'menghapus baris MANUAL (apotek_grup_id null) tidak boleh menyentuh apotek_transaksi sama sekali';
end $$;

\echo '--- 10. Jalur lama (apoteker, apotek_keluar/apotek_batalkan_grup) tetap menolak kasir setelah dipecah'
do $$
declare gagal boolean := false;
begin
  begin
    perform public.apotek_keluar('0bebe000-0000-0000-0000-000000000001', 1, 'Penjualan Bebas');
  exception when others then
    gagal := true;
    assert sqlerrm like '%apoteker%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'kasir tidak boleh memanggil apotek_keluar() langsung — jalur lama tetap terjaga';

  gagal := false;
  begin
    perform public.apotek_batalkan_grup(gen_random_uuid());
  exception when others then
    gagal := true;
    assert sqlerrm like '%apoteker%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'kasir tidak boleh memanggil apotek_batalkan_grup() langsung — jalur lama tetap terjaga';
end $$;

\echo '--- 11. Menambah baris obat ke tagihan yang sudah dibayar ditolak DAN stok tidak ikut terpotong'
do $$
declare
  v_tagihan uuid; gagal boolean := false;
  v_stok_sebelum numeric; v_stok_sesudah numeric;
begin
  insert into kasir_tagihan (nama_pembayar, penjamin, dibuat_oleh)
  values ('Uji Sudah Lunas','UMUM','44444444-4444-4444-4444-444444444444')
  returning id into v_tagihan;
  insert into kasir_tagihan_item (tagihan_id, sumber, nama, qty, harga_satuan)
  values (v_tagihan, 'MANUAL', 'Karcis', 1, 15000);
  perform public.kasir_catat_pembayaran(v_tagihan, 15000, null, 'tunai', null, 15000);

  select coalesce(sum(stok_sisa),0) into v_stok_sebelum from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';

  begin
    perform public.kasir_jual_obat_bebas(v_tagihan, '0bebe000-0000-0000-0000-000000000001', 2);
  exception when others then
    gagal := true;
    assert sqlerrm like '%sudah menerima pembayaran%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'baris obat tidak boleh ditambahkan ke tagihan yang sudah dibayar';

  select coalesce(sum(stok_sisa),0) into v_stok_sesudah from apotek_batch
   where obat_id = '0bebe000-0000-0000-0000-000000000001';
  assert v_stok_sesudah = v_stok_sebelum,
    'stok tidak boleh ikut terpotong kalau baris tagihannya gagal ditulis (harus satu transaksi)';
end $$;

drop table if exists _uji_bebas;

\echo 'SEMUA UJI KASIR OBAT BEBAS LULUS'

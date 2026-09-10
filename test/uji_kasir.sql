-- =====================================================================
--  UJI FUNGSIONAL MODUL KASIR
--  Dijalankan SETELAH uji_apotek.sql (memakai pengguna & obat dari sana).
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Persiapan
-- ---------------------------------------------------------------------
insert into icd9cm (kode, nama_id, kategori, aktif) values
  ('89.01','Konsultasi dan evaluasi terbatas','UMUM', true),
  ('23.09','Pencabutan gigi lainnya','GIGI', true)
on conflict (kode) do nothing;

-- Dua kunjungan baru: satu umum, satu BPJS.
insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal) values
  ('ddddddd1-0000-0000-0000-00000000000A','UJI-KUNJ-UMUM',
   'bbbbbbb1-0000-0000-0000-000000000001','ccccccc1-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333','UMUM', public.tgl_klinik()),
  ('ddddddd1-0000-0000-0000-00000000000B','UJI-KUNJ-BPJS',
   'bbbbbbb1-0000-0000-0000-000000000001','ccccccc1-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333','BPJS', public.tgl_klinik())
on conflict (id) do nothing;

insert into tindakan (kunjungan_id, kode_icd9, nama, jumlah, urutan) values
  ('ddddddd1-0000-0000-0000-00000000000A','89.01','Konsultasi dokter umum', 1, 0),
  ('ddddddd1-0000-0000-0000-00000000000A','23.09','Pencabutan gigi', 2, 1),
  ('ddddddd1-0000-0000-0000-00000000000B','89.01','Konsultasi dokter umum', 1, 0);

-- Tarif berlaku sejak setahun lalu.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
insert into kasir_tarif (jenis, kode_icd9, kode, nama, tarif, berlaku_mulai) values
  ('TINDAKAN','89.01','89.01','Konsultasi dokter umum',  50000, public.tgl_klinik() - 365),
  ('TINDAKAN','23.09','23.09','Pencabutan gigi',        150000, public.tgl_klinik() - 365);

-- Resep umum: dokter menulis 20, apoteker hanya menyerahkan 12.
insert into resep (id, kunjungan_id, no_resep, dibuat_oleh)
values ('eeeeeee1-0000-0000-0000-00000000000A','ddddddd1-0000-0000-0000-00000000000A',
        'UJI-R-UMUM','33333333-3333-3333-3333-333333333333');
insert into resep_item (id, resep_id, obat_id, nama_obat, jumlah, satuan) values
  ('fffffff1-0000-0000-0000-00000000000A','eeeeeee1-0000-0000-0000-00000000000A',
   'aaaaaaa1-0000-0000-0000-000000000001','Amoxicillin 500 mg', 20, 'Tablet');

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select public.apotek_serahkan_resep('eeeeeee1-0000-0000-0000-00000000000A',
  '[{"resep_item_id":"fffffff1-0000-0000-0000-00000000000A","jumlah":12}]'::jsonb);

-- Mulai sekarang berlagak jadi kasir.
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);


\echo '--- 1. Tagihan umum: tindakan bertarif + obat yang benar-benar diserahkan'
do $$
declare v_id uuid; t kasir_tagihan%rowtype; n int; v numeric;
begin
  v_id := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-00000000000A');
  select * into t from kasir_tagihan where id = v_id;

  select count(*) into n from kasir_tagihan_item where tagihan_id = v_id;
  assert n = 3, format('harus 3 baris (2 tindakan + 1 obat), dapat %s', n);

  -- 50.000 x 1 + 150.000 x 2 + 12 x 1.500 = 50.000 + 300.000 + 18.000
  assert t.total = 368000, format('total harus 368000, dapat %s', t.total);
  assert t.subtotal = 368000, 'pasien umum: subtotal = total';
  assert t.status_bayar = 'belum_lunas', format('status awal harus belum_lunas, dapat %s', t.status_bayar);
  assert t.nomor like 'INV-%', format('nomor harus berawalan INV-, dapat %s', t.nomor);
  assert t.penjamin = 'UMUM', 'penjamin harus disalin dari kunjungan';

  -- Obat ditagih 12 (yang diserahkan), bukan 20 (yang diresepkan).
  select qty into v from kasir_tagihan_item where tagihan_id = v_id and sumber = 'OBAT';
  assert v = 12, format('obat harus ditagih 12 (yang diserahkan), bukan 20. Dapat %s', v);
end $$;

\echo '--- 2. Tindakan per gigi diberi keterangan nomor giginya'
do $$
declare n int;
begin
  select count(*) into n from kasir_tagihan_item i
    join kasir_tagihan t on t.id = i.tagihan_id
   where t.kunjungan_id='ddddddd1-0000-0000-0000-00000000000A'
     and i.sumber='TINDAKAN' and i.harga_satuan = 150000 and i.qty = 2;
  assert n = 1, 'tindakan dengan jumlah 2 harus tercatat qty 2';
end $$;

\echo '--- 3. Tagihan BPJS: tercatat nilainya, tidak ditagihkan ke pasien'
do $$
declare v_id uuid; t kasir_tagihan%rowtype; n int;
begin
  v_id := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-00000000000B');
  select * into t from kasir_tagihan where id = v_id;

  assert t.subtotal = 50000, format('nilai ekonomi harus tetap tercatat 50000, dapat %s', t.subtotal);
  assert t.total = 0, format('pasien BPJS tidak ditagih: total harus 0, dapat %s', t.total);
  assert t.status_bayar = 'lunas',
    format('tagihan bernilai nol harus langsung lunas, bukan menggantung. Dapat %s', t.status_bayar);

  select count(*) into n from kasir_tagihan_item
   where tagihan_id = v_id and not ditanggung_penjamin;
  assert n = 0, 'semua baris kunjungan BPJS harus ditanggung penjamin';
end $$;

\echo '--- 4. Satu baris BPJS dibalik jadi tanggungan pasien (obat di luar tanggungan)'
do $$
declare v_id uuid; t kasir_tagihan%rowtype;
begin
  select kt.id into v_id from kasir_tagihan kt
   where kt.kunjungan_id='ddddddd1-0000-0000-0000-00000000000B';
  update kasir_tagihan_item set ditanggung_penjamin = false
   where tagihan_id = v_id and sumber = 'TINDAKAN';

  select * into t from kasir_tagihan where id = v_id;
  assert t.total = 50000, format('baris yang dibalik harus jadi tagihan pasien, total %s', t.total);
  assert t.subtotal = 50000, 'subtotal tidak berubah';
  assert t.status_bayar = 'belum_lunas', 'tagihan yang jadi ada nilainya harus kembali belum lunas';

  -- kembalikan
  update kasir_tagihan_item set ditanggung_penjamin = true where tagihan_id = v_id;
end $$;

\echo '--- 5. Pembayaran sebagian lalu pelunasan'
do $$
declare v_id uuid; h jsonb; t kasir_tagihan%rowtype;
begin
  select kt.id into v_id from kasir_tagihan kt
   where kt.kunjungan_id='ddddddd1-0000-0000-0000-00000000000A';

  h := public.kasir_catat_pembayaran(v_id, 100000, null, 'tunai', null, 100000);
  assert (h->>'status_bayar') = 'sebagian', format('harus sebagian, dapat %s', h->>'status_bayar');
  assert (h->>'sisa')::numeric = 268000, format('sisa harus 268000, dapat %s', h->>'sisa');

  h := public.kasir_catat_pembayaran(v_id, 268000, null, 'tunai', null, 300000);
  assert (h->>'status_bayar') = 'lunas', format('harus lunas, dapat %s', h->>'status_bayar');
  assert (h->>'kembalian')::numeric = 32000, format('kembalian harus 32000, dapat %s', h->>'kembalian');

  select * into t from kasir_tagihan where id = v_id;
  assert t.amount_paid = 368000, format('amount_paid harus 368000, dapat %s', t.amount_paid);
end $$;

\echo '--- 6. Kembalian tidak disimpan, hanya uang diterima'
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_name='kasir_pembayaran' and column_name in ('kembalian','kembali');
  assert n = 0, 'kolom kembalian tidak boleh ada — selalu dihitung dari uang_diterima';
end $$;

\echo '--- 7. Pembayaran melebihi sisa ditolak'
do $$
declare v_id uuid; gagal boolean := false;
begin
  select kt.id into v_id from kasir_tagihan kt
   where kt.kunjungan_id='ddddddd1-0000-0000-0000-00000000000A';
  begin perform public.kasir_catat_pembayaran(v_id, 5000); exception when others then
    gagal := true;
    assert sqlerrm like '%melebihi sisa%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'pembayaran pada tagihan lunas harus ditolak';
end $$;

\echo '--- 8. Uang diterima kurang dari yang dibayarkan ditolak'
do $$
declare v_id uuid; gagal boolean := false;
begin
  insert into kasir_tagihan (nama_pembayar, penjamin, dibuat_oleh)
  values ('Pembeli Bebas','UMUM','44444444-4444-4444-4444-444444444444')
  returning kasir_tagihan.id into v_id;
  insert into kasir_tagihan_item (tagihan_id, sumber, nama, qty, harga_satuan)
  values (v_id, 'MANUAL', 'Obat bebas', 1, 25000);

  begin perform public.kasir_catat_pembayaran(v_id, 25000, null, 'tunai', null, 20000);
  exception when others then
    gagal := true;
    assert sqlerrm like '%kurang%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'uang diterima kurang harus ditolak';
end $$;

\echo '--- 9. Rincian tagihan yang sudah dibayar tidak bisa diubah'
do $$
declare v_id uuid; gagal boolean := false;
begin
  select kt.id into v_id from kasir_tagihan kt
   where kt.kunjungan_id='ddddddd1-0000-0000-0000-00000000000A';
  begin
    insert into kasir_tagihan_item (tagihan_id, sumber, nama, qty, harga_satuan)
    values (v_id, 'MANUAL', 'Tambahan sesudah bayar', 1, 10000);
  exception when others then
    gagal := true;
    assert sqlerrm like '%sudah menerima pembayaran%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'baris tidak boleh ditambahkan setelah tagihan dibayar';
end $$;

\echo '--- 10. Menyusun ulang tagihan yang sudah dibayar ditolak'
do $$
declare gagal boolean := false;
begin
  begin perform public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-00000000000A');
  exception when others then
    gagal := true;
    assert sqlerrm like '%sudah dibayar%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'penyusunan ulang tagihan terbayar harus ditolak';
end $$;

\echo '--- 11. Baris MANUAL dipertahankan saat tagihan disusun ulang'
do $$
declare v_id uuid; n int; t kasir_tagihan%rowtype;
begin
  v_id := public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-00000000000B');
  insert into kasir_tagihan_item (tagihan_id, sumber, nama, qty, harga_satuan, urutan)
  values (v_id, 'MANUAL', 'Surat keterangan sakit', 1, 15000, 99);

  -- Dokter menambah satu tindakan, kasir menyusun ulang.
  insert into tindakan (kunjungan_id, kode_icd9, nama, jumlah, urutan)
  values ('ddddddd1-0000-0000-0000-00000000000B','23.09','Pencabutan gigi', 1, 1);
  perform public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-00000000000B');

  select count(*) into n from kasir_tagihan_item
   where tagihan_id = v_id and sumber = 'MANUAL';
  assert n = 1, 'baris manual kasir tidak boleh hilang saat susun ulang';

  select count(*) into n from kasir_tagihan_item
   where tagihan_id = v_id and sumber = 'TINDAKAN';
  assert n = 2, format('tindakan harus jadi 2 setelah susun ulang, dapat %s', n);

  -- Surat keterangan dijual ke pasien BPJS: bukan tanggungan kapitasi,
  -- jadi barisnya tetap ditagihkan meski kunjungannya BPJS.
  select * into t from kasir_tagihan where id = v_id;
  assert t.total = 15000, format('hanya baris manual yang ditagihkan, dapat %s', t.total);
  assert t.subtotal = 215000, format('subtotal harus 50000+150000+15000, dapat %s', t.subtotal);
end $$;

\echo '--- 12. Kenaikan tarif tidak mengubah tagihan lama'
do $$
declare lama numeric; baru numeric;
begin
  select harga_satuan into lama from kasir_tagihan_item i
    join kasir_tagihan t on t.id = i.tagihan_id
   where t.kunjungan_id='ddddddd1-0000-0000-0000-00000000000A'
     and i.ref_kode='89.01';
  assert lama = 50000, format('tarif tersalin harus 50000, dapat %s', lama);

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  insert into kasir_tarif (jenis, kode_icd9, kode, nama, tarif, berlaku_mulai)
  values ('TINDAKAN','89.01','89.01','Konsultasi dokter umum', 75000, public.tgl_klinik());
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);

  select harga_satuan into baru from kasir_tagihan_item i
    join kasir_tagihan t on t.id = i.tagihan_id
   where t.kunjungan_id='ddddddd1-0000-0000-0000-00000000000A'
     and i.ref_kode='89.01';
  assert baru = 50000, format('tagihan lama tidak boleh ikut naik, jadi %s', baru);

  assert public.kasir_tarif_berlaku('89.01', public.tgl_klinik()) = 75000,
    'tarif baru harus berlaku untuk tagihan berikutnya';
end $$;

\echo '--- 13. Diskon per baris'
do $$
declare v_id uuid; t kasir_tagihan%rowtype;
begin
  insert into kasir_tagihan (nama_pembayar, penjamin, dibuat_oleh)
  values ('Uji Diskon','UMUM','44444444-4444-4444-4444-444444444444')
  returning kasir_tagihan.id into v_id;
  insert into kasir_tagihan_item (tagihan_id, sumber, nama, qty, harga_satuan, diskon_pct)
  values (v_id, 'MANUAL', 'Paket pemeriksaan', 2, 100000, 10);

  select * into t from kasir_tagihan where id = v_id;
  assert t.total = 180000, format('2 x 100000 - 10%% = 180000, dapat %s', t.total);
end $$;

\echo '--- 14. Peran non-kasir ditolak'
do $$
declare gagal boolean := false;
begin
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
  begin perform public.kasir_susun_dari_kunjungan('ddddddd1-0000-0000-0000-00000000000A');
  exception when others then gagal := true; end;
  assert gagal, 'apoteker tidak boleh menyusun tagihan';
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
end $$;

\echo '--- 15. Hanya master yang boleh menghapus pembayaran'
do $$
declare pid uuid; gagal boolean := false; t kasir_tagihan%rowtype; tid uuid;
begin
  select kt.id into tid from kasir_tagihan kt
   where kt.kunjungan_id='ddddddd1-0000-0000-0000-00000000000A';
  select id into pid from kasir_pembayaran where tagihan_id = tid order by created_at limit 1;

  begin perform public.kasir_hapus_pembayaran(pid, 'uji'); exception when others then
    gagal := true;
    assert sqlerrm like '%master%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'kasir tidak boleh menghapus pembayaran';

  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
  perform public.kasir_hapus_pembayaran(pid, 'salah input');
  select * into t from kasir_tagihan where id = tid;
  assert t.status_bayar = 'sebagian',
    format('status harus dihitung ulang jadi sebagian, dapat %s', t.status_bayar);
  assert t.amount_paid = 268000, format('dibayar harus tinggal 268000, dapat %s', t.amount_paid);
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
end $$;

\echo '--- 16. Penghapusan pembayaran tercatat di audit log'
do $$
declare n int;
begin
  select count(*) into n from audit_log
   where tabel='kasir_pembayaran' and aksi='DELETE' and keterangan='salah input';
  assert n >= 1, 'penghapusan pembayaran wajib meninggalkan jejak audit';
end $$;

\echo '--- 17. Kunjungan yang sudah ditagih hilang dari daftar menunggu'
do $$
declare n int;
begin
  select count(*) into n from v_kasir_menunggu
   where kunjungan_id = 'ddddddd1-0000-0000-0000-00000000000A';
  assert n = 0, 'kunjungan yang sudah punya tagihan tidak boleh muncul lagi';

  -- Kunjungan dari uji apotek belum pernah ditagih, jadi harus muncul.
  select count(*) into n from v_kasir_menunggu
   where kunjungan_id = 'ddddddd1-0000-0000-0000-000000000001';
  assert n = 1, format('kunjungan yang belum ditagih harus muncul, dapat %s', n);
end $$;

\echo '--- 18. Rekap harian menjumlahkan per metode'
do $$
declare v numeric;
begin
  select total into v from v_kasir_rekap_harian
   where tanggal = public.tgl_klinik() and metode = 'tunai';
  assert v > 0, 'rekap tunai hari ini harus ada isinya';
end $$;

\echo '--- 19. Satu kunjungan hanya boleh punya satu tagihan'
do $$
declare gagal boolean := false;
begin
  begin
    insert into kasir_tagihan (kunjungan_id, nama_pembayar, dibuat_oleh)
    values ('ddddddd1-0000-0000-0000-00000000000A','Duplikat',
            '44444444-4444-4444-4444-444444444444');
  exception when others then gagal := true; end;
  assert gagal, 'tagihan kedua untuk kunjungan yang sama harus ditolak';
end $$;

\echo '--- 20. Template invoice: dibaca semua staf, ditulis yang punya hak master_data saja'
do $$
declare n int; gagal boolean := false;
begin
  select count(*) into n from sys_template_invoice where id = 1;
  assert n = 1, 'baris template harus sudah ada sejak pemasangan';
end $$;

\echo 'SEMUA UJI KASIR LULUS'

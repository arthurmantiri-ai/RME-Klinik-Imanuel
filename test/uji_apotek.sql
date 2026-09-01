-- =====================================================================
--  UJI FUNGSIONAL MODUL APOTEK
--  Dijalankan dengan psql -v ON_ERROR_STOP=1
--  Setiap pemeriksaan memakai assert; skrip berhenti pada kegagalan pertama.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Persiapan: pengguna, obat, pasien, kunjungan, resep
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','admin@uji.id'),
  ('22222222-2222-2222-2222-222222222222','apoteker@uji.id'),
  ('33333333-3333-3333-3333-333333333333','dokter@uji.id'),
  ('44444444-4444-4444-4444-444444444444','kasir@uji.id')
on conflict do nothing;

update pegawai set nama='Admin Uji',    peran='admin'     where id='11111111-1111-1111-1111-111111111111';
update pegawai set nama='Apt Uji',      peran='apoteker'  where id='22222222-2222-2222-2222-222222222222';
update pegawai set nama='dr Uji',       peran='dokter'    where id='33333333-3333-3333-3333-333333333333';
update pegawai set nama='Kasir Uji',    peran='kasir'     where id='44444444-4444-4444-4444-444444444444';

insert into obat (id, kode_internal, nama, satuan, harga) values
  ('aaaaaaa1-0000-0000-0000-000000000001','UJI-AMX','Amoxicillin 500 mg','Tablet', 1500),
  ('aaaaaaa1-0000-0000-0000-000000000002','UJI-PCT','Paracetamol 500 mg','Tablet',  800)
on conflict (id) do nothing;

insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin)
values ('bbbbbbb1-0000-0000-0000-000000000001','UJI001','Pasien Uji','1990-05-05','L')
on conflict (id) do nothing;

insert into poli (id, kode, nama) values
  ('ccccccc1-0000-0000-0000-000000000001','UJIPOLI','Poli Uji')
on conflict (kode) do nothing;

insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal)
values ('ddddddd1-0000-0000-0000-000000000001','UJI-KUNJ-1',
        'bbbbbbb1-0000-0000-0000-000000000001','ccccccc1-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333','UMUM', public.tgl_klinik())
on conflict (id) do nothing;

insert into resep (id, kunjungan_id, no_resep, dibuat_oleh)
values ('eeeeeee1-0000-0000-0000-000000000001','ddddddd1-0000-0000-0000-000000000001',
        'UJI-R-1','33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

insert into resep_item (id, resep_id, obat_id, nama_obat, jumlah, satuan, signa, urutan) values
  ('fffffff1-0000-0000-0000-000000000001','eeeeeee1-0000-0000-0000-000000000001',
   'aaaaaaa1-0000-0000-0000-000000000001','Amoxicillin 500 mg', 15,'Tablet','3x1', 0),
  ('fffffff1-0000-0000-0000-000000000002','eeeeeee1-0000-0000-0000-000000000001',
   'aaaaaaa1-0000-0000-0000-000000000002','Paracetamol 500 mg', 10,'Tablet','3x1', 1)
on conflict (id) do nothing;

-- Berlagak jadi apoteker untuk seluruh pengujian di bawah.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);

\echo '--- 1. Obat masuk: dua batch dengan expired berbeda'
do $$
declare h jsonb;
begin
  -- Batch B: expired LEBIH LAMA, masuk LEBIH DULU
  h := public.apotek_masuk('aaaaaaa1-0000-0000-0000-000000000001', 100, 1000,
        public.tgl_klinik() + 365, 'PBF Lama', 'FK-001', public.tgl_klinik() - 10);
  assert (h->>'digabung')::boolean = false, 'batch pertama tidak boleh digabung';

  -- Batch A: expired LEBIH DEKAT, masuk BELAKANGAN.
  -- Dengan FIFO batch ini akan mengendap sampai kadaluwarsa; dengan FEFO
  -- ia yang keluar duluan. Inilah inti perbedaannya.
  h := public.apotek_masuk('aaaaaaa1-0000-0000-0000-000000000001', 30, 1200,
        public.tgl_klinik() + 40, 'PBF Baru', 'FK-002', public.tgl_klinik() - 2);
  assert (h->>'digabung')::boolean = false, 'batch kedua tidak boleh digabung';

  h := public.apotek_masuk('aaaaaaa1-0000-0000-0000-000000000002', 50, 500,
        public.tgl_klinik() + 200, 'PBF Lama', 'FK-003');
end $$;

do $$ declare n int; begin
  select count(*) into n from apotek_batch;
  assert n = 3, format('harus ada 3 batch, ada %s', n);
end $$;

\echo '--- 2. Batch identik digabung, bukan dibuat baru'
do $$
declare h jsonb; n int;
begin
  h := public.apotek_masuk('aaaaaaa1-0000-0000-0000-000000000001', 20, 1000,
        public.tgl_klinik() + 365, 'pbf lama', 'FK-001', public.tgl_klinik() - 10);
  assert (h->>'digabung')::boolean = true, 'batch identik harus digabung';
  assert (h->>'stok_sisa')::numeric = 120, format('stok setelah gabung harus 120, dapat %s', h->>'stok_sisa');
  select count(*) into n from apotek_batch;
  assert n = 3, format('jumlah batch tidak boleh bertambah, jadi %s', n);
end $$;

\echo '--- 3. FEFO: yang paling dekat expired keluar duluan'
do $$
declare h jsonb; p jsonb; sisa_dekat numeric; sisa_lama numeric;
begin
  h := public.apotek_keluar('aaaaaaa1-0000-0000-0000-000000000001', 10, 'Penjualan Bebas');
  p := h->'potongan';
  assert jsonb_array_length(p) = 1, 'harus cukup dari satu batch';
  assert (p->0->>'pbf') = 'PBF Baru',
    format('FEFO harus mengambil batch expired terdekat (PBF Baru), bukan %s', p->0->>'pbf');
  assert (h->>'total_nilai')::numeric = 12000,
    format('nilai keluar harus 10 x 1200 = 12000, dapat %s', h->>'total_nilai');

  select stok_sisa into sisa_dekat from apotek_batch where no_faktur='FK-002';
  select stok_sisa into sisa_lama  from apotek_batch where no_faktur='FK-001';
  assert sisa_dekat = 20,  format('batch dekat-expired harus sisa 20, dapat %s', sisa_dekat);
  assert sisa_lama  = 120, format('batch lama tidak boleh tersentuh, dapat %s', sisa_lama);
end $$;

\echo '--- 4. Permintaan besar terpecah ke beberapa batch, harga per batch dihormati'
create temp table jejak_grup (nama text primary key, grup uuid);

do $$
declare h jsonb; p jsonb;
begin
  h := public.apotek_keluar('aaaaaaa1-0000-0000-0000-000000000001', 30, 'Penjualan Bebas');
  p := h->'potongan';
  insert into jejak_grup values ('pecah', (h->>'grup_id')::uuid);
  assert jsonb_array_length(p) = 2, format('harus terpecah 2 batch, dapat %s', jsonb_array_length(p));
  assert (p->0->>'jumlah')::numeric = 20, 'sisa batch dekat-expired diambil habis lebih dulu';
  assert (p->1->>'jumlah')::numeric = 10, 'kekurangannya dari batch berikutnya';
  -- 20 x 1200 + 10 x 1000 = 34000. Kalau harga diambil dari master obat
  -- dan bukan dari batch, hasilnya akan 30 x 1500 = 45000.
  assert (h->>'total_nilai')::numeric = 34000,
    format('nilai harus 34000 (harga per batch), dapat %s', h->>'total_nilai');
end $$;

\echo '--- 5. Semua potongan satu perintah berbagi grup_id yang sama'
do $$
declare n int; total numeric;
begin
  select count(*), coalesce(sum(jumlah),0) into n, total
    from apotek_transaksi
   where grup_id = (select grup from jejak_grup where nama='pecah');
  assert n = 2, format('perintah yang terpecah harus meninggalkan 2 baris dalam satu grup, dapat %s', n);
  assert total = 30, format('jumlah seluruh baris satu grup harus 30, dapat %s', total);
end $$;

\echo '--- 6. Stok kurang ditolak, dan tidak menyisakan potongan setengah'
do $$
declare gagal boolean := false; sisa_sebelum numeric; sisa_sesudah numeric;
begin
  select coalesce(sum(stok_sisa),0) into sisa_sebelum from apotek_batch
   where obat_id='aaaaaaa1-0000-0000-0000-000000000001';
  begin
    perform public.apotek_keluar('aaaaaaa1-0000-0000-0000-000000000001', 99999, 'Penjualan Bebas');
  exception when others then
    gagal := true;
    assert sqlerrm like '%tidak cukup%', format('pesan harus menyebut stok kurang, dapat: %s', sqlerrm);
  end;
  assert gagal, 'permintaan melebihi stok harus ditolak';
  select coalesce(sum(stok_sisa),0) into sisa_sesudah from apotek_batch
   where obat_id='aaaaaaa1-0000-0000-0000-000000000001';
  assert sisa_sebelum = sisa_sesudah,
    format('stok tidak boleh berubah setelah penolakan: %s -> %s', sisa_sebelum, sisa_sesudah);
end $$;

\echo '--- 7. Batch kadaluwarsa terkunci untuk pasien, terbuka untuk pemusnahan'
do $$
declare gagal boolean := false; h jsonb;
begin
  insert into apotek_batch (obat_id, tgl_expired, tgl_masuk, no_faktur, pbf,
                            harga_beli, stok_awal, stok_sisa)
  values ('aaaaaaa1-0000-0000-0000-000000000002', public.tgl_klinik() - 5,
          public.tgl_klinik() - 300, 'FK-EXP', 'PBF Lama', 500, 40, 40);

  -- Untuk pasien: hanya 50 tablet layak yang boleh dihitung, bukan 90.
  begin
    perform public.apotek_keluar('aaaaaaa1-0000-0000-0000-000000000002', 60, 'Resep Pasien');
  exception when others then gagal := true; end;
  assert gagal, 'batch kadaluwarsa tidak boleh ikut melayani resep pasien';

  -- Untuk pemusnahan: justru batch itulah sasarannya.
  h := public.apotek_keluar('aaaaaaa1-0000-0000-0000-000000000002', 40, 'Obat Expired',
                            null, null, null, null, 'Dimusnahkan sesuai berita acara');
  assert (h->'potongan'->0->>'pbf') = 'PBF Lama', 'pemusnahan harus mengambil batch kadaluwarsa';
end $$;

\echo '--- 8. Penyerahan resep memotong stok dan menandai resep'
do $$
declare h jsonb; r resep%rowtype; ri resep_item%rowtype; n int;
begin
  h := public.apotek_serahkan_resep(
    'eeeeeee1-0000-0000-0000-000000000001',
    '[{"resep_item_id":"fffffff1-0000-0000-0000-000000000001","jumlah":15},
      {"resep_item_id":"fffffff1-0000-0000-0000-000000000002","jumlah":10}]'::jsonb);

  assert (h->>'butir')::int = 2, 'dua butir harus terserahkan';
  assert (h->>'sebagian')::boolean = false, 'resep lengkap tidak boleh ditandai sebagian';

  select * into r from resep where id='eeeeeee1-0000-0000-0000-000000000001';
  assert r.status = 'DISERAHKAN', format('status resep harus DISERAHKAN, dapat %s', r.status);
  assert r.diserahkan_oleh = '22222222-2222-2222-2222-222222222222', 'penyerah harus tercatat';

  select * into ri from resep_item where id='fffffff1-0000-0000-0000-000000000001';
  assert ri.jumlah_diserahkan = 15, 'jumlah diserahkan harus tercatat';

  -- Pengeluaran resep wajib membawa identitas pasien dan kunjungan.
  select count(*) into n from apotek_transaksi
   where kategori='Resep Pasien' and kunjungan_id='ddddddd1-0000-0000-0000-000000000001'
     and pasien_id='bbbbbbb1-0000-0000-0000-000000000001';
  assert n >= 2, format('pengeluaran resep harus tertaut kunjungan & pasien, dapat %s baris', n);
end $$;

\echo '--- 9. Resep yang sudah diserahkan tidak bisa diserahkan dua kali'
do $$
declare gagal boolean := false;
begin
  begin
    perform public.apotek_serahkan_resep('eeeeeee1-0000-0000-0000-000000000001',
      '[{"resep_item_id":"fffffff1-0000-0000-0000-000000000001","jumlah":5}]'::jsonb);
  exception when others then gagal := true; end;
  assert gagal, 'penyerahan ganda harus ditolak';
end $$;

\echo '--- 10. Pembatalan grup mengembalikan stok dan membuka resep kembali'
do $$
declare g uuid; sebelum numeric; sesudah numeric; r resep%rowtype; ri resep_item%rowtype;
begin
  select grup_id into g from apotek_transaksi
   where resep_item_id='fffffff1-0000-0000-0000-000000000001' limit 1;
  select coalesce(sum(stok_sisa),0) into sebelum from apotek_batch
   where obat_id='aaaaaaa1-0000-0000-0000-000000000001';

  perform public.apotek_batalkan_grup(g, 'salah input');

  select coalesce(sum(stok_sisa),0) into sesudah from apotek_batch
   where obat_id='aaaaaaa1-0000-0000-0000-000000000001';
  assert sesudah = sebelum + 15, format('stok harus kembali +15: %s -> %s', sebelum, sesudah);

  select * into r from resep where id='eeeeeee1-0000-0000-0000-000000000001';
  assert r.status = 'DIBUAT', format('resep harus terbuka lagi, status %s', r.status);
  select * into ri from resep_item where id='fffffff1-0000-0000-0000-000000000001';
  assert ri.jumlah_diserahkan is null, 'jumlah diserahkan harus dikosongkan';
end $$;

\echo '--- 11. Pembatalan dua kali ditolak'
do $$
declare g uuid; gagal boolean := false;
begin
  select grup_id into g from apotek_transaksi where dibatalkan limit 1;
  begin perform public.apotek_batalkan_grup(g); exception when others then gagal := true; end;
  assert gagal, 'grup yang sudah dibatalkan tidak boleh dibatalkan lagi';
end $$;

\echo '--- 12. Pembatalan lewat 7 hari ditolak'
do $$
declare g uuid; gagal boolean := false;
begin
  select grup_id into g from apotek_transaksi
   where jenis='MASUK' and not dibatalkan limit 1;
  update apotek_transaksi set tanggal = public.tgl_klinik() - 30 where grup_id = g;
  begin perform public.apotek_batalkan_grup(g); exception when others then
    gagal := true;
    assert sqlerrm like '%7 hari%', format('pesan harus menyebut batas 7 hari: %s', sqlerrm);
  end;
  assert gagal, 'transaksi lama tidak boleh dibatalkan';
  update apotek_transaksi set tanggal = public.tgl_klinik() where grup_id = g;
end $$;

\echo '--- 13. Pembatalan pemasukan yang stoknya sudah terpakai ditolak'
do $$
declare g uuid; gagal boolean := false;
begin
  -- Batch FK-002 sudah habis terpakai di uji 3 & 4.
  select grup_id into g from apotek_transaksi
   where jenis='MASUK' and no_faktur='FK-002' and not dibatalkan limit 1;
  begin perform public.apotek_batalkan_grup(g); exception when others then
    gagal := true;
    assert sqlerrm like '%terpakai sebagian%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'pemasukan yang sudah terpakai tidak boleh dibatalkan';
end $$;

\echo '--- 14. Butir resep tanpa obat_id ditolak dengan pesan yang jelas'
do $$
declare gagal boolean := false;
begin
  insert into resep_item (id, resep_id, obat_id, nama_obat, jumlah, satuan)
  values ('fffffff1-0000-0000-0000-000000000009','eeeeeee1-0000-0000-0000-000000000001',
          null, 'Obat Racikan Tanpa Master', 5, 'Bungkus');
  begin
    perform public.apotek_serahkan_resep('eeeeeee1-0000-0000-0000-000000000001',
      '[{"resep_item_id":"fffffff1-0000-0000-0000-000000000009","jumlah":5}]'::jsonb);
  exception when others then
    gagal := true;
    assert sqlerrm like '%belum tertaut ke master obat%', format('pesan tidak sesuai: %s', sqlerrm);
  end;
  assert gagal, 'butir tanpa master obat harus ditolak';
  delete from resep_item where id='fffffff1-0000-0000-0000-000000000009';
end $$;

\echo '--- 15. Peran non-apoteker ditolak'
do $$
declare gagal boolean := false;
begin
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
  begin
    perform public.apotek_keluar('aaaaaaa1-0000-0000-0000-000000000001', 1, 'Penjualan Bebas');
  exception when others then
    gagal := true;
    assert sqlerrm like '%apoteker%', format('pesan harus menyebut apoteker: %s', sqlerrm);
  end;
  assert gagal, 'dokter tidak boleh mengeluarkan obat';
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
end $$;

\echo '--- 16. View stok konsisten dengan jumlah batch'
do $$
declare v numeric; b numeric;
begin
  select stok_total into v from v_apotek_stok where obat_id='aaaaaaa1-0000-0000-0000-000000000001';
  select coalesce(sum(stok_sisa),0) into b from apotek_batch
   where obat_id='aaaaaaa1-0000-0000-0000-000000000001';
  assert v = b, format('v_apotek_stok (%s) harus sama dengan jumlah batch (%s)', v, b);
end $$;

\echo '--- 17. Antrean farmasi menampilkan resep yang belum diserahkan'
do $$
declare n int;
begin
  select count(*) into n from v_antrean_farmasi
   where resep_id='eeeeeee1-0000-0000-0000-000000000001' and status='DIBUAT';
  assert n = 1, format('resep terbuka harus muncul di antrean, dapat %s', n);
end $$;

\echo 'SEMUA UJI APOTEK LULUS'

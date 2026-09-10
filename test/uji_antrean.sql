-- =====================================================================
--  UJI FUNGSIONAL ANTREAN ONLINE (Antrol) & LAYAR TUNGGU
--  Dijalankan SETELAH uji_periksa.sql (memakai pengguna, poli, dan
--  pasien yang sudah dibuat berkas uji sebelumnya).
--
--  Yang diuji di sini bukan "apakah tabelnya ada" melainkan APA YANG
--  AKAN DILIHAT BPJS. Seluruh logika Antrol hidup sebagai fungsi SQL
--  justru supaya bisa diuji di sini — kalau ia ditulis di dalam Edge
--  Function, satu-satunya cara mengujinya adalah menjalankan Deno,
--  yang berarti ia tidak akan pernah diuji.
--
--  Kode metadata di bawah (200 / 201 / 202) adalah kode yang benar-benar
--  akan dibaca aplikasi Mobile JKN saat UAT.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);

-- ---------------------------------------------------------------------
-- Persiapan: poli antrean sendiri supaya tidak mengganggu uji lain,
-- pasien BPJS yang sudah dikenal, dan jadwal yang buka setiap hari.
-- ---------------------------------------------------------------------
insert into poli (id, kode, nama, kode_pcare, prefix_antrean, urutan)
values ('ccccccc1-0000-0000-0000-0000000000A1','UJIANT','Poli Antrean Uji','901','Q', 90)
on conflict (id) do update set kode_pcare = '901', prefix_antrean = 'Q', aktif = true;

insert into poli (id, kode, nama, kode_pcare, prefix_antrean, urutan)
values ('ccccccc1-0000-0000-0000-0000000000A2','UJIANT2','Poli Antrean Uji 2','902','R', 91)
on conflict (id) do update set kode_pcare = '902', prefix_antrean = 'R', aktif = true;

-- Buka tujuh hari, kuota longgar. Jam tutup online dibuat 23:59 supaya
-- uji tidak bergantung pada jam berapa berkas ini dijalankan.
delete from poli_jadwal where poli_id in
  ('ccccccc1-0000-0000-0000-0000000000A1','ccccccc1-0000-0000-0000-0000000000A2');
insert into poli_jadwal (poli_id, hari, sesi, jam_buka, jam_tutup, jam_tutup_online, kuota, kuota_online)
select p.id, h.hari, 1, '00:00'::time, '23:59'::time, '23:59'::time, 50, 25
  from (values ('ccccccc1-0000-0000-0000-0000000000A1'::uuid),
               ('ccccccc1-0000-0000-0000-0000000000A2'::uuid)) p(id)
 cross join (select generate_series(0,6) as hari) h;

insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin, no_bpjs, nik)
values ('bbbbbbb1-0000-0000-0000-0000000000A1','UJIANT1','Peserta Antrean Uji',
        '1988-04-04','P','0009876543210','7371040404040001')
on conflict (id) do update set no_bpjs = '0009876543210', nik = '7371040404040001';

delete from antrean where poli_id in
  ('ccccccc1-0000-0000-0000-0000000000A1','ccccccc1-0000-0000-0000-0000000000A2');


\echo '--- 1. Nomor antrean berurut per poli, memakai awalan huruf poli'
do $$
declare a1 antrean; a2 antrean; b1 antrean;
begin
  insert into antrean (poli_id, pasien_id) values
    ('ccccccc1-0000-0000-0000-0000000000A1','bbbbbbb1-0000-0000-0000-000000000001')
    returning * into a1;
  insert into antrean (poli_id) values ('ccccccc1-0000-0000-0000-0000000000A1')
    returning * into a2;
  insert into antrean (poli_id) values ('ccccccc1-0000-0000-0000-0000000000A2')
    returning * into b1;

  assert a1.no_urut = 1 and a2.no_urut = 2, 'nomor harus berurut dalam satu poli';
  assert b1.no_urut = 1, 'poli lain punya deret nomornya sendiri';
  assert a1.nomor = 'Q-001', 'nomor salah: ' || a1.nomor;
  assert b1.nomor = 'R-001', 'awalan huruf harus ikut poli: ' || b1.nomor;
  assert a1.kode_booking like 'ANT-%', 'kode booking tidak terbit';
  assert a1.status = 'MENUNGGU' and a1.tahap = 'LOKET', 'keadaan awal salah';
end $$;


\echo '--- 2. Nomor ke-1000 tidak terpotong (lpad memotong, padStart tidak)'
do $$
declare a antrean;
begin
  -- lpad('1000', 3, '0') di PostgreSQL memulangkan '100'. Bug persis ini
  -- pernah lolos di penomoran surat dan baru ketahuan pada surat ke-100.
  insert into antrean (poli_id, no_urut) values
    ('ccccccc1-0000-0000-0000-0000000000A2', 1000) returning * into a;
  assert a.nomor = 'R-1000', 'nomor empat digit terpotong: ' || a.nomor;
  delete from antrean where id = a.id;
end $$;


\echo '--- 3. Nomor kembar dalam satu poli pada satu hari ditolak database'
do $$
declare v_ditolak boolean := false;
begin
  begin
    insert into antrean (poli_id, no_urut) values
      ('ccccccc1-0000-0000-0000-0000000000A1', 1);
  exception when unique_violation then v_ditolak := true;
  end;
  assert v_ditolak, 'dua nomor yang sama harus ditolak, bukan diterima diam-diam';
end $$;


\echo '--- 4. Antrol menolak nomor kartu dan NIK yang tidak berbentuk'
do $$
declare r jsonb;
begin
  r := public.antrol_ambil('', '7371040404040001', '901', to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '201', 'kartu kosong harus 201';
  assert r#>>'{metadata,message}' ilike '%tidak boleh kosong%', r#>>'{metadata,message}';
  assert not (r ? 'response'), 'jawaban gagal tidak boleh memuat response';

  r := public.antrol_ambil('12345', '7371040404040001', '901', to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,message}' ilike '%13 digit%', r#>>'{metadata,message}';

  r := public.antrol_ambil('000987654321X', '7371040404040001', '901', to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,message}' ilike '%format nomor kartu%', r#>>'{metadata,message}';

  r := public.antrol_ambil('0009876543210', '123', '901', to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,message}' ilike '%16 digit%', r#>>'{metadata,message}';

  r := public.antrol_ambil('0009876543210', '7371040404040001', '901', '05-09-2026');
  assert r#>>'{metadata,message}' ilike '%yyyy-mm-dd%', r#>>'{metadata,message}';
end $$;


\echo '--- 5. Kode poli yang dikirim BPJS adalah kdPoli PCare, bukan kode klinik'
do $$
declare r jsonb;
begin
  -- 'UJIANT' adalah kode poli MILIK KLINIK. BPJS tidak pernah mengirimnya.
  r := public.antrol_ambil('0009876543210','7371040404040001','UJIANT',
                           to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '201', 'kode poli klinik tidak boleh diterima';
  assert r#>>'{metadata,message}' = 'Poli tidak ditemukan', r#>>'{metadata,message}';
end $$;


\echo '--- 6. Tanggal mundur ditolak, tanggal besok diterima'
do $$
declare r jsonb;
begin
  r := public.antrol_status('901', to_char(public.tgl_klinik() - 1,'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '201', 'tanggal kemarin harus ditolak';
  assert r#>>'{metadata,message}' ilike '%mundur%', r#>>'{metadata,message}';

  r := public.antrol_status('901', to_char(public.tgl_klinik() + 1,'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '200', 'tanggal besok harus boleh: ' || r::text;
end $$;


\echo '--- 7. Pengambilan berhasil memulangkan nomor, angka, dan sisa antrean'
do $$
declare r jsonb; v_tgl text := to_char(public.tgl_klinik(),'YYYY-MM-DD');
begin
  r := public.antrol_ambil('0009876543210','7371040404040001','901', v_tgl);
  assert r#>>'{metadata,code}' = '200',
    'peserta yang sudah jadi pasien harus 200, dapat ' || r::text;
  -- Q-001 dan Q-002 lahir di uji 1; nomor kembar di uji 3 ditolak dan
  -- karena itu TIDAK menghabiskan nomor.
  assert r#>>'{response,nomorantrean}' = 'Q-003',
    'nomorantrean salah: ' || coalesce(r#>>'{response,nomorantrean}','null');
  assert r#>>'{response,angkaantrean}' = '3', 'angkaantrean harus angka telanjang';
  assert r#>>'{response,namapoli}' = 'Poli Antrean Uji', r#>>'{response,namapoli}';
  assert r#>>'{response,sisaantrean}' = '2', 'sisa di depannya salah: ' || r#>>'{response,sisaantrean}';
  assert length(r#>>'{response,keterangan}') > 10, 'keterangan untuk pasien tidak boleh kosong';
  assert (select pasien_id from antrean where kode_booking = r#>>'{response,kodebooking}')
         = 'bbbbbbb1-0000-0000-0000-0000000000A1',
    'peserta yang sudah dikenal harus langsung tertaut ke rekam medisnya';
end $$;


\echo '--- 8. Jawaban memakai "metadata" huruf kecil, bukan "metaData" PCare'
do $$
declare r jsonb;
begin
  r := public.antrol_status('901', to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  -- Satu huruf besar di sini membuat Mobile JKN membaca seluruh jawaban
  -- kita sebagai gagal, tanpa pesan galat apa pun di sisi klinik.
  assert r ? 'metadata',      'kunci harus "metadata" (huruf kecil semua)';
  assert not (r ? 'metaData'), 'metaData milik PCare, bukan Antrol FKTP';
end $$;


\echo '--- 9. Satu peserta hanya boleh satu nomor per poli per hari'
do $$
declare r jsonb; v_tgl text := to_char(public.tgl_klinik(),'YYYY-MM-DD');
begin
  r := public.antrol_ambil('0009876543210','7371040404040001','901', v_tgl);
  assert r#>>'{metadata,code}' = '201', 'pengambilan kedua harus ditolak';
  assert r#>>'{metadata,message}' ilike '%satu kali%', r#>>'{metadata,message}';

  -- Poli lain pada hari yang sama tetap boleh.
  r := public.antrol_ambil('0009876543210','7371040404040001','902', v_tgl);
  assert r#>>'{metadata,code}' = '200', 'poli berbeda harus boleh: ' || r::text;
end $$;


\echo '--- 10. Nomor yang sudah diambil di loket menutup jalur online'
do $$
declare r jsonb; v_tgl text := to_char(public.tgl_klinik(),'YYYY-MM-DD');
begin
  -- Celah antar-jalur: indeks unik hanya menjaga sumber ONLINE, karena
  -- loket tidak boleh pernah terhalang. Yang menutup celahnya adalah
  -- pemeriksaan di dalam antrol_ambil.
  insert into antrean (poli_id, sumber, no_kartu, nik)
  values ('ccccccc1-0000-0000-0000-0000000000A1','LOKET','0001111111111','7371010101019999');

  r := public.antrol_ambil('0001111111111','7371010101019999','901', v_tgl);
  assert r#>>'{metadata,code}' = '201',
    'nomor loket harus menghalangi nomor online untuk kartu yang sama';
  assert r#>>'{metadata,message}' ilike '%satu kali%', r#>>'{metadata,message}';
end $$;


\echo '--- 11. Peserta yang belum jadi pasien tetap dapat nomor, dengan kode 202'
do $$
declare r jsonb; a antrean;
begin
  r := public.antrol_ambil('0002222222222','7371020202029999','901',
                           to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  -- Kode 202 memberi tahu Mobile JKN untuk mengirim data dirinya.
  -- Nomornya TETAP terbit: pasien yang sudah berangkat tidak boleh
  -- disuruh pulang hanya karena namanya belum ada di komputer.
  assert r#>>'{metadata,code}' = '202', 'pasien baru harus 202, dapat ' || r::text;
  assert r ? 'response', 'kode 202 tetap harus memulangkan nomor antrean';

  select * into a from antrean where kode_booking = r#>>'{response,kodebooking}';
  assert a.pasien_id is null, 'pasien tidak boleh dibuat otomatis dari data Mobile JKN';
  assert a.no_kartu = '0002222222222' and a.nik = '7371020202029999',
    'identitas peserta harus tersimpan supaya petugas bisa mencocokkannya';
end $$;


\echo '--- 12. POST /peserta melengkapi data calon, bukan menerbitkan rekam medis'
do $$
declare r jsonb; a antrean; v_rm_sebelum bigint;
begin
  select count(*) into v_rm_sebelum from pasien;

  r := public.antrol_peserta_baru(jsonb_build_object(
    'nomorkartu','0002222222222', 'nik','7371020202029999',
    'nama','Peserta Baru Mobile JKN', 'jeniskelamin','L',
    'tanggallahir','1995-07-07', 'alamat','Jl. Contoh No. 1'));
  assert r#>>'{metadata,code}' = '200', r::text;

  assert (select count(*) from pasien) = v_rm_sebelum,
    'nomor rekam medis tidak boleh terbit tanpa dilihat petugas';

  select * into a from antrean
   where no_kartu = '0002222222222' and tanggal = public.tgl_klinik();
  assert a.nama_snapshot = 'Peserta Baru Mobile JKN', 'nama calon tidak tersimpan';
  assert a.catatan ilike '%1995-07-07%', 'data calon harus lengkap untuk petugas loket';

  r := public.antrol_peserta_baru(jsonb_build_object(
    'nomorkartu','0003333333333','nik','7371030303039999','nama','Tanpa Antrean'));
  assert r#>>'{metadata,code}' = '201', 'peserta tanpa antrean harus ditolak';
end $$;


\echo '--- 13. Poli libur dan poli tutup menolak pemesanan'
do $$
declare r jsonb; v_besok date := public.tgl_klinik() + 1;
begin
  insert into poli_libur (tanggal, poli_id, keterangan)
  values (v_besok, 'ccccccc1-0000-0000-0000-0000000000A1','Uji libur');

  r := public.antrol_ambil('0004444444444','7371040404049999','901',
                           to_char(v_besok,'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '201', 'hari libur harus menolak';
  assert r#>>'{metadata,message}' ilike '%tutup%', r#>>'{metadata,message}';

  -- Libur satu poli tidak boleh menutup poli lain.
  r := public.antrol_ambil('0004444444444','7371040404049999','902',
                           to_char(v_besok,'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' in ('200','202'), 'poli lain harus tetap buka: ' || r::text;

  delete from poli_libur where tanggal = v_besok;
end $$;


\echo '--- 14. Jam tutup online berlaku untuk hari ini saja, tidak untuk besok'
do $$
declare r jsonb;
begin
  -- Poli sudah tutup online sejak pukul 00:01 hari ini.
  update poli_jadwal set jam_tutup_online = '00:01'
   where poli_id = 'ccccccc1-0000-0000-0000-0000000000A1';

  r := public.antrol_ambil('0005555555555','7371050505059999','901',
                           to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '201', 'pendaftaran online hari ini sudah lewat jam';
  assert r#>>'{metadata,message}' ilike '%ditutup pukul 00:01%', r#>>'{metadata,message}';

  -- Besok belum lewat. Menolaknya adalah bug yang paling mudah dibuat:
  -- jam ditimbang tanpa melihat tanggal mana yang diminta.
  r := public.antrol_ambil('0005555555555','7371050505059999','901',
                           to_char(public.tgl_klinik() + 1,'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' in ('200','202'),
    'pemesanan untuk besok tidak boleh ditolak oleh jam tutup hari ini: ' || r::text;

  update poli_jadwal set jam_tutup_online = '23:59'
   where poli_id = 'ccccccc1-0000-0000-0000-0000000000A1';
  delete from antrean where no_kartu = '0005555555555';
end $$;


\echo '--- 15. Kuota online habis menolak, kuota loket tidak ikut habis'
do $$
declare r jsonb; k record; v_terpakai int;
begin
  update poli_jadwal set kuota_online = 1, kuota = 50
   where poli_id = 'ccccccc1-0000-0000-0000-0000000000A2';

  r := public.antrol_ambil('0006666666666','7371060606069999','902',
                           to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '201', 'kuota online 1 sudah terpakai sebelumnya';
  assert r#>>'{metadata,message}' ilike '%kuota%penuh%', r#>>'{metadata,message}';

  -- Loket tetap boleh mendaftarkan pasien yang berdiri di depannya.
  insert into antrean (poli_id, sumber) values ('ccccccc1-0000-0000-0000-0000000000A2','LOKET');

  select * into k from v_antrean_kuota where poli_id = 'ccccccc1-0000-0000-0000-0000000000A2';
  assert k.sisa_kuota_online = 0, 'sisa kuota online salah: ' || k.sisa_kuota_online;
  assert k.sisa_kuota > 0, 'kuota total tidak boleh ikut habis';

  update poli_jadwal set kuota_online = 25
   where poli_id = 'ccccccc1-0000-0000-0000-0000000000A2';
end $$;


\echo '--- 16. Nomor yang dibatalkan dan tidak hadir mengembalikan kuotanya'
do $$
declare a antrean; v_sebelum int; v_sesudah int;
begin
  insert into antrean (poli_id, sumber) values
    ('ccccccc1-0000-0000-0000-0000000000A1','LOKET') returning * into a;
  v_sebelum := public.antrean_terpakai(a.poli_id, a.tanggal, false);

  perform public.antrean_lewat(a.id, 'Uji tidak hadir');
  v_sesudah := public.antrean_terpakai(a.poli_id, a.tanggal, false);

  assert v_sesudah = v_sebelum - 1,
    'kursi pasien yang tidak hadir memang kosong dan harus kembali ke kuota';
  assert (select status from antrean where id = a.id) = 'TIDAK_HADIR', 'status salah';
end $$;


\echo '--- 17. Memanggil menaikkan hitungan dan menulis riwayat yang tidak bisa disunting'
do $$
declare a antrean; b antrean; n bigint; v_ditolak boolean := false;
begin
  insert into antrean (poli_id, sumber) values
    ('ccccccc1-0000-0000-0000-0000000000A1','LOKET') returning * into a;

  b := public.antrean_panggil(a.id);
  assert b.status = 'DIPANGGIL', 'status setelah dipanggil salah';
  assert b.jumlah_panggil = 1, 'hitungan panggilan salah';
  assert b.tujuan_terakhir = 'Loket Pendaftaran',
    'tahap LOKET harus memanggil ke loket, dapat ' || coalesce(b.tujuan_terakhir,'null');
  assert b.waktu_hadir is not null,
    'pasien yang dipanggil jelas sudah hadir — penandaannya menyelamatkan check-in yang terlupa';

  b := public.antrean_panggil(a.id, 'Loket 2');
  assert b.jumlah_panggil = 2 and b.tujuan_terakhir = 'Loket 2', 'panggil ulang salah';

  select count(*) into n from antrean_panggilan where antrean_id = a.id;
  assert n = 2, 'riwayat panggilan harus dua baris, dapat ' || n;

  -- Riwayat panggilan adalah bukti bahwa pasien memang pernah dipanggil
  -- sebelum dinyatakan tidak hadir. Ia tidak boleh bisa diperbaiki.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  begin
    update antrean_panggilan set tujuan = 'diubah' where antrean_id = a.id;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0, 'riwayat panggilan tidak boleh bisa disunting, termasuk oleh master';

  perform public.antrean_lewat(a.id);
end $$;


\echo '--- 18. Nomor yang sudah selesai atau batal tidak bisa dipanggil lagi'
do $$
declare a antrean; v_ditolak boolean := false;
begin
  insert into antrean (poli_id, sumber) values
    ('ccccccc1-0000-0000-0000-0000000000A1','LOKET') returning * into a;
  perform public.antrean_batal(a.id, 'Uji batal');

  begin
    perform public.antrean_panggil(a.id);
  exception when others then v_ditolak := true;
  end;
  assert v_ditolak, 'nomor yang sudah dibatalkan tidak boleh bisa dipanggil';
end $$;


\echo '--- 19. Check-in membuat kunjungan bernomor sama dan memindahkan tahap ke poli'
do $$
declare a antrean; k kunjungan; a2 antrean;
begin
  insert into antrean (poli_id, sumber, status, tahap, no_kartu)
  values ('ccccccc1-0000-0000-0000-0000000000A1','ONLINE','BELUM_HADIR','LOKET','0007777777777')
  returning * into a;

  k := public.antrean_checkin(a.id, 'bbbbbbb1-0000-0000-0000-0000000000A1',
                              '33333333-3333-3333-3333-333333333333', 'BPJS', 'Uji keluhan');

  assert k.no_antrian = a.no_urut,
    'kunjungan harus mewarisi nomor antrean, bukan menghitung nomornya sendiri';
  assert k.antrean_id = a.id, 'kunjungan tidak tertaut ke antreannya';

  select * into a2 from antrean where id = a.id;
  assert a2.tahap = 'POLI' and a2.status = 'MENUNGGU', 'tahap setelah check-in salah';
  assert a2.pasien_id = 'bbbbbbb1-0000-0000-0000-0000000000A1', 'pasien tidak tertaut';
  assert a2.kunjungan_id = k.id, 'tautan balik ke kunjungan hilang';

  -- Check-in kedua tidak boleh melahirkan kunjungan kembar.
  k := public.antrean_checkin(a.id, 'bbbbbbb1-0000-0000-0000-0000000000A1');
  assert (select count(*) from kunjungan where antrean_id = a.id) = 1,
    'check-in dua kali tidak boleh membuat dua kunjungan';
end $$;


\echo '--- 20. Antrean yang sudah jadi kunjungan tidak bisa dibatalkan dari Mobile JKN'
do $$
declare r jsonb; v_ditolak boolean := false;
begin
  r := public.antrol_batal('0007777777777','901', to_char(public.tgl_klinik(),'YYYY-MM-DD'));
  assert r#>>'{metadata,code}' = '201',
    'pasien yang sudah di loket tidak boleh dihapus oleh ponselnya sendiri';
  assert r#>>'{metadata,message}' ilike '%sudah dilayani%', r#>>'{metadata,message}';

  -- Petugas pun harus membereskan kunjungannya lebih dulu.
  begin
    perform public.antrean_batal(
      (select id from antrean where no_kartu = '0007777777777' and tanggal = public.tgl_klinik()));
  exception when others then v_ditolak := true;
  end;
  assert v_ditolak, 'membatalkan antrean berkunjungan harus ditolak, bukan menyisakan kunjungan yatim';
end $$;


\echo '--- 21. Pembatalan dari Mobile JKN berhasil selama pasien belum hadir'
do $$
declare r jsonb; v_tgl text := to_char(public.tgl_klinik(),'YYYY-MM-DD');
begin
  r := public.antrol_ambil('0008888888888','7371080808089999','901', v_tgl);
  assert r#>>'{metadata,code}' in ('200','202'), r::text;

  r := public.antrol_batal('0008888888888','901', v_tgl);
  assert r#>>'{metadata,code}' = '200', 'pembatalan seharusnya berhasil: ' || r::text;
  assert not (r ? 'response'), 'jawaban batal hanya berisi metadata';

  assert (select status from antrean
           where no_kartu = '0008888888888' and tanggal = public.tgl_klinik()) = 'BATAL',
    'status tidak berubah jadi BATAL';

  -- Setelah batal, peserta boleh mengambil nomor lagi.
  r := public.antrol_ambil('0008888888888','7371080808089999','901', v_tgl);
  assert r#>>'{metadata,code}' in ('200','202'),
    'nomor yang sudah dibatalkan tidak boleh menghalangi pengambilan baru: ' || r::text;

  r := public.antrol_batal('0009999999999','901', v_tgl);
  assert r#>>'{metadata,code}' = '201', 'kartu tanpa antrean harus ditolak';
end $$;


\echo '--- 22. Status antrean dan sisa peserta terbaca sesuai keadaan'
do $$
declare r jsonb; a antrean; v_tgl text := to_char(public.tgl_klinik(),'YYYY-MM-DD');
begin
  r := public.antrol_status('901', v_tgl);
  assert r#>>'{metadata,code}' = '200', r::text;
  assert (r#>>'{response,totalantrean}')::int > 0, 'total antrean kosong';
  assert r#>>'{response,namapoli}' = 'Poli Antrean Uji', r#>>'{response,namapoli}';

  -- Nomor yang sedang dipanggil ikut dikirim ke Mobile JKN.
  select * into a from antrean
   where no_kartu = '0008888888888' and tanggal = public.tgl_klinik() and status <> 'BATAL';
  perform public.antrean_panggil(a.id, 'Loket 1');

  r := public.antrol_status('901', v_tgl);
  assert r#>>'{response,antreanpanggil}' = a.nomor,
    'antreanpanggil salah: ' || r#>>'{response,antreanpanggil}';

  r := public.antrol_sisa_peserta('0008888888888','901', v_tgl);
  assert r#>>'{metadata,code}' = '200', r::text;
  assert r#>>'{response,nomorantrean}' = a.nomor, 'nomor peserta salah';

  r := public.antrol_sisa_peserta('0009999999999','901', v_tgl);
  assert r#>>'{metadata,code}' = '201', 'peserta tanpa antrean harus 201';
end $$;


\echo '--- 23. antreanpanggil kosong berupa teks kosong, bukan null'
do $$
declare r jsonb;
begin
  -- Mobile JKN menampilkan isi field ini apa adanya. null akan terbaca
  -- sebagai tulisan "null" di layar ponsel pasien.
  r := public.antrol_status('902', to_char(public.tgl_klinik() + 1,'YYYY-MM-DD'));
  assert r#>>'{response,antreanpanggil}' = '',
    'antreanpanggil harus teks kosong: ' || coalesce(r#>>'{response,antreanpanggil}','NULL');
end $$;


\echo '--- 24. Kunjungan dari loket tetap mendapat nomor antrean sendiri'
do $$
declare k kunjungan; a antrean;
begin
  -- Halaman Pendaftaran membuat kunjungan langsung, tanpa antrean online.
  -- Tanpa trigger ini, pasien loket tidak akan pernah muncul di layar tunggu.
  insert into kunjungan (pasien_id, poli_id, cara_bayar)
  values ('bbbbbbb1-0000-0000-0000-000000000001','ccccccc1-0000-0000-0000-0000000000A1','UMUM')
  returning * into k;

  select * into a from antrean where kunjungan_id = k.id;
  assert found, 'kunjungan dari loket harus melahirkan nomor antrean';
  assert a.no_urut = k.no_antrian, 'nomor antrean dan nomor kunjungan berselisih';
  assert a.tahap = 'POLI' and a.sumber = 'LOKET',
    'pasien yang mendaftar di loket sudah lewat loket, langsung menunggu poli';
  assert a.waktu_hadir is not null, 'pasien loket jelas sudah hadir';
end $$;


\echo '--- 25. Kunjungan selesai membuat antreannya ikut selesai'
do $$
declare k kunjungan; a antrean;
begin
  select * into k from kunjungan
   where poli_id = 'ccccccc1-0000-0000-0000-0000000000A1' and antrean_id is not null
   order by created_at desc limit 1;

  update kunjungan set status = 'SELESAI' where id = k.id;

  select * into a from antrean where id = k.antrean_id;
  assert a.status = 'SELESAI' and a.tahap = 'SELESAI',
    'antrean pasien yang sudah pulang harus berhenti dihitung sebagai sisa antrean';
  assert a.waktu_selesai is not null, 'waktu selesai tidak tercatat';
end $$;


\echo '--- 26. Layar tunggu menolak token kosong, pendek, dan salah'
do $$
declare r jsonb;
begin
  -- Sebelum token dibuat, token_layar masih null. Memanggil dengan ''
  -- tidak boleh cocok — kalau cocok, layar terbuka untuk siapa saja.
  update sys_antrean_pengaturan set token_layar = null where id = 1;
  r := public.antrean_layar('');
  assert r ? 'galat', 'token kosong harus ditolak';
  r := public.antrean_layar('apa saja');
  assert r ? 'galat', 'token asal harus ditolak';

  update sys_antrean_pengaturan
     set token_layar = 'token-uji-panjang-sekali-1234567890' where id = 1;
  r := public.antrean_layar('token-uji-panjang-sekali-123456789');   -- kurang satu huruf
  assert r ? 'galat', 'token yang meleset satu huruf harus ditolak';
  r := public.antrean_layar(null);
  assert r ? 'galat', 'token null harus ditolak';
end $$;


\echo '--- 27. Layar tunggu memulangkan nomor — dan tidak satu pun nama pasien'
do $$
declare r jsonb; v_teks text;
begin
  r := public.antrean_layar('token-uji-panjang-sekali-1234567890');
  assert not (r ? 'galat'), 'token benar harus diterima: ' || r::text;
  assert r ? 'poli' and r ? 'panggilan', 'bentuk jawaban layar tidak lengkap';
  assert jsonb_array_length(r->'poli') > 0, 'daftar poli kosong';

  -- Ini pemeriksaan yang paling penting di seluruh berkas ini. Layar
  -- dipasang di ruang tunggu, dibuka tanpa login, dan tautannya bisa
  -- tersebar. Yang membuatnya aman bukan kerahasiaan token, melainkan
  -- kenyataan bahwa tidak ada apa pun untuk dibocorkan.
  v_teks := r::text;
  assert v_teks not ilike '%Peserta Antrean Uji%', 'nama pasien bocor ke layar tunggu';
  assert v_teks not ilike '%Pasien Uji%',          'nama pasien bocor ke layar tunggu';
  assert v_teks not ilike '%UJIANT1%',             'nomor rekam medis bocor ke layar tunggu';
  assert v_teks not ilike '%0008888888888%',       'nomor kartu BPJS bocor ke layar tunggu';
  assert v_teks not ilike '%7371%',                'NIK bocor ke layar tunggu';
end $$;


\echo '--- 28. Layar bisa dipanggil sebagai anon — bukan hanya sebagai superuser'
do $$
declare r jsonb;
begin
  /* Layar tunggu TIDAK login. Ia memakai kunci anon, yaitu role `anon`.
     Seluruh uji di atas berjalan sebagai superuser, yang lolos semua
     pemeriksaan hak akses — persis lubang yang dulu membuat
     "permission denied for table apotek_batch" baru ketahuan di klinik.

     Di sinilah fungsinya dijalankan dengan hak yang sebenarnya. */
  set local role anon;
  begin
    execute 'select public.antrean_layar($1)'
      into r using 'token-uji-panjang-sekali-1234567890';
  exception when others then
    reset role;
    raise exception 'Layar tunggu tidak bisa dipanggil sebagai anon: %', sqlerrm;
  end;
  reset role;

  assert not (r ? 'galat'), 'anon dengan token benar harus dilayani: ' || r::text;
  assert r ? 'poli', 'jawaban untuk anon tidak lengkap';
end $$;


\echo '--- 29. anon TIDAK boleh membaca tabel antrean maupun data pasien'
do $$
declare n bigint; v_ditolak boolean;
begin
  -- Hak yang diberikan hanya SATU fungsi. Kalau anon bisa membaca tabelnya
  -- langsung, token layar berhenti menjadi pembatas apa pun.
  set local role anon;
  v_ditolak := false;
  begin execute 'select count(*) from antrean' into n;
  exception when others then v_ditolak := true; end;
  reset role;
  assert v_ditolak, 'anon tidak boleh bisa membaca tabel antrean langsung';

  set local role anon;
  v_ditolak := false;
  begin execute 'select count(*) from pasien' into n;
  exception when others then v_ditolak := true; end;
  reset role;
  assert v_ditolak, 'anon tidak boleh bisa membaca tabel pasien';

  set local role anon;
  v_ditolak := false;
  begin execute 'select public.antrol_ambil($1,$2,$3,$4)'
    into n using '0001234567890','7371010101010001','901','2099-01-01';
  exception when others then v_ditolak := true; end;
  reset role;
  assert v_ditolak,
    'anon tidak boleh menerbitkan nomor antrean — hanya Edge Function (service_role) yang boleh';
end $$;


\echo '--- 30. Setiap panggilan punya id naik, supaya layar tidak membunyikan ulang'
do $$
declare r jsonb; id1 bigint; id2 bigint; a antrean;
begin
  r := public.antrean_layar('token-uji-panjang-sekali-1234567890');
  id1 := (r#>>'{panggilan,0,id}')::bigint;

  insert into antrean (poli_id, sumber) values
    ('ccccccc1-0000-0000-0000-0000000000A1','LOKET') returning * into a;
  perform public.antrean_panggil(a.id, 'Loket 3');

  r := public.antrean_layar('token-uji-panjang-sekali-1234567890');
  id2 := (r#>>'{panggilan,0,id}')::bigint;

  assert id2 > id1, 'panggilan terbaru harus punya id lebih besar dan berada di depan';
  assert r#>>'{panggilan,0,nomor}' = a.nomor, 'nomor panggilan terbaru salah';
  assert r#>>'{panggilan,0,tujuan}' = 'Loket 3', 'tujuan panggilan tidak ikut';
end $$;


\echo '--- 31. Akun web service: sandi benar diterima, salah ditolak, hash tak terbaca'
do $$
declare r jsonb; v_hash text;
begin
  perform public.antrol_akun_simpan('bpjs-uji', 'sandi-panjang-untuk-uji-123', 'Akun UAT');

  r := public.antrol_auth('bpjs-uji', 'sandi-panjang-untuk-uji-123');
  assert r#>>'{metadata,code}' = '200', 'sandi benar harus diterima';

  r := public.antrol_auth('bpjs-uji', 'salah');
  assert r#>>'{metadata,code}' = '201', 'sandi salah harus ditolak';
  r := public.antrol_auth('tidak-ada', 'sandi-panjang-untuk-uji-123');
  assert r#>>'{metadata,code}' = '201', 'username tidak dikenal harus ditolak';

  -- Sandi disimpan sebagai hash bersalt, bukan apa adanya.
  select sandi_hash into v_hash from antrol_akun where username = 'bpjs-uji';
  assert v_hash <> 'sandi-panjang-untuk-uji-123', 'sandi tersimpan telanjang';
  assert length(v_hash) = 64, 'hash bukan sha256';

  assert (select terakhir_dipakai from antrol_akun where username = 'bpjs-uji') is not null,
    'pemakaian akun harus tercatat untuk penelusuran saat UAT';
end $$;


\echo '--- 32. Sandi web service pendek ditolak — pintunya menghadap internet'
do $$
declare v_ditolak boolean := false;
begin
  begin
    perform public.antrol_akun_simpan('bpjs-uji2', 'pendek');
  exception when others then v_ditolak := true;
  end;
  assert v_ditolak, 'sandi 6 huruf tidak boleh diterima untuk pintu publik';
end $$;


\echo '--- 33. Peramban tidak bisa membaca tabel akun, bahkan sebagai master'
do $$
declare n bigint; v_ditolak boolean := false;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  begin
    execute 'select count(*) from antrol_akun' into n;
  exception when others then v_ditolak := true;
  end;
  reset role;
  assert v_ditolak, 'hak baca tabel antrol_akun harus dicabut dari peramban';
end $$;


\echo '--- 34. Admin melihat daftar akun lewat view, tanpa hash; staf lain tidak melihat apa pun'
do $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  execute 'select count(*) from v_antrol_akun' into n;
  reset role;
  assert n >= 1, 'master harus bisa melihat daftar akun';

  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', true);
  set local role authenticated;
  execute 'select count(*) from v_antrol_akun' into n;
  reset role;
  assert n = 0, 'perawat tidak boleh melihat akun web service';
end $$;


\echo '--- 35. Hanya master yang boleh mengganti token layar dan akun Antrol'
do $$
declare v_ditolak boolean;
begin
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', true);
  set local role authenticated;

  v_ditolak := false;
  begin perform public.antrean_token_baru('token-baru-yang-cukup-panjang-sekali');
  exception when others then v_ditolak := true; end;
  assert v_ditolak, 'perawat tidak boleh mengganti token layar';

  v_ditolak := false;
  begin perform public.antrol_akun_simpan('curang','sandi-panjang-untuk-uji-123');
  exception when others then v_ditolak := true; end;
  assert v_ditolak, 'perawat tidak boleh membuat akun web service';

  reset role;
end $$;


\echo '--- 36. Token layar terlalu pendek ditolak'
do $$
declare v_ditolak boolean := false;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  begin perform public.antrean_token_baru('pendek');
  exception when others then v_ditolak := true; end;
  assert v_ditolak, 'token 6 huruf bisa ditebak — harus ditolak';
end $$;


\echo '--- 37. Jadwal dan kuota hanya boleh diubah master'
do $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', true);
  set local role authenticated;
  begin
    execute 'with x as (update poli_jadwal set kuota = 999
                         where poli_id = ''ccccccc1-0000-0000-0000-0000000000A1'' returning 1)
             select count(*) from x' into n;
  exception when others then n := 0;
  end;
  reset role;
  assert n = 0, 'perawat tidak boleh mengubah kuota antrean';

  -- Tapi harus bisa membacanya: halaman antrean menampilkan sisa kuota.
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', true);
  set local role authenticated;
  execute 'select count(*) from poli_jadwal' into n;
  reset role;
  assert n > 0, 'seluruh staf harus bisa membaca jadwal poli';
end $$;


\echo '--- 38. Tabel dan view baru bisa dibaca sebagai authenticated, bukan hanya superuser'
do $$
declare t text; n bigint;
begin
  -- Dua kali sudah terjadi di proyek ini: tabel baru dan view baru tidak
  -- mewarisi GRANT dari 02_rls.sql, dan gejalanya "permission denied"
  -- yang baru muncul di klinik, bukan di uji.
  perform set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', true);
  foreach t in array array['antrean','antrean_panggilan','poli_jadwal','poli_libur',
                           'sys_antrean_pengaturan','v_antrean_hari_ini','v_antrean_kuota']
  loop
    set local role authenticated;
    begin
      execute format('select count(*) from %I', t) into n;
    exception when others then
      reset role;
      raise exception 'GRANT belum diberikan untuk %: %', t, sqlerrm;
    end;
    reset role;
  end loop;
end $$;


\echo '--- 39. Petugas melihat antrean hari ini lengkap dengan lama menunggu'
do $$
declare v record; n bigint;
begin
  select count(*) into n from v_antrean_hari_ini
   where poli_id = 'ccccccc1-0000-0000-0000-0000000000A1';
  assert n > 0, 'antrean hari ini kosong';

  select * into v from v_antrean_hari_ini
   where kunjungan_id is not null limit 1;
  assert v.sudah_checkin, 'antrean berkunjungan harus bertanda sudah check-in';
  assert v.nama_pasien is not null, 'petugas harus melihat nama pasien';
  assert v.menit_menunggu >= 0, 'lama menunggu tidak masuk akal';
end $$;


\echo '--- 40. Nomor antrean online yang dibatalkan tidak menyumbat nomor berikutnya'
do $$
declare a1 antrean; a2 antrean;
begin
  insert into antrean (poli_id, sumber) values
    ('ccccccc1-0000-0000-0000-0000000000A2','LOKET') returning * into a1;
  perform public.antrean_batal(a1.id, 'Uji');
  insert into antrean (poli_id, sumber) values
    ('ccccccc1-0000-0000-0000-0000000000A2','LOKET') returning * into a2;

  -- Nomor yang batal TIDAK dipakai ulang: pasien mungkin sudah memotret
  -- nomornya, dan dua orang dengan nomor sama di ruang tunggu tidak bisa
  -- dibereskan lagi.
  assert a2.no_urut = a1.no_urut + 1,
    'nomor bekas pembatalan tidak boleh dipakai ulang';
end $$;


\echo 'SEMUA UJI ANTREAN LULUS'

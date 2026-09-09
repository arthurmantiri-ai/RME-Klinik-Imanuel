-- =====================================================================
--  UJI FUNGSIONAL LAPORAN — TAHAP 3
--  Dijalankan PALING AKHIR (setelah uji_kronis_pantau), memakai pegawai
--  dari uji_apotek.sql/uji_penunjang.sql (admin=1111…, dokter=3333…,
--  kasir=4444…, perawat=5555…, pendaftaran=6666…) dan poli GIGI/UMUM
--  bawaan dari sql/04_seed.sql + sql/05_gigi.sql.
--
--  Yang diuji: gabungan kolom baru v_riwayat_kunjungan, pemilahan jenis
--  rujukan di v_laporan_rujukan (dan bahwa kunjungan yang BUKAN rujukan
--  tidak ikut muncul), serta bahwa dua definisi "pendapatan" di
--  v_laporan_keuangan_tagihan/_pembayaran benar-benar terpisah dan
--  dikelompokkan per jenis poli + penjamin dengan benar. Bukan tampilan
--  (itu ada di uji_laporan_core.js) — di sini murni fakta yang view
--  pulangkan.
-- =====================================================================

\set QUIET on
set client_min_messages to warning;

-- ---------------------------------------------------------------------
-- Persiapan
-- ---------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into pasien (id, no_rm, nama, tanggal_lahir, jenis_kelamin, no_bpjs, no_hp) values
  ('bbbbbbb3-0000-0000-0000-000000000001','UJILAP01','Pasien Umum Laporan','1985-03-10','L','0001112223334445','081300000001'),
  ('bbbbbbb3-0000-0000-0000-000000000002','UJILAP02','Pasien Gigi Laporan','1978-11-20','P','0009998887776665','081300000002')
on conflict (id) do nothing;

-- Kunjungan #1: Poli Umum, BPJS, rujukan LANJUT (eksternal, terstruktur).
insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, jenis_kunjungan, tanggal, waktu_daftar)
values ('ddddddd3-0000-0000-0000-000000000001','UJILAP-KUNJ-1',
        'bbbbbbb3-0000-0000-0000-000000000001',
        (select id from poli where kode = 'UMUM'),
        '33333333-3333-3333-3333-333333333333','BPJS','BARU',
        public.tgl_klinik(),
        (public.tgl_klinik()::text || ' 09:15:00')::timestamp at time zone 'Asia/Makassar')
on conflict (id) do nothing;

-- Kunjungan #2: Poli Gigi, Umum (bayar sendiri), rujukan INTERNAL ke poli lain.
insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, jenis_kunjungan, tanggal, waktu_daftar)
values ('ddddddd3-0000-0000-0000-000000000002','UJILAP-KUNJ-2',
        'bbbbbbb3-0000-0000-0000-000000000002',
        (select id from poli where kode = 'GIGI'),
        '33333333-3333-3333-3333-333333333333','UMUM','LAMA',
        public.tgl_klinik(),
        (public.tgl_klinik()::text || ' 14:40:00')::timestamp at time zone 'Asia/Makassar')
on conflict (id) do nothing;

-- Kunjungan #3: Poli Umum, KONTROL biasa — BUKAN rujukan, harus absen dari v_laporan_rujukan.
insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, jenis_kunjungan, tanggal)
values ('ddddddd3-0000-0000-0000-000000000003','UJILAP-KUNJ-3',
        'bbbbbbb3-0000-0000-0000-000000000001',
        (select id from poli where kode = 'UMUM'),
        '33333333-3333-3333-3333-333333333333','BPJS','LAMA', public.tgl_klinik())
on conflict (id) do nothing;

-- Kunjungan #4: Poli Umum, rujukan IGD — hanya kolom teks lama yang terisi.
insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, jenis_kunjungan, tanggal)
values ('ddddddd3-0000-0000-0000-000000000004','UJILAP-KUNJ-4',
        'bbbbbbb3-0000-0000-0000-000000000002',
        (select id from poli where kode = 'UMUM'),
        '33333333-3333-3333-3333-333333333333','BPJS','BARU', public.tgl_klinik())
on conflict (id) do nothing;

-- Kunjungan #5: Poli Gigi, BPJS — KHUSUS untuk uji keuangan (§6/§7).
-- Sengaja di poli Gigi, bukan Umum: beberapa berkas uji lain (mis.
-- uji_kasir.sql) membuat kasir_tagihan sendiri hari ini pada poli custom
-- yang jenisnya baku 'UMUM', sehingga bucket (tanggal ini, jenis_poli
-- UMUM, ...) di v_laporan_keuangan_* TIDAK eksklusif milik berkas ini.
-- Poli Gigi tidak disentuh berkas uji mana pun selain ini — jumlahnya
-- bisa dicocokkan persis, bukan cuma diperiksa "setidaknya ada".
insert into kunjungan (id, no_kunjungan, pasien_id, poli_id, dokter_id, cara_bayar, tanggal)
values ('ddddddd3-0000-0000-0000-000000000005','UJILAP-KUNJ-5',
        'bbbbbbb3-0000-0000-0000-000000000001',
        (select id from poli where kode = 'GIGI'),
        '33333333-3333-3333-3333-333333333333','BPJS', public.tgl_klinik())
on conflict (id) do nothing;

-- ref_ppk milik berkas ini sendiri — uji_periksa.sql membersihkan barisnya
-- sendiri ('0123R001','9999X') di baris terakhirnya, jadi tidak boleh
-- dipinjam di sini.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into ref_ppk (kode, nama, jenis) values ('9999L003','RS Uji Laporan','RS')
on conflict (kode) do nothing;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);

insert into pemeriksaan (kunjungan_id, subjective, tindak_lanjut,
                          rujuk_ppk_kode, rujuk_subspesialis_kode, rujuk_sarana_kode, rujuk_tgl_estimasi)
values ('ddddddd3-0000-0000-0000-000000000001', 'Uji rujukan lanjut', 'RUJUK_LANJUT',
        '9999L003', (select kode from ref_subspesialis limit 1), (select kode from ref_sarana limit 1),
        public.tgl_klinik() + 3)
on conflict (kunjungan_id) do update set tindak_lanjut = excluded.tindak_lanjut,
  rujuk_ppk_kode = excluded.rujuk_ppk_kode, rujuk_subspesialis_kode = excluded.rujuk_subspesialis_kode,
  rujuk_sarana_kode = excluded.rujuk_sarana_kode, rujuk_tgl_estimasi = excluded.rujuk_tgl_estimasi;

insert into pemeriksaan (kunjungan_id, subjective, tindak_lanjut, rujuk_poli_internal_id)
values ('ddddddd3-0000-0000-0000-000000000002', 'Uji rujukan internal', 'RUJUK_INTERNAL',
        (select id from poli where kode = 'UMUM'))
on conflict (kunjungan_id) do update set tindak_lanjut = excluded.tindak_lanjut,
  rujuk_poli_internal_id = excluded.rujuk_poli_internal_id;

insert into pemeriksaan (kunjungan_id, subjective, tindak_lanjut, tanggal_kontrol)
values ('ddddddd3-0000-0000-0000-000000000003', 'Kontrol biasa, bukan rujukan', 'KONTROL',
        public.tgl_klinik() + 7)
on conflict (kunjungan_id) do update set tindak_lanjut = excluded.tindak_lanjut;

insert into pemeriksaan (kunjungan_id, subjective, tindak_lanjut, rujuk_ke_faskes, rujuk_spesialis, rujuk_alasan)
values ('ddddddd3-0000-0000-0000-000000000004', 'Uji rujukan IGD', 'RUJUK_IGD',
        'RS Bergerak Terdekat', 'IGD', 'Kegawatan')
on conflict (kunjungan_id) do update set tindak_lanjut = excluded.tindak_lanjut,
  rujuk_ke_faskes = excluded.rujuk_ke_faskes, rujuk_spesialis = excluded.rujuk_spesialis,
  rujuk_alasan = excluded.rujuk_alasan;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

-- Tagihan #1: kunjungan Gigi/BPJS (kunjungan #5) — sengaja subtotal > total (ditanggung BPJS).
insert into kasir_tagihan (id, nomor, kunjungan_id, pasien_id, nama_pembayar, tanggal, penjamin, subtotal, total, amount_paid, status_bayar)
values ('fffffff3-0000-0000-0000-000000000001','UJILAP-TGH-1','ddddddd3-0000-0000-0000-000000000005',
        'bbbbbbb3-0000-0000-0000-000000000001','Pasien Umum Laporan', public.tgl_klinik(), 'BPJS',
        150000, 0, 0, 'lunas')
on conflict (id) do nothing;

-- Tagihan #2: kunjungan Gigi/Umum — dibayar tunai penuh di satu tanggal, dicicil dua metode.
insert into kasir_tagihan (id, nomor, kunjungan_id, pasien_id, nama_pembayar, tanggal, penjamin, subtotal, total, amount_paid, status_bayar)
values ('fffffff3-0000-0000-0000-000000000002','UJILAP-TGH-2','ddddddd3-0000-0000-0000-000000000002',
        'bbbbbbb3-0000-0000-0000-000000000002','Pasien Gigi Laporan', public.tgl_klinik(), 'UMUM',
        500000, 500000, 0, 'belum_lunas')
on conflict (id) do nothing;

-- Tagihan #3: penjualan bebas, TANPA kunjungan — harus jatuh ke bucket 'LAINNYA'.
-- Penjamin sengaja ASURANSI_LAIN (bukan UMUM): uji_kasir.sql juga membuat
-- tagihan bebas kunjungan hari ini dengan penjamin UMUM, jadi bucket
-- (LAINNYA, UMUM) hari ini bukan eksklusif milik berkas ini — ASURANSI_LAIN
-- tidak dipakai berkas uji lain mana pun.
insert into kasir_tagihan (id, nomor, kunjungan_id, pasien_id, nama_pembayar, tanggal, penjamin, subtotal, total, amount_paid, status_bayar)
values ('fffffff3-0000-0000-0000-000000000003','UJILAP-TGH-3', null,
        null,'Pembeli Lepas', public.tgl_klinik(), 'ASURANSI_LAIN', 20000, 20000, 0, 'belum_lunas')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into kasir_pembayaran (id, tagihan_id, jumlah, tanggal, metode, uang_diterima)
values
  ('11111113-0000-0000-0000-000000000001','fffffff3-0000-0000-0000-000000000002', 300000, public.tgl_klinik(), 'tunai', 300000),
  ('11111113-0000-0000-0000-000000000002','fffffff3-0000-0000-0000-000000000002', 200000, public.tgl_klinik(), 'qris', 200000),
  ('11111113-0000-0000-0000-000000000003','fffffff3-0000-0000-0000-000000000003',  20000, public.tgl_klinik(), 'tunai', 20000)
on conflict (id) do nothing;


\echo '--- 1. v_riwayat_kunjungan membawa kolom baru Tahap 3 dengan benar'
do $$
declare r record;
begin
  select * into r from v_riwayat_kunjungan where id = 'ddddddd3-0000-0000-0000-000000000001';
  assert r.jenis_poli = 'UMUM', 'jenis_poli harus UMUM untuk kunjungan #1';
  assert r.jenis_kunjungan = 'BARU', 'jenis_kunjungan harus BARU untuk kunjungan #1';
  assert r.jenis_kelamin = 'L', 'jenis_kelamin pasien #1 harus L';
  assert r.no_bpjs = '0001112223334445', 'no_bpjs pasien #1 harus ikut terpilih';
  -- jam_daftar HARUS dibaca WITA, bukan zona sesi Postgres — makanya
  -- dibandingkan terhadap jam yang ditulis eksplisit ('09:15:00' WITA),
  -- bukan terhadap extract(hour from waktu_daftar) mentah.
  assert r.jam_daftar = 9, format('jam_daftar kunjungan #1 harus 9 (WITA), didapat %s.', r.jam_daftar);

  select * into r from v_riwayat_kunjungan where id = 'ddddddd3-0000-0000-0000-000000000002';
  assert r.jenis_poli = 'GIGI', 'jenis_poli harus GIGI untuk kunjungan #2';
  assert r.jam_daftar = 14, format('jam_daftar kunjungan #2 harus 14 (WITA), didapat %s.', r.jam_daftar);
  -- jenis_kunjungan dihitung ulang oleh trigger di kunjungan (bukan nilai
  -- yang di-INSERT) berdasarkan riwayat kunjungan pasien sebelumnya — ini
  -- kunjungan PERTAMA Pasien Gigi Laporan di database uji, jadi BARU.
  assert r.jenis_kunjungan = 'BARU', 'jenis_kunjungan harus BARU untuk kunjungan #2 (kunjungan pertama pasien ini)';
end $$;


\echo '--- 2. v_laporan_rujukan hanya memuat kunjungan yang benar-benar dirujuk'
do $$
declare n int;
begin
  select count(*) into n from v_laporan_rujukan where kunjungan_id = 'ddddddd3-0000-0000-0000-000000000003';
  assert n = 0, 'Kunjungan KONTROL biasa tidak boleh muncul di v_laporan_rujukan.';

  -- Dibatasi ke kunjungan milik berkas ini sendiri (id berawalan ddddddd3-)
  -- — berkas uji lain (mis. uji_periksa.sql) juga meninggalkan baris
  -- rujukan permanen di database bersama ini, jadi hitungan tabel penuh
  -- tidak boleh dipakai.
  select count(*) into n from v_laporan_rujukan where kunjungan_id::text like 'ddddddd3-%';
  assert n = 3, format('Harus ada tepat 3 baris rujukan milik berkas ini (lanjut, internal, IGD), didapat %s.', n);
end $$;


\echo '--- 3. Rujukan LANJUT membawa kode faskes/subspesialis/sarana terstruktur'
do $$
declare r record;
begin
  select * into r from v_laporan_rujukan where kunjungan_id = 'ddddddd3-0000-0000-0000-000000000001';
  assert r.jenis_rujukan = 'RUJUK_LANJUT', 'jenis_rujukan harus RUJUK_LANJUT';
  assert r.rujuk_ppk_kode = '9999L003', 'rujuk_ppk_kode harus ikut terpilih apa adanya';
  assert r.tujuan_faskes_kode = 'RS Uji Laporan', 'nama faskes harus tergabung dari ref_ppk';
  assert r.tujuan_subspesialis is not null, 'nama subspesialis harus tergabung dari ref_subspesialis';
  assert r.tujuan_sarana is not null, 'nama sarana harus tergabung dari ref_sarana';
  assert r.tujuan_poli_internal is null, 'rujukan lanjut tidak boleh punya tujuan poli internal';
end $$;


\echo '--- 4. Rujukan INTERNAL membawa nama poli tujuan, bukan kode BPJS'
do $$
declare r record;
begin
  select * into r from v_laporan_rujukan where kunjungan_id = 'ddddddd3-0000-0000-0000-000000000002';
  assert r.jenis_rujukan = 'RUJUK_INTERNAL', 'jenis_rujukan harus RUJUK_INTERNAL';
  assert r.tujuan_poli_internal = 'Poli Umum', 'tujuan_poli_internal harus terisi nama poli';
  assert r.rujuk_ppk_kode is null, 'rujukan internal tidak boleh punya kode PPK';
  assert r.nama_poli_asal = 'Poli Gigi', 'poli asal harus Poli Gigi (poli kunjungan, bukan tujuan)';
end $$;


\echo '--- 5. Rujukan IGD memakai kolom teks lama, bukan kolom terstruktur'
do $$
declare r record;
begin
  select * into r from v_laporan_rujukan where kunjungan_id = 'ddddddd3-0000-0000-0000-000000000004';
  assert r.jenis_rujukan = 'RUJUK_IGD', 'jenis_rujukan harus RUJUK_IGD';
  assert r.tujuan_teks = 'RS Bergerak Terdekat', 'tujuan_teks harus ikut terpilih untuk rujukan IGD';
  assert r.rujuk_ppk_kode is null and r.tujuan_poli_internal is null,
    'rujukan IGD di paket ini belum punya daftar RS terstruktur — kolom kode harus kosong, bukan mengarang.';
end $$;


\echo '--- 6. v_laporan_keuangan_tagihan memisahkan nilai_layanan vs ditagih per jenis poli + penjamin'
do $$
declare r record;
begin
  select * into r from v_laporan_keuangan_tagihan
   where tanggal = public.tgl_klinik() and jenis_poli = 'GIGI' and penjamin = 'BPJS';
  assert r.nilai_layanan = 150000, format('nilai_layanan Gigi/BPJS harus 150000, didapat %s.', r.nilai_layanan);
  assert r.ditagih = 0, 'ditagih Gigi/BPJS harus 0 — seluruhnya ditanggung penjamin, pasien tidak menerima tagihan.';

  select * into r from v_laporan_keuangan_tagihan
   where tanggal = public.tgl_klinik() and jenis_poli = 'GIGI' and penjamin = 'UMUM';
  assert r.nilai_layanan = 500000 and r.ditagih = 500000,
    'kunjungan Gigi/Umum: nilai_layanan dan ditagih harus sama (bukan BPJS, tidak ada yang ditanggung).';

  select * into r from v_laporan_keuangan_tagihan
   where tanggal = public.tgl_klinik() and jenis_poli = 'LAINNYA' and penjamin = 'ASURANSI_LAIN';
  assert r.nilai_layanan = 20000 and r.jumlah_tagihan = 1,
    'Tagihan tanpa kunjungan (penjualan bebas) harus jatuh ke bucket LAINNYA, bukan hilang atau error.';
end $$;


\echo '--- 7. v_laporan_keuangan_pembayaran memisah per metode dan tidak memakai subtotal'
do $$
declare v_tunai record; v_qris record; v_total_masuk numeric;
begin
  select * into v_tunai from v_laporan_keuangan_pembayaran
   where tanggal = public.tgl_klinik() and jenis_poli = 'GIGI' and metode = 'tunai';
  assert v_tunai.uang_masuk = 300000, format('uang_masuk tunai Gigi harus 300000, didapat %s.', v_tunai.uang_masuk);

  select * into v_qris from v_laporan_keuangan_pembayaran
   where tanggal = public.tgl_klinik() and jenis_poli = 'GIGI' and metode = 'qris';
  assert v_qris.uang_masuk = 200000, format('uang_masuk qris Gigi harus 200000, didapat %s.', v_qris.uang_masuk);

  select sum(uang_masuk) into v_total_masuk from v_laporan_keuangan_pembayaran
   where tanggal = public.tgl_klinik() and jenis_poli = 'GIGI' and penjamin = 'BPJS';
  assert v_total_masuk is null,
    'Kunjungan Gigi/BPJS (kunjungan #5) tidak punya baris kasir_pembayaran — tidak boleh ikut ke uang_masuk mana pun.';
end $$;


\echo '--- 8. Staf non-kasir (perawat) tetap bisa membaca ketiga view — dibatasi di menu, bukan RLS'
create or replace function ujilap_terlihat(p_user uuid, p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text,''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

do $$
declare n bigint;
begin
  n := ujilap_terlihat('55555555-5555-5555-5555-555555555555',
    $q$select count(*) from v_laporan_rujukan where kunjungan_id::text like 'ddddddd3-%'$q$);
  assert n = 3, 'Perawat harus tetap bisa membaca v_laporan_rujukan lewat RLS (pembatasan ada di menu).';

  n := ujilap_terlihat('66666666-6666-6666-6666-666666666666',
    $q$select count(*) from v_laporan_keuangan_pembayaran$q$);
  assert n >= 1, 'Pendaftaran harus tetap bisa membaca v_laporan_keuangan_pembayaran lewat RLS.';
end $$;

drop function ujilap_terlihat(uuid, text);

-- Bersihkan ref_ppk milik berkas ini sendiri (lihat catatan di atas) —
-- lepas dulu rujukannya di pemeriksaan (pola yang sama dipakai
-- uji_periksa.sql sebelum menghapus '0123R001'), baru hapus barisnya.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update pemeriksaan set rujuk_ppk_kode = null
 where kunjungan_id = 'ddddddd3-0000-0000-0000-000000000001';
delete from ref_ppk where kode = '9999L003';

\echo 'SEMUA UJI LAPORAN LULUS'

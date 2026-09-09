-- =====================================================================
--  TAHAP 3 — LAPORAN: rekap kunjungan, rujukan, keuangan, dan Puskesmas,
--  pindahan dari dashboard.html portal sipantau (lihat claude/rancangan-
--  kronis.md dan claude/daftar-berkas-tahap3.md untuk latar lengkap).
--
--  Pola yang dipegang di seluruh berkas ini, sama seperti Tahap 2:
--  SQL HANYA memulangkan fakta mentah (baris per kunjungan/tagihan/
--  pembayaran/diagnosa), seluruh klasifikasi dan agregasi (tren 7 hari,
--  perbandingan bulanan, heatmap jam, kategori usia Puskesmas, rekap per
--  dokter) dihitung SATU-SATUNYA di js/laporan_core.js. Nol tabel baru —
--  seluruhnya view di atas tabel yang sudah ada, dan sebagian besar
--  malah tidak butuh view baru sama sekali karena halaman membaca
--  langsung dari tabel lewat select PostgREST (pola yang sama dipakai
--  DB.diagnosaTeratas() yang sudah ada).
--
--  Tiga hal baru yang BENAR-BENAR butuh SQL:
--    A. `v_riwayat_kunjungan` — 10 kolom ditambahkan di AKHIR daftar SELECT
--       (jenis_poli, jenis_kunjungan, dokter_id, poli_id, waktu_daftar,
--       jam_daftar, tanggal_lahir, jenis_kelamin, no_bpjs, no_hp). Menambah kolom di
--       tengah gagal dengan "cannot change name of view column" — pelajaran
--       yang sama dengan `v_apotek_batch` di Tahap 1b.
--    B. `v_laporan_rujukan` — rujukan internal/lanjut/IGD belum pernah
--       punya satu tempat baca sendiri; sebelumnya cuma kolom di pemeriksaan.
--    C. Dua view keuangan — `laporan_keuangan` di portal itu tabel yang
--       DIKETIK manual tiap hari. RME sudah punya transaksi sungguhan
--       (kasir_tagihan/kasir_pembayaran), jadi baris ini dihitung, bukan
--       diketik. Dipisah nilai-layanan (termasuk yang ditanggung BPJS,
--       dari kasir_tagihan) vs uang-masuk (kas sungguhan, dari
--       kasir_pembayaran) — dua definisi "pendapatan" yang berbeda dan
--       tidak boleh dijumlahkan begitu saja.
--
--  Akses: seluruh view di bawah TERBUKA untuk semua staf lewat RLS tabel
--  aslinya (sama seperti kasir_tagihan dan v_kronis_telpon_h1 di Tahap 2)
--  — yang membatasi tab Laporan Lanjutan ke akun admin adalah menu di
--  js/pages/laporan.js, bukan baris di sini. Alasannya sama seperti
--  v_kronis_telpon_h1: dokter atau kasir yang perlu data ini dari layar
--  lain (mis. cetak ulang rujukan dari rekam medis) tidak boleh ikut
--  terkunci oleh pembatasan yang sebetulnya cuma soal tata letak menu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Perluasan v_riwayat_kunjungan
-- ---------------------------------------------------------------------
create or replace view v_riwayat_kunjungan with (security_invoker = true) as
select k.id, k.no_kunjungan, k.tanggal, k.status, k.cara_bayar,
       p.id as pasien_id, p.no_rm, p.nama as nama_pasien,
       po.nama as nama_poli,
       d.nama as nama_dokter,
       (select string_agg(dg.kode_icd10 || ' - ' || dg.nama, '; ' order by dg.jenis)
          from diagnosa dg where dg.kunjungan_id = k.id) as daftar_diagnosa,
       (select dg.kode_icd10 from diagnosa dg
         where dg.kunjungan_id = k.id and dg.jenis = 'PRIMER' limit 1) as icd_primer,
       k.satusehat_status, k.pcare_status,
       -- Tahap 3 — ditambahkan di AKHIR, lihat catatan kepala berkas.
       po.jenis as jenis_poli,
       k.jenis_kunjungan,
       k.dokter_id,
       k.poli_id,
       k.waktu_daftar,
       -- Jam WITA siap pakai, BUKAN diturunkan dari waktu_daftar di JS.
       -- `timestamptz` dikirim PostgREST dalam timezone sesi Supabase
       -- (lazimnya UTC), jadi `new Date(waktu_daftar).getHours()` di
       -- peramban bisa membaca zona yang salah tanpa galat apa pun —
       -- kelas kesalahan yang sama dengan UI.hariIni() dulu (lihat
       -- claude/status-rme.md). Dihitung sekali di sini, dengan aturan
       -- WITA yang sama seperti tgl_klinik().
       extract(hour from k.waktu_daftar at time zone 'Asia/Makassar')::smallint as jam_daftar,
       p.tanggal_lahir,
       p.jenis_kelamin,
       p.no_bpjs,
       p.no_hp
from kunjungan k
join pasien p on p.id = k.pasien_id
join poli po on po.id = k.poli_id
left join pegawai d on d.id = k.dokter_id
order by k.tanggal desc, k.no_antrian desc;

grant select on v_riwayat_kunjungan to authenticated;

-- ---------------------------------------------------------------------
-- B. Data rujukan — internal, lanjut (eksternal), dan IGD
-- ---------------------------------------------------------------------
-- Ketiganya sama-sama "rujukan" dari sudut pandang laporan, tapi tujuannya
-- disimpan di kolom berbeda tergantung jenisnya (poli internal vs faskes
-- luar vs teks bebas IGD). SQL memulangkan ketiga kemungkinan itu apa
-- adanya sebagai kolom terpisah; js/laporan_core.js yang memilih mana
-- yang dipakai untuk kolom "Tujuan" di tabel, supaya aturan pemilihan itu
-- bisa diuji di Node tanpa database.
create or replace view v_laporan_rujukan with (security_invoker = true) as
select
  pm.kunjungan_id,
  k.no_kunjungan,
  k.tanggal,
  pm.tindak_lanjut as jenis_rujukan,
  p.id as pasien_id, p.no_rm, p.nama as nama_pasien,
  p.no_bpjs, p.no_hp, p.tanggal_lahir, p.jenis_kelamin,
  po.nama as nama_poli_asal,
  dok.nama as nama_dokter,
  -- Rujukan internal: poli tujuan di klinik sendiri.
  poin.nama as tujuan_poli_internal,
  -- Rujukan lanjut: faskes BPJS terstruktur (kode + nama), kalau sudah dipetakan.
  pm.rujuk_ppk_kode,
  rppk.nama as tujuan_faskes_kode,
  rsub.nama as tujuan_subspesialis,
  rsar.nama as tujuan_sarana,
  pm.rujuk_tgl_estimasi,
  -- Kolom teks lama — dulu satu-satunya cara mengisi tujuan, sebelum
  -- rujukan terstruktur ada (3 Sep 2026). Rujukan IGD masih memakainya
  -- apa adanya karena belum ada daftar rumah sakit rujukan IGD terstruktur.
  pm.rujuk_ke_faskes as tujuan_teks,
  pm.rujuk_spesialis as spesialis_teks,
  pm.rujuk_alasan,
  (select string_agg(dg.kode_icd10 || ' - ' || dg.nama, '; ' order by dg.jenis)
     from diagnosa dg where dg.kunjungan_id = pm.kunjungan_id) as daftar_diagnosa
from pemeriksaan pm
join kunjungan k on k.id = pm.kunjungan_id
join pasien p on p.id = k.pasien_id
join poli po on po.id = k.poli_id
left join pegawai dok on dok.id = k.dokter_id
left join poli poin on poin.id = pm.rujuk_poli_internal_id
left join ref_ppk rppk on rppk.kode = pm.rujuk_ppk_kode
left join ref_subspesialis rsub on rsub.kode = pm.rujuk_subspesialis_kode
left join ref_sarana rsar on rsar.kode = pm.rujuk_sarana_kode
where pm.tindak_lanjut in ('RUJUK_INTERNAL', 'RUJUK_LANJUT', 'RUJUK_IGD')
order by k.tanggal desc;

grant select on v_laporan_rujukan to authenticated;

-- ---------------------------------------------------------------------
-- C. Keuangan — nilai layanan vs uang masuk (lihat catatan kepala berkas)
-- ---------------------------------------------------------------------

-- C1. Nilai layanan: dari kasir_tagihan, per hari + jenis poli + penjamin.
--     `nilai_layanan` (subtotal) mencakup yang ditanggung BPJS dan TIDAK
--     pernah masuk kas — jangan disandingkan dengan uang_masuk di C2 pada
--     baris yang sama seolah keduanya sama-sama "pendapatan".
create or replace view v_laporan_keuangan_tagihan with (security_invoker = true) as
select
  tg.tanggal,
  coalesce(po.jenis::text, 'LAINNYA') as jenis_poli,
  tg.penjamin,
  count(*)                 as jumlah_tagihan,
  sum(tg.subtotal)         as nilai_layanan,
  sum(tg.total)            as ditagih,
  sum(tg.amount_paid)      as sudah_dibayar
from kasir_tagihan tg
left join kunjungan k on k.id = tg.kunjungan_id
left join poli po     on po.id = k.poli_id
group by tg.tanggal, coalesce(po.jenis::text, 'LAINNYA'), tg.penjamin;

grant select on v_laporan_keuangan_tagihan to authenticated;

-- C2. Uang masuk sungguhan: dari kasir_pembayaran, per hari + jenis poli
--     + penjamin + metode. Ini kas beneran — dasar rekonsiliasi tutup kas,
--     bukan v_kasir_rekap_harian (yang tidak dipisah per poli/penjamin;
--     dipakai halaman Kasir untuk tutup kas harian dan sengaja tidak diubah).
create or replace view v_laporan_keuangan_pembayaran with (security_invoker = true) as
select
  bp.tanggal,
  coalesce(po.jenis::text, 'LAINNYA') as jenis_poli,
  tg.penjamin,
  bp.metode,
  count(*)          as jumlah_transaksi,
  sum(bp.jumlah)    as uang_masuk
from kasir_pembayaran bp
join kasir_tagihan tg  on tg.id = bp.tagihan_id
left join kunjungan k  on k.id = tg.kunjungan_id
left join poli po      on po.id = k.poli_id
group by bp.tanggal, coalesce(po.jenis::text, 'LAINNYA'), tg.penjamin, bp.metode;

grant select on v_laporan_keuangan_pembayaran to authenticated;

comment on view v_laporan_rujukan is
  'Dibatasi ke akun admin di menu (js/pages/laporan.js), bukan di RLS — RLS
   tabel pemeriksaan sudah membuka baca untuk semua staf, sama seperti
   v_kronis_telpon_h1 di Tahap 2.';
comment on view v_laporan_keuangan_tagihan is
  'Dibatasi ke akun admin di menu (js/pages/laporan.js), bukan di RLS — RLS
   kasir_tagihan sudah membuka baca untuk semua staf (halaman Kasir
   memerlukannya). nilai_layanan (subtotal) TERMASUK yang ditanggung BPJS
   dan tidak sama dengan uang yang benar-benar masuk — lihat
   v_laporan_keuangan_pembayaran untuk itu.';
comment on view v_laporan_keuangan_pembayaran is
  'Dibatasi ke akun admin di menu (js/pages/laporan.js), bukan di RLS.
   Inilah kas sungguhan — dasar rekonsiliasi, bukan v_kasir_rekap_harian
   (dipakai halaman Kasir untuk tutup kas harian, tidak dipisah per poli).';

-- =====================================================================
--  EKSPOR DATA PEMANTAUAN KRONIS DARI PORTAL SIPANTAU
--
--  BERKAS INI DIJALANKAN DI DATABASE PORTAL, BUKAN DI DATABASE RME.
--  Supabase -> project "Pantau Klinik Imanuel" -> SQL Editor.
--
--  Jangan meletakkannya di folder sql/: berkas di sana dijalankan
--  berurutan ke database RME, dan tabel-tabel di bawah tidak ada di sana.
--
--  CARA PAKAI
--  ----------
--   1. Jalankan bagian 0 dulu untuk melihat berapa banyak datanya.
--   2. Jalankan bagian 1 sampai 4 SATU PER SATU. Setiap kali selesai,
--      tekan tombol "Download CSV" di kanan atas hasil, lalu simpan
--      dengan nama yang disebutkan di atas tiap bagian.
--   3. Keempat berkas CSV itu diunggah di RME:
--      Pengaturan -> Migrasi Portal.
--
--  KENAPA HASILNYA SATU KOLOM BERISI JSON
--  ---------------------------------------
--  Kolom resep_tetap di portal berisi teks BERBARIS BANYAK. Pada CSV
--  biasa, satu baris data jadi terpecah menjadi beberapa baris berkas,
--  dan berkas yang terpotong di tengah tidak akan terbaca utuh —
--  gejalanya bukan galat, melainkan separuh resep yang hilang diam-diam.
--  Sebagai JSON, ganti baris ditulis sebagai \n dan satu baris data
--  tetap satu baris berkas.
--
--  Ikut terbawa juga kolom yang tidak saya sebut satu per satu (mis.
--  created_at). Itu disengaja: yang tidak dikenali disimpan apa adanya,
--  jadi tidak ada yang hilang kalau ternyata portal punya kolom yang
--  belum saya lihat.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. BERAPA BANYAK DATANYA — jalankan ini dulu
-- ---------------------------------------------------------------------
select 'kronis_terapi (aktif)'  as tabel, count(*) as jumlah from kronis_terapi where aktif
union all
select 'kronis_terapi (total)',        count(*) from kronis_terapi
union all
select 'kronis_terapi punya no BPJS',  count(*) from kronis_terapi
                                        where coalesce(btrim(no_bpjs),'') <> ''
union all
select 'obat_kronis (riwayat ambil)',  count(*) from obat_kronis
union all
select 'lab_rutin (riwayat lab)',      count(*) from lab_rutin
union all
select 'pasien_kontrol (semua)',       count(*) from pasien_kontrol
union all
select 'pasien_kontrol (masih di depan)', count(*) from pasien_kontrol
                                        where tanggal_kontrol >= current_date;


-- ---------------------------------------------------------------------
-- 1. PENDAFTARAN TERAPI KRONIS   ->  simpan sebagai: 1-kronis_terapi.csv
-- ---------------------------------------------------------------------
select row_to_json(t)::text as baris
  from public.kronis_terapi t
 order by t.id;


-- ---------------------------------------------------------------------
-- 2. RIWAYAT PENGAMBILAN OBAT    ->  simpan sebagai: 2-obat_kronis.csv
--
-- Ini biasanya tabel terbesar. Kalau hasilnya terlalu banyak untuk sekali
-- unduh, jalankan bertahap dengan menghapus tanda komentar pada baris
-- offset di bawah: 0, lalu 5000, lalu 10000, dan seterusnya. Berkasnya
-- boleh diunggah satu per satu — baris yang sama tidak akan masuk dua
-- kali, karena yang dikenali adalah id aslinya di portal.
-- ---------------------------------------------------------------------
select row_to_json(t)::text as baris
  from public.obat_kronis t
 order by t.id
 limit 5000 offset 0;


-- ---------------------------------------------------------------------
-- 3. RIWAYAT PEMERIKSAAN LAB     ->  simpan sebagai: 3-lab_rutin.csv
-- ---------------------------------------------------------------------
select row_to_json(t)::text as baris
  from public.lab_rutin t
 order by t.id
 limit 5000 offset 0;


-- ---------------------------------------------------------------------
-- 4. JADWAL KONTROL PASIEN       ->  simpan sebagai: 4-pasien_kontrol.csv
--
-- Sengaja HANYA yang tanggalnya belum lewat. Jadwal kontrol yang sudah
-- berlalu bukan riwayat penyakit — ia pengingat yang sudah kedaluwarsa,
-- dan membawanya ke RME hanya menambah baris tanpa menambah keterangan.
-- Yang masih di depan justru wajib dibawa: kalau tidak, pasien yang
-- seharusnya ditelepon minggu depan hilang begitu portal dipensiunkan.
-- ---------------------------------------------------------------------
select row_to_json(t)::text as baris
  from public.pasien_kontrol t
 where t.tanggal_kontrol >= current_date
 order by t.id;

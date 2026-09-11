-- =====================================================================
--  RME KLINIK IMANUEL - KASIR BOLEH MENGELOLA TARIF (11 Sep 2026)
--
--  Laporan Arthur: kasir tidak bisa menambah tarif baru, tombolnya
--  "Tarif baru" di halaman Tarif & Invoice hanya berfungsi untuk master.
--
--  Akar masalahnya DUA LAPIS, bukan satu:
--
--   1. Kode `menu_tarif` (mengatur menu "Tarif & Invoice" terlihat/tidak)
--      belum pernah di-seed untuk peran mana pun selain master — jadi
--      SEBELUM migrasi ini, halamannya sendiri memang tertutup untuk
--      semua peran selain master, persis seperti yang dilaporkan Arthur.
--   2. Sekalipun langkah 1 diperbaiki (kasir dicentang `menu_tarif` lewat
--      Pengaturan -> Hak Akses), tombol "Tarif baru" TETAP akan gagal
--      disimpan — kebijakan RLS tabel `kasir_tarif` (tarif_kelola)
--      memeriksa `boleh_master_data()`, kode yang jauh lebih luas
--      (Master Data: obat, poli, ICD-10/9-CM, signa, dst), yang memang
--      sengaja hanya untuk master/admin. Memberi kasir akses master_data
--      hanya supaya bisa mengubah tarif berarti kasir ikut bisa mengubah
--      seluruh Master Data itu juga — bukan itu yang diminta.
--
--  Perbaikan: `menu_tarif` diberi fungsi `boleh_<kode>()` sendiri
--  (boleh_tarif()) dan dipakai LANGSUNG untuk kebijakan tulis
--  `kasir_tarif`, terpisah dari `master_data`. Satu kode, satu centang di
--  Pengaturan -> Hak Akses, cakupannya persis "Tarif & Invoice" saja.
--
--  Tab "Tampilan invoice" (logo/warna/struk) di halaman yang SAMA
--  SENGAJA TETAP dikunci ke boleh_master_data() — perubahan di sana
--  berlaku untuk SEMUA transaksi kasir sekaligus, beda kelas risiko
--  dibanding menambah satu baris tarif. js/pages/tarif.js disesuaikan
--  supaya kasir yang tidak punya master_data melihat tab itu sebagai
--  baca-saja (tombol Simpan disembunyikan), bukan gagal diam-diam saat
--  ditekan.
--
--  Idempoten — aman dijalankan ulang kapan saja.
-- =====================================================================

-- A. Fungsi boleh_tarif() — pembungkus tipis hak_akses_cek('menu_tarif'),
--    mengikuti pola boleh_kasir()/boleh_apotek() yang sudah ada.
create or replace function public.boleh_tarif() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('menu_tarif') $$;

grant execute on function public.boleh_tarif() to authenticated;

-- B. Kebijakan tulis Master Tarif: dari boleh_master_data() -> boleh_tarif().
--    Kebijakan baca (tarif_baca) tidak disentuh — semua staf tetap bisa
--    membaca tarif seperti sebelumnya.
drop policy if exists tarif_kelola on kasir_tarif;
create policy tarif_kelola on kasir_tarif for all
  to authenticated
  using (public.boleh_tarif())
  with check (public.boleh_tarif());

-- C. Beri kasir kode `menu_tarif` — ini yang membuat perubahan di atas
--    langsung terasa hari ini, tanpa Arthur perlu membuka Pengaturan ->
--    Hak Akses secara manual. Master tetap bisa mencabutnya kembali
--    kapan saja lewat halaman itu kalau berubah pikiran.
insert into public.hak_akses (kode, peran, diizinkan) values
  ('menu_tarif', 'kasir', true)
on conflict (kode, peran) do nothing;

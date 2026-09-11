-- =====================================================================
--  RME KLINIK IMANUEL — CARI PASIEN MIRIP (dipakai Pra-daftar Pasien)
--  Jalankan SETELAH 23_salinan_resep.sql. Aman dijalankan di database
--  berisi data, dan aman dijalankan ulang.
--
--  KENAPA FUNGSI INI ADA
--  ----------------------
--  Halaman Migrasi Portal (16_kronis.sql) sengaja TIDAK membuatkan
--  pasien baru otomatis: tabel pasien mewajibkan tanggal_lahir dan
--  jenis_kelamin, dua hal yang portal sipantau tidak pernah simpan.
--
--  Itu benar untuk klinik yang sudah punya pasien berjalan. Tapi kalau
--  RME dipasang dari nol (belum ada satu pun pasien terdaftar) dan
--  portal punya ratusan orang, mendaftarkan satu per satu lewat formulir
--  Pendaftaran tidak realistis. Halaman Pra-daftar Pasien (js/pages/
--  pra_daftar.js, ditempel sebagai tab tambahan di Migrasi Portal)
--  memberi jalan lain: staf mengisi tanggal lahir & jenis kelamin di
--  berkas CSV (dari kartu BPJS/KTP/catatan kertas), lalu berkasnya
--  didaftarkan sekaligus.
--
--  Fungsi di bawah ini yang menjaga jalan pintas itu tidak menerbitkan
--  pasien kembar: sebelum satu baris CSV benar-benar di-insert ke
--  `pasien`, halamannya memanggil fungsi ini untuk bertanya "apakah
--  sudah ada orang seperti ini?" — persis pertanyaan yang sama seperti
--  kronis_impor_usulan(), hanya saja sumbernya CSV pra-daftar, bukan
--  baris titipan migrasi kronis.
--
--  Skor mengikuti tingkatan yang sama dengan kronis_impor_usulan():
--    1. NIK sama persis         -> 100  (nik UNIQUE di tabel pasien)
--    2. Nomor BPJS sama persis  -> 95   (no_bpjs TIDAK unik di RME)
--    3. Nama sama persis        -> 90
--    4. Nama mirip (trigram)    -> di bawah itu
--  Sama seperti kronis_impor_usulan: kecocokan tetap hanya USULAN.
--  Keputusan "ini orang yang sama atau bukan" tidak pernah diambil di
--  sini — itu tetap tugas manusia yang melihat kartu pasiennya.
-- =====================================================================

create or replace function public.pasien_cari_mirip(
  p_nama     text,
  p_nik      text default null,
  p_no_bpjs  text default null,
  p_batas    int  default 5
) returns table (
  id uuid, no_rm text, nama text, tanggal_lahir date, jenis_kelamin jenis_kelamin_t,
  nik text, no_bpjs text, alamat text, skor numeric, alasan text
)
language sql stable security definer set search_path = public as $$
  with nik_bersih  as (select nullif(regexp_replace(coalesce(p_nik,''),     '\D', '', 'g'), '') as n),
       bpjs_bersih as (select nullif(regexp_replace(coalesce(p_no_bpjs,''), '\D', '', 'g'), '') as n)
  select p.id, p.no_rm, p.nama, p.tanggal_lahir, p.jenis_kelamin,
         p.nik, p.no_bpjs, p.alamat,
         greatest(
           case when (select n from nik_bersih) is not null
                 and p.nik = (select n from nik_bersih)
                then 100 else 0 end,
           case when (select n from bpjs_bersih) is not null
                 and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g') = (select n from bpjs_bersih)
                then 95 else 0 end,
           case when lower(btrim(p.nama)) = lower(btrim(p_nama))
                then 90 else 0 end,
           round(similarity(p.nama, p_nama)::numeric * 80, 1)
         ) as skor,
         case
           when (select n from nik_bersih) is not null
            and p.nik = (select n from nik_bersih)
             then 'NIK sama'
           when (select n from bpjs_bersih) is not null
            and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g') = (select n from bpjs_bersih)
             then 'Nomor BPJS sama'
           when lower(btrim(p.nama)) = lower(btrim(p_nama))
             then 'Nama sama persis'
           else 'Nama mirip'
         end as alasan
    from pasien p
   where p.aktif
     and (
       ((select n from nik_bersih) is not null and p.nik = (select n from nik_bersih))
       or ((select n from bpjs_bersih) is not null
            and regexp_replace(coalesce(p.no_bpjs,''), '\D', '', 'g') = (select n from bpjs_bersih))
       or similarity(p.nama, p_nama) > 0.3
     )
   order by skor desc, p.nama
   limit greatest(1, coalesce(p_batas, 5));
$$;

grant execute on function public.pasien_cari_mirip(text, text, text, int) to authenticated;

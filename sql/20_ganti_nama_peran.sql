-- =====================================================================
--  RME KLINIK IMANUEL - GANTI NAMA PERAN (9 Sep 2026)
--
--  HANYA untuk database Supabase yang SUDAH berjalan (sudah punya akun
--  dengan peran 'admin'/'pendaftaran'). Instalasi BARU dari nol tidak
--  perlu berkas ini sama sekali — sql/01_schema.sql sudah langsung
--  membuat peran dengan nama final ('master','admin',...).
--
--  Yang berubah:
--    'admin'       (peran tertinggi/pemilik sistem)  ->  'master'
--    'pendaftaran' (staf loket)                       ->  'admin'
--
--  Akun yang ada TIDAK PERLU di-UPDATE satu per satu. `RENAME VALUE`
--  hanya mengganti LABEL nilai enum yang sudah ada — baris `pegawai` yang
--  sekarang `peran = 'admin'` otomatis terbaca `'master'` sesudah ini,
--  begitu juga 'pendaftaran' -> 'admin'. Tidak ada data yang berubah.
--
--  URUTAN WAJIB: 'admin' harus lebih dulu dipindah ke 'master' supaya
--  label 'admin' kosong sebelum dipakai ulang untuk arti baru. Membalik
--  urutan akan gagal.
--
--  SETELAH menjalankan berkas ini, WAJIB langsung jalankan ulang (dalam
--  sesi kerja yang sama, jangan ditunda) berkas-berkas berikut — semuanya
--  sudah ditulis idempoten (aman dijalankan ulang di database berisi
--  data), dan sekarang memakai nama peran baru + kode hak akses yang
--  bisa diatur lewat Pengaturan -> Hak Akses:
--
--    02_rls.sql, 05_gigi.sql, 06_master.sql, 08_apotek.sql, 09_kasir.sql,
--    11_penunjang.sql, 13_surat.sql, 14_periksa_terstruktur.sql,
--    15_antrean.sql, 16_kronis.sql
--
--  Kalau langkah re-run itu terlewat, kebijakan RLS lama (yang masih
--  menyebut literal 'admin'/'pendaftaran' versi lama) akan mulai gagal
--  dengan "invalid input value for enum peran_pegawai" begitu label lama
--  itu sudah tidak ada — karena itu jangan jalankan berkas ini sendirian
--  lalu berhenti di tengah jalan.
--
--  Dibungkus supaya IDEMPOTEN (aman dijalankan ulang, dan aman ikut
--  terjalankan otomatis oleh test/jalankan.sh pada instalasi baru yang
--  labelnya sudah 'master' sejak awal): kalau label 'master' sudah ada
--  di enum, berkas ini tidak melakukan apa-apa.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'peran_pegawai' and e.enumlabel = 'master'
  ) then
    alter type peran_pegawai rename value 'admin' to 'master';
    alter type peran_pegawai rename value 'pendaftaran' to 'admin';
  end if;
end $$;

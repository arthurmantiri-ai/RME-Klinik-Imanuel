/* =====================================================================
   PENGATURAN TEMPLATE CETAK RESEP (10 Sep 2026)

   Arthur minta bisa mengatur template cetak Resep dari Pengaturan: unggah
   logo sendiri, pilih ukuran kertas, dan menyalakan/mematikan beberapa
   bagian (BB, Riwayat Alergi Obat, kotak Validasi Farmasi).

   Pola SENGAJA disalin persis dari `sys_surat_pengaturan` (13_surat.sql):
   satu baris jsonb, bawaan lengkap ditulis di JavaScript
   (js/db.js -> BAWAAN_RESEP), isi database ditumpuk di atasnya. Menambah
   pengaturan baru nanti (mis. sakelar tambahan) tidak butuh migrasi SQL
   lagi -- cukup satu kunci baru di BAWAAN_RESEP, dan klinik yang belum
   menyimpannya tetap jalan dengan nilai bawaan itu.

   Logo disimpan sebagai data URI di kolom jsonb ini juga (BUKAN Supabase
   Storage) -- alasan yang sama seperti kop surat: kuota Storage paket
   gratis habis diam-diam, dan window cetak (document.write) butuh
   gambarnya ADA saat itu juga, tidak bisa menunggu unduhan dari URL.
   ===================================================================== */

create table if not exists sys_resep_pengaturan (
  id           smallint primary key default 1 check (id = 1),
  konfigurasi  jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references pegawai(id)
);

insert into sys_resep_pengaturan (id, konfigurasi) values (1, '{}'::jsonb)
on conflict (id) do nothing;

drop trigger if exists trg_updated_sys_resep on sys_resep_pengaturan;
create trigger trg_updated_sys_resep before update on sys_resep_pengaturan
for each row execute function set_updated_at();

comment on table sys_resep_pengaturan is
  'Pengaturan template cetak Resep: logo, ukuran kertas, dan bagian yang ditampilkan. Satu baris (id=1), sama seperti sys_surat_pengaturan.';

-- Grant blanket seperti tabel sys_*_pengaturan lain -- lihat catatan RLS
-- di 02_rls.sql soal grant hanya berlaku untuk objek yang ADA saat
-- grant itu berjalan; tabel baru selalu butuh grant sendiri di sini.
grant select, insert, update, delete on sys_resep_pengaturan to authenticated;

alter table sys_resep_pengaturan enable row level security;

-- Dibaca semua staf (dibutuhkan siapa pun yang mencetak resep -- dokter),
-- diubah kode `master_data` -- persis sama seperti sys_surat_pengaturan.
drop policy if exists sys_resep_baca on sys_resep_pengaturan;
create policy sys_resep_baca on sys_resep_pengaturan for select
  to authenticated using (public.saya_staf());

drop policy if exists sys_resep_tulis on sys_resep_pengaturan;
create policy sys_resep_tulis on sys_resep_pengaturan for all
  to authenticated
  using (public.boleh_master_data())
  with check (public.boleh_master_data());

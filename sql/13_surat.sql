-- =====================================================================
--  RME KLINIK IMANUEL - SURAT-SURAT KETERANGAN
--  Surat sakit, rujukan BPJS, surat kontrol, keterangan berbadan sehat,
--  resume medis, dan surat keterangan bebas isi.
--  Jalankan SETELAH 12_kasir_penunjang.sql
--
--  ---------------------------------------------------------------------
--  PENOMORAN
--  ---------------------------------------------------------------------
--  Bentuk nomor yang dipakai Yayasan Kesehatan Imanuel:
--
--        07/SKS/YAKIM/IX/2026
--        ^^ ^^^ ^^^^^ ^^ ^^^^
--        |  |   |     |  +-- tahun
--        |  |   |     +----- bulan dalam angka Romawi
--        |  |   +----------- singkatan yayasan, tetap
--        |  +--------------- kode jenis surat
--        +------------------ nomor urut, minimal dua digit
--
--  Yang diketik pengguna HANYA angka nomor urutnya. Sisanya disusun
--  sendiri oleh database lewat kolom terhitung `nomor_surat`, sehingga
--  tidak ada satu pun surat yang bisa keluar dengan bentuk nomor berbeda
--  hanya karena seseorang salah ketik garis miring.
--
--  Deretnya TERPISAH PER JENIS SURAT dan diulang tiap tahun: surat sakit
--  punya deret sendiri, surat rujukan punya deret sendiri. Itu bentuk
--  yang lazim dipakai klinik dan paling mudah dicocokkan dengan buku
--  agenda surat keluar.
--
--  `surat_nomor_berikutnya()` hanya MENYARANKAN nomor terbesar + 1.
--  Sarannya boleh diganti — klinik yang sudah punya buku agenda berjalan
--  perlu bisa memasukkan nomor yang mendahului. Yang dijaga keras adalah
--  keunikannya, lewat indeks unik.
--
--  NOMOR YANG SUDAH DIPAKAI TIDAK PERNAH DIPAKAI ULANG, termasuk milik
--  surat yang dibatalkan. Surat yang batal hampir selalu sudah tercetak
--  dan mungkin sudah dipegang pasien; kalau nomornya dilepas kembali,
--  satu nomor pada buku agenda menunjuk dua lembar berbeda dan tidak ada
--  cara memisahkan keduanya lagi. Karena itu indeks uniknya sengaja
--  TIDAK memakai `where status = 'AKTIF'`.
--
--  ---------------------------------------------------------------------
--  TANDA TANGAN
--  ---------------------------------------------------------------------
--  Surat dicetak dengan RUANG TANDA TANGAN KOSONG, di bawahnya nama
--  dokter dan nomor SIP. Dokter menandatangani dengan pulpen, klinik
--  membubuhkan stempel. Keputusan Arthur, 3 September 2026.
--
--  Spesimen tanda tangan digital sengaja tidak disimpan. Alasannya bukan
--  soal ukuran berkas (satu spesimen PNG cuma puluhan kilobyte),
--  melainkan soal siapa yang bisa membubuhkannya: begitu gambar tanda
--  tangan dokter ada di dalam sistem, surat keterangan sakit bertanda
--  tangan dokter bisa terbit tanpa dokter itu pernah melihat pasiennya.
--
--  Nama dan SIP penanda tangan DISALIN ke dalam baris suratnya
--  (`ttd_nama`, `ttd_sip`), bukan dibaca ulang dari tabel `pegawai` saat
--  dicetak. Kalau nomor SIP dokter diperbarui tahun depan, cetak ulang
--  surat tahun ini harus tetap memulangkan lembar yang sama persis
--  dengan yang dulu ditandatangani — itu inti dari arsip.
-- =====================================================================


-- =====================================================================
--  A. HAK AKSES
-- =====================================================================

-- Siapa yang boleh MENERBITKAN surat.
-- Hanya dokter dan admin. Surat keterangan sakit, rujukan, dan keterangan
-- sehat semuanya adalah pernyataan medis atas nama dokter; yang boleh
-- menyusunnya adalah orang yang boleh bertanggung jawab atasnya.
-- Perawat, pendaftaran, apoteker, dan kasir tetap bisa MEMBACA dan
-- MENCETAK ULANG surat yang sudah terbit — itu pekerjaan loket.
-- 9 Sep 2026: lewat tabel hak_akses (bisa diatur master), bukan daftar
-- peran tetap lagi — lihat sql/02_rls.sql bagian HAK AKSES.
create or replace function public.boleh_surat() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('surat') $$;

-- Siapa boleh membatalkan/menghapus surat MILIK ORANG LAIN (di luar surat
-- sendiri, yang selalu boleh oleh dokter penerbitnya — itu tetap dijaga di
-- kode, bukan lewat kode hak akses ini, supaya master tidak bisa mencabut
-- hak dokter membatalkan suratnya sendiri).
create or replace function public.boleh_surat_batal() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('surat_batal') $$;

grant execute on function public.boleh_surat()       to authenticated;
grant execute on function public.boleh_surat_batal() to authenticated;

insert into public.hak_akses (kode, peran, diizinkan) values
  ('surat', 'dokter', true)
on conflict (kode, peran) do nothing;


-- =====================================================================
--  B. FUNGSI PENOMORAN
-- =====================================================================

-- Angka Romawi 1..12. IMMUTABLE karena dipakai di kolom terhitung.
create or replace function public.bulan_romawi(b integer) returns text
language sql immutable strict
as $$ select (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[b] $$;

-- Satu-satunya tempat bentuk nomor surat ditulis. Dipakai kolom
-- terhitung di tabel `surat`, dan dicerminkan di js/surat_core.js untuk
-- pratinjau sambil mengetik. Uji test/uji_surat.sql dan
-- test/uji_surat_core.js sengaja memakai contoh yang sama persis supaya
-- keduanya tidak bisa berselisih diam-diam.
--
-- Catatan tentang lpad: `lpad('115', 2, '0')` memulangkan '11', bukan
-- '115' — lpad memotong bila teksnya sudah lebih panjang dari panjang
-- yang diminta. Karena itu panjangnya dihitung dulu dengan greatest().
-- Tanpa itu, surat ke-100 dan seterusnya keluar dengan nomor terpotong,
-- dan bentroknya baru ketahuan pada surat ke-100 di bulan kesekian —
-- jauh setelah semua orang percaya penomorannya benar.
create or replace function public.format_no_surat(
  p_nomor integer, p_jenis text, p_bulan integer, p_tahun integer)
returns text
language sql immutable
as $$
  select lpad(p_nomor::text, greatest(2, length(p_nomor::text)), '0')
         || '/' || p_jenis || '/YAKIM/'
         || public.bulan_romawi(p_bulan) || '/' || p_tahun::text
$$;

grant execute on function public.bulan_romawi(integer) to authenticated;
grant execute on function public.format_no_surat(integer, text, integer, integer) to authenticated;


-- =====================================================================
--  C. MASTER JENIS SURAT
-- =====================================================================
--  Kodenya ikut tercetak di nomor surat, jadi mengubah kode setelah surat
--  terbit akan mengubah nomor surat lama (kolom `nomor_surat` terhitung
--  dari kode yang tersimpan di baris surat, bukan dari master — lihat
--  catatan di tabel `surat`). Karena itu kode disimpan sebagai teks di
--  baris suratnya sendiri, bukan sebagai kunci asing yang ikut berubah.
create table if not exists ref_jenis_surat (
  kode            text primary key,
  nama            text not null,
  judul_cetak     text not null,             -- judul besar di tengah lembar
  keterangan      text,
  perlu_kunjungan boolean not null default true,
  urutan          smallint not null default 0,
  aktif           boolean not null default true,
  created_at      timestamptz not null default now()
);
comment on table ref_jenis_surat is
  'Jenis surat yang bisa diterbitkan. Kode ikut tercetak di nomor surat.';

insert into ref_jenis_surat (kode, nama, judul_cetak, keterangan, perlu_kunjungan, urutan) values
  ('SKS',  'Surat Keterangan Sakit',        'SURAT KETERANGAN SAKIT',
   'Keterangan istirahat karena sakit, untuk tempat kerja atau sekolah.', true, 1),
  ('SR',   'Surat Rujukan',                 'SURAT RUJUKAN',
   'Rujukan ke fasilitas kesehatan tingkat lanjut, bentuk mengikuti rujukan BPJS.', true, 2),
  ('SK',   'Surat Kontrol',                 'SURAT KONTROL',
   'Anjuran kontrol ulang pada tanggal tertentu.', true, 3),
  ('SKBS', 'Surat Keterangan Berbadan Sehat','SURAT KETERANGAN BERBADAN SEHAT',
   'Hasil pemeriksaan kesehatan untuk melamar kerja, sekolah, atau keperluan lain.', true, 4),
  ('RM',   'Resume Medis',                  'RESUME MEDIS',
   'Ringkasan pelayanan satu kunjungan untuk asuransi atau rujukan lanjutan.', true, 5),
  ('SKL',  'Surat Keterangan',              'SURAT KETERANGAN',
   'Surat keterangan dengan isi bebas, untuk keperluan yang belum ada bentuk bakunya.', false, 9)
on conflict (kode) do update set
  nama = excluded.nama, judul_cetak = excluded.judul_cetak,
  keterangan = excluded.keterangan, perlu_kunjungan = excluded.perlu_kunjungan,
  urutan = excluded.urutan;


-- =====================================================================
--  D. SURAT
-- =====================================================================
create table if not exists surat (
  id            uuid primary key default uuid_generate_v4(),

  -- ---- Penomoran -----------------------------------------------------
  -- jenis_kode, bulan, dan tahun disimpan sebagai NILAI, bukan diturunkan
  -- dari tanggal saat dibaca. Surat yang dibuat 2 Oktober untuk agenda
  -- bulan September harus tetap bernomor .../IX/2026 selamanya, dan surat
  -- lama tidak boleh berubah nomor kalau master jenis surat disunting.
  jenis_kode    text not null references ref_jenis_surat(kode),
  nomor_urut    integer not null check (nomor_urut between 1 and 9999),
  bulan         smallint not null check (bulan between 1 and 12),
  tahun         smallint not null check (tahun between 2000 and 2199),
  nomor_surat   text generated always as
                  (public.format_no_surat(nomor_urut, jenis_kode, bulan, tahun)) stored,

  tanggal_surat date not null default public.tgl_klinik(),

  -- ---- Kepada siapa --------------------------------------------------
  pasien_id     uuid not null references pasien(id),
  -- Boleh kosong: surat keterangan bebas isi kadang tidak melekat pada
  -- satu kunjungan tertentu.
  kunjungan_id  uuid references kunjungan(id) on delete set null,

  -- ---- Isi -----------------------------------------------------------
  -- Bentuk isinya berbeda-beda per jenis surat dan akan bertambah seiring
  -- waktu. Menyimpannya sebagai jsonb berarti menambah jenis surat baru
  -- tidak butuh migrasi kolom; bentuk tiap jenis dijaga di
  -- js/surat_core.js, yang juga yang menyusun formulir dan lembar cetaknya.
  perihal       text,
  data          jsonb not null default '{}'::jsonb,

  -- ---- Penanda tangan (disalin, bukan dibaca ulang) -------------------
  dokter_id     uuid references pegawai(id),
  ttd_nama      text not null,
  ttd_jabatan   text not null default 'Dokter Pemeriksa',
  ttd_sip       text,

  -- ---- Keadaan -------------------------------------------------------
  status        text not null default 'AKTIF' check (status in ('AKTIF','BATAL')),
  alasan_batal  text,
  dibatalkan_oleh uuid references pegawai(id),
  dibatalkan_pada timestamptz,

  jml_cetak     integer not null default 0,
  cetak_terakhir timestamptz,

  dibuat_oleh   uuid references pegawai(id),
  dibuat_pada   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Satu nomor hanya boleh menunjuk satu lembar, selamanya. Termasuk surat
-- yang sudah dibatalkan — lihat penjelasan di kepala berkas ini.
create unique index if not exists uq_surat_nomor
  on surat (jenis_kode, tahun, nomor_urut);

create index if not exists idx_surat_pasien on surat (pasien_id, tanggal_surat desc);
create index if not exists idx_surat_kunjungan on surat (kunjungan_id);
create index if not exists idx_surat_tanggal on surat (tanggal_surat desc);

-- Pencarian bebas di halaman Riwayat Surat: nomor, nama pasien, dan
-- perihal dicari dengan satu kotak, tanpa pengguna perlu tahu ia sedang
-- mencari di kolom yang mana.
create index if not exists idx_surat_nomor_cari on surat (nomor_surat text_pattern_ops);

drop trigger if exists trg_updated_surat on surat;
create trigger trg_updated_surat before update on surat
for each row execute function set_updated_at();

-- Bulan dan tahun tidak boleh ditinggal kosong saat aplikasi lupa
-- mengirimnya; kalau tidak diisi, ikuti tanggal suratnya.
create or replace function public.surat_lengkapi() returns trigger
language plpgsql as $$
begin
  if new.bulan is null then new.bulan := extract(month from new.tanggal_surat)::smallint; end if;
  if new.tahun is null then new.tahun := extract(year  from new.tanggal_surat)::smallint; end if;

  -- Penerbit surat ditentukan oleh sesi, bukan oleh yang dikirim peramban.
  -- Kolom ini yang dipakai kebijakan RLS untuk memutuskan siapa yang boleh
  -- menyunting dan membatalkan surat; kalau nilainya boleh diketik klien,
  -- satu permintaan yang disusun tangan bisa menerbitkan surat atas nama
  -- dokter lain, lengkap dengan izin menyuntingnya.
  -- coalesce dipakai supaya berkas uji yang berjalan tanpa sesi (sebagai
  -- superuser) tetap bisa menyiapkan data.
  new.dibuat_oleh := coalesce(auth.uid(), new.dibuat_oleh);
  return new;
end $$;

drop trigger if exists trg_surat_lengkapi on surat;
create trigger trg_surat_lengkapi before insert on surat
for each row execute function public.surat_lengkapi();

-- Surat yang sudah dibatalkan tidak boleh disunting lagi. Tanpa
-- penjagaan ini, "batalkan lalu perbaiki isinya" menjadi cara mengubah
-- surat yang sudah dipegang pasien tanpa meninggalkan jejak: nomornya
-- sama, isinya lain, dan tidak ada satu pun kolom yang berubah untuk
-- menandainya. Membatalkan dan mencatat cetak tetap boleh.
create or replace function public.surat_jaga_batal() returns trigger
language plpgsql as $$
begin
  if old.status = 'BATAL' and new.status = 'BATAL' then
    if new.jenis_kode is distinct from old.jenis_kode
       or new.nomor_urut is distinct from old.nomor_urut
       or new.bulan is distinct from old.bulan
       or new.tahun is distinct from old.tahun
       or new.tanggal_surat is distinct from old.tanggal_surat
       or new.pasien_id is distinct from old.pasien_id
       or new.perihal is distinct from old.perihal
       or new.data is distinct from old.data
       or new.ttd_nama is distinct from old.ttd_nama then
      raise exception 'Surat yang sudah dibatalkan tidak dapat diubah. Terbitkan surat baru dengan nomor baru.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_surat_jaga_batal on surat;
create trigger trg_surat_jaga_batal before update on surat
for each row execute function public.surat_jaga_batal();


-- =====================================================================
--  E. FUNGSI
-- =====================================================================

-- Saran nomor berikutnya untuk satu jenis surat pada satu tahun.
-- Sekadar saran: pengguna boleh menggantinya. Yang menjaga keunikannya
-- adalah indeks uq_surat_nomor, bukan fungsi ini.
create or replace function public.surat_nomor_berikutnya(p_jenis text, p_tahun integer)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(max(nomor_urut), 0) + 1
    from public.surat
   where jenis_kode = p_jenis and tahun = p_tahun::smallint
$$;

-- Apakah satu nomor sudah terpakai? Dipakai formulir untuk memberi
-- peringatan SEBELUM tombol simpan ditekan, supaya pengguna tidak
-- kehilangan isian yang sudah diketik hanya untuk mengetahui nomornya
-- bentrok.
create or replace function public.surat_nomor_terpakai(
  p_jenis text, p_tahun integer, p_nomor integer)
returns text
language sql stable security definer set search_path = public
as $$
  select nomor_surat || case when status = 'BATAL' then ' (dibatalkan)' else '' end
    from public.surat
   where jenis_kode = p_jenis and tahun = p_tahun::smallint and nomor_urut = p_nomor
   limit 1
$$;

-- Membatalkan surat. Alasannya wajib dan tercatat.
-- Yang boleh: admin, atau dokter yang menerbitkannya sendiri.
create or replace function public.surat_batalkan(p_id uuid, p_alasan text)
returns surat
language plpgsql security definer set search_path = public
as $$
declare s surat;
begin
  if coalesce(btrim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi.';
  end if;

  select * into s from surat where id = p_id for update;
  if not found then raise exception 'Surat tidak ditemukan.'; end if;
  if s.status = 'BATAL' then raise exception 'Surat ini sudah dibatalkan.'; end if;

  if not (public.boleh_surat_batal() or s.dibuat_oleh = auth.uid()) then
    raise exception 'Hanya master atau dokter yang menerbitkan surat ini yang boleh membatalkannya.';
  end if;

  update surat set status = 'BATAL', alasan_batal = btrim(p_alasan),
         dibatalkan_oleh = auth.uid(), dibatalkan_pada = now()
   where id = p_id returning * into s;
  return s;
end $$;

-- Mencatat bahwa surat dicetak / diunduh. Boleh dipanggil semua staf —
-- loket memang yang mencetak ulang. Sengaja lewat fungsi, bukan UPDATE
-- biasa: kalau seluruh baris `surat` boleh di-UPDATE staf loket, mencatat
-- cetakan berarti membuka pintu untuk mengubah isi suratnya juga.
create or replace function public.surat_catat_cetak(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.saya_staf() then
    raise exception 'Tidak berwenang.';
  end if;
  update surat set jml_cetak = jml_cetak + 1, cetak_terakhir = now()
   where id = p_id;
end $$;

grant execute on function public.surat_nomor_berikutnya(text, integer)      to authenticated;
grant execute on function public.surat_nomor_terpakai(text, integer, integer) to authenticated;
grant execute on function public.surat_batalkan(uuid, text)                  to authenticated;
grant execute on function public.surat_catat_cetak(uuid)                     to authenticated;


-- =====================================================================
--  F. PENGATURAN SURAT
-- =====================================================================
--  Satu baris berisi seluruh pengaturan cetak surat: kop, kota pada
--  baris tanggal, dan catatan kaki. Bentuknya jsonb dengan pola yang sama
--  seperti sys_template_invoice (BAWAAN di JavaScript + gabung), sehingga
--  menambah pengaturan baru nanti tidak butuh migrasi SQL.
--
--  KOP DISIMPAN SEBAGAI DATA URI DI DALAM BARIS INI, BUKAN DI STORAGE.
--  Alasannya sama dengan keputusan 2 September untuk gambar rontgen:
--  Supabase paket gratis memberi 1 GB Storage, dan kuota yang habis
--  menggagalkan unggahan di tengah jam praktek. Kop surat cuma satu
--  gambar untuk seluruh klinik, ukurannya ratusan kilobyte setelah
--  dikecilkan di peramban, dan ia dibutuhkan SEKALIGUS dengan halaman
--  cetaknya — pdfmake bahkan tidak bisa mengambil gambar dari URL sama
--  sekali. Satu baris jsonb menyelesaikan ketiganya.
create table if not exists sys_surat_pengaturan (
  id           smallint primary key default 1 check (id = 1),
  konfigurasi  jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references pegawai(id)
);

insert into sys_surat_pengaturan (id, konfigurasi) values (1, '{}'::jsonb)
on conflict (id) do nothing;

drop trigger if exists trg_updated_sys_surat on sys_surat_pengaturan;
create trigger trg_updated_sys_surat before update on sys_surat_pengaturan
for each row execute function set_updated_at();


-- =====================================================================
--  G. VIEW
-- =====================================================================
create or replace view v_surat with (security_invoker = true) as
select s.id, s.nomor_surat, s.jenis_kode, s.nomor_urut, s.bulan, s.tahun,
       s.tanggal_surat, s.perihal, s.data, s.status, s.alasan_batal,
       s.jml_cetak, s.cetak_terakhir, s.dibuat_pada, s.dibuat_oleh,
       s.ttd_nama, s.ttd_jabatan, s.ttd_sip,
       j.nama as jenis_nama, j.judul_cetak,
       p.id as pasien_id, p.no_rm, p.nama as nama_pasien,
       p.jenis_kelamin, p.tanggal_lahir,
       s.kunjungan_id, k.no_kunjungan, k.tanggal as tanggal_kunjungan,
       k.cara_bayar,
       po.nama as nama_poli,
       pb.nama as nama_pembuat
  from surat s
  join ref_jenis_surat j on j.kode = s.jenis_kode
  join pasien p on p.id = s.pasien_id
  left join kunjungan k on k.id = s.kunjungan_id
  left join poli po on po.id = k.poli_id
  left join pegawai pb on pb.id = s.dibuat_oleh;

-- View tidak mewarisi GRANT dari 02_rls.sql. Gejalanya kalau ini
-- terlewat: "permission denied for view v_surat" di halaman yang
-- tabel-tabelnya jelas boleh dibaca. Karena view ini security_invoker,
-- RLS tabel di baliknya tetap berlaku; GRANT hanya membuka pintunya.
grant select on v_surat to authenticated;


-- =====================================================================
--  H. HAK AKSES TABEL & ROW LEVEL SECURITY
-- =====================================================================
--  GRANT ditulis untuk tiap tabel baru dan tidak diwariskan dari
--  02_rls.sql: `grant ... on all tables` di sana hanya mengenai tabel
--  yang sudah ada saat berkas itu dijalankan.
grant select, insert, update, delete on
  ref_jenis_surat, surat, sys_surat_pengaturan
  to authenticated;

alter table ref_jenis_surat     enable row level security;
alter table surat               enable row level security;
alter table sys_surat_pengaturan enable row level security;

-- Master jenis surat: dibaca semua staf, diubah kode `master_data`.
drop policy if exists ref_jenis_surat_baca on ref_jenis_surat;
create policy ref_jenis_surat_baca on ref_jenis_surat for select
  to authenticated using (public.saya_staf());

drop policy if exists ref_jenis_surat_tulis on ref_jenis_surat;
create policy ref_jenis_surat_tulis on ref_jenis_surat for all
  to authenticated
  using (public.boleh_master_data())
  with check (public.boleh_master_data());

-- Surat: dibaca semua staf (loket mencetak ulang, kasir memeriksa
-- kelengkapan berkas rujukan).
drop policy if exists surat_baca on surat;
create policy surat_baca on surat for select
  to authenticated using (public.saya_staf());

-- Diterbitkan hanya oleh dokter (kode `surat`).
drop policy if exists surat_terbit on surat;
create policy surat_terbit on surat for insert
  to authenticated with check (public.boleh_surat());

-- Disunting oleh yang berhak membatalkan surat orang lain (kode
-- `surat_batal`), atau dokter yang menerbitkannya sendiri, dan hanya
-- selama masih berstatus AKTIF. Perubahan status menjadi BATAL berjalan
-- lewat surat_batalkan() yang SECURITY DEFINER, jadi tidak terhalang
-- kebijakan ini.
drop policy if exists surat_sunting on surat;
create policy surat_sunting on surat for update
  to authenticated
  using (public.boleh_surat_batal()
         or (public.boleh_surat() and dibuat_oleh = auth.uid() and status = 'AKTIF'))
  with check (public.boleh_surat_batal()
              or (public.boleh_surat() and dibuat_oleh = auth.uid()));

-- Menghapus surat: kode `surat_batal` juga, dan sebaiknya tidak pernah.
-- Surat yang salah dibatalkan, bukan dihapus — nomornya tetap terpakai
-- supaya lembar yang terlanjur tercetak tidak berubah arti.
drop policy if exists surat_hapus on surat;
create policy surat_hapus on surat for delete
  to authenticated using (public.boleh_surat_batal());

-- Pengaturan surat: dibaca semua staf (kopnya dibutuhkan siapa pun yang
-- mencetak), diubah kode `master_data`.
drop policy if exists sys_surat_baca on sys_surat_pengaturan;
create policy sys_surat_baca on sys_surat_pengaturan for select
  to authenticated using (public.saya_staf());

drop policy if exists sys_surat_tulis on sys_surat_pengaturan;
create policy sys_surat_tulis on sys_surat_pengaturan for all
  to authenticated
  using (public.boleh_master_data())
  with check (public.boleh_master_data());


-- =====================================================================
--  I. AUDIT
-- =====================================================================
drop trigger if exists trg_audit_surat on surat;
create trigger trg_audit_surat
  after insert or update or delete on surat
  for each row execute function public.catat_audit();

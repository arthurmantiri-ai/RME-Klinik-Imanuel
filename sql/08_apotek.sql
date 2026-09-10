-- =====================================================================
--  RME KLINIK IMANUEL - MODUL APOTEK (STOK OBAT BATCH, FEFO)
--  Jalankan SETELAH 07_peran_kasir.sql
--
--  Diturunkan dari modul stok obat portal sipantau, dengan tiga
--  perbedaan yang disengaja:
--
--   1. Obat ditunjuk lewat obat_id ke master `obat`, bukan nama teks.
--      Di portal nama obat adalah teks bebas, sehingga "Amoxicillin 500mg"
--      dan "amoxicillin 500 mg" dari impor Excel menjadi dua obat berbeda
--      dan kartu stoknya pecah dua. RME sudah punya master obat; dipakai.
--
--   2. Alokasi FEFO dikerjakan di database, bukan di browser. Di portal
--      perhitungannya di JavaScript lalu mengirim UPDATE per batch — aman
--      untuk satu apoteker di satu komputer. Di sini apoteker dan kasir
--      bisa membuka halaman bersamaan; dua orang yang memotong batch yang
--      sama pada detik yang sama akan sama-sama membaca sisa 10 dan
--      sama-sama menguranginya. Penguncian di §D menutup celah itu.
--
--   3. Pengeluaran obat menyimpan kunjungan_id dan resep_item_id, jadi
--      setiap butir obat yang keluar bisa ditelusuri ke pasiennya.
--
--  Yang DISALIN apa adanya dari portal karena sudah terbukti:
--   - FEFO (bukan FIFO): yang paling dekat kadaluwarsa keluar duluan,
--     tanggal masuk hanya jadi pemutus seri.
--   - grup_id: satu penyerahan yang terpecah ke beberapa batch dibatalkan
--     serentak atau tidak sama sekali.
--   - Batch kadaluwarsa hanya boleh dikeluarkan lewat kategori pemusnahan.
-- =====================================================================


-- =====================================================================
--  A. FUNGSI BANTU
-- =====================================================================

-- A1. Tanggal menurut zona klinik, bukan zona server.
--
-- Supabase menjalankan Postgres pada UTC. Manado ada di WITA (UTC+8),
-- jadi current_date masih menunjukkan tanggal KEMARIN sampai pukul 08.00
-- pagi waktu setempat — persis jam klinik mulai menerima kiriman PBF dan
-- membuka layanan. Barang yang diterima pukul 07.30 akan tercatat masuk
-- di tanggal kemarin, dan rekap kas hari itu tidak akan pernah cocok.
--
-- Semua tanggal bawaan di modul apotek & kasir memakai fungsi ini.
create or replace function public.tgl_klinik() returns date
language sql stable as $$ select (now() at time zone 'Asia/Makassar')::date $$;

comment on function public.tgl_klinik() is
  'Tanggal hari ini menurut WITA (Asia/Makassar). Dipakai sebagai default
   tanggal transaksi apotek & kasir supaya tidak meleset satu hari pada
   jam pagi.';

grant execute on function public.tgl_klinik() to authenticated;


-- A2. Peran pengguna sebagai teks.
--
-- peran_saya() sudah ada di 02_rls.sql dan mengembalikan enum. Versi teks
-- ini dipakai oleh policy di modul apotek & kasir supaya tidak ada satu
-- pun literal enum baru ('kasir') yang muncul di berkas ini — lihat
-- catatan panjang di 07_peran_kasir.sql.
create or replace function public.peran_teks_saya() returns text
language sql stable security definer set search_path = public
as $$ select peran::text from public.pegawai where id = auth.uid() and aktif $$;

grant execute on function public.peran_teks_saya() to authenticated;

-- A3. Pintasan hak akses modul.
-- 9 Sep 2026: isinya sekarang lewat tabel hak_akses (bisa diatur master di
-- Pengaturan -> Hak Akses), bukan daftar peran tetap lagi — lihat
-- sql/02_rls.sql bagian HAK AKSES untuk fungsi generiknya.
create or replace function public.boleh_apotek() returns boolean
language sql stable security definer set search_path = public
as $$ select public.hak_akses_cek('apotek') $$;

grant execute on function public.boleh_apotek() to authenticated;

-- Apoteker menandai resep sudah diserahkan langsung di tabel `resep`.
-- Dipindah ke sini (dari sql/02_rls.sql) supaya sekalian konsisten pakai
-- boleh_apotek() — sebelumnya hanya 'apoteker' literal, artinya admin/master
-- sebenarnya TIDAK bisa melakukan ini di database walau tombolnya di
-- apotek.js terlihat aktif untuk admin (klien mengizinkan, server menolak).
-- boleh_apotek() menyamakan keduanya: master selalu ikut lewat jaring
-- pengaman, dan kode `apotek` tetap default hanya untuk apoteker.
drop policy if exists resep_serah_apoteker on resep;
create policy resep_serah_apoteker on resep for update
  to authenticated
  using (public.boleh_apotek())
  with check (public.boleh_apotek());

-- Isian awal kode `apotek` — sama seperti sebelumnya (apoteker), plus
-- master lewat jaring pengaman di hak_akses_cek(). Aman dijalankan ulang.
insert into public.hak_akses (kode, peran, diizinkan) values
  ('apotek', 'apoteker', true)
on conflict (kode, peran) do nothing;


-- =====================================================================
--  B. TABEL
-- =====================================================================

-- B1. Satu baris = satu batch fisik di rak.
--
-- Batch dibedakan oleh gabungan (obat, tgl_expired, no_faktur, pbf,
-- harga_beli). Pemasukan dengan gabungan yang persis sama menambah stok
-- batch yang ada, bukan membuat baris baru — kalau tidak, satu obat yang
-- dibeli tiap minggu dari PBF yang sama akan menumpuk puluhan baris yang
-- sebenarnya satu tumpukan yang sama di rak.
create table if not exists apotek_batch (
  id            uuid primary key default uuid_generate_v4(),
  obat_id       uuid not null references obat(id),
  no_batch      text,
  tgl_expired   date not null,
  tgl_masuk     date not null default public.tgl_klinik(),
  no_faktur     text,
  pbf           text not null,
  harga_beli    numeric(14,2) not null default 0,   -- per satuan terkecil
  stok_awal     numeric(14,2) not null,
  stok_sisa     numeric(14,2) not null,
  keterangan    text,
  dibuat_oleh   uuid references pegawai(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint stok_awal_positif check (stok_awal > 0),
  constraint stok_sisa_wajar  check (stok_sisa >= 0 and stok_sisa <= stok_awal)
);

comment on table apotek_batch is
  'Persediaan obat per batch. Urutan keluar ditentukan FEFO: tgl_expired
   paling dekat lebih dulu, tgl_masuk jadi pemutus seri.';

-- Indeks urutan FEFO. Parsial supaya batch habis tidak ikut ditelusuri.
create index if not exists idx_batch_fefo
  on apotek_batch (obat_id, tgl_expired, tgl_masuk, created_at)
  where stok_sisa > 0;
create index if not exists idx_batch_obat    on apotek_batch (obat_id);
create index if not exists idx_batch_expired on apotek_batch (tgl_expired) where stok_sisa > 0;

-- Penggabungan batch identik bersandar pada indeks unik ini. no_faktur
-- boleh NULL, dan NULL tidak pernah sama dengan NULL di indeks unik biasa,
-- jadi dipakai coalesce ke string kosong.
create unique index if not exists uq_batch_identik on apotek_batch
  (obat_id, tgl_expired, coalesce(no_faktur,''), lower(pbf), harga_beli);


-- B2. Satu baris = satu pergerakan stok.
--
-- Tidak pernah di-UPDATE untuk mengoreksi. Koreksi dilakukan dengan
-- membatalkan grup (§D4), yang menulis pembatalannya sebagai peristiwa
-- tersendiri. Riwayat yang bisa ditimpa bukan riwayat.
create table if not exists apotek_transaksi (
  id             bigserial primary key,
  batch_id       uuid not null references apotek_batch(id) on delete cascade,
  obat_id        uuid not null references obat(id),
  nama_obat      text not null,          -- potret nama saat itu
  satuan         text not null,
  jenis          text not null check (jenis in ('MASUK','KELUAR')),
  kategori       text not null,
  jumlah         numeric(14,2) not null check (jumlah > 0),
  harga_satuan   numeric(14,2) not null default 0,
  total_nilai    numeric(14,2) not null default 0,
  tanggal        date not null default public.tgl_klinik(),
  no_faktur      text,
  pbf            text,
  -- Penghubung ke rekam medis. NULL untuk pembelian, pemusnahan, retur.
  kunjungan_id   uuid references kunjungan(id) on delete set null,
  pasien_id      uuid references pasien(id) on delete set null,
  resep_item_id  uuid references resep_item(id) on delete set null,
  -- Satu perintah pemakai; bisa terpecah ke beberapa batch.
  grup_id        uuid not null,
  -- Diisi saat baris ini adalah pembatalan baris lain.
  batal_dari     uuid,
  dibatalkan     boolean not null default false,
  keterangan     text,
  dibuat_oleh    uuid references pegawai(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_trx_tanggal   on apotek_transaksi (tanggal desc, id desc);
create index if not exists idx_trx_obat      on apotek_transaksi (obat_id, tanggal);
create index if not exists idx_trx_batch     on apotek_transaksi (batch_id);
create index if not exists idx_trx_grup      on apotek_transaksi (grup_id);
create index if not exists idx_trx_kunjungan on apotek_transaksi (kunjungan_id)
  where kunjungan_id is not null;


-- B3. Kolom tambahan pada resep yang sudah ada.
--
-- jumlah_diserahkan sengaja terpisah dari jumlah. Dokter menulis 30
-- tablet, apoteker menyerahkan 20 karena stok tipis — dua angka yang
-- berbeda dan sering. Kalau stok dipotong dari angka resep, kartu stok
-- akan melenceng dari rak dalam hitungan minggu, dan selisihnya tidak
-- akan pernah bisa ditelusuri.
alter table resep_item add column if not exists jumlah_diserahkan numeric(8,2);
alter table resep_item add column if not exists catatan_farmasi   text;

-- resep.status sudah ada dengan nilai 'DIBUAT' | 'DISERAHKAN'.
-- Ditambah dua nilai: 'DISIAPKAN' (sedang dikerjakan apoteker) dan
-- 'BATAL' (pasien tidak jadi menebus).
alter table resep add column if not exists diserahkan_sebagian boolean not null default false;


-- =====================================================================
--  C. KATEGORI PENGELUARAN
-- =====================================================================

-- Hanya kategori pemusnahan yang boleh mengambil dari batch kadaluwarsa —
-- itu justru gunanya. Untuk kategori lain, batch kadaluwarsa terkunci:
-- obat kadaluwarsa tidak boleh sampai ke tangan pasien hanya karena ia
-- kebetulan paling depan dalam antrean FEFO.
create or replace function public.apotek_kategori_pemusnahan() returns text[]
language sql immutable as $$ select array['Obat Expired','Obat Rusak','Retur ke PBF'] $$;

create or replace function public.apotek_kategori_keluar() returns text[]
language sql immutable as $$ select array[
  'Resep Pasien', 'Penjualan Bebas', 'Obat Expired', 'Obat Rusak',
  'Retur ke PBF', 'Penyesuaian Stok', 'Lainnya'
] $$;

grant execute on function public.apotek_kategori_pemusnahan() to authenticated;
grant execute on function public.apotek_kategori_keluar() to authenticated;


-- =====================================================================
--  D. FUNGSI TRANSAKSI
-- =====================================================================

-- D1. Kunci per obat.
--
-- pg_advisory_xact_lock menahan seluruh transaksi lain yang menyentuh
-- obat yang SAMA sampai transaksi ini selesai, lalu lepas sendiri saat
-- commit atau rollback. Dipakai alih-alih SELECT ... FOR UPDATE karena
-- FOR UPDATE yang dipadukan ORDER BY punya jebakan halus: pemanggil
-- kedua menunggu, tetapi setelah kuncinya lepas ia melanjutkan dengan
-- urutan baris hasil pembacaan LAMA — yaitu urutan FEFO sebelum batch
-- pertama terpotong. Dengan advisory lock, pembacaan baru terjadi
-- setelah kunci didapat, jadi urutannya selalu urutan mutakhir.
create or replace function public.apotek_kunci_obat(p_obat_id uuid) returns void
language sql as $$ select pg_advisory_xact_lock(hashtextextended(p_obat_id::text, 0)) $$;


-- D2. OBAT MASUK
--
-- Mengembalikan { batch_id, grup_id, digabung }. `digabung` true berarti
-- stok ditambahkan ke batch yang sudah ada, bukan membuat batch baru.
create or replace function public.apotek_masuk(
  p_obat_id     uuid,
  p_jumlah      numeric,
  p_harga_beli  numeric,
  p_tgl_expired date,
  p_pbf         text,
  p_no_faktur   text default null,
  p_tgl_masuk   date default null,
  p_no_batch    text default null,
  p_keterangan  text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_obat     obat%rowtype;
  v_batch    apotek_batch%rowtype;
  v_tgl      date := coalesce(p_tgl_masuk, public.tgl_klinik());
  v_grup     uuid := gen_random_uuid();
  v_digabung boolean := false;
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh mencatat obat masuk.'
      using errcode = '42501';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah masuk harus lebih dari nol.';
  end if;
  if p_tgl_expired is null then
    raise exception 'Tanggal kadaluwarsa wajib diisi.';
  end if;
  if coalesce(btrim(p_pbf), '') = '' then
    raise exception 'Nama PBF / distributor wajib diisi.';
  end if;

  select * into v_obat from obat where id = p_obat_id;
  if not found then
    raise exception 'Obat tidak ditemukan di master obat.';
  end if;

  perform public.apotek_kunci_obat(p_obat_id);

  select * into v_batch from apotek_batch
   where obat_id = p_obat_id
     and tgl_expired = p_tgl_expired
     and coalesce(no_faktur,'') = coalesce(p_no_faktur,'')
     and lower(pbf) = lower(btrim(p_pbf))
     and harga_beli = p_harga_beli;

  if found then
    update apotek_batch
       set stok_awal  = stok_awal + p_jumlah,
           stok_sisa  = stok_sisa + p_jumlah,
           updated_at = now()
     where id = v_batch.id
     returning * into v_batch;
    v_digabung := true;
  else
    insert into apotek_batch (obat_id, no_batch, tgl_expired, tgl_masuk, no_faktur,
                              pbf, harga_beli, stok_awal, stok_sisa, keterangan, dibuat_oleh)
    values (p_obat_id, p_no_batch, p_tgl_expired, v_tgl, p_no_faktur,
            btrim(p_pbf), p_harga_beli, p_jumlah, p_jumlah, p_keterangan, auth.uid())
    returning * into v_batch;
  end if;

  insert into apotek_transaksi (batch_id, obat_id, nama_obat, satuan, jenis, kategori,
                                jumlah, harga_satuan, total_nilai, tanggal,
                                no_faktur, pbf, grup_id, keterangan, dibuat_oleh)
  values (v_batch.id, p_obat_id, v_obat.nama, v_obat.satuan, 'MASUK', 'Pembelian',
          p_jumlah, p_harga_beli, p_jumlah * p_harga_beli, v_tgl,
          p_no_faktur, btrim(p_pbf), v_grup, p_keterangan, auth.uid());

  return jsonb_build_object(
    'batch_id',  v_batch.id,
    'grup_id',   v_grup,
    'digabung',  v_digabung,
    'stok_sisa', v_batch.stok_sisa
  );
end $$;


-- D3. OBAT KELUAR (mesin FEFO)
--
-- Satu transaksi utuh: kunci → baca urutan FEFO → potong → tulis riwayat.
-- Gagal di tengah berarti tidak ada yang berubah sama sekali.
--
-- Mengembalikan { grup_id, total_nilai, potongan:[{batch_id, tgl_expired,
-- jumlah, harga_satuan, nilai}] }.
create or replace function public.apotek_keluar(
  p_obat_id       uuid,
  p_jumlah        numeric,
  p_kategori      text default 'Resep Pasien',
  p_tanggal       date default null,
  p_kunjungan_id  uuid default null,
  p_resep_item_id uuid default null,
  p_batch_id      uuid default null,
  p_keterangan    text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_obat       obat%rowtype;
  v_tgl        date := coalesce(p_tanggal, public.tgl_klinik());
  v_grup       uuid := gen_random_uuid();
  v_sisa       numeric := p_jumlah;
  v_ambil      numeric;
  v_total      numeric := 0;
  v_tersedia   numeric := 0;
  v_pemusnahan boolean;
  v_pasien     uuid;
  v_potongan   jsonb := '[]'::jsonb;
  r            record;
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh mengeluarkan obat.'
      using errcode = '42501';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah keluar harus lebih dari nol.';
  end if;
  if not (p_kategori = any (public.apotek_kategori_keluar())) then
    raise exception 'Kategori pengeluaran "%" tidak dikenal.', p_kategori;
  end if;

  select * into v_obat from obat where id = p_obat_id;
  if not found then
    raise exception 'Obat tidak ditemukan di master obat.';
  end if;

  v_pemusnahan := p_kategori = any (public.apotek_kategori_pemusnahan());

  if p_kunjungan_id is not null then
    select pasien_id into v_pasien from kunjungan where id = p_kunjungan_id;
  end if;

  perform public.apotek_kunci_obat(p_obat_id);

  -- Cek ketersediaan LEBIH DULU, supaya pesannya menyebut angka yang
  -- berguna ("kurang 8") alih-alih gagal di tengah perulangan.
  select coalesce(sum(stok_sisa), 0) into v_tersedia
    from apotek_batch
   where obat_id = p_obat_id
     and stok_sisa > 0
     and (p_batch_id is null or id = p_batch_id)
     and (v_pemusnahan or tgl_expired > v_tgl);

  if v_tersedia < p_jumlah then
    raise exception 'Stok % tidak cukup. Tersedia % %, diminta %.',
      v_obat.nama, v_tersedia, v_obat.satuan, p_jumlah;
  end if;

  for r in
    select * from apotek_batch
     where obat_id = p_obat_id
       and stok_sisa > 0
       and (p_batch_id is null or id = p_batch_id)
       and (v_pemusnahan or tgl_expired > v_tgl)
     order by tgl_expired, tgl_masuk, created_at, id     -- FEFO
  loop
    exit when v_sisa <= 0;

    v_ambil := least(r.stok_sisa, v_sisa);

    update apotek_batch
       set stok_sisa = stok_sisa - v_ambil, updated_at = now()
     where id = r.id;

    insert into apotek_transaksi (batch_id, obat_id, nama_obat, satuan, jenis, kategori,
                                  jumlah, harga_satuan, total_nilai, tanggal,
                                  no_faktur, pbf, kunjungan_id, pasien_id, resep_item_id,
                                  grup_id, keterangan, dibuat_oleh)
    values (r.id, p_obat_id, v_obat.nama, v_obat.satuan, 'KELUAR', p_kategori,
            v_ambil, r.harga_beli, v_ambil * r.harga_beli, v_tgl,
            r.no_faktur, r.pbf, p_kunjungan_id, v_pasien, p_resep_item_id,
            v_grup, p_keterangan, auth.uid());

    v_total    := v_total + v_ambil * r.harga_beli;
    v_sisa     := v_sisa - v_ambil;
    v_potongan := v_potongan || jsonb_build_object(
      'batch_id',     r.id,
      'tgl_expired',  r.tgl_expired,
      'no_faktur',    r.no_faktur,
      'pbf',          r.pbf,
      'jumlah',       v_ambil,
      'harga_satuan', r.harga_beli,
      'nilai',        v_ambil * r.harga_beli
    );
  end loop;

  -- Penjaga terakhir. Kalau baris ini pernah tercapai, ada yang salah
  -- pada penguncian di atas — dan lebih baik seluruh penyerahan batal
  -- daripada stok tercatat keluar setengah.
  if v_sisa > 0 then
    raise exception 'Alokasi FEFO gagal: masih kurang % %. Tidak ada yang disimpan.',
      v_sisa, v_obat.satuan;
  end if;

  return jsonb_build_object(
    'grup_id',     v_grup,
    'total_nilai', v_total,
    'potongan',    v_potongan
  );
end $$;


-- D4. PEMBATALAN SATU GRUP
--
-- Batasnya 7 hari, ditegakkan DI SINI dan bukan hanya di tombol browser.
-- Tombol yang dinonaktifkan hanya menghemat satu klik sia-sia; yang
-- benar-benar menjaga adalah baris ini.
create or replace function public.apotek_batalkan_grup(
  p_grup_id   uuid,
  p_alasan    text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_baris   record;
  v_jumlah  int := 0;
  v_obat_id uuid;
  v_umur    int;
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh membatalkan transaksi.'
      using errcode = '42501';
  end if;

  select obat_id, (public.tgl_klinik() - min(tanggal))
    into v_obat_id, v_umur
    from apotek_transaksi
   where grup_id = p_grup_id and not dibatalkan
   group by obat_id;

  if v_obat_id is null then
    raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan sebelumnya.';
  end if;
  if v_umur > 7 then
    raise exception 'Transaksi berumur % hari sudah tidak bisa dibatalkan (batas 7 hari). '
                    'Catat koreksinya sebagai Penyesuaian Stok.', v_umur;
  end if;

  perform public.apotek_kunci_obat(v_obat_id);

  for v_baris in
    select * from apotek_transaksi where grup_id = p_grup_id and not dibatalkan
  loop
    if v_baris.jenis = 'KELUAR' then
      update apotek_batch set stok_sisa = stok_sisa + v_baris.jumlah, updated_at = now()
       where id = v_baris.batch_id;
    else
      -- Membatalkan pemasukan hanya sah kalau barangnya masih utuh di rak.
      -- Kalau sebagian sudah diserahkan ke pasien, membatalkan pemasukan
      -- akan membuat stok minus dan riwayat berbohong.
      update apotek_batch
         set stok_awal = stok_awal - v_baris.jumlah,
             stok_sisa = stok_sisa - v_baris.jumlah,
             updated_at = now()
       where id = v_baris.batch_id and stok_sisa >= v_baris.jumlah;
      if not found then
        raise exception 'Batch ini sudah terpakai sebagian, jadi pemasukannya tidak bisa '
                        'dibatalkan. Keluarkan sisanya lewat Penyesuaian Stok.';
      end if;
    end if;

    update apotek_transaksi set dibatalkan = true where id = v_baris.id;
    v_jumlah := v_jumlah + 1;
  end loop;

  -- Kalau grup ini berasal dari penyerahan resep, kembalikan resepnya
  -- ke keadaan belum diserahkan supaya bisa dikerjakan ulang.
  update resep_item ri
     set jumlah_diserahkan = null
    from apotek_transaksi t
   where t.grup_id = p_grup_id and t.resep_item_id = ri.id;

  update resep r
     set status = 'DIBUAT', diserahkan_pada = null, diserahkan_oleh = null,
         diserahkan_sebagian = false
   where r.id in (
     select ri.resep_id from apotek_transaksi t
       join resep_item ri on ri.id = t.resep_item_id
      where t.grup_id = p_grup_id
   );

  return jsonb_build_object('dibatalkan', v_jumlah, 'alasan', p_alasan);
end $$;


-- D5. PENYERAHAN RESEP
--
-- p_item berbentuk [{ "resep_item_id": "...", "jumlah": 10 }, ...].
-- Butir dengan jumlah 0 atau tidak disebut = tidak diserahkan; resepnya
-- ditandai diserahkan sebagian, bukan diserahkan penuh.
--
-- Seluruh butir dikerjakan dalam SATU transaksi: kalau obat ketiga
-- ternyata kurang, dua yang pertama ikut batal. Alternatifnya adalah
-- pasien pulang membawa dua obat sementara sistem mencatat resep gagal —
-- selisih yang tidak akan ketahuan sampai stok opname.
create or replace function public.apotek_serahkan_resep(
  p_resep_id  uuid,
  p_item      jsonb,
  p_tanggal   date default null,
  p_catatan   text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_resep      resep%rowtype;
  v_kunjungan  uuid;
  v_it         jsonb;
  v_ri         resep_item%rowtype;
  v_jumlah     numeric;
  v_hasil      jsonb;
  v_grup       jsonb := '[]'::jsonb;
  v_diserahkan int := 0;
  v_total_item int := 0;
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh menyerahkan resep.'
      using errcode = '42501';
  end if;

  select * into v_resep from resep where id = p_resep_id;
  if not found then raise exception 'Resep tidak ditemukan.'; end if;
  if v_resep.status = 'DISERAHKAN' then
    raise exception 'Resep % sudah pernah diserahkan.', coalesce(v_resep.no_resep,'ini');
  end if;
  v_kunjungan := v_resep.kunjungan_id;

  select count(*) into v_total_item from resep_item where resep_id = p_resep_id;

  for v_it in select * from jsonb_array_elements(coalesce(p_item, '[]'::jsonb))
  loop
    v_jumlah := coalesce((v_it->>'jumlah')::numeric, 0);
    continue when v_jumlah <= 0;

    select * into v_ri from resep_item
     where id = (v_it->>'resep_item_id')::uuid and resep_id = p_resep_id;
    if not found then
      raise exception 'Butir resep tidak ditemukan pada resep ini.';
    end if;
    if v_ri.obat_id is null then
      raise exception 'Butir "%" belum tertaut ke master obat, jadi stoknya tidak bisa '
                      'dipotong. Perbaiki lewat Master Data lebih dulu.', v_ri.nama_obat;
    end if;

    v_hasil := public.apotek_keluar(
      p_obat_id       => v_ri.obat_id,
      p_jumlah        => v_jumlah,
      p_kategori      => 'Resep Pasien',
      p_tanggal       => coalesce(p_tanggal, public.tgl_klinik()),
      p_kunjungan_id  => v_kunjungan,
      p_resep_item_id => v_ri.id,
      p_batch_id      => null,
      p_keterangan    => coalesce(v_it->>'keterangan', v_resep.no_resep)
    );

    update resep_item
       set jumlah_diserahkan = v_jumlah,
           catatan_farmasi   = nullif(v_it->>'keterangan','')
     where id = v_ri.id;

    v_grup := v_grup || jsonb_build_object(
      'resep_item_id', v_ri.id, 'nama_obat', v_ri.nama_obat,
      'jumlah', v_jumlah, 'hasil', v_hasil);
    v_diserahkan := v_diserahkan + 1;
  end loop;

  if v_diserahkan = 0 then
    raise exception 'Tidak ada butir obat yang diserahkan.';
  end if;

  update resep
     set status              = 'DISERAHKAN',
         diserahkan_oleh     = auth.uid(),
         diserahkan_pada     = now(),
         diserahkan_sebagian = (v_diserahkan < v_total_item),
         catatan             = coalesce(p_catatan, catatan)
   where id = p_resep_id;

  return jsonb_build_object(
    'resep_id',   p_resep_id,
    'butir',      v_diserahkan,
    'dari',       v_total_item,
    'sebagian',   v_diserahkan < v_total_item,
    'rincian',    v_grup
  );
end $$;


-- =====================================================================
--  E. VIEW
-- =====================================================================

-- E1. Stok per batch, lengkap dengan identitas obat dan status kedaluwarsa.
create or replace view v_apotek_batch with (security_invoker = true) as
select b.id, b.obat_id, b.no_batch, b.tgl_expired, b.tgl_masuk, b.no_faktur, b.pbf,
       b.harga_beli, b.stok_awal, b.stok_sisa, b.keterangan, b.created_at,
       o.nama            as nama_obat,
       o.satuan,
       o.golongan,
       o.bentuk_sediaan,
       o.kekuatan,
       o.harga            as harga_jual,
       b.stok_sisa * b.harga_beli as nilai_beli,
       (b.tgl_expired <= public.tgl_klinik())                          as kadaluwarsa,
       (b.tgl_expired  > public.tgl_klinik()
        and b.tgl_expired <= public.tgl_klinik() + 30)                 as segera_kadaluwarsa,
       (b.tgl_expired - public.tgl_klinik())                           as hari_ke_expired
  from apotek_batch b
  join obat o on o.id = b.obat_id;

-- E2. Ringkasan per obat — dipakai kartu ringkasan dan pemilih obat keluar.
create or replace view v_apotek_stok with (security_invoker = true) as
select o.id                                as obat_id,
       o.nama                              as nama_obat,
       o.satuan,
       o.golongan,
       o.bentuk_sediaan,
       o.kekuatan,
       o.harga                             as harga_jual,
       o.aktif,
       coalesce(sum(b.stok_sisa), 0)                          as stok_total,
       coalesce(sum(b.stok_sisa * b.harga_beli), 0)           as nilai_total,
       count(b.id) filter (where b.stok_sisa > 0)             as jumlah_batch,
       count(b.id) filter (where b.stok_sisa > 0
                             and b.tgl_expired <= public.tgl_klinik())  as batch_kadaluwarsa,
       count(b.id) filter (where b.stok_sisa > 0
                             and b.tgl_expired  > public.tgl_klinik()
                             and b.tgl_expired <= public.tgl_klinik() + 30) as batch_segera,
       coalesce(sum(b.stok_sisa) filter (
         where b.tgl_expired > public.tgl_klinik()), 0)       as stok_layak,
       min(b.tgl_expired) filter (where b.stok_sisa > 0)      as expired_terdekat
  from obat o
  left join apotek_batch b on b.obat_id = o.id and b.stok_sisa > 0
 group by o.id, o.nama, o.satuan, o.golongan, o.bentuk_sediaan, o.kekuatan, o.harga, o.aktif;

-- E3. Antrean farmasi: resep yang sudah ditulis dokter dan belum diserahkan.
create or replace view v_antrean_farmasi with (security_invoker = true) as
select r.id                as resep_id,
       r.no_resep,
       r.status,
       r.catatan,
       r.dibuat_pada,
       r.diserahkan_pada,
       r.diserahkan_sebagian,
       k.id                as kunjungan_id,
       k.no_kunjungan,
       k.no_antrian,
       k.tanggal,
       k.cara_bayar,
       k.status            as status_kunjungan,
       p.id                as pasien_id,
       p.no_rm,
       p.nama              as nama_pasien,
       p.tanggal_lahir,
       p.jenis_kelamin,
       date_part('year', age(p.tanggal_lahir))::int as umur,
       po.nama             as nama_poli,
       d.nama              as nama_dokter,
       (select count(*) from resep_item ri where ri.resep_id = r.id)         as jumlah_item,
       (select count(*) from resep_item ri where ri.resep_id = r.id
          and ri.obat_id is null)                                            as item_tanpa_master,
       (select coalesce(string_agg(ri.nama_obat, ', ' order by ri.urutan), '')
          from resep_item ri where ri.resep_id = r.id)                       as daftar_obat
  from resep r
  join kunjungan k on k.id = r.kunjungan_id
  join pasien p    on p.id = k.pasien_id
  join poli po     on po.id = k.poli_id
  left join pegawai d on d.id = k.dokter_id;

-- E4. Kartu stok tidak dibuat sebagai view.
--     Saldo hariannya ditarik MUNDUR dari stok yang ada sekarang (lihat
--     apotek_core.js), bukan dijumlahkan maju dari nol. Alasannya: koreksi
--     batch lewat Edit Batch mengubah stok tanpa menulis baris transaksi,
--     sehingga penjumlahan maju akan berselisih diam-diam dengan tab Stok.
--     Perhitungan mundur itu butuh dua array penuh dan lebih jernih
--     dikerjakan di sisi aplikasi, di mana ia juga bisa diuji tanpa database.


-- =====================================================================
--  F. ROW LEVEL SECURITY
-- =====================================================================

-- GRANT tabel-level HARUS ditulis di sini, tidak cukup mengandalkan
-- 02_rls.sql. Perintah `grant ... on all tables in schema public` di berkas
-- itu hanya berlaku untuk tabel yang SUDAH ADA saat ia dijalankan; tabel
-- yang dibuat belakangan tidak ikut terkena. Supabase memang memasang
-- default privileges yang biasanya menutupi ini, tetapi kalau suatu saat
-- tidak, gejalanya adalah "permission denied for table apotek_batch" di
-- browser — pesan yang tidak menyebut-nyebut RLS sama sekali, sehingga
-- pencarian penyebabnya berjam-jam.
grant select, insert, update, delete on apotek_batch, apotek_transaksi to authenticated;
grant usage, select on sequence apotek_transaksi_id_seq to authenticated;

alter table apotek_batch     enable row level security;
alter table apotek_transaksi enable row level security;

-- Semua staf boleh MELIHAT stok. Dokter perlu tahu obat mana yang kosong
-- sebelum menuliskannya di resep; kasir perlu tahu harga; perawat perlu
-- tahu apa yang tersedia. Yang dibatasi adalah menulis.
drop policy if exists batch_baca on apotek_batch;
create policy batch_baca on apotek_batch for select
  to authenticated using (public.saya_staf());

drop policy if exists batch_tulis on apotek_batch;
create policy batch_tulis on apotek_batch for all
  to authenticated
  using (public.boleh_apotek())
  with check (public.boleh_apotek());

drop policy if exists trx_baca on apotek_transaksi;
create policy trx_baca on apotek_transaksi for select
  to authenticated using (public.saya_staf());

-- Menulis riwayat lewat tangan tidak diizinkan sama sekali, bahkan untuk
-- apoteker. Satu-satunya jalan masuk adalah fungsi di §D, yang menjaga
-- stok dan riwayat tetap sejalan. Baris riwayat yang bisa ditulis
-- langsung adalah baris yang bisa dikarang.
drop policy if exists trx_tulis on apotek_transaksi;
create policy trx_tulis on apotek_transaksi for all
  to authenticated
  using (public.peran_teks_saya() = 'master')
  with check (public.peran_teks_saya() = 'master');

grant execute on function public.apotek_masuk(uuid,numeric,numeric,date,text,text,date,text,text) to authenticated;
grant execute on function public.apotek_keluar(uuid,numeric,text,date,uuid,uuid,uuid,text)        to authenticated;
grant execute on function public.apotek_batalkan_grup(uuid,text)                                  to authenticated;
grant execute on function public.apotek_serahkan_resep(uuid,jsonb,date,text)                      to authenticated;


-- =====================================================================
--  G. AUDIT
-- =====================================================================

drop trigger if exists trg_audit_batch on apotek_batch;
create trigger trg_audit_batch after insert or update or delete on apotek_batch
for each row execute function public.catat_audit();


-- =====================================================================
--  H. PEMICU updated_at
-- =====================================================================

drop trigger if exists trg_updated_apotek_batch on apotek_batch;
create trigger trg_updated_apotek_batch before update on apotek_batch
for each row execute function set_updated_at();

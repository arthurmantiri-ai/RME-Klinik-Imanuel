-- =====================================================================
--  RME KLINIK IMANUEL - PEMISAHAN KOLAM STOK (KRONIS vs REGULER)
--  Jalankan SETELAH 16_kronis.sql
--
--  Tahap 1b dari modul pemantauan kronis. Sebelum tahap ini, seluruh stok
--  apotek adalah satu kolam. Klinik membeli obat kronis dengan dana
--  sendiri (bukan titipan BPJS), tetapi tetap ingin mencatatnya terpisah
--  dari stok obat resep biasa — dan menurut klinik sendiri, pemisahan ini
--  TIDAK mutlak: kalau satu kolam habis, boleh sementara memakai kolam
--  lain. Karena itu tahap ini TIDAK memasang sekat keras. Yang dipasang:
--
--   1. Setiap batch dan setiap baris transaksi mencatat `kolam`nya
--      ('reguler' atau 'kronis'), sehingga nilai aset dan pemakaian bisa
--      dilaporkan terpisah.
--   2. FEFO tetap jalan seperti biasa, hanya diberi PRIORITAS: resep obat
--      kronis pasien buku kronis mengutamakan batch kolam kronis lebih
--      dulu, baru pindah ke kolam reguler kalau kolam kronis kosong —
--      dan sebaliknya untuk resep biasa. Stok TIDAK PERNAH ditolak hanya
--      karena kolamnya kosong.
--
--  KENAPA BUKAN TABEL OBAT KEDUA
--
--  Alternatif yang lebih sederhana kelihatannya adalah membuat baris obat
--  kedua, misalnya "Amlodipine 5mg (Kronis)". Itu akan diam-diam merusak
--  seluruh tautan `kronis_obat.obat_id` yang baru saja dibuat migrasi
--  Tahap 1 — persis kelas kesalahan yang sama dengan `poli.jenis` dan
--  `obat.dpho` dulu: fitur berhenti bekerja tanpa satu pun galat.
--  Pemisahannya karena itu dipasang di tingkat BATCH, bukan di tingkat
--  obat: satu obat, banyak batch, tiap batch tahu kolamnya sendiri.
--
--  KENAPA BUKAN TIPE ENUM
--
--  Menambah nilai enum di tengah jalan butuh transaksi terisolasi
--  (pelajaran panjang di 07_peran_kasir.sql). `kolam` karena itu memakai
--  `text` dengan CHECK, seperti `jenis` di apotek_transaksi.
--
--  AMAN dijalankan berulang pada database berisi data.
-- =====================================================================


-- =====================================================================
--  A. KOLOM KOLAM PADA BATCH & TRANSAKSI
-- =====================================================================

alter table apotek_batch     add column if not exists kolam text not null default 'reguler';
alter table apotek_transaksi add column if not exists kolam text not null default 'reguler';

alter table apotek_batch     drop constraint if exists ck_batch_kolam;
alter table apotek_batch     add  constraint ck_batch_kolam check (kolam in ('reguler','kronis'));
alter table apotek_transaksi drop constraint if exists ck_trx_kolam;
alter table apotek_transaksi add  constraint ck_trx_kolam check (kolam in ('reguler','kronis'));

comment on column apotek_batch.kolam is
  'Kolam pencatatan: ''reguler'' atau ''kronis''. Bukan sekat keras — lihat
   catatan FEFO di apotek_keluar(). Klinik membeli sendiri obat kronisnya,
   jadi ini murni pemisahan pencatatan/pelaporan, bukan soal kepemilikan.';
comment on column apotek_transaksi.kolam is
  'Kolam BATCH yang benar-benar terpotong/terisi baris ini — bukan kolam
   yang "diinginkan". Dipakai untuk laporan pemakaian per kolam yang jujur,
   termasuk saat FEFO terpaksa menyeberang kolam.';

-- Batch identik digabung berdasarkan gabungan (obat, expired, faktur, pbf,
-- harga) — lihat 08_apotek.sql §B1. Kolam ditambahkan ke gabungan itu:
-- tanpa ini, batch kronis dan batch reguler dengan faktur/harga yang
-- kebetulan sama akan MENYATU jadi satu baris dan kolamnya hilang.
drop index if exists uq_batch_identik;
create unique index uq_batch_identik on apotek_batch
  (obat_id, tgl_expired, coalesce(no_faktur,''), lower(pbf), harga_beli, kolam);


-- =====================================================================
--  B. KOLAM YANG DISUKAI SEBUAH RESEP
-- =====================================================================

-- Menjawab: "obat ini, untuk pasien ini, bagian dari terapi kronisnya?"
-- `language sql` sengaja dipilih (bukan plpgsql): fungsi bahasa SQL
-- diperiksa terhadap katalog SAAT DIBUAT, sehingga kalau berkas ini
-- ternyata dijalankan sebelum 16_kronis.sql, kesalahannya langsung
-- muncul di sini — bukan diam-diam lolos dan baru meledak saat resep
-- pertama diserahkan.
--
-- security definer: apoteker tidak (dan tidak perlu) diberi hak SELECT
-- langsung ke kronis_terapi/kronis_obat (lihat boleh_kronis_kelola() di
-- 16_kronis.sql, yang membatasi ke admin/dokter/perawat). Fungsi ini
-- membuka celah SEMPIT: hanya menjawab ya/tidak, tidak membocorkan
-- baris kronis apa pun ke luar.
create or replace function public.kronis_kolam_resep_item(p_pasien_id uuid, p_obat_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case when exists (
           select 1 from kronis_terapi t
           join kronis_obat ko on ko.terapi_id = t.id
          where t.pasien_id = p_pasien_id
            and t.aktif
            and ko.obat_id = p_obat_id
         ) then 'kronis' else 'reguler' end
$$;

grant execute on function public.kronis_kolam_resep_item(uuid,uuid) to authenticated;


-- =====================================================================
--  C. apotek_masuk() DENGAN KOLAM
-- =====================================================================

-- Menambah parameter = fungsi baru bagi PostgreSQL (lihat catatan di
-- 10_apotek_impor.sql). Signature lama dibuang dulu.
drop function if exists public.apotek_masuk(uuid,numeric,numeric,date,text,text,date,text,text,text);

create or replace function public.apotek_masuk(
  p_obat_id     uuid,
  p_jumlah      numeric,
  p_harga_beli  numeric,
  p_tgl_expired date,
  p_pbf         text,
  p_no_faktur   text default null,
  p_tgl_masuk   date default null,
  p_no_batch    text default null,
  p_keterangan  text default null,
  p_kategori    text default 'Pembelian',
  p_kolam       text default 'reguler'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_obat     obat%rowtype;
  v_batch    apotek_batch%rowtype;
  v_tgl      date := coalesce(p_tgl_masuk, public.tgl_klinik());
  v_grup     uuid := gen_random_uuid();
  v_digabung boolean := false;
  v_kat      text := coalesce(nullif(btrim(p_kategori), ''), 'Pembelian');
  v_kolam    text := lower(coalesce(nullif(btrim(p_kolam), ''), 'reguler'));
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh mencatat obat masuk.'
      using errcode = '42501';
  end if;
  if v_kat not in ('Pembelian', 'Saldo Awal') then
    raise exception 'Kategori pemasukan "%" tidak dikenal. Yang sah: Pembelian, Saldo Awal.', v_kat;
  end if;
  if v_kolam not in ('reguler', 'kronis') then
    raise exception 'Kolam "%" tidak dikenal. Yang sah: reguler, kronis.', v_kolam;
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
     and harga_beli = p_harga_beli
     and kolam = v_kolam;

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
                              pbf, harga_beli, stok_awal, stok_sisa, keterangan, kolam, dibuat_oleh)
    values (p_obat_id, p_no_batch, p_tgl_expired, v_tgl, p_no_faktur,
            btrim(p_pbf), p_harga_beli, p_jumlah, p_jumlah, p_keterangan, v_kolam, auth.uid())
    returning * into v_batch;
  end if;

  insert into apotek_transaksi (batch_id, obat_id, nama_obat, satuan, jenis, kategori,
                                jumlah, harga_satuan, total_nilai, tanggal,
                                no_faktur, pbf, kolam, grup_id, keterangan, dibuat_oleh)
  values (v_batch.id, p_obat_id, v_obat.nama, v_obat.satuan, 'MASUK', v_kat,
          p_jumlah, p_harga_beli, p_jumlah * p_harga_beli, v_tgl,
          p_no_faktur, btrim(p_pbf), v_kolam, v_grup, p_keterangan, auth.uid());

  return jsonb_build_object(
    'batch_id',  v_batch.id,
    'grup_id',   v_grup,
    'digabung',  v_digabung,
    'kategori',  v_kat,
    'kolam',     v_kolam,
    'stok_sisa', v_batch.stok_sisa
  );
end $$;

grant execute on function
  public.apotek_masuk(uuid,numeric,numeric,date,text,text,date,text,text,text,text)
  to authenticated;


-- =====================================================================
--  D. apotek_keluar() DENGAN PRIORITAS KOLAM (BUKAN SEKAT)
-- =====================================================================

drop function if exists public.apotek_keluar(uuid,numeric,text,date,uuid,uuid,uuid,text);

create or replace function public.apotek_keluar(
  p_obat_id        uuid,
  p_jumlah         numeric,
  p_kategori       text default 'Resep Pasien',
  p_tanggal        date default null,
  p_kunjungan_id   uuid default null,
  p_resep_item_id  uuid default null,
  p_batch_id       uuid default null,
  p_keterangan     text default null,
  p_kolam_disukai  text default null   -- null = tidak ada preferensi, FEFO polos seperti sebelum tahap ini
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
  v_kolam_pref text := nullif(lower(btrim(coalesce(p_kolam_disukai, ''))), '');
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
  if v_kolam_pref is not null and v_kolam_pref not in ('reguler','kronis') then
    raise exception 'Kolam "%" tidak dikenal. Yang sah: reguler, kronis.', v_kolam_pref;
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

  -- Cek ketersediaan LEBIH DULU, TOTAL LINTAS KOLAM. Pemisahan kolam
  -- adalah pencatatan, bukan sekat: resep tidak boleh ditolak hanya
  -- karena kolam yang disukai kebetulan kosong selama kolam lain cukup.
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

  -- Urutan FEFO tidak berubah. Yang ditambahkan hanya pemutus seri PALING
  -- AWAL: batch di kolam yang disukai didahulukan. Kalau kolam itu habis,
  -- perulangan berlanjut ke batch kolam lain tanpa berhenti sama sekali —
  -- persis "boleh menyeberang saat darurat" yang diminta klinik.
  for r in
    select * from apotek_batch
     where obat_id = p_obat_id
       and stok_sisa > 0
       and (p_batch_id is null or id = p_batch_id)
       and (v_pemusnahan or tgl_expired > v_tgl)
     order by (case when v_kolam_pref is not null and kolam = v_kolam_pref then 0 else 1 end),
              tgl_expired, tgl_masuk, created_at, id     -- FEFO
  loop
    exit when v_sisa <= 0;

    v_ambil := least(r.stok_sisa, v_sisa);

    update apotek_batch
       set stok_sisa = stok_sisa - v_ambil, updated_at = now()
     where id = r.id;

    insert into apotek_transaksi (batch_id, obat_id, nama_obat, satuan, jenis, kategori,
                                  jumlah, harga_satuan, total_nilai, tanggal,
                                  no_faktur, pbf, kolam, kunjungan_id, pasien_id, resep_item_id,
                                  grup_id, keterangan, dibuat_oleh)
    values (r.id, p_obat_id, v_obat.nama, v_obat.satuan, 'KELUAR', p_kategori,
            v_ambil, r.harga_beli, v_ambil * r.harga_beli, v_tgl,
            r.no_faktur, r.pbf, r.kolam, p_kunjungan_id, v_pasien, p_resep_item_id,
            v_grup, p_keterangan, auth.uid());

    v_total    := v_total + v_ambil * r.harga_beli;
    v_sisa     := v_sisa - v_ambil;
    v_potongan := v_potongan || jsonb_build_object(
      'batch_id',     r.id,
      'tgl_expired',  r.tgl_expired,
      'no_faktur',    r.no_faktur,
      'pbf',          r.pbf,
      'kolam',        r.kolam,
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

grant execute on function
  public.apotek_keluar(uuid,numeric,text,date,uuid,uuid,uuid,text,text)
  to authenticated;


-- =====================================================================
--  E. apotek_serahkan_resep() MEMILIH KOLAM OTOMATIS
-- =====================================================================

-- Signature TIDAK berubah — hanya isinya. Satu baris ditambahkan sebelum
-- memanggil apotek_keluar(): tanya dulu apakah obat ini bagian dari
-- terapi kronis aktif pasien ini. Apoteker tidak perlu memilih apa pun;
-- kalau salah, cukup dikoreksi lewat Edit Batch tanpa membongkar resep.
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
  v_kolam      text;
  v_hasil      jsonb;
  v_grup       jsonb := '[]'::jsonb;
  v_diserahkan int := 0;
  v_total_item int := 0;
  v_pasien     uuid;
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
  select pasien_id into v_pasien from kunjungan where id = v_kunjungan;

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

    v_kolam := public.kronis_kolam_resep_item(v_pasien, v_ri.obat_id);

    v_hasil := public.apotek_keluar(
      p_obat_id       => v_ri.obat_id,
      p_jumlah        => v_jumlah,
      p_kategori      => 'Resep Pasien',
      p_tanggal       => coalesce(p_tanggal, public.tgl_klinik()),
      p_kunjungan_id  => v_kunjungan,
      p_resep_item_id => v_ri.id,
      p_batch_id      => null,
      p_keterangan    => coalesce(v_it->>'keterangan', v_resep.no_resep),
      p_kolam_disukai => v_kolam
    );

    update resep_item
       set jumlah_diserahkan = v_jumlah,
           catatan_farmasi   = nullif(v_it->>'keterangan','')
     where id = v_ri.id;

    v_grup := v_grup || jsonb_build_object(
      'resep_item_id', v_ri.id, 'nama_obat', v_ri.nama_obat,
      'jumlah', v_jumlah, 'kolam', v_kolam, 'hasil', v_hasil);
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
--  F. apotek_impor() MENERIMA KOLAM PER BARIS
-- =====================================================================

-- Signature TIDAK berubah — p_jenis tetap satu nilai untuk seluruh
-- berkas ('Pembelian'/'Saldo Awal'), sedangkan kolam ada PER BARIS di
-- dalam p_baris, karena satu berkas saldo awal wajar berisi campuran
-- obat kronis dan obat biasa sekaligus.
create or replace function public.apotek_impor(
  p_baris  jsonb,
  p_jenis  text default 'Pembelian'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_b          jsonb;
  v_i          int := 0;
  v_obat_id    uuid;
  v_baru       jsonb;
  v_nama       text;
  v_kode       text;
  v_kolam      text;
  v_hasil      jsonb;
  v_dibuat     int := 0;
  v_batch_baru int := 0;
  v_gabung     int := 0;
  v_nilai      numeric := 0;
  v_nama_baru  text[] := '{}';
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh mengimpor stok.'
      using errcode = '42501';
  end if;
  if p_jenis not in ('Pembelian', 'Saldo Awal') then
    raise exception 'Jenis impor "%" tidak dikenal.', p_jenis;
  end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    raise exception 'Tidak ada baris untuk diimpor.';
  end if;
  if jsonb_array_length(p_baris) > 2000 then
    raise exception 'Sekali impor dibatasi 2.000 baris. Pecah berkasnya lebih dulu.';
  end if;

  for v_b in select * from jsonb_array_elements(p_baris)
  loop
    v_i := v_i + 1;

    -- ── Menentukan obatnya ────────────────────────────────────────────
    v_obat_id := nullif(v_b->>'obat_id','')::uuid;
    v_baru    := v_b->'obat_baru';

    if v_obat_id is null and (v_baru is null or jsonb_typeof(v_baru) <> 'object') then
      raise exception 'Baris %: obat belum ditentukan.', v_i;
    end if;

    if v_obat_id is null then
      v_nama := btrim(coalesce(v_baru->>'nama',''));
      v_kode := nullif(btrim(coalesce(v_baru->>'kode_internal','')), '');
      if v_nama = '' then
        raise exception 'Baris %: nama obat baru kosong.', v_i;
      end if;

      /* Cari dulu sebelum membuat. Satu berkas impor sering memuat
         beberapa batch dari obat yang sama — tanpa pencarian ini, baris
         kedua akan membuat obat kembar dengan nama yang persis sama, dan
         stoknya terpecah ke dua kartu yang tidak akan pernah dijumlahkan. */
      select id into v_obat_id from obat
       where (v_kode is not null and kode_internal = v_kode)
          or (v_kode is null and lower(btrim(nama)) = lower(v_nama))
       limit 1;

      if v_obat_id is null then
        insert into obat (kode_internal, nama, satuan, harga, aktif)
        values (v_kode, v_nama,
                coalesce(nullif(btrim(v_baru->>'satuan'),''), 'Tablet'),
                coalesce((v_baru->>'harga')::numeric, 0), true)
        returning id into v_obat_id;

        v_dibuat := v_dibuat + 1;
        v_nama_baru := v_nama_baru || v_nama;

        /* Tabel obat tidak punya pemicu audit, sedangkan menambah obat
           lewat impor adalah satu-satunya jalan bagi apoteker menyentuh
           master data. Jejaknya ditulis di sini supaya tetap bisa
           ditelusuri siapa menambahkan apa, dan kapan. */
        insert into audit_log (user_id, user_nama, aksi, tabel, record_id, data_baru, keterangan)
        values (auth.uid(), (select nama from pegawai where id = auth.uid()),
                'INSERT', 'obat', v_obat_id::text,
                jsonb_build_object('nama', v_nama, 'kode_internal', v_kode),
                'Dibuat otomatis lewat impor stok (' || p_jenis || ')');
      end if;
    end if;

    -- ── Memasukkan batch-nya ──────────────────────────────────────────
    v_kolam := coalesce(nullif(btrim(v_b->>'kolam'), ''), 'reguler');
    begin
      v_hasil := public.apotek_masuk(
        p_obat_id     => v_obat_id,
        p_jumlah      => (v_b->>'jumlah')::numeric,
        p_harga_beli  => coalesce((v_b->>'harga_beli')::numeric, 0),
        p_tgl_expired => (v_b->>'tgl_expired')::date,
        p_pbf         => v_b->>'pbf',
        p_no_faktur   => nullif(v_b->>'no_faktur',''),
        p_tgl_masuk   => nullif(v_b->>'tgl_masuk','')::date,
        p_no_batch    => nullif(v_b->>'no_batch',''),
        p_keterangan  => nullif(v_b->>'keterangan',''),
        p_kategori    => p_jenis,
        p_kolam       => v_kolam
      );
    exception when others then
      /* Nomor baris ditempelkan ke pesan aslinya. Tanpa itu apoteker
         hanya melihat "Tanggal kadaluwarsa wajib diisi" untuk berkas 80
         baris, dan harus menebak yang mana. */
      raise exception 'Baris %: %', v_i, sqlerrm;
    end;

    if (v_hasil->>'digabung')::boolean then v_gabung := v_gabung + 1;
    else v_batch_baru := v_batch_baru + 1; end if;
    v_nilai := v_nilai + (v_b->>'jumlah')::numeric
                       * coalesce((v_b->>'harga_beli')::numeric, 0);
  end loop;

  return jsonb_build_object(
    'jenis',            p_jenis,
    'baris',            v_i,
    'batch_baru',       v_batch_baru,
    'batch_digabung',   v_gabung,
    'obat_baru',        v_dibuat,
    'nama_obat_baru',   to_jsonb(v_nama_baru),
    'total_nilai',      v_nilai
  );
end $$;


-- =====================================================================
--  G. VIEW — kolam ikut tampil
-- =====================================================================

-- CREATE OR REPLACE VIEW tidak boleh mengubah urutan atau nama kolom yang
-- sudah ada — hanya boleh MENAMBAH di akhir. `kolam` karena itu ditaruh
-- paling belakang, bukan di dekat kolom identitas batch lain yang mungkin
-- terasa lebih wajar; menaruhnya di tengah akan membuat `create or replace`
-- ini gagal dengan "cannot change name of view column ... to ...".
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
       (b.tgl_expired - public.tgl_klinik())                           as hari_ke_expired,
       b.kolam
  from apotek_batch b
  join obat o on o.id = b.obat_id;

-- v_apotek_stok TIDAK diubah: tetap total lintas kolam per obat, seperti
-- sebelum tahap ini. Menjumlahkan kedua kolam menghasilkan angka yang
-- sama seperti dulu, sehingga tidak ada layar yang diam-diam berubah
-- angkanya hanya karena berkas ini dijalankan.

-- =====================================================================
--  RME KLINIK IMANUEL - IMPOR STOK APOTEK DARI EXCEL
--  Jalankan SETELAH 09_kasir.sql
--
--  Berkas ini AMAN dijalankan pada database yang sudah berisi data.
--  Ia tidak membuat tabel baru dan tidak menyentuh satu baris pun yang
--  sudah ada; hanya mengganti satu fungsi dan menambah satu fungsi.
--
--  DUA HAL YANG DIKERJAKAN DI SINI
--
--  1. apotek_masuk() diberi parameter kategori.
--     Sebelumnya kategori dipatok 'Pembelian'. Untuk memuat stok yang
--     SUDAH ADA di rak saat sistem mulai dipakai, itu keliru: 300 juta
--     rupiah persediaan lama akan muncul sebagai pembelian bulan ini dan
--     laporan bulan pertama tidak bisa dipakai. Sekarang pemuatan awal
--     dicatat sebagai 'Saldo Awal' dan dipisahkan di laporan.
--
--  2. apotek_impor() memproses seluruh berkas dalam SATU transaksi.
--     Impor 80 baris yang gagal di baris ke-63 tidak boleh menyisakan 62
--     batch yang sudah masuk — apoteker tidak punya cara mengetahui di
--     mana ia berhenti, dan mengulang dari awal akan menggandakan stok.
--     Gagal di mana pun berarti tidak ada yang berubah sama sekali.
-- =====================================================================


-- =====================================================================
--  A. apotek_masuk() DENGAN KATEGORI
-- =====================================================================

-- Fungsi lama dibuang lebih dulu, bukan di-CREATE OR REPLACE.
-- Menambah parameter mengubah tanda tangan fungsi, dan PostgreSQL
-- memperlakukan itu sebagai fungsi BARU — hasilnya dua fungsi bernama
-- sama hidup berdampingan, satu di antaranya masih memaksa kategori
-- 'Pembelian'. Mana yang terpanggil bergantung pada bentuk pemanggilan,
-- dan itu jenis ketidakpastian yang tidak boleh ada di jalur stok.
drop function if exists public.apotek_masuk(uuid,numeric,numeric,date,text,text,date,text,text);

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
  p_kategori    text default 'Pembelian'
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
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh mencatat obat masuk.'
      using errcode = '42501';
  end if;
  if v_kat not in ('Pembelian', 'Saldo Awal') then
    raise exception 'Kategori pemasukan "%" tidak dikenal. Yang sah: Pembelian, Saldo Awal.', v_kat;
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
  values (v_batch.id, p_obat_id, v_obat.nama, v_obat.satuan, 'MASUK', v_kat,
          p_jumlah, p_harga_beli, p_jumlah * p_harga_beli, v_tgl,
          p_no_faktur, btrim(p_pbf), v_grup, p_keterangan, auth.uid());

  return jsonb_build_object(
    'batch_id',  v_batch.id,
    'grup_id',   v_grup,
    'digabung',  v_digabung,
    'kategori',  v_kat,
    'stok_sisa', v_batch.stok_sisa
  );
end $$;

grant execute on function
  public.apotek_masuk(uuid,numeric,numeric,date,text,text,date,text,text,text)
  to authenticated;


-- =====================================================================
--  B. IMPOR MASSAL
-- =====================================================================

-- p_baris berbentuk array objek:
--   [{ "obat_id": "uuid"                       -- bila sudah cocok master
--    , "obat_baru": {"nama","satuan","kode_internal","harga"}   -- bila dibuat baru
--    , "jumlah", "harga_beli", "tgl_expired"
--    , "tgl_masuk", "no_faktur", "pbf", "no_batch", "keterangan" }]
--
-- Pencocokan nama obat dikerjakan di sisi aplikasi (apotek_excel.js),
-- di mana apoteker bisa melihat dan membetulkannya baris per baris
-- sebelum apa pun ditulis. Fungsi ini hanya menerima keputusan yang
-- sudah bulat: obat mana, berapa, batch apa.
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
        p_kategori    => p_jenis
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

grant execute on function public.apotek_impor(jsonb, text) to authenticated;


-- =====================================================================
--  C. DAFTAR OBAT UNTUK PENCOCOKAN
-- =====================================================================

-- Halaman impor membutuhkan SELURUH master obat sekaligus untuk
-- mencocokkan nama — termasuk yang nonaktif, supaya obat yang pernah
-- dinonaktifkan tidak lahir kembali sebagai duplikat. Kolomnya sengaja
-- dibatasi: yang dikirim ke browser hanya yang benar-benar dipakai
-- mencocokkan dan menampilkan.
create or replace view v_obat_pencocokan with (security_invoker = true) as
select id, kode_internal, nama, nama_generik, satuan, bentuk_sediaan,
       kekuatan, harga, aktif
  from obat;

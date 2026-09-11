-- =====================================================================
--  RME KLINIK IMANUEL - OBAT DI PENJUALAN BEBAS KASIR + KODE TARIF OTOMATIS
--  Jalankan SETELAH 20_ganti_nama_peran.sql
--
--  Dua permintaan Arthur (10 Sep 2026):
--
--   1. "Tambah baris" / "Penjualan bebas" di Kasir harus bisa menjual obat
--      langsung dari master Obat (harga & kode sudah ada di sana), TANPA
--      mendaftarkan ulang tiap obat ke Master Tarif satu per satu — obat
--      di klinik ini jumlahnya ratusan dan datanya sudah dikelola penuh
--      di Apotek, jadi menduplikasinya ke Tarif berarti dua tempat kelola
--      untuk satu hal yang sama, kelas kesalahan yang sama dengan
--      `poli.jenis`/`obat.dpho` dulu.
--
--   2. Memilih obat + jumlah di Kasir harus SEKALIGUS memotong stok
--      (FEFO, kategori 'Penjualan Bebas') dalam satu aksi — tidak perlu
--      lagi bolak-balik ke Apotek -> Obat keluar untuk transaksi yang
--      sama, yang sebelumnya membuat kasir mengetik obat & jumlah yang
--      SAMA dua kali di dua halaman berbeda.
--
--   3. Kode internal di Master Tarif (tindakan/layanan/lain-lain — kode
--      LAB & Penunjang TIDAK disentuh, sudah otomatis dari referensinya
--      sendiri) digenerate otomatis kalau dikosongkan, supaya Arthur
--      tidak perlu memikirkan penomoran sendiri untuk tiap tarif baru.
--      Tetap bisa diketik manual kalau memang ingin kode tertentu.
--
--  Prinsip yang dijaga di berkas ini: TIDAK menulis ulang mesin FEFO
--  (`apotek_keluar`) maupun pembatalannya (`apotek_batalkan_grup`) di
--  tempat kedua. Keduanya dipecah jadi inti tanpa pemeriksaan hak akses
--  (`_apotek_potong_fefo_inti`, `_apotek_batalkan_grup_inti`) yang
--  dipanggil BERSAMA oleh jalur lama (apoteker, lewat apotek_keluar /
--  apotek_batalkan_grup) dan jalur baru (kasir, lewat
--  kasir_jual_obat_bebas / trigger penghapusan baris). Kalau logika FEFO
--  berubah kelak, cukup diubah di satu tempat.
-- =====================================================================


-- =====================================================================
--  A. BARIS TAGIHAN TAHU DARI GRUP STOK MANA IA BERASAL
-- =====================================================================

-- NULL untuk seluruh baris lama (TINDAKAN, LAYANAN, MANUAL, dan OBAT yang
-- ditarik dari kunjungan/resep — stoknya sudah dipotong terpisah saat
-- resep diserahkan di Apotek, bukan oleh baris tagihan ini). Hanya terisi
-- untuk baris OBAT yang dibuat lewat kasir_jual_obat_bebas() di bawah,
-- supaya baris ITU sendiri yang memotong stoknya sendiri, dan baris ITU
-- sendiri pula yang tahu grup mana yang harus dibatalkan kalau dihapus.
alter table kasir_tagihan_item add column if not exists apotek_grup_id uuid;

comment on column kasir_tagihan_item.apotek_grup_id is
  'Diisi hanya untuk baris OBAT yang dijual langsung dari Kasir (penjualan '
  'bebas / tambah baris), menunjuk ke apotek_transaksi.grup_id yang dibuat '
  'bersamaan. NULL untuk baris lain, termasuk obat yang ditarik dari resep '
  'kunjungan (stoknya sudah dipotong terpisah saat diserahkan di Apotek). '
  'Dipakai trigger kasir_trg_batal_obat_bebas untuk membatalkan stoknya '
  'otomatis kalau baris ini dihapus.';


-- =====================================================================
--  B. KODE INTERNAL TARIF — OTOMATIS KALAU DIKOSONGKAN
-- =====================================================================

create sequence if not exists seq_kode_tarif start 1;

-- Satu sequence dipakai bersama lintas jenis (bukan satu sequence per
-- jenis) supaya tidak ada kemungkinan dua transaksi bersamaan mendapat
-- nomor yang sama — nextval() atomik, sedangkan "hitung baris yang sudah
-- ada lalu +1" tidak. Konsekuensinya nomor urut LAY-/TND-/LAIN- boleh
-- meloncat kalau jenisnya berselang-seling; itu kosmetik, bukan cacat.
create or replace function public.gen_kode_tarif() returns trigger
language plpgsql as $$
declare v_prefix text;
begin
  if new.kode is null or btrim(new.kode) = '' then
    v_prefix := case new.jenis
                  when 'TINDAKAN' then 'TND'
                  when 'LAYANAN'  then 'LAY'
                  when 'LAIN'     then 'LAIN'
                  -- LAB dan PENUNJANG semestinya sudah dikirim dengan kode
                  -- terisi (dari js/pages/tarif.js, diambil dari referensi
                  -- lab/penunjang yang dipilih) sebelum sampai ke sini.
                  -- Cabang ini murni jaring pengaman, bukan jalur normal.
                  else 'TRF'
                end;
    new.kode := v_prefix || '-' || lpad(nextval('seq_kode_tarif')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_gen_kode_tarif on kasir_tarif;
create trigger trg_gen_kode_tarif before insert on kasir_tarif
for each row execute function public.gen_kode_tarif();

grant usage, select on sequence seq_kode_tarif to authenticated;


-- =====================================================================
--  C. APOTEK_KELUAR() DIPECAH: INTI TANPA HAK AKSES + PEMBUNGKUS LAMA
-- =====================================================================

-- Isinya SAMA PERSIS dengan apotek_keluar() di sql/17_apotek_kolam.sql
-- (bagian D), hanya pemeriksaan public.boleh_apotek() di awalnya
-- dipindah keluar. Pemanggilnya (apotek_keluar di bawah, dan
-- kasir_jual_obat_bebas di bagian E) masing-masing memeriksa hak
-- aksesnya SENDIRI sebelum memanggil ini.
create or replace function public._apotek_potong_fefo_inti(
  p_obat_id        uuid,
  p_jumlah         numeric,
  p_kategori       text,
  p_tanggal        date,
  p_kunjungan_id   uuid,
  p_resep_item_id  uuid,
  p_batch_id       uuid,
  p_keterangan     text,
  p_kolam_disukai  text
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

-- Pembungkus: satu-satunya perbedaan dari sebelumnya adalah badan fungsi
-- sekarang cuma memeriksa hak akses lalu meneruskan ke inti di atas.
-- Nama, parameter, dan perilaku dari luar SAMA PERSIS seperti sebelum
-- berkas ini — kode yang sudah memanggil apotek_keluar() (apotek.js,
-- apotek_serahkan_resep, apotek_impor) tidak perlu berubah sama sekali.
create or replace function public.apotek_keluar(
  p_obat_id        uuid,
  p_jumlah         numeric,
  p_kategori       text default 'Resep Pasien',
  p_tanggal        date default null,
  p_kunjungan_id   uuid default null,
  p_resep_item_id  uuid default null,
  p_batch_id       uuid default null,
  p_keterangan     text default null,
  p_kolam_disukai  text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh mengeluarkan obat.'
      using errcode = '42501';
  end if;
  return public._apotek_potong_fefo_inti(
    p_obat_id, p_jumlah, p_kategori, p_tanggal, p_kunjungan_id,
    p_resep_item_id, p_batch_id, p_keterangan, p_kolam_disukai);
end $$;

grant execute on function
  public.apotek_keluar(uuid,numeric,text,date,uuid,uuid,uuid,text,text)
  to authenticated;


-- =====================================================================
--  D. APOTEK_BATALKAN_GRUP() DIPECAH DENGAN CARA YANG SAMA
-- =====================================================================

create or replace function public._apotek_batalkan_grup_inti(
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

create or replace function public.apotek_batalkan_grup(
  p_grup_id   uuid,
  p_alasan    text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh membatalkan transaksi.'
      using errcode = '42501';
  end if;
  return public._apotek_batalkan_grup_inti(p_grup_id, p_alasan);
end $$;

grant execute on function public.apotek_batalkan_grup(uuid,text) to authenticated;


-- =====================================================================
--  E. KASIR MENJUAL OBAT LANGSUNG — SATU AKSI, SATU SUMBER HARGA
-- =====================================================================

-- Dipanggil dari dialog "Tambah baris" / "Penjualan bebas" di Kasir saat
-- kasir memilih obat lewat pencarian (bukan lewat Master Tarif). Harga
-- SELALU diambil dari obat.harga saat ini — tidak ada tempat untuk
-- mengetik harga sendiri di sini, supaya tidak ada dua sumber harga yang
-- bisa berselisih untuk obat yang sama. Diskon per baris tetap boleh
-- (dialog "Tambah baris" sudah punya kolomnya, dipakai apa adanya).
--
-- Stok dipotong FEFO dalam transaksi yang SAMA dengan penulisan baris
-- tagihan: kalau salah satu gagal, keduanya batal — tidak pernah ada
-- baris tagihan tanpa stok yang benar-benar terpotong, atau sebaliknya.
create or replace function public.kasir_jual_obat_bebas(
  p_tagihan_id          uuid,
  p_obat_id             uuid,
  p_qty                 numeric,
  p_diskon_pct          numeric  default 0,
  p_ditanggung_penjamin boolean  default false,
  p_urutan              smallint default 99,
  p_keterangan          text     default null
) returns kasir_tagihan_item
language plpgsql security definer set search_path = public
as $$
declare
  v_obat  obat%rowtype;
  v_t     kasir_tagihan%rowtype;
  v_hasil jsonb;
  v_item  kasir_tagihan_item%rowtype;
begin
  if not public.boleh_kasir() then
    raise exception 'Hanya kasir dan admin yang boleh menambah baris penjualan.'
      using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Jumlah harus lebih dari nol.';
  end if;

  select * into v_t from kasir_tagihan where id = p_tagihan_id;
  if not found then raise exception 'Tagihan tidak ditemukan.'; end if;

  select * into v_obat from obat where id = p_obat_id and aktif;
  if not found then raise exception 'Obat tidak ditemukan atau sudah nonaktif.'; end if;

  -- Kategori 'Penjualan Bebas' sudah ada sejak modul apotek dibangun
  -- (lihat apotek_kategori_keluar() di sql/08_apotek.sql §C) — dipakai
  -- di sini apa adanya, bukan kategori baru. Tanpa preferensi kolam:
  -- penjualan bebas bukan bagian program kronis, jadi FEFO polos lintas
  -- kolam reguler & kronis (boleh menyeberang, sama seperti resep biasa
  -- untuk pasien yang bukan pemegang buku kronis).
  v_hasil := public._apotek_potong_fefo_inti(
    p_obat_id, p_qty, 'Penjualan Bebas', v_t.tanggal,
    v_t.kunjungan_id, null, null,
    coalesce(p_keterangan, 'Penjualan bebas — kasir ' || v_t.nomor),
    null);

  insert into kasir_tagihan_item (tagihan_id, sumber, ref_id, ref_kode, nama, qty,
                                  harga_satuan, diskon_pct, ditanggung_penjamin, urutan,
                                  apotek_grup_id)
  values (p_tagihan_id, 'OBAT', p_obat_id, v_obat.kode_internal,
          v_obat.nama || ' (' || p_qty || ' ' || v_obat.satuan || ')',
          p_qty, coalesce(v_obat.harga, 0), coalesce(p_diskon_pct, 0),
          p_ditanggung_penjamin, p_urutan, (v_hasil->>'grup_id')::uuid)
  returning * into v_item;

  return v_item;
end $$;

grant execute on function
  public.kasir_jual_obat_bebas(uuid,uuid,numeric,numeric,boolean,smallint,text)
  to authenticated;


-- =====================================================================
--  F. MENGHAPUS BARIS OBAT-BEBAS MENGEMBALIKAN STOKNYA — DI DATABASE,
--     BUKAN DIGANTUNGKAN KE JALUR KLIEN
-- =====================================================================

-- Dipasang sebagai trigger (bukan disisipkan ke fungsi penghapusan baris
-- tertentu) supaya invariannya berlaku di MANA PUN baris ini terhapus:
-- lewat tombol "×" di Kasir (kasirHapusItem, hapus langsung tabelnya),
-- lewat "Susun ulang dari kunjungan" (yang menghapus seluruh baris
-- TINDAKAN/OBAT/LAYANAN lama sebelum menulis ulang — lihat §E1-E3 di
-- sql/09_kasir.sql), maupun lewat penghapusan seluruh tagihan
-- (kasir_hapus_tagihan, cascade). Baris yang bukan hasil
-- kasir_jual_obat_bebas() (apotek_grup_id null) tidak tersentuh sama
-- sekali — WHEN di trigger memastikan itu.
--
-- Batas 7 hari dan penjagaan lain sudah ada di _apotek_batalkan_grup_inti;
-- trigger ini tidak menduplikasinya.
create or replace function public.kasir_trg_batal_obat_bebas() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public._apotek_batalkan_grup_inti(old.apotek_grup_id,
    'Baris penjualan bebas dihapus dari Kasir (tagihan ' ||
    coalesce((select nomor from kasir_tagihan where id = old.tagihan_id), '?') || ')');
  return old;
end $$;

drop trigger if exists trg_batal_obat_bebas on kasir_tagihan_item;
create trigger trg_batal_obat_bebas before delete on kasir_tagihan_item
for each row when (old.apotek_grup_id is not null)
execute function public.kasir_trg_batal_obat_bebas();

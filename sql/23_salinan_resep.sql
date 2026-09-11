/* =====================================================================
   SALINAN RESEP + RESEP ITER (10 Sep 2026)

   Arthur melaporkan: kalau obat yang diresepkan dokter ternyata habis atau
   sudah kadaluarsa saat resep diserahkan, sistem sekarang cuma memberi
   peringatan "stok tidak cukup" lalu apoteker mengisi jumlah seadanya
   (fitur "diserahkan sebagian" yang sudah ada sejak 08_apotek.sql). Yang
   BELUM ada: dokumen "Salinan Resep" resmi (per Permenkes 73/2016 tentang
   Standar Pelayanan Kefarmasian di Apotek) yang HARUS diberikan ke pasien
   dalam situasi itu, supaya sisa obatnya bisa ditebus di apotek lain —
   berisi tanda det/nedet per obat, identitas apoteker penyerah (nama +
   No. SIPA), No. SIA apotek, dan cap "p.c.c" (pro copy conform).

   Arthur juga eksplisit minta dukungan "iter resep": dokter menuliskan
   resep boleh diulang N kali (mis. obat kronis bulanan) tanpa periksa
   ulang; tiap pengambilan dicetak Salinan Resep baru sampai iterasinya
   habis.

   MASALAH STRUKTUR YANG HARUS DIPECAHKAN LEBIH DULU: sebelum berkas ini,
   `apotek_serahkan_resep()` (08_apotek.sql, dibungkus ulang di
   17_apotek_kolam.sql) mengunci resep SELAMANYA begitu status jadi
   'DISERAHKAN' — sekalipun baru diserahkan SEBAGIAN. Tidak ada tempat
   menyimpan riwayat "penyerahan keberapa" karena `resep_item.jumlah_diserahkan`
   cuma satu kolom (ditimpa tiap kali). Iter butuh resep bisa dibuka lagi
   berkali-kali, dan tiap kali butuh jejak sendiri (untuk mencetak ulang
   Salinan Resep penyerahan yang mana pun) — karenanya dua tabel baru di
   bawah, TERPISAH dari apotek_transaksi (yang tetap satu-satunya sumber
   kebenaran KARTU STOK & TAGIHAN KASIR, tidak disentuh sama sekali di sini).

   =====================================================================
   A. KOLOM BARU
   ===================================================================== */

-- No. Surat Izin Apotek — wajib tercantum di Salinan Resep bersama identitas
-- klinik yang sudah ada (nama, alamat, kode_registrasi_kemenkes).
alter table faskes add column if not exists no_sia text;
comment on column faskes.no_sia is
  'Nomor Surat Izin Apotek (SIA) — dicetak di kop Salinan Resep.';

-- iter_maks: berapa kali resep ini BOLEH diulang di LUAR penyerahan
-- pertama (tulisan dokter "iter 2x" di kertas resep = iter_maks 2, jadi
-- total 3 kali boleh diserahkan). 0 = tidak iter, perilaku sama seperti
-- sebelum fitur ini ada (sekali serah, langsung terkunci).
alter table resep add column if not exists iter_maks smallint not null default 0
  check (iter_maks >= 0 and iter_maks <= 12);
comment on column resep.iter_maks is
  'Jumlah pengulangan yang diizinkan DOKTER di luar penyerahan pertama ("iter Nx"). Diisi saat menulis resep, bukan oleh apoteker.';

alter table resep add column if not exists iter_terpakai smallint not null default 0;
comment on column resep.iter_terpakai is
  'Berapa kali resep ini sudah diserahkan (termasuk penyerahan pertama). Resep masih bisa diserahkan lagi selama iter_terpakai <= iter_maks.';

/* =====================================================================
   B. RIWAYAT PENYERAHAN (per kejadian, bukan per resep)

   Satu baris resep_penyerahan = satu kali apoteker menekan "Serahkan &
   potong stok" (penyerahan pertama ATAU salah satu iter). resep_item TETAP
   menyimpan snapshot penyerahan TERAKHIR (kolom jumlah_diserahkan/
   catatan_farmasi lama, dipakai layar "Serahkan resep" untuk menampilkan
   angka default) — tabel ini yang menjadi sumber kebenaran untuk mencetak
   ulang Salinan Resep penyerahan mana pun, kapan pun, termasuk yang lampau.
   ===================================================================== */
create table if not exists resep_penyerahan (
  id           uuid primary key default uuid_generate_v4(),
  resep_id     uuid not null references resep(id) on delete cascade,
  ke_berapa    smallint not null,              -- 1 = penyerahan pertama, 2 = iter ke-1, dst
  lengkap      boolean not null default true,  -- semua butir resep terpenuhi PENUH di kejadian ini?
  catatan      text,
  apoteker_id  uuid references pegawai(id),
  tanggal      date not null,
  dibuat_pada  timestamptz not null default now()
);
create index if not exists idx_resep_penyerahan_resep on resep_penyerahan (resep_id);
comment on table resep_penyerahan is
  'Satu baris per kejadian penyerahan resep (penyerahan pertama atau salah satu iter) — dasar cetak Salinan Resep.';

create table if not exists resep_penyerahan_item (
  id                uuid primary key default uuid_generate_v4(),
  penyerahan_id     uuid not null references resep_penyerahan(id) on delete cascade,
  resep_item_id     uuid not null references resep_item(id) on delete cascade,
  jumlah_diminta    numeric(8,2) not null,            -- = resep_item.jumlah saat kejadian ini
  jumlah_diserahkan numeric(8,2) not null default 0,  -- < diminta -> "nedet" sebagian di Salinan Resep
  keterangan        text
);
create index if not exists idx_resep_penyerahan_item_penyerahan on resep_penyerahan_item (penyerahan_id);
comment on table resep_penyerahan_item is
  'Jumlah diminta vs benar-benar diserahkan PER BUTIR pada satu kejadian penyerahan — sumber tanda det/nedet di Salinan Resep.';

/* =====================================================================
   C. apotek_serahkan_resep() — DITULIS ULANG TOTAL

   Perbedaan dari versi 08_apotek.sql/17_apotek_kolam.sql:
   - TIDAK menolak lagi begitu status = 'DISERAHKAN' — yang ditolak adalah
     ketika iter_terpakai sudah mencapai iter_maks+1 (iterasi benar-benar
     habis). Resep tanpa iter (iter_maks=0) berperilaku PERSIS seperti
     sebelumnya: sekali serah (penuh atau sebagian), langsung terkunci.
   - Setiap pemanggilan membuat SATU baris resep_penyerahan + baris
     resep_penyerahan_item per butir yang disebut di p_item, supaya bisa
     dicetak sebagai Salinan Resep kapan pun setelahnya.
   - status resep: 'DISERAHKAN' hanya saat iterasi benar-benar habis;
     selama masih ada iterasi tersisa, statusnya 'ITER_BERJALAN' (tetap
     muncul di antrean "belum diserahkan" milik apoteker, supaya kelihatan
     saat pasiennya balik lagi).
   - Pemotongan stok (apotek_keluar, FEFO) TIDAK berubah sama sekali.
   ===================================================================== */
create or replace function public.apotek_serahkan_resep(
  p_resep_id  uuid,
  p_item      jsonb,
  p_tanggal   date default null,
  p_catatan   text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_resep       resep%rowtype;
  v_kunjungan   uuid;
  v_it          jsonb;
  v_ri          resep_item%rowtype;
  v_jumlah      numeric;
  v_kolam       text;
  v_hasil       jsonb;
  v_grup        jsonb := '[]'::jsonb;
  v_diserahkan  int := 0;
  v_total_item  int := 0;
  v_ke_berapa   smallint;
  v_penyerahan  uuid;
  v_lengkap     boolean;
  v_pasien      uuid;
  v_tgl         date := coalesce(p_tanggal, public.tgl_klinik());
begin
  if not public.boleh_apotek() then
    raise exception 'Hanya apoteker dan admin yang boleh menyerahkan resep.'
      using errcode = '42501';
  end if;

  select * into v_resep from resep where id = p_resep_id;
  if not found then raise exception 'Resep tidak ditemukan.'; end if;

  if v_resep.iter_terpakai >= v_resep.iter_maks + 1 then
    raise exception 'Resep % sudah habis diserahkan (termasuk iter), tidak bisa diserahkan lagi.',
      coalesce(v_resep.no_resep,'ini');
  end if;

  v_kunjungan := v_resep.kunjungan_id;
  v_ke_berapa := v_resep.iter_terpakai + 1;
  select pasien_id into v_pasien from kunjungan where id = v_kunjungan;

  select count(*) into v_total_item from resep_item where resep_id = p_resep_id;

  insert into resep_penyerahan (resep_id, ke_berapa, apoteker_id, tanggal, catatan)
  values (p_resep_id, v_ke_berapa, auth.uid(), v_tgl, p_catatan)
  returning id into v_penyerahan;

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
      p_tanggal       => v_tgl,
      p_kunjungan_id  => v_kunjungan,
      p_resep_item_id => v_ri.id,
      p_batch_id      => null,
      p_keterangan    => coalesce(v_it->>'keterangan', v_resep.no_resep),
      p_kolam_disukai => v_kolam
    );

    insert into resep_penyerahan_item
      (penyerahan_id, resep_item_id, jumlah_diminta, jumlah_diserahkan, keterangan)
    values
      (v_penyerahan, v_ri.id, v_ri.jumlah, v_jumlah, nullif(v_it->>'keterangan',''));

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
    -- Batalkan baris penyerahan kosong: jangan sampai ada "penyerahan
    -- ke-N" tercatat tapi tidak ada satu pun butir yang benar-benar keluar.
    delete from resep_penyerahan where id = v_penyerahan;
    raise exception 'Tidak ada butir obat yang diserahkan.';
  end if;

  v_lengkap := v_diserahkan >= v_total_item
           and not exists (
             select 1 from resep_penyerahan_item
              where penyerahan_id = v_penyerahan
                and jumlah_diserahkan < jumlah_diminta);

  update resep_penyerahan set lengkap = v_lengkap where id = v_penyerahan;

  update resep
     set status              = case when v_ke_berapa >= v_resep.iter_maks + 1
                                     then 'DISERAHKAN' else 'ITER_BERJALAN' end,
         iter_terpakai       = v_ke_berapa,
         diserahkan_oleh     = auth.uid(),
         diserahkan_pada     = now(),
         diserahkan_sebagian = (not v_lengkap) or coalesce(diserahkan_sebagian, false),
         catatan             = coalesce(p_catatan, catatan)
   where id = p_resep_id;

  return jsonb_build_object(
    'resep_id',      p_resep_id,
    'penyerahan_id', v_penyerahan,
    'ke_berapa',     v_ke_berapa,
    'butir',         v_diserahkan,
    'dari',          v_total_item,
    'lengkap',       v_lengkap,
    'iter_sisa',     greatest(0, v_resep.iter_maks + 1 - v_ke_berapa),
    'rincian',       v_grup
  );
end $$;

grant execute on function public.apotek_serahkan_resep(uuid,jsonb,date,text) to authenticated;

/* =====================================================================
   D. VIEW — v_antrean_farmasi ikut membawa info iter, supaya daftar
   antrean bisa menunjukkan "iter 1/3" dan resep ITER_BERJALAN tetap
   tampil di tab "Menunggu diserahkan" (statusnya bukan 'DISERAHKAN').
   ===================================================================== */
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
          from resep_item ri where ri.resep_id = r.id)                       as daftar_obat,
       r.iter_maks,
       r.iter_terpakai
  from resep r
  join kunjungan k on k.id = r.kunjungan_id
  join pasien p    on p.id = k.pasien_id
  join poli po     on po.id = k.poli_id
  left join pegawai d on d.id = k.dokter_id;

/* =====================================================================
   E. RIWAYAT PENYERAHAN UNTUK LAYAR FARMASI — ditarik lewat select
   bersarang di js/db.js (resepUntukFarmasi), bukan view terpisah, supaya
   satu roundtrip mengembalikan resep + item + riwayat penyerahan sekaligus.

   F. ROW LEVEL SECURITY
   ===================================================================== */
grant select, insert, update, delete on resep_penyerahan, resep_penyerahan_item to authenticated;

alter table resep_penyerahan      enable row level security;
alter table resep_penyerahan_item enable row level security;

-- Baca: semua staf (dipakai layar riwayat penyerahan & cetak Salinan Resep).
drop policy if exists resep_penyerahan_baca on resep_penyerahan;
create policy resep_penyerahan_baca on resep_penyerahan for select
  to authenticated using (public.saya_staf());

drop policy if exists resep_penyerahan_item_baca on resep_penyerahan_item;
create policy resep_penyerahan_item_baca on resep_penyerahan_item for select
  to authenticated using (public.saya_staf());

-- Menulis langsung lewat tangan TIDAK diizinkan, bahkan untuk apoteker —
-- satu-satunya jalan masuk normal adalah apotek_serahkan_resep() di atas
-- (SECURITY DEFINER, jadi tidak terkena RLS karena berjalan sebagai
-- pemilik tabel). Sama persis pola trx_tulis pada apotek_transaksi di
-- 08_apotek.sql: master tetap bisa menulis langsung untuk koreksi darurat.
drop policy if exists resep_penyerahan_tulis on resep_penyerahan;
create policy resep_penyerahan_tulis on resep_penyerahan for all
  to authenticated
  using (public.peran_teks_saya() = 'master')
  with check (public.peran_teks_saya() = 'master');

drop policy if exists resep_penyerahan_item_tulis on resep_penyerahan_item;
create policy resep_penyerahan_item_tulis on resep_penyerahan_item for all
  to authenticated
  using (public.peran_teks_saya() = 'master')
  with check (public.peran_teks_saya() = 'master');

/* =====================================================================
   G. _apotek_batalkan_grup_inti() — SATU baris disesuaikan untuk iter

   Sebelum berkas ini, membatalkan transaksi penyerahan SELALU mereset
   resep.status ke 'DIBUAT' tanpa syarat. Untuk resep iter itu salah:
   membatalkan penyerahan ke-2 dari resep iter 2x semestinya membuka lagi
   iterasi ke-2 (status ITER_BERJALAN, iter_terpakai turun jadi 1), bukan
   pura-pura resepnya belum pernah disentuh sama sekali (iter_terpakai
   balik ke 0 akan membuat pasien "berhak" atas satu putaran ekstra yang
   tidak pernah ditulis dokter).

   CATATAN KETERBATASAN yang SENGAJA dibiarkan (di luar cakupan permintaan
   Arthur, dan sudah begini sejak sebelum fitur ini): pembatalan bekerja
   per grup_id (satu obat), tapi resep_item.jumlah_diserahkan & resep.status
   di-reset untuk SELURUH resep, bukan cuma obat yang grup-nya dibatalkan —
   perilaku ini disalin apa adanya dari versi sebelum 10 Sep 2026. Baris
   riwayat resep_penyerahan/resep_penyerahan_item TIDAK ikut disunting di
   sini (tetap sebagai catatan bahwa penyerahan itu SEMPAT terjadi) — kalau
   suatu saat perlu presisi penuh (mis. Salinan Resep tidak boleh lagi
   dicetak untuk penyerahan yang dibatalkan), itu pekerjaan terpisah.
   ===================================================================== */
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
     set status        = case when r.iter_terpakai > 1 then 'ITER_BERJALAN' else 'DIBUAT' end,
         iter_terpakai  = greatest(0, r.iter_terpakai - 1),
         diserahkan_pada = null, diserahkan_oleh = null,
         diserahkan_sebagian = false
   where r.id in (
     select ri.resep_id from apotek_transaksi t
       join resep_item ri on ri.id = t.resep_item_id
      where t.grup_id = p_grup_id
   );

  return jsonb_build_object('dibatalkan', v_jumlah, 'alasan', p_alasan);
end $$;

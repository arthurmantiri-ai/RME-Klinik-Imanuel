-- =====================================================================
--  RME KLINIK IMANUEL - PENUNJANG MASUK KE TAGIHAN
--  Jalankan SETELAH 11_penunjang.sql
--
--  Aman dijalankan di database yang sudah berisi data. Berkas ini hanya
--  melonggarkan dua check constraint dan mengganti isi satu fungsi;
--  tidak ada tabel yang dibuat ulang dan tidak ada baris yang disentuh.
--
--  Yang ditambahkan: pemeriksaan laboratorium dan pemeriksaan penunjang
--  yang DIKERJAKAN DI KLINIK ikut masuk tagihan, dengan aturan yang sama
--  seperti obat — yang ditagihkan adalah yang benar-benar dikerjakan,
--  bukan yang diminta dokter. Permintaan yang dibatalkan tidak ditagih,
--  dan hasil dari lab luar tidak ditagih sama sekali karena bukan klinik
--  yang mengerjakannya.
-- =====================================================================


-- =====================================================================
--  A. MELONGGARKAN CHECK CONSTRAINT
-- =====================================================================

-- Tarif kini mengenal dua jenis baru.
alter table kasir_tarif drop constraint if exists kasir_tarif_jenis_check;
alter table kasir_tarif add  constraint kasir_tarif_jenis_check
  check (jenis in ('TINDAKAN','LAYANAN','LAB','PENUNJANG','LAIN'));

-- Baris tagihan kini mengenal dua asal baru.
alter table kasir_tagihan_item drop constraint if exists kasir_tagihan_item_sumber_check;
alter table kasir_tagihan_item add  constraint kasir_tagihan_item_sumber_check
  check (sumber in ('TINDAKAN','OBAT','LAYANAN','LAB','PENUNJANG','MANUAL'));


-- =====================================================================
--  B. PENCARIAN TARIF
-- =====================================================================

-- Kembarannya kasir_tarif_berlaku(), tapi mencari lewat kolom `kode`
-- bebas, bukan kode ICD-9-CM. Untuk lab, `kode` diisi kode pemeriksaan
-- (mis. 'HB'); untuk penunjang, diisi jenisnya (mis. 'RO_PERIAPIKAL').
--
-- Sama seperti tarif tindakan: yang dipakai adalah tarif yang berlaku
-- pada TANGGAL KUNJUNGAN, bukan tarif hari ini. Tarif naik bulan depan
-- tidak boleh mengubah tagihan bulan ini.
create or replace function public.kasir_tarif_kode(
  p_jenis   text,
  p_kode    text,
  p_tanggal date
) returns numeric
language sql stable security definer set search_path = public
as $$
  select t.tarif from kasir_tarif t
   where t.jenis = p_jenis
     and t.kode  = p_kode
     and t.aktif
     and t.berlaku_mulai <= p_tanggal
   order by t.berlaku_mulai desc
   limit 1
$$;

grant execute on function public.kasir_tarif_kode(text, text, date) to authenticated;


-- =====================================================================
--  C. PENYUSUNAN TAGIHAN
-- =====================================================================
--  Mengganti isi kasir_susun_dari_kunjungan() dari 09_kasir.sql.
--  Tanda tangannya persis sama (satu uuid), jadi `create or replace`
--  benar-benar mengganti dan tidak melahirkan fungsi kembar — beda dengan
--  kasus apotek_masuk() di 10_apotek_impor.sql yang parameternya bertambah
--  sehingga versi lamanya harus dibuang lebih dulu.
--
--  Bagian E1-E3 tidak diubah sedikit pun dari versi 09_kasir.sql.
--  Yang baru hanya E4 dan E5, serta dua nilai tambahan pada daftar hapus
--  di awal — tanpa itu, menyusun ulang tagihan akan menggandakan baris lab.
create or replace function public.kasir_susun_dari_kunjungan(
  p_kunjungan_id uuid
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_k         kunjungan%rowtype;
  v_p         pasien%rowtype;
  v_tagihan   kasir_tagihan%rowtype;
  v_ditanggung boolean;
  v_urut      smallint := 0;
  v_bayar     numeric;
  r           record;
begin
  if not public.boleh_kasir() then
    raise exception 'Hanya kasir dan admin yang boleh menyusun tagihan.' using errcode = '42501';
  end if;

  select * into v_k from kunjungan where id = p_kunjungan_id;
  if not found then raise exception 'Kunjungan tidak ditemukan.'; end if;
  select * into v_p from pasien where id = v_k.pasien_id;

  -- Penjamin menentukan segalanya. BPJS dan GRATIS tidak ditagihkan ke
  -- pasien; nilainya tetap dicatat untuk laporan.
  v_ditanggung := v_k.cara_bayar in ('BPJS','GRATIS');

  select * into v_tagihan from kasir_tagihan where kunjungan_id = p_kunjungan_id;
  if found then
    select coalesce(sum(jumlah),0) into v_bayar
      from kasir_pembayaran where tagihan_id = v_tagihan.id;
    if v_bayar > 0 then
      raise exception 'Tagihan % sudah dibayar, jadi tidak bisa disusun ulang.', v_tagihan.nomor;
    end if;
    delete from kasir_tagihan_item
     where tagihan_id = v_tagihan.id
       and sumber in ('TINDAKAN','OBAT','LAYANAN','LAB','PENUNJANG');
    update kasir_tagihan set penjamin = v_k.cara_bayar where id = v_tagihan.id;
    select coalesce(max(urutan), 0) into v_urut
      from kasir_tagihan_item where tagihan_id = v_tagihan.id;
  else
    insert into kasir_tagihan (kunjungan_id, pasien_id, nama_pembayar, tanggal,
                               penjamin, dibuat_oleh)
    values (p_kunjungan_id, v_k.pasien_id, v_p.nama, v_k.tanggal,
            v_k.cara_bayar, auth.uid())
    returning * into v_tagihan;
  end if;

  -- E1. Layanan otomatis (karcis / administrasi).
  for r in select * from kasir_tarif
            where jenis = 'LAYANAN' and otomatis and aktif
              and berlaku_mulai <= v_k.tanggal
            order by nama
  loop
    v_urut := v_urut + 1;
    insert into kasir_tagihan_item (tagihan_id, sumber, ref_id, ref_kode, nama, qty,
                                    harga_satuan, ditanggung_penjamin, urutan)
    values (v_tagihan.id, 'LAYANAN', r.id, r.kode, r.nama, 1,
            r.tarif, v_ditanggung, v_urut);
  end loop;

  -- E2. Tindakan ICD-9-CM dari catatan dokter.
  --     Tindakan tanpa tarif tetap dimasukkan dengan harga 0 supaya
  --     terlihat di struk dan ketahuan tarifnya belum diisi — jauh lebih
  --     baik daripada hilang diam-diam dari tagihan.
  for r in select t.id, t.kode_icd9, t.nama, t.jumlah, t.fdi
             from tindakan t where t.kunjungan_id = p_kunjungan_id
            order by t.urutan
  loop
    v_urut := v_urut + 1;
    insert into kasir_tagihan_item (tagihan_id, sumber, ref_id, ref_kode, nama, qty,
                                    harga_satuan, ditanggung_penjamin, urutan)
    values (v_tagihan.id, 'TINDAKAN', r.id, r.kode_icd9,
            r.nama || case when r.fdi is not null then ' (gigi ' || r.fdi || ')' else '' end,
            greatest(r.jumlah, 1),
            coalesce(public.kasir_tarif_berlaku(r.kode_icd9, v_k.tanggal), 0),
            v_ditanggung, v_urut);
  end loop;

  -- E3. Obat yang benar-benar diserahkan apotek.
  --     Dikelompokkan per obat: satu obat yang terpecah ke tiga batch
  --     adalah satu baris di mata pasien, bukan tiga.
  for r in select at.obat_id, max(at.nama_obat) as nama_obat, max(at.satuan) as satuan,
                  sum(at.jumlah) as jumlah, max(o.harga) as harga_jual
             from apotek_transaksi at
             join obat o on o.id = at.obat_id
            where at.kunjungan_id = p_kunjungan_id
              and at.jenis = 'KELUAR'
              and at.kategori = 'Resep Pasien'
              and not at.dibatalkan
            group by at.obat_id
            having sum(at.jumlah) > 0
            order by max(at.nama_obat)
  loop
    v_urut := v_urut + 1;
    insert into kasir_tagihan_item (tagihan_id, sumber, ref_id, ref_kode, nama, qty,
                                    harga_satuan, ditanggung_penjamin, urutan)
    values (v_tagihan.id, 'OBAT', r.obat_id, null,
            r.nama_obat || ' (' || r.jumlah || ' ' || coalesce(r.satuan,'') || ')',
            r.jumlah, coalesce(r.harga_jual, 0), v_ditanggung, v_urut);
  end loop;

  -- E4. Pemeriksaan laboratorium yang dikerjakan klinik.
  --     Tiga penyaring, masing-masing menutup satu cara salah tagih:
  --       asal = INTERNAL  → hasil dari lab luar bukan pekerjaan klinik
  --       status <> BATAL  → permintaan yang dibatalkan tidak pernah dikerjakan
  --       nilai terisi     → pemeriksaan yang tidak jadi dikerjakan (sampel
  --                          kurang, reagen habis) ikut tidak ditagihkan
  --     Yang ketiga itu sengaja: dokter bisa saja meminta sepuluh
  --     pemeriksaan dan hanya delapan yang bisa dikerjakan hari itu.
  for r in select h.id, rl.kode, h.nama
             from lab_hasil h
             join lab_permintaan lp on lp.id = h.permintaan_id
             join ref_lab rl on rl.id = h.lab_id
            where lp.kunjungan_id = p_kunjungan_id
              and lp.asal = 'INTERNAL'
              and lp.status <> 'BATAL'
              and (h.nilai_angka is not null or nullif(h.nilai_teks,'') is not null)
            order by h.urutan
  loop
    v_urut := v_urut + 1;
    insert into kasir_tagihan_item (tagihan_id, sumber, ref_id, ref_kode, nama, qty,
                                    harga_satuan, ditanggung_penjamin, urutan)
    values (v_tagihan.id, 'LAB', r.id, r.kode, 'Lab: ' || r.nama, 1,
            coalesce(public.kasir_tarif_kode('LAB', r.kode, v_k.tanggal), 0),
            v_ditanggung, v_urut);
  end loop;

  -- E5. Pemeriksaan penunjang yang dikerjakan klinik (rontgen, EKG, USG).
  --     Bacaan atas foto yang dibuat DI TEMPAT LAIN tidak ditagihkan
  --     sebagai pemeriksaan. Kalau klinik ingin menagih jasa membacanya,
  --     itu tindakan tersendiri dan dicatat sebagai tindakan ICD-9-CM.
  --
  --     Penyaring terakhir menutup tagihan ganda. Satu foto periapikal bisa
  --     tercatat dua kali dengan cara yang sama-sama benar: dokter mencatat
  --     tindakan "87.12 Rontgen gigi lainnya" di §E2, DAN menulis bacaannya
  --     di sini. Tanpa penyaring ini pasien membayar dua kali untuk satu
  --     film, dengan dua baris struk yang sama-sama berakhir "(gigi 36)".
  --     Yang dipertahankan adalah baris tindakan, karena ia membawa kode
  --     ICD-9-CM yang dibutuhkan laporan dan bridging.
  for r in select pn.id, pn.jenis, coalesce(pn.judul, pn.jenis) as nama,
                  (select string_agg(pg.fdi, ', ' order by pg.fdi)
                     from penunjang_gigi pg where pg.penunjang_id = pn.id) as gigi
             from penunjang pn
            where pn.kunjungan_id = p_kunjungan_id
              and pn.asal = 'INTERNAL'
              and not exists (
                    select 1 from tindakan t
                     where t.kunjungan_id = p_kunjungan_id
                       and t.kode_icd9 = any (
                             case
                               when left(pn.jenis, 3) = 'RO_' and pn.jenis <> 'RO_THORAX'
                                 then array['87.11','87.12']
                               when pn.jenis = 'RO_THORAX' then array['87.44']
                               when pn.jenis = 'EKG'       then array['89.52']
                               when pn.jenis = 'USG'       then array['88.79']
                               else array[]::text[]
                             end))
            order by pn.dibaca_pada
  loop
    v_urut := v_urut + 1;
    insert into kasir_tagihan_item (tagihan_id, sumber, ref_id, ref_kode, nama, qty,
                                    harga_satuan, ditanggung_penjamin, urutan)
    values (v_tagihan.id, 'PENUNJANG', r.id, r.jenis,
            r.nama || case when r.gigi is not null then ' (gigi ' || r.gigi || ')' else '' end,
            1,
            coalesce(public.kasir_tarif_kode('PENUNJANG', r.jenis, v_k.tanggal), 0),
            v_ditanggung, v_urut);
  end loop;

  perform public.kasir_hitung_tagihan(v_tagihan.id);
  return v_tagihan.id;
end $$;

grant execute on function public.kasir_susun_dari_kunjungan(uuid) to authenticated;


-- =====================================================================
--  D. DAFTAR KUNJUNGAN YANG MENUNGGU KASIR
-- =====================================================================
--  Kunjungan yang pemeriksaan labnya belum selesai belum boleh dianggap
--  siap ditagih — kalau kasir menyusun tagihan lebih dulu, hasil lab yang
--  keluar sepuluh menit kemudian tidak akan pernah masuk ke tagihan itu,
--  dan pasien pulang tanpa membayarnya.
create or replace view v_kasir_menunggu_lab with (security_invoker = true) as
select k.id as kunjungan_id,
       count(*) filter (where lp.status in ('DIMINTA','DIKERJAKAN')) as lab_belum_selesai
  from kunjungan k
  join lab_permintaan lp on lp.kunjungan_id = k.id and lp.asal = 'INTERNAL'
 group by k.id;

grant select on v_kasir_menunggu_lab to authenticated;

comment on view v_kasir_menunggu_lab is
  'Dipakai halaman kasir untuk memberi peringatan sebelum tagihan disusun: masih ada pemeriksaan lab yang belum selesai pada kunjungan ini.';

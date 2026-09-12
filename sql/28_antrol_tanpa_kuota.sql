/* =========================================================================
   28_antrol_tanpa_kuota.sql
   -------------------------------------------------------------------------
   Menghapus penegakan kuota pada pendaftaran online Mobile JKN (Antrol).
   Klinik ini tidak pernah membatasi jumlah pasien yang datang berobat —
   baik lewat loket maupun online — jadi blok "Kuota online" yang dulu
   menolak pemesanan begitu `kuota_online` per sesi tercapai dihapus.
   Permintaan eksplisit Arthur, 12 Sep 2026.

   `create or replace function` — aman dijalankan berulang, dan berlaku
   langsung untuk pemesanan berikutnya tanpa migrasi data (tidak ada baris
   `antrean` yang perlu diubah).

   Kolom `poli_jadwal.kuota_online` SENGAJA TIDAK dihapus dari skema —
   hanya dibuat tidak berpengaruh lagi. Menghapus kolom NOT NULL berarti
   migrasi skema + kemungkinan menyunting baris yang sudah ada, risiko
   yang tidak sepadan untuk kolom yang sekarang murni tidak dipakai.
   Halaman Jadwal & Kuota (js/pages/jadwal.js) sudah tidak lagi meminta
   ATAU menampilkan angka ini ke petugas — nilainya diisi otomatis dengan
   angka besar (lihat js/pages/jadwal.js) supaya batasan NOT NULL/CHECK
   tetap terpenuhi tanpa staf perlu memikirkannya.

   Fungsi lain yang dulu MENCERMINKAN aturan ini untuk pengujian —
   AntreanCore.bolehDaftarOnline() di js/antrean_core.js — juga diperbarui
   terpisah (lihat commit yang sama) supaya perilakunya tetap sama dengan
   fungsi database ini.
   ========================================================================= */

create or replace function public.antrol_ambil(
  p_no_kartu text, p_nik text, p_kode_poli text, p_tanggal text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record; j record; g jsonb; a antrean;
  v_pasien uuid; v_nama_poli text; v_nama_pasien text;
  v_sisa int; v_jam time;
begin
  g := public.antrol_periksa_kartu(p_no_kartu); if g is not null then return g; end if;
  g := public.antrol_periksa_nik(p_nik);        if g is not null then return g; end if;

  select * into c from public.antrol_periksa_poli_tanggal(p_kode_poli, p_tanggal);
  if c.v_galat is not null then return c.v_galat; end if;

  select nama into v_nama_poli from poli where id = c.v_poli;

  -- Jadwal
  select * into j from public.poli_jadwal_berlaku(c.v_poli, c.v_tgl);
  if not found then
    return public.antrol_gagal('Pendaftaran ke ' || v_nama_poli || ' sedang tutup pada tanggal tersebut');
  end if;

  -- Jam tutup hanya berlaku untuk pemesanan HARI INI. Pemesanan untuk
  -- besok tidak boleh ditolak karena poli sudah tutup sore ini.
  if c.v_tgl = public.tgl_klinik() then
    v_jam := public.jam_klinik();
    if v_jam > j.jam_tutup_online then
      return public.antrol_gagal(
        'Pendaftaran online ke ' || v_nama_poli || ' hari ini sudah ditutup pukul ' ||
        to_char(j.jam_tutup_online, 'HH24:MI'));
    end if;
  end if;

  -- Sudah punya nomor?
  --
  -- Sengaja memeriksa SEMUA sumber, bukan hanya ONLINE. Kalau pasien
  -- sudah mengambil nomor di loket pagi ini, nomor kedua dari Mobile JKN
  -- akan membuatnya dipanggil dua kali. Indeks unik di tabel hanya
  -- menjaga jalur online; pemeriksaan inilah yang menutup celah
  -- antar-jalur. (Ini BUKAN pemeriksaan kuota — tetap dipertahankan.)
  if exists (
    select 1 from antrean
     where tanggal = c.v_tgl and poli_id = c.v_poli
       and no_kartu = trim(p_no_kartu)
       and status not in ('BATAL','TIDAK_HADIR'))
  then
    return public.antrol_gagal(
      'Nomor antrean hanya dapat diambil satu kali pada tanggal dan poli yang sama');
  end if;

  -- (12 Sep 2026: blok "Kuota online" yang dulu ada di sini — menolak
  -- pemesanan begitu jumlah terpakai mencapai j.kuota_online — DIHAPUS.
  -- Klinik tidak membatasi jumlah pasien; pemesanan Mobile JKN sekarang
  -- selalu diterima selama poli buka dan belum lewat jam tutup online.)

  -- Pasien dikenal? Dicari lewat nomor BPJS dulu, lalu NIK.
  select id, nama into v_pasien, v_nama_pasien
    from pasien
   where aktif and (no_bpjs = trim(p_no_kartu) or nik = trim(p_nik))
   order by (no_bpjs = trim(p_no_kartu)) desc
   limit 1;

  insert into antrean (tanggal, poli_id, sumber, status, tahap,
                       pasien_id, no_kartu, nik, nama_snapshot)
  values (c.v_tgl, c.v_poli, 'ONLINE', 'BELUM_HADIR', 'LOKET',
          v_pasien, trim(p_no_kartu), trim(p_nik), v_nama_pasien)
  returning * into a;

  select count(*) into v_sisa from antrean
   where tanggal = c.v_tgl and poli_id = c.v_poli
     and status in ('BELUM_HADIR','MENUNGGU','DIPANGGIL')
     and no_urut < a.no_urut;

  return jsonb_build_object(
    'response', jsonb_build_object(
      'nomorantrean',  a.nomor,
      'angkaantrean',  a.no_urut::text,
      'namapoli',      v_nama_poli,
      'sisaantrean',   v_sisa::text,
      'antreanpanggil', public.antrol_antrean_panggil(c.v_poli, c.v_tgl),
      'keterangan',    public.antrol_keterangan(),
      'kodebooking',   a.kode_booking),
    'metadata', jsonb_build_object(
      'message', 'Ok',
      -- 202 = peserta belum terdaftar sebagai pasien di sini. Nomornya
      -- TETAP terbit — pasien yang sudah berangkat tidak boleh disuruh
      -- pulang. Kode 202-lah yang memberi tahu Mobile JKN agar mengirim
      -- data dirinya lewat POST /peserta, dan petugas loket melihat
      -- nomor ini bertanda "pasien baru" di papan antrean.
      'code', case when v_pasien is null then 202 else 200 end));
end $$;

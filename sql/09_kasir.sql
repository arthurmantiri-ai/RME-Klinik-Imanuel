-- =====================================================================
--  RME KLINIK IMANUEL - MODUL KASIR
--  Jalankan SETELAH 08_apotek.sql
--
--  Diturunkan dari invoice generator portal sipantau. Yang disalin utuh
--  karena portal sudah membayarnya dengan bug nyata:
--
--   1. Frontend TIDAK PERNAH menulis status_bayar atau amount_paid.
--      Keduanya dijaga trigger. Di portal, invoice yang disimpan langsung
--      'lunas' tanpa baris pembayaran justru statusnya MUNDUR ke
--      'sebagian' begitu pembayaran pertama dicatat.
--
--   2. Satu sumber status. Judul dokumen, cap di kanan atas, dan baris
--      sisa tagihan semuanya membaca angka yang sama. Di portal pernah
--      terjadi satu lembar mencetak "KWITANSI" di kepala dan
--      "BELUM LUNAS" di kaki, karena judul membaca kolom status
--      sementara stempel menghitung sendiri dari nominal.
--
--   3. Kembalian tidak pernah disimpan. Yang disimpan adalah uang yang
--      diterima; kembalian selalu dihitung saat dicetak. Angka turunan
--      yang disimpan adalah angka yang suatu hari bertentangan dengan
--      sumbernya.
--
--  Yang BARU di RME dan tidak ada di portal:
--
--   4. Penjamin. Kunjungan BPJS di klinik pratama dibayar kapitasi, jadi
--      pasien tidak ditagih. Barisnya tetap dicatat lengkap dengan
--      nilainya lewat kolom ditanggung_penjamin — sehingga pertanyaan
--      "berapa nilai obat BPJS bulan ini" tetap bisa dijawab — tapi
--      tidak ikut hitungan yang harus dibayar di meja kasir.
--
--   5. Tagihan disusun dari kunjungan, bukan diketik. Tindakan ICD-9-CM
--      diambil dari catatan dokter, obat dari apa yang BENAR-BENAR
--      diserahkan apotek.
-- =====================================================================


-- =====================================================================
--  A. FUNGSI BANTU
-- =====================================================================

create or replace function public.boleh_kasir() returns boolean
language sql stable security definer set search_path = public
as $$ select public.peran_teks_saya() = any (array['admin','kasir']) $$;

grant execute on function public.boleh_kasir() to authenticated;


-- =====================================================================
--  B. MASTER TARIF
-- =====================================================================

-- Tarif berversi. Tarif naik itu wajar; tagihan bulan lalu tidak boleh
-- ikut berubah karenanya. Karena itu tarif TIDAK PERNAH dibaca ulang saat
-- mencetak — nilainya disalin ke kasir_tagihan_item saat tagihan disusun,
-- dan salinan itulah yang berlaku selamanya untuk tagihan tersebut.
create table if not exists kasir_tarif (
  id             uuid primary key default uuid_generate_v4(),
  jenis          text not null default 'TINDAKAN'
                 check (jenis in ('TINDAKAN','LAYANAN','LAIN')),
  kode_icd9      text references icd9cm(kode),   -- diisi bila jenis = TINDAKAN
  kode           text,
  nama           text not null,
  tarif          numeric(14,2) not null default 0 check (tarif >= 0),
  -- Layanan dengan otomatis = true ditambahkan ke setiap tagihan pasien
  -- umum saat disusun dari kunjungan (mis. karcis / administrasi).
  otomatis       boolean not null default false,
  berlaku_mulai  date not null default public.tgl_klinik(),
  aktif          boolean not null default true,
  keterangan     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_tarif_icd9 on kasir_tarif (kode_icd9, berlaku_mulai desc)
  where aktif;
create index if not exists idx_tarif_otomatis on kasir_tarif (otomatis) where otomatis and aktif;

-- Tarif yang berlaku untuk satu kode tindakan pada satu tanggal.
create or replace function public.kasir_tarif_berlaku(p_kode_icd9 text, p_tanggal date)
returns numeric
language sql stable security definer set search_path = public
as $$
  select tarif from kasir_tarif
   where kode_icd9 = p_kode_icd9 and aktif and berlaku_mulai <= p_tanggal
   order by berlaku_mulai desc, created_at desc
   limit 1
$$;

grant execute on function public.kasir_tarif_berlaku(text,date) to authenticated;


-- =====================================================================
--  C. TAGIHAN
-- =====================================================================

create sequence if not exists seq_no_tagihan start 1;

create table if not exists kasir_tagihan (
  id             uuid primary key default uuid_generate_v4(),
  nomor          text not null unique,
  -- Satu kunjungan hanya boleh punya satu tagihan. Kunjungan NULL =
  -- penjualan bebas / pasien luar yang tidak lewat pendaftaran.
  kunjungan_id   uuid unique references kunjungan(id) on delete set null,
  pasien_id      uuid references pasien(id) on delete set null,
  nama_pembayar  text not null,
  tanggal        date not null default public.tgl_klinik(),
  penjamin       cara_bayar_t not null default 'UMUM',
  -- subtotal = nilai ekonomi SELURUH baris, termasuk yang ditanggung
  --            penjamin. Inilah angka untuk laporan pemakaian BPJS.
  -- total     = yang harus dibayar di meja kasir.
  subtotal       numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  amount_paid    numeric(14,2) not null default 0,   -- dijaga trigger
  status_bayar   text not null default 'belum_lunas' -- dijaga trigger
                 check (status_bayar in ('belum_lunas','sebagian','lunas')),
  catatan        text,
  pdf_path       text,
  dibuat_oleh    uuid references pegawai(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_tagihan_tanggal on kasir_tagihan (tanggal desc, created_at desc);
create index if not exists idx_tagihan_pasien  on kasir_tagihan (pasien_id);
create index if not exists idx_tagihan_status  on kasir_tagihan (status_bayar)
  where status_bayar <> 'lunas';

create or replace function public.gen_no_tagihan() returns trigger
language plpgsql as $$
begin
  if new.nomor is null or new.nomor = '' then
    new.nomor := 'INV-' || to_char(coalesce(new.tanggal, public.tgl_klinik()),'YYYY')
                 || '-' || lpad(nextval('seq_no_tagihan')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_gen_no_tagihan on kasir_tagihan;
create trigger trg_gen_no_tagihan before insert on kasir_tagihan
for each row execute function public.gen_no_tagihan();

drop trigger if exists trg_updated_tagihan on kasir_tagihan;
create trigger trg_updated_tagihan before update on kasir_tagihan
for each row execute function set_updated_at();


create table if not exists kasir_tagihan_item (
  id            uuid primary key default uuid_generate_v4(),
  tagihan_id    uuid not null references kasir_tagihan(id) on delete cascade,
  sumber        text not null default 'MANUAL'
                check (sumber in ('TINDAKAN','OBAT','LAYANAN','MANUAL')),
  -- Penunjuk balik ke asalnya: tindakan.id, obat.id, atau kasir_tarif.id.
  -- Sengaja tanpa foreign key: baris tagihan harus tetap utuh terbaca
  -- walaupun sumbernya kelak dihapus dari master.
  ref_id        uuid,
  ref_kode      text,
  nama          text not null,          -- potret nama saat itu
  qty           numeric(14,2) not null default 1 check (qty > 0),
  harga_satuan  numeric(14,2) not null default 0 check (harga_satuan >= 0),
  diskon_pct    numeric(5,2)  not null default 0 check (diskon_pct between 0 and 100),
  total_baris   numeric(14,2) not null default 0,
  -- Saklar penjamin. true = tercatat untuk laporan, tidak ditagihkan.
  ditanggung_penjamin boolean not null default false,
  urutan        smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_titem_tagihan on kasir_tagihan_item (tagihan_id, urutan);


create table if not exists kasir_pembayaran (
  id             uuid primary key default uuid_generate_v4(),
  tagihan_id     uuid not null references kasir_tagihan(id) on delete cascade,
  jumlah         numeric(14,2) not null check (jumlah > 0),
  tanggal        date not null default public.tgl_klinik(),
  metode         text not null default 'tunai'
                 check (metode in ('tunai','transfer','qris','debit','kartu_kredit','lainnya')),
  -- Uang tunai yang diserahkan pasien. Boleh lebih besar dari `jumlah`;
  -- selisihnya adalah kembalian, dan kembalian tidak pernah disimpan.
  uang_diterima  numeric(14,2),
  catatan        text,
  dibuat_oleh    uuid references pegawai(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_bayar_tagihan on kasir_pembayaran (tagihan_id);
create index if not exists idx_bayar_tanggal on kasir_pembayaran (tanggal desc);


-- =====================================================================
--  D. TRIGGER PENJAGA ANGKA
-- =====================================================================

-- D1. total_baris dihitung, tidak pernah diterima dari pemanggil.
create or replace function public.kasir_hitung_baris() returns trigger
language plpgsql as $$
begin
  new.total_baris := round(new.qty * new.harga_satuan * (1 - new.diskon_pct / 100.0), 2);
  return new;
end $$;

drop trigger if exists trg_hitung_baris on kasir_tagihan_item;
create trigger trg_hitung_baris before insert or update on kasir_tagihan_item
for each row execute function public.kasir_hitung_baris();


-- D2. Ringkasan tagihan mengikuti barisnya.
--
--   subtotal = seluruh baris (nilai ekonomi)
--   total    = hanya baris yang ditagihkan ke pasien
--
-- Untuk kunjungan BPJS semua baris ditanggung penjamin, jadi total = 0
-- sementara subtotal tetap menyimpan nilainya untuk laporan.
create or replace function public.kasir_hitung_tagihan(p_tagihan_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_sub numeric; v_tot numeric;
begin
  select coalesce(sum(total_baris), 0),
         coalesce(sum(total_baris) filter (where not ditanggung_penjamin), 0)
    into v_sub, v_tot
    from kasir_tagihan_item where tagihan_id = p_tagihan_id;

  update kasir_tagihan set subtotal = v_sub, total = v_tot where id = p_tagihan_id;
  perform public.kasir_sync_bayar(p_tagihan_id);
end $$;

create or replace function public.kasir_trg_hitung_tagihan() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.kasir_hitung_tagihan(coalesce(new.tagihan_id, old.tagihan_id));
  return null;
end $$;

drop trigger if exists trg_total_tagihan on kasir_tagihan_item;
create trigger trg_total_tagihan after insert or update or delete on kasir_tagihan_item
for each row execute function public.kasir_trg_hitung_tagihan();


-- D3. Status pembayaran dihitung dari baris pembayaran, tidak pernah
--     ditulis tangan. Cerminan persis statusDari() di portal.
--
--     Toleransi 0,5 rupiah: diskon persen bisa menyisakan pecahan sen
--     yang mustahil dibayar tunai, dan tagihan yang tersisa Rp 0,003
--     akan tampak "belum lunas" selamanya.
create or replace function public.kasir_sync_bayar(p_tagihan_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_bayar numeric; v_total numeric; v_status text;
begin
  select coalesce(sum(jumlah), 0) into v_bayar
    from kasir_pembayaran where tagihan_id = p_tagihan_id;
  select total into v_total from kasir_tagihan where id = p_tagihan_id;
  if v_total is null then return; end if;

  if v_total <= 0.5 then
    -- Tagihan bernilai nol — pasien BPJS, atau seluruh barisnya ditanggung.
    -- Tidak ada yang perlu dibayar, jadi tidak masuk akal menahannya di
    -- daftar "belum lunas" sampai kasir menekan tombol bayar Rp 0.
    v_status := 'lunas';
  elsif v_bayar <= 0       then v_status := 'belum_lunas';
  elsif v_bayar >= v_total - 0.5 then v_status := 'lunas';
  else                          v_status := 'sebagian';
  end if;

  update kasir_tagihan
     set amount_paid = v_bayar, status_bayar = v_status
   where id = p_tagihan_id;
end $$;

create or replace function public.kasir_trg_sync_bayar() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.kasir_sync_bayar(coalesce(new.tagihan_id, old.tagihan_id));
  return null;
end $$;

drop trigger if exists trg_sync_bayar on kasir_pembayaran;
create trigger trg_sync_bayar after insert or update or delete on kasir_pembayaran
for each row execute function public.kasir_trg_sync_bayar();


-- D4. Tagihan yang sudah dibayar tidak boleh diubah isinya.
--
-- Bukan kerewelan: struk sudah dicetak dan diserahkan ke pasien.
-- Mengubah barisnya sesudah itu membuat kertas di tangan pasien dan
-- catatan di sistem menyebut dua hal yang berbeda, tanpa jejak mana yang
-- benar. Koreksi dilakukan dengan menghapus pembayarannya lebih dulu —
-- tindakan yang tercatat di audit log.
create or replace function public.kasir_cegah_ubah_terbayar() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_bayar numeric;
begin
  v_id := coalesce(new.tagihan_id, old.tagihan_id);
  select coalesce(sum(jumlah),0) into v_bayar from kasir_pembayaran where tagihan_id = v_id;
  if v_bayar > 0 then
    raise exception 'Tagihan ini sudah menerima pembayaran, jadi rinciannya tidak bisa '
                    'diubah. Hapus dulu pembayarannya bila memang perlu dikoreksi.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_cegah_ubah_terbayar on kasir_tagihan_item;
create trigger trg_cegah_ubah_terbayar before insert or update or delete on kasir_tagihan_item
for each row execute function public.kasir_cegah_ubah_terbayar();


-- =====================================================================
--  E. MENYUSUN TAGIHAN DARI KUNJUNGAN
-- =====================================================================

-- Menarik tindakan ICD-9-CM dari catatan dokter dan obat dari apa yang
-- BENAR-BENAR diserahkan apotek (apotek_transaksi, bukan resep_item).
--
-- Dua angka itu berbeda dan sering: dokter menulis 30 tablet, apoteker
-- menyerahkan 20 karena stok tipis. Menagih dari resep berarti menagih
-- obat yang tidak pernah pasien terima.
--
-- Aman dipanggil berulang: baris TINDAKAN/OBAT/LAYANAN ditulis ulang,
-- baris MANUAL yang ditambahkan kasir dipertahankan.
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
     where tagihan_id = v_tagihan.id and sumber in ('TINDAKAN','OBAT','LAYANAN');
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

  perform public.kasir_hitung_tagihan(v_tagihan.id);
  return v_tagihan.id;
end $$;


-- =====================================================================
--  F. PEMBAYARAN
-- =====================================================================

create or replace function public.kasir_catat_pembayaran(
  p_tagihan_id    uuid,
  p_jumlah        numeric,
  p_tanggal       date    default null,
  p_metode        text    default 'tunai',
  p_catatan       text    default null,
  p_uang_diterima numeric default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_t     kasir_tagihan%rowtype;
  v_bayar numeric;
  v_sisa  numeric;
  v_id    uuid;
begin
  if not public.boleh_kasir() then
    raise exception 'Hanya kasir dan admin yang boleh mencatat pembayaran.' using errcode = '42501';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari nol.';
  end if;

  select * into v_t from kasir_tagihan where id = p_tagihan_id for update;
  if not found then raise exception 'Tagihan tidak ditemukan.'; end if;

  select coalesce(sum(jumlah),0) into v_bayar
    from kasir_pembayaran where tagihan_id = p_tagihan_id;
  v_sisa := v_t.total - v_bayar;

  if p_jumlah > v_sisa + 0.5 then
    raise exception 'Pembayaran % melebihi sisa tagihan %.',
      to_char(p_jumlah,'FM999G999G999'), to_char(greatest(v_sisa,0),'FM999G999G999');
  end if;
  if p_uang_diterima is not null and p_uang_diterima > 0
     and p_uang_diterima < p_jumlah - 0.5 then
    raise exception 'Uang yang diterima kurang % dari jumlah yang dibayarkan.',
      to_char(p_jumlah - p_uang_diterima,'FM999G999G999');
  end if;

  insert into kasir_pembayaran (tagihan_id, jumlah, tanggal, metode,
                                uang_diterima, catatan, dibuat_oleh)
  values (p_tagihan_id, p_jumlah, coalesce(p_tanggal, public.tgl_klinik()),
          p_metode, nullif(p_uang_diterima, 0), p_catatan, auth.uid())
  returning id into v_id;

  select * into v_t from kasir_tagihan where id = p_tagihan_id;

  return jsonb_build_object(
    'pembayaran_id', v_id,
    'status_bayar',  v_t.status_bayar,
    'dibayar',       v_t.amount_paid,
    'sisa',          greatest(v_t.total - v_t.amount_paid, 0),
    'kembalian',     case when p_uang_diterima is null then 0
                          else greatest(p_uang_diterima - p_jumlah, 0) end
  );
end $$;


-- Menghapus baris pembayaran sama berbahayanya dengan menghapus tagihan,
-- hanya arahnya terbalik: uangnya sudah diterima dan struknya sudah
-- dicetak, lalu barisnya hilang sehingga tagihan tampak belum lunas dan
-- uang di laci tidak pernah dicari. Karena itu dibatasi ke admin.
create or replace function public.kasir_hapus_pembayaran(
  p_pembayaran_id uuid,
  p_alasan        text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p kasir_pembayaran%rowtype; v_t kasir_tagihan%rowtype;
begin
  if public.peran_teks_saya() <> 'admin' then
    raise exception 'Hanya admin yang boleh menghapus pembayaran yang sudah tercatat.'
      using errcode = '42501';
  end if;

  select * into v_p from kasir_pembayaran where id = p_pembayaran_id;
  if not found then raise exception 'Baris pembayaran tidak ditemukan.'; end if;

  insert into audit_log (user_id, user_nama, aksi, tabel, record_id, data_lama, keterangan)
  values (auth.uid(),
          (select nama from pegawai where id = auth.uid()),
          'DELETE', 'kasir_pembayaran', p_pembayaran_id::text,
          to_jsonb(v_p), coalesce(p_alasan, 'tanpa alasan'));

  delete from kasir_pembayaran where id = p_pembayaran_id;
  select * into v_t from kasir_tagihan where id = v_p.tagihan_id;

  return jsonb_build_object('tagihan_id', v_p.tagihan_id,
                            'status_bayar', v_t.status_bayar,
                            'dibayar', v_t.amount_paid);
end $$;


-- Membatalkan seluruh tagihan. Hanya boleh selama belum ada pembayaran.
create or replace function public.kasir_hapus_tagihan(p_tagihan_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_bayar numeric;
begin
  if not public.boleh_kasir() then
    raise exception 'Hanya kasir dan admin yang boleh menghapus tagihan.' using errcode = '42501';
  end if;
  select coalesce(sum(jumlah),0) into v_bayar
    from kasir_pembayaran where tagihan_id = p_tagihan_id;
  if v_bayar > 0 then
    raise exception 'Tagihan ini sudah menerima pembayaran dan tidak bisa dihapus.';
  end if;
  delete from kasir_tagihan where id = p_tagihan_id;
end $$;


-- =====================================================================
--  G. TEMPLATE INVOICE
-- =====================================================================

-- Satu baris berisi seluruh pengaturan tampilan invoice PDF dan struk
-- thermal. Bentuk isinya dijaga di sisi aplikasi oleh invoice_template.js
-- (BAWAAN + gabung + bersihkan), sehingga menambah pengaturan baru tidak
-- pernah butuh migrasi SQL: kunci yang belum ada di sini jatuh ke bawaan.
create table if not exists sys_template_invoice (
  id           smallint primary key default 1 check (id = 1),
  konfigurasi  jsonb not null default '{}'::jsonb,
  diubah_pada  timestamptz not null default now(),
  diubah_oleh  uuid references pegawai(id)
);

insert into sys_template_invoice (id, konfigurasi) values (1, '{}'::jsonb)
on conflict (id) do nothing;

create or replace function public.sentuh_template_invoice() returns trigger
language plpgsql as $$
begin
  new.diubah_pada := now();
  new.diubah_oleh := auth.uid();
  return new;
end $$;

drop trigger if exists trg_template_invoice on sys_template_invoice;
create trigger trg_template_invoice before update on sys_template_invoice
for each row execute function public.sentuh_template_invoice();


-- =====================================================================
--  H. VIEW
-- =====================================================================

-- H1. Kunjungan yang siap ditagih tapi belum punya tagihan.
create or replace view v_kasir_menunggu with (security_invoker = true) as
select k.id            as kunjungan_id,
       k.no_kunjungan,
       k.no_antrian,
       k.tanggal,
       k.cara_bayar,
       k.status        as status_kunjungan,
       p.id            as pasien_id,
       p.no_rm,
       p.nama          as nama_pasien,
       p.tanggal_lahir,
       p.jenis_kelamin,
       po.nama         as nama_poli,
       d.nama          as nama_dokter,
       (select count(*) from tindakan t where t.kunjungan_id = k.id)          as jumlah_tindakan,
       (select count(*) from apotek_transaksi at
         where at.kunjungan_id = k.id and at.jenis='KELUAR'
           and at.kategori='Resep Pasien' and not at.dibatalkan)              as jumlah_obat,
       exists (select 1 from resep r where r.kunjungan_id = k.id
                 and r.status <> 'DISERAHKAN')                                as resep_belum_diserahkan
  from kunjungan k
  join pasien p on p.id = k.pasien_id
  join poli po  on po.id = k.poli_id
  left join pegawai d on d.id = k.dokter_id
 where k.status not in ('BATAL')
   and not exists (select 1 from kasir_tagihan tg where tg.kunjungan_id = k.id);

-- H2. Tagihan lengkap dengan identitas pasien.
create or replace view v_kasir_tagihan with (security_invoker = true) as
select tg.*,
       greatest(tg.total - tg.amount_paid, 0)  as sisa,
       p.no_rm,
       p.nama            as nama_pasien,
       p.tanggal_lahir,
       p.no_hp,
       k.no_kunjungan,
       k.no_antrian,
       po.nama           as nama_poli,
       d.nama            as nama_dokter,
       pg.nama           as nama_kasir,
       (select count(*) from kasir_tagihan_item i where i.tagihan_id = tg.id) as jumlah_item
  from kasir_tagihan tg
  left join pasien p    on p.id  = tg.pasien_id
  left join kunjungan k on k.id  = tg.kunjungan_id
  left join poli po     on po.id = k.poli_id
  left join pegawai d   on d.id  = k.dokter_id
  left join pegawai pg  on pg.id = tg.dibuat_oleh;

-- H3. Rekap harian untuk tutup kas.
create or replace view v_kasir_rekap_harian with (security_invoker = true) as
select b.tanggal,
       b.metode,
       count(*)                as jumlah_transaksi,
       sum(b.jumlah)           as total
  from kasir_pembayaran b
 group by b.tanggal, b.metode;


-- =====================================================================
--  I. ROW LEVEL SECURITY
-- =====================================================================

-- Lihat catatan panjang soal GRANT di 08_apotek.sql §F.
grant select, insert, update, delete on
  kasir_tarif, kasir_tagihan, kasir_tagihan_item, kasir_pembayaran,
  sys_template_invoice to authenticated;
grant usage, select on sequence seq_no_tagihan to authenticated;

alter table kasir_tarif          enable row level security;
alter table kasir_tagihan        enable row level security;
alter table kasir_tagihan_item   enable row level security;
alter table kasir_pembayaran     enable row level security;
alter table sys_template_invoice enable row level security;

-- Tarif: semua staf boleh melihat (dokter perlu tahu biaya tindakan
-- sebelum menyarankannya), hanya admin yang mengubah.
drop policy if exists tarif_baca on kasir_tarif;
create policy tarif_baca on kasir_tarif for select
  to authenticated using (public.saya_staf());

drop policy if exists tarif_kelola on kasir_tarif;
create policy tarif_kelola on kasir_tarif for all
  to authenticated
  using (public.peran_teks_saya() = 'admin')
  with check (public.peran_teks_saya() = 'admin');

drop policy if exists tagihan_baca on kasir_tagihan;
create policy tagihan_baca on kasir_tagihan for select
  to authenticated using (public.saya_staf());

drop policy if exists tagihan_tulis on kasir_tagihan;
create policy tagihan_tulis on kasir_tagihan for all
  to authenticated
  using (public.boleh_kasir()) with check (public.boleh_kasir());

drop policy if exists titem_baca on kasir_tagihan_item;
create policy titem_baca on kasir_tagihan_item for select
  to authenticated using (public.saya_staf());

drop policy if exists titem_tulis on kasir_tagihan_item;
create policy titem_tulis on kasir_tagihan_item for all
  to authenticated
  using (public.boleh_kasir()) with check (public.boleh_kasir());

drop policy if exists bayar_baca on kasir_pembayaran;
create policy bayar_baca on kasir_pembayaran for select
  to authenticated using (public.saya_staf());

-- Menulis pembayaran lewat tangan tidak diizinkan, bahkan untuk kasir.
-- Satu-satunya jalan masuk adalah kasir_catat_pembayaran(), yang memeriksa
-- sisa tagihan dan uang yang diterima. Baris pembayaran yang bisa ditulis
-- langsung adalah baris yang bisa dikarang.
drop policy if exists bayar_tulis on kasir_pembayaran;
create policy bayar_tulis on kasir_pembayaran for all
  to authenticated
  using (public.peran_teks_saya() = 'admin')
  with check (public.peran_teks_saya() = 'admin');

-- Template: semua staf boleh membaca (halaman kasir memerlukannya untuk
-- mencetak), hanya admin yang mengubah.
drop policy if exists template_baca on sys_template_invoice;
create policy template_baca on sys_template_invoice for select
  to authenticated using (public.saya_staf());

drop policy if exists template_kelola on sys_template_invoice;
create policy template_kelola on sys_template_invoice for all
  to authenticated
  using (public.peran_teks_saya() = 'admin')
  with check (public.peran_teks_saya() = 'admin');

grant execute on function public.kasir_susun_dari_kunjungan(uuid)                            to authenticated;
grant execute on function public.kasir_catat_pembayaran(uuid,numeric,date,text,text,numeric) to authenticated;
grant execute on function public.kasir_hapus_pembayaran(uuid,text)                           to authenticated;
grant execute on function public.kasir_hapus_tagihan(uuid)                                   to authenticated;


-- =====================================================================
--  J. AUDIT
-- =====================================================================

drop trigger if exists trg_audit_tagihan on kasir_tagihan;
create trigger trg_audit_tagihan after insert or update or delete on kasir_tagihan
for each row execute function public.catat_audit();

drop trigger if exists trg_audit_bayar on kasir_pembayaran;
create trigger trg_audit_bayar after insert or update or delete on kasir_pembayaran
for each row execute function public.catat_audit();


-- =====================================================================
--  K. DATA AWAL
-- =====================================================================

-- Karcis dibuat NONAKTIF dan tidak otomatis. Menyalakannya adalah
-- keputusan klinik, bukan bawaan yang diam-diam menambah biaya ke setiap
-- tagihan begitu modul dipasang.
insert into kasir_tarif (jenis, kode, nama, tarif, otomatis, aktif, keterangan)
values ('LAYANAN', 'ADM', 'Karcis / Administrasi', 0, false, false,
        'Nyalakan lewat Master Tarif bila klinik menarik biaya administrasi. '
        'Saat otomatis dinyalakan, baris ini ikut di setiap tagihan baru.')
on conflict do nothing;

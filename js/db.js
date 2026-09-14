/* =====================================================================
   DB — satu-satunya tempat aplikasi berbicara dengan Supabase.
   Semua halaman memanggil fungsi di sini, bukan memanggil Supabase
   langsung, supaya mudah diubah saat digabung dengan portal klinik.
   ===================================================================== */
const DB = (() => {

  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  /* Profil pengguna yang sedang login, di-cache selama sesi */
  let _saya = null;
  let _faskes = null;

  /* --------------------------- Autentikasi ---------------------------- */
  async function masuk(email, sandi) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: sandi });
    if (error) throw error;
    return data;
  }
  async function keluar() { _saya = null; await sb.auth.signOut(); }
  async function sesi() { const { data } = await sb.auth.getSession(); return data.session; }

  async function saya(paksaMuat = false) {
    if (_saya && !paksaMuat) return _saya;
    const s = await sesi();
    if (!s) return null;
    const { data, error } = await sb.from('pegawai')
      .select('*, poli:poli_default(id,nama,kode)').eq('id', s.user.id).single();
    if (error) throw error;
    _saya = { ...data, email: s.user.email };
    return _saya;
  }

  const bolehTulis = (peranDiizinkan) =>
    _saya && (peranDiizinkan.includes(_saya.peran) || _saya.peran === 'master');

  /* --------------------------- Profil klinik --------------------------- */
  async function faskes(paksaMuat = false) {
    if (_faskes && !paksaMuat) return _faskes;
    const { data, error } = await sb.from('faskes').select('*').eq('id', 1).single();
    if (error) throw error;
    _faskes = data; return data;
  }
  async function simpanFaskes(patch) {
    const { data, error } = await sb.from('faskes').update(patch).eq('id', 1).select().single();
    if (error) throw error;
    _faskes = data; return data;
  }

  /* --------------------------- Master ---------------------------------- */
  async function daftarPoli(hanyaAktif = true) {
    let q = sb.from('poli').select('*').order('urutan');
    if (hanyaAktif) q = q.eq('aktif', true);
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function daftarDokter(jenis = null) {
    let q = sb.from('pegawai')
      .select('id,nama,peran,no_sip,kode_dokter_pcare,jenis_dokter')
      .eq('peran', 'dokter').eq('aktif', true).order('nama');
    const { data, error } = await q;
    if (error) throw error;
    if (!jenis) return data;
    // Dokter tanpa keterangan jenis tetap ditampilkan agar tidak ada yang hilang
    // hanya karena kolomnya belum diisi.
    return data.filter(d => !d.jenis_dokter || d.jenis_dokter === jenis);
  }
  async function daftarPegawai() {
    const { data, error } = await sb.from('pegawai').select('*').order('nama');
    if (error) throw error; return data;
  }

  /* ------------------------- Hak akses (9 Sep 2026) -------------------- */
  // Kode yang diizinkan untuk PERAN SENDIRI — dimuat sekali saat masuk
  // (lihat js/app.js -> mulai()), dipakai App.boleh(kode).
  async function hakAksesSaya() {
    const { data, error } = await sb.from('v_hak_akses_saya').select('kode');
    if (error) throw error;
    return data.map(r => r.kode);
  }
  // Matriks lengkap (semua peran x semua kode) — hanya master yang bisa
  // membacanya lewat RLS, dipakai halaman Pengaturan -> Hak Akses.
  async function daftarHakAkses() {
    const { data, error } = await sb.from('hak_akses').select('*');
    if (error) throw error; return data;
  }
  async function simpanHakAkses(kode, peran, diizinkan) {
    const { error } = await sb.from('hak_akses')
      .upsert({ kode, peran, diizinkan, diubah_oleh: _saya?.id, diubah_pada: new Date().toISOString() },
              { onConflict: 'kode,peran' });
    if (error) throw error;
  }
  async function cariIcd(kata, batas = 25) {
    if (!kata || kata.length < 2) {
      const { data, error } = await sb.from('icd10').select('kode,nama_id,nama_en')
        .eq('sering_dipakai', true).eq('aktif', true).order('nama_id').limit(60);
      if (error) throw error; return data;
    }
    const k = `%${kata}%`;
    const { data, error } = await sb.from('icd10').select('kode,nama_id,nama_en')
      .eq('aktif', true)
      .or(`kode.ilike.${k},nama_id.ilike.${k},nama_en.ilike.${k}`)
      .order('sering_dipakai', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }
  /* `kode_pcare` dan `dpho` WAJIB ikut terpilih. Keduanya yang menentukan
     obat ini dikirim ke PCare sebagai kdObat (obat DPHO) atau sebagai
     nmObatNonDPHO. Kalau lupa diminta, setiap obat yang diresepkan
     tercatat sebagai non-DPHO tanpa satu pun galat, dan klaim obat
     program tidak pernah terbayar. */
  async function cariObat(kata, batas = 25) {
    let q = sb.from('obat')
      .select('id,nama,satuan,bentuk_sediaan,kekuatan,kode_kfa,kode_pcare,dpho,golongan')
      .eq('aktif', true).order('nama').limit(batas);
    if (kata && kata.length >= 2) q = q.or(`nama.ilike.%${kata}%,nama_generik.ilike.%${kata}%`);
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  /* Untuk pencarian obat di Kasir (Tambah baris / Penjualan bebas) —
     beda dari cariObat() di atas karena kasir butuh HARGA JUAL dan STOK
     SAAT INI, bukan kode klaim BPJS. Dibaca dari v_apotek_stok, bukan
     tabel obat langsung, supaya kasir bisa melihat stok layaknya di
     Apotek tanpa pindah halaman — kolom yang sama, tempat yang sama
     dengan yang dipakai apotek.js. */
  async function cariObatJual(kata, batas = 25) {
    let q = sb.from('v_apotek_stok')
      .select('obat_id,nama_obat,satuan,bentuk_sediaan,kekuatan,golongan,harga_jual,stok_layak')
      .eq('aktif', true).order('nama_obat').limit(batas);
    if (kata && kata.trim().length >= 2) q = q.ilike('nama_obat', `%${kata.trim()}%`);
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function daftarSigna() {
    const { data, error } = await sb.from('signa').select('*').order('urutan');
    if (error) throw error; return data;
  }

  /* --------------------------- Pasien ---------------------------------- */
  async function cariPasien(kata, batas = 30) {
    let q = sb.from('pasien')
      .select('id,no_rm,nik,no_bpjs,nama,tanggal_lahir,jenis_kelamin,alamat,no_hp,catatan_penting')
      .eq('aktif', true).order('nama').limit(batas);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim();
      q = q.or(`nama.ilike.%${k}%,no_rm.ilike.%${k}%,nik.ilike.%${k}%,no_bpjs.ilike.%${k}%`);
    }
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function pasien(id) {
    const { data, error } = await sb.from('pasien').select('*').eq('id', id).single();
    if (error) throw error; return data;
  }
  async function simpanPasien(data, id = null) {
    const q = id
      ? sb.from('pasien').update(data).eq('id', id).select().single()
      : sb.from('pasien').insert(data).select().single();
    const { data: hasil, error } = await q;
    if (error) throw error; return hasil;
  }
  async function alergiPasien(pasienId) {
    const { data, error } = await sb.from('pasien_alergi').select('*')
      .eq('pasien_id', pasienId).order('dicatat_pada', { ascending: false });
    if (error) throw error; return data;
  }
  async function tambahAlergi(rec) {
    const { data, error } = await sb.from('pasien_alergi').insert(rec).select().single();
    if (error) throw error; return data;
  }
  async function hapusAlergi(id) {
    const { error } = await sb.from('pasien_alergi').delete().eq('id', id);
    if (error) throw error;
  }
  /* Catat siapa membuka rekam medis siapa — amanat audit trail */
  async function catatAkses(pasienId, keterangan) {
    try { await sb.rpc('catat_akses_rm', { p_pasien_id: pasienId, p_keterangan: keterangan || null }); }
    catch (e) { console.warn('Gagal mencatat akses:', e.message); }
  }

  /* --------------------------- Kunjungan -------------------------------- */
  async function antrianHariIni() {
    const { data, error } = await sb.from('v_antrian_hari_ini').select('*');
    if (error) throw error; return data;
  }
  async function daftarKunjungan(filter = {}) {
    let q = sb.from('v_riwayat_kunjungan').select('*').limit(filter.batas || 100);
    if (filter.pasien_id) q = q.eq('pasien_id', filter.pasien_id);
    if (filter.dari) q = q.gte('tanggal', filter.dari);
    if (filter.sampai) q = q.lte('tanggal', filter.sampai);
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function buatKunjungan(rec) {
    const { data, error } = await sb.from('kunjungan').insert(rec).select().single();
    if (error) throw error; return data;
  }
  /* `poli.jenis` WAJIB ikut terpilih di sini. Seluruh modul poli gigi —
     odontogram, pemeriksaan gigi & mulut, dan kolom nomor gigi pada daftar
     tindakan — dinyalakan oleh `kunjungan.poli.jenis === 'GIGI'` di
     pages/periksa.js dan pages/rekam.js. Kalau kolomnya tidak diminta,
     nilainya undefined, perbandingannya bernilai false, dan ketiga bagian itu
     hilang dari layar tanpa satu pun galat — halaman tetap tampil rapi,
     hanya saja poli gigi berubah jadi poli umum. Dijaga oleh
     test/uji_kolom_db.js. */
  async function kunjungan(id) {
    const { data, error } = await sb.from('kunjungan')
      .select(`*, pasien:pasien_id(*), poli:poli_id(id,nama,kode,jenis), dokter:dokter_id(id,nama,no_sip)`)
      .eq('id', id).single();
    if (error) throw error; return data;
  }
  async function ubahKunjungan(id, patch) {
    const { data, error } = await sb.from('kunjungan').update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  }

  /* --------------------------- Kajian awal ------------------------------ */
  async function kajian(kunjunganId) {
    const { data, error } = await sb.from('kajian_awal').select('*')
      .eq('kunjungan_id', kunjunganId).maybeSingle();
    if (error) throw error; return data;
  }
  async function simpanKajian(kunjunganId, rec) {
    const { data, error } = await sb.from('kajian_awal')
      .upsert({ ...rec, kunjungan_id: kunjunganId, dibuat_oleh: _saya?.id },
              { onConflict: 'kunjungan_id' }).select().single();
    if (error) throw error; return data;
  }

  /* --------------------------- Pemeriksaan (SOAP) ----------------------- */
  async function pemeriksaan(kunjunganId) {
    const { data, error } = await sb.from('pemeriksaan').select('*')
      .eq('kunjungan_id', kunjunganId).maybeSingle();
    if (error) throw error; return data;
  }
  async function simpanPemeriksaan(kunjunganId, rec) {
    const { data, error } = await sb.from('pemeriksaan')
      .upsert({ ...rec, kunjungan_id: kunjunganId, dibuat_oleh: _saya?.id },
              { onConflict: 'kunjungan_id' }).select().single();
    if (error) throw error; return data;
  }
  async function finalisasi(kunjunganId) {
    const { data, error } = await sb.from('pemeriksaan')
      .update({ final: true, final_pada: new Date().toISOString() })
      .eq('kunjungan_id', kunjunganId).select().single();
    if (error) throw error; return data;
  }
  async function tambahAddendum(kunjunganId, isi, alasan) {
    const { data, error } = await sb.from('addendum')
      .insert({ kunjungan_id: kunjunganId, isi, alasan, dibuat_oleh: _saya?.id })
      .select().single();
    if (error) throw error; return data;
  }
  async function daftarAddendum(kunjunganId) {
    const { data, error } = await sb.from('addendum')
      .select('*, penulis:dibuat_oleh(nama)').eq('kunjungan_id', kunjunganId)
      .order('dibuat_pada');
    if (error) throw error; return data;
  }

  /* --------------------------- Diagnosa --------------------------------- */
  async function diagnosa(kunjunganId) {
    const { data, error } = await sb.from('diagnosa').select('*')
      .eq('kunjungan_id', kunjunganId).order('jenis').order('urutan');
    if (error) throw error; return data;
  }
  async function simpanDiagnosa(kunjunganId, daftar) {
    // Ganti seluruh daftar diagnosa kunjungan ini (hapus lalu tulis ulang)
    const { error: e1 } = await sb.from('diagnosa').delete().eq('kunjungan_id', kunjunganId);
    if (e1) throw e1;
    if (!daftar.length) return [];
    const rows = daftar.map((d, i) => ({
      kunjungan_id: kunjunganId, kode_icd10: d.kode, nama: d.nama,
      jenis: d.jenis || (i === 0 ? 'PRIMER' : 'SEKUNDER'),
      kasus: d.kasus || 'BARU', urutan: i
    }));
    const { data, error } = await sb.from('diagnosa').insert(rows).select();
    if (error) throw error; return data;
  }

  /* --------------------------- Resep ------------------------------------ */
  async function resep(kunjunganId) {
    const { data, error } = await sb.from('resep')
      .select('*, item:resep_item(*)').eq('kunjungan_id', kunjunganId).maybeSingle();
    if (error) throw error;
    if (data && data.item) data.item.sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    return data;
  }
  async function simpanResep(kunjunganId, item, catatan = null, iterMaks = 0) {
    let r = await resep(kunjunganId);
    /* Resep yang SUDAH pernah diserahkan apoteker (iter_terpakai > 0) tidak
       boleh lagi diubah daftar/iter-nya dari layar dokter ini — lihat
       cabang di bawah. */
    if (!r) {
      const { data, error } = await sb.from('resep')
        .insert({ kunjungan_id: kunjunganId, catatan, dibuat_oleh: _saya?.id,
                  iter_maks: Math.max(0, Number(iterMaks) || 0) }).select().single();
      if (error) throw error; r = data;
    } else if (r.iter_terpakai) {
      /* Resep ini sudah pernah diserahkan apoteker (mungkin baru
         penyerahan pertama dari beberapa iter). Daftar butirnya sudah
         jadi dasar riwayat penyerahan (resep_penyerahan_item) — menghapus
         resep_item di sini akan ikut menghapus riwayat itu (referensinya
         ON DELETE CASCADE). Tolak mentah-mentah, jangan diam-diam
         mengabaikan sebagian perubahan dokter. */
      throw new Error('Resep ini sudah pernah diserahkan apoteker, daftar obatnya tidak '
        + 'bisa diubah lagi dari sini. Buat resep susulan untuk tambahan obat baru.');
    } else {
      const patch = { catatan, iter_maks: Math.max(0, Number(iterMaks) || 0) };
      await sb.from('resep').update(patch).eq('id', r.id);
      const { error } = await sb.from('resep_item').delete().eq('resep_id', r.id);
      if (error) throw error;
    }
    if (!item.length) return { ...r, item: [] };
    /* frekuensi & dosis = signa1 & signa2 milik PCare, kode_pcare &
       obat_dpho menentukan obat dikirim berkode atau bernama. Empat
       kolom ini disalin ke baris resep, bukan dibaca dari master saat
       pengiriman: master obat bisa berubah bertahun-tahun kemudian,
       sedangkan yang diklaim adalah obat yang diserahkan hari itu. */
    const rows = item.map((o, i) => ({
      resep_id: r.id, obat_id: o.obat_id || null, nama_obat: o.nama_obat,
      kode_kfa: o.kode_kfa || null, kode_pcare: o.kode_pcare || null,
      obat_dpho: !!o.obat_dpho,
      jumlah: o.jumlah, satuan: o.satuan,
      signa: o.signa, frekuensi: o.frekuensi || null, dosis: o.dosis || null,
      rute: o.rute || 'Oral', keterangan: o.keterangan || null, urutan: i
    }));
    const { data, error } = await sb.from('resep_item').insert(rows).select();
    if (error) throw error;
    return { ...r, item: data };
  }

  /* --------------------------- Rekam medis lengkap ---------------------- */
  async function rekamMedisLengkap(kunjunganId) {
    const [k, ka, pm, dg, rs, ad, pg, td] = await Promise.all([
      kunjungan(kunjunganId), kajian(kunjunganId), pemeriksaan(kunjunganId),
      diagnosa(kunjunganId), resep(kunjunganId), daftarAddendum(kunjunganId),
      pemeriksaanGigi(kunjunganId), tindakan(kunjunganId)
    ]);
    return { kunjungan: k, kajian: ka, pemeriksaan: pm, diagnosa: dg, resep: rs,
             addendum: ad, gigi: pg, tindakan: td };
  }

  /* --------------------------- Statistik -------------------------------- */
  async function statistikHariIni() {
    const hari = UI.hariIni();
    const [total, selesai, pasienTotal] = await Promise.all([
      sb.from('kunjungan').select('id', { count: 'exact', head: true }).eq('tanggal', hari),
      sb.from('kunjungan').select('id', { count: 'exact', head: true }).eq('tanggal', hari).eq('status', 'SELESAI'),
      sb.from('pasien').select('id', { count: 'exact', head: true }).eq('aktif', true)
    ]);
    return {
      kunjungan_hari_ini: total.count || 0,
      selesai_hari_ini: selesai.count || 0,
      dalam_antrian: (total.count || 0) - (selesai.count || 0),
      total_pasien: pasienTotal.count || 0
    };
  }
  async function diagnosaTeratas(dari, sampai, batas = 10) {
    const { data, error } = await sb.from('diagnosa')
      .select('kode_icd10, nama, kunjungan!inner(tanggal)')
      .gte('kunjungan.tanggal', dari).lte('kunjungan.tanggal', sampai);
    if (error) throw error;
    const hitung = {};
    (data || []).forEach(d => {
      const k = d.kode_icd10;
      if (!hitung[k]) hitung[k] = { kode: k, nama: d.nama, jml: 0 };
      hitung[k].jml++;
    });
    return Object.values(hitung).sort((a, b) => b.jml - a.jml).slice(0, batas);
  }


  /* ========================= POLI GIGI ============================== */

  let _refGigi = null, _refKondisi = null, _refBidang = null;

  async function refGigi() {
    if (_refGigi) return _refGigi;
    const { data, error } = await sb.from('ref_gigi').select('*').order('kuadran').order('posisi');
    if (error) throw error;
    _refGigi = data; return data;
  }
  async function refKondisiGigi() {
    if (_refKondisi) return _refKondisi;
    const { data, error } = await sb.from('ref_kondisi_gigi').select('*')
      .eq('aktif', true).order('urutan');
    if (error) throw error;
    _refKondisi = data; return data;
  }
  async function refBidangGigi() {
    if (_refBidang) return _refBidang;
    const { data, error } = await sb.from('ref_bidang_gigi').select('*').order('urutan');
    if (error) throw error;
    _refBidang = data; return data;
  }

  /* Keadaan gigi pasien saat ini, dalam bentuk { "36": {kondisi, bidang, catatan} } */
  async function odontogram(pasienId) {
    const { data, error } = await sb.from('odontogram')
      .select('fdi,kondisi,bidang,catatan').eq('pasien_id', pasienId);
    if (error) throw error;
    const hasil = {};
    (data || []).forEach(r => {
      hasil[r.fdi] = { kondisi: r.kondisi, bidang: r.bidang || {}, catatan: r.catatan };
    });
    return hasil;
  }

  /* Odontogram sebagaimana keadaannya pada satu kunjungan di masa lalu.
     Dihitung dengan membatalkan semua perubahan yang terjadi setelah kunjungan itu,
     sehingga rekam medis lama tetap menggambarkan apa yang dilihat dokter saat itu. */
  async function odontogramPadaKunjungan(pasienId, kunjunganId, batasWaktu) {
    const sekarang = await odontogram(pasienId);
    if (!batasWaktu) return sekarang;

    const { data, error } = await sb.from('odontogram_riwayat')
      .select('fdi,kondisi_lama,bidang_lama,kondisi_baru,bidang_baru,waktu')
      .eq('pasien_id', pasienId)
      .gt('waktu', batasWaktu)
      .order('waktu', { ascending: false });
    if (error) throw error;

    const hasil = JSON.parse(JSON.stringify(sekarang));
    (data || []).forEach(r => {
      const adaSebelumnya = r.kondisi_lama !== null || (r.bidang_lama && Object.keys(r.bidang_lama).length);
      if (adaSebelumnya) {
        hasil[r.fdi] = { kondisi: r.kondisi_lama, bidang: r.bidang_lama || {},
                         catatan: hasil[r.fdi] ? hasil[r.fdi].catatan : null };
      } else {
        delete hasil[r.fdi];
      }
    });
    return hasil;
  }

  /* Menyimpan odontogram: hanya gigi yang berubah yang disentuh, supaya
     riwayat perubahan tidak dipenuhi baris palsu. */
  async function simpanOdontogram(pasienId, kunjunganId, baru) {
    const lama = await odontogram(pasienId);
    const sama = (a, b) =>
      (a?.kondisi ?? null) === (b?.kondisi ?? null) &&
      JSON.stringify(a?.bidang ?? {}) === JSON.stringify(b?.bidang ?? {}) &&
      (a?.catatan ?? null) === (b?.catatan ?? null);

    const untukSimpan = [];
    Object.entries(baru).forEach(([fdi, d]) => {
      if (!sama(lama[fdi], d)) {
        untukSimpan.push({
          pasien_id: pasienId, fdi,
          kondisi: d.kondisi || null,
          bidang: d.bidang || {},
          catatan: d.catatan || null,
          kunjungan_id: kunjunganId,
          diperbarui_pada: new Date().toISOString(),
          diperbarui_oleh: _saya?.id
        });
      }
    });
    const untukHapus = Object.keys(lama).filter(fdi => !baru[fdi]);

    if (untukSimpan.length) {
      const { error } = await sb.from('odontogram')
        .upsert(untukSimpan, { onConflict: 'pasien_id,fdi' });
      if (error) throw error;
    }
    if (untukHapus.length) {
      const { error } = await sb.from('odontogram')
        .delete().eq('pasien_id', pasienId).in('fdi', untukHapus);
      if (error) throw error;
    }
    return { diperbarui: untukSimpan.length, dihapus: untukHapus.length };
  }

  async function riwayatOdontogram(pasienId, batas = 60) {
    const { data, error } = await sb.from('odontogram_riwayat')
      .select('*, kunjungan:kunjungan_id(no_kunjungan,tanggal)')
      .eq('pasien_id', pasienId).order('waktu', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }

  /* Pemeriksaan gigi (ekstra oral, intra oral, indeks) */
  async function pemeriksaanGigi(kunjunganId) {
    const { data, error } = await sb.from('pemeriksaan_gigi').select('*')
      .eq('kunjungan_id', kunjunganId).maybeSingle();
    if (error) throw error; return data;
  }
  async function simpanPemeriksaanGigi(kunjunganId, rec) {
    const { data, error } = await sb.from('pemeriksaan_gigi')
      .upsert({ ...rec, kunjungan_id: kunjunganId, dibuat_oleh: _saya?.id },
              { onConflict: 'kunjungan_id' }).select().single();
    if (error) throw error; return data;
  }

  /* Tindakan (ICD-9-CM) */
  async function cariIcd9(kata, kategori = null, batas = 25) {
    let q = sb.from('icd9cm').select('kode,nama_id,nama_en,kategori,per_gigi,kode_pcare')
      .eq('aktif', true).limit(batas);
    if (kata && kata.length >= 2) {
      const k = `%${kata}%`;
      q = q.or(`kode.ilike.${k},nama_id.ilike.${k},nama_en.ilike.${k}`);
    } else {
      q = q.eq('sering_dipakai', true);
    }
    if (kategori) q = q.in('kategori', Array.isArray(kategori) ? kategori : [kategori]);
    const { data, error } = await q.order('sering_dipakai', { ascending: false }).order('kode');
    if (error) throw error; return data;
  }
  async function tindakan(kunjunganId) {
    const { data, error } = await sb.from('tindakan')
      .select('*, ref:kode_icd9(per_gigi,kategori)')
      .eq('kunjungan_id', kunjunganId).order('urutan');
    if (error) throw error; return data;
  }
  async function simpanTindakan(kunjunganId, daftar) {
    const { error: e1 } = await sb.from('tindakan').delete().eq('kunjungan_id', kunjunganId);
    if (e1) throw e1;
    if (!daftar.length) return [];
    const rows = daftar.map((t, i) => ({
      kunjungan_id: kunjunganId, kode_icd9: t.kode, nama: t.nama,
      kode_pcare: t.kode_pcare || null,
      fdi: t.fdi || null, jumlah: t.jumlah || 1, catatan: t.catatan || null,
      dilakukan_oleh: _saya?.id, urutan: i
    }));
    const { data, error } = await sb.from('tindakan').insert(rows).select();
    if (error) throw error; return data;
  }

  async function tindakanTeratas(dari, sampai, batas = 12) {
    const { data, error } = await sb.from('tindakan')
      .select('kode_icd9, nama, kunjungan!inner(tanggal)')
      .gte('kunjungan.tanggal', dari).lte('kunjungan.tanggal', sampai);
    if (error) throw error;
    const hitung = {};
    (data || []).forEach(t => {
      if (!hitung[t.kode_icd9]) hitung[t.kode_icd9] = { kode: t.kode_icd9, nama: t.nama, jml: 0 };
      hitung[t.kode_icd9].jml++;
    });
    return Object.values(hitung).sort((a, b) => b.jml - a.jml).slice(0, batas);
  }


  /* ===================== MASTER DATA (pengelolaan admin) ============== */

  let _refKesadaran = null, _refStatusPulang = null;

  async function refKesadaran() {
    if (_refKesadaran) return _refKesadaran;
    const { data, error } = await sb.from('ref_kesadaran').select('*')
      .eq('aktif', true).order('urutan');
    if (error) throw error;
    _refKesadaran = data; return data;
  }
  async function refStatusPulang() {
    if (_refStatusPulang) return _refStatusPulang;
    const { data, error } = await sb.from('ref_status_pulang').select('*')
      .eq('aktif', true).order('urutan');
    if (error) throw error;
    _refStatusPulang = data; return data;
  }

  /* --------------------- Rujukan pemeriksaan terstruktur ---------------
     Semua di-cache karena isinya puluhan baris yang tidak berubah selama
     sesi, sementara halaman pemeriksaan memuat tujuh tabel sekaligus.

     PERHATIKAN kolom yang diminta. `ref_sistem_fisik.normal_teks` dan
     `temuan_lazim` bukan hiasan: kalimat normal itulah yang masuk rekam
     medis dan yang dikirim ke SatuSehat. Kalau lupa diminta di sini,
     tombol "dalam batas normal" tetap bisa ditekan dan rekam medisnya
     keluar kosong tanpa satu pun galat — kelas kesalahan yang sama
     dengan hilangnya poli.jenis dulu. Dijaga test/uji_kolom_db.js. */
  const _ref = {};
  function refCache(nama, tabel, kolom, urut = 'urutan') {
    return async () => {
      if (_ref[nama]) return _ref[nama];
      const { data, error } = await sb.from(tabel).select(kolom)
        .eq('aktif', true).order(urut);
      if (error) throw error;
      _ref[nama] = data; return data;
    };
  }

  const refPrognosa     = refCache('prognosa', 'ref_prognosa',
                            'kode,nama,keterangan,kode_pcare,urutan');
  const refTacc         = refCache('tacc', 'ref_tacc',
                            'kode,nama,keterangan,kode_pcare,perlu_alasan,urutan');
  const refSubspesialis = refCache('subspesialis', 'ref_subspesialis',
                            'kode,nama,kode_pcare,urutan');
  const refSarana       = refCache('sarana', 'ref_sarana',
                            'kode,nama,kode_pcare,urutan');
  const refAlergi       = refCache('alergi', 'ref_alergi',
                            'id,jenis,kode,nama,kode_pcare,urutan');
  const refPpk          = refCache('ppk', 'ref_ppk',
                            'kode,nama,jenis,alamat,telepon,sumber,urutan', 'nama');

  async function refSistemFisik(poliJenis = null) {
    const kunci = 'sistem_' + (poliJenis || 'semua');
    if (_ref[kunci]) return _ref[kunci];
    const { data, error } = await sb.from('ref_sistem_fisik')
      .select('kode,nama,normal_teks,temuan_lazim,kode_loinc,kode_snomed,'
            + 'poli_jenis,bawaan_periksa,urutan')
      .eq('aktif', true).order('urutan');
    if (error) throw error;
    /* Sistem tanpa poli_jenis berlaku di semua poli; yang bertanda hanya
       muncul di poli itu. Disaring di sini, bukan di SQL, supaya satu
       permintaan cukup untuk poli mana pun. */
    const hasil = (data || []).filter(s => !s.poli_jenis || s.poli_jenis === poliJenis);
    _ref[kunci] = hasil; return hasil;
  }

  /* ref_vital tidak punya kolom `aktif`; refCache tidak bisa dipakai. */
  async function refVitalSemua() {
    if (_ref.vital_semua) return _ref.vital_semua;
    const { data, error } = await sb.from('ref_vital')
      .select('kode,nama,satuan,satuan_ucum,kode_loinc,urutan').order('urutan');
    if (error) throw error;
    _ref.vital_semua = data; return data;
  }

  /* Alergi berkode pasien: satu baris per jenis (MAKANAN, UDARA, OBAT),
     karena PCare hanya menerima satu kode per jenis. */
  async function alergiKode(pasienId) {
    const { data, error } = await sb.from('pasien_alergi')
      .select('id,jenis,nama,reaksi,tingkat,ref_alergi_id,dicatat_pada')
      .eq('pasien_id', pasienId).not('ref_alergi_id', 'is', null)
      .order('dicatat_pada', { ascending: false });
    if (error) throw error;
    const per = {};
    (data || []).forEach(a => { if (!per[a.jenis]) per[a.jenis] = a; });
    return per;
  }

  /* Mengganti alergi berkode satu jenis. Baris alergi lama yang diketik
     bebas TIDAK dihapus — itu catatan medis, bukan sampah. */
  async function setAlergiKode(pasienId, jenis, refAlergiId, nama, catatan) {
    const { error: e1 } = await sb.from('pasien_alergi').delete()
      .eq('pasien_id', pasienId).eq('jenis', jenis).not('ref_alergi_id', 'is', null);
    if (e1) throw e1;
    if (!refAlergiId) return null;
    const { data, error } = await sb.from('pasien_alergi').insert({
      pasien_id: pasienId, jenis, nama: nama || jenis,
      reaksi: catatan || null, ref_alergi_id: refAlergiId,
      dicatat_oleh: _saya?.id
    }).select().single();
    if (error) throw error; return data;
  }

  /* Pratinjau payload PCare langsung dari database — inilah yang benar-
     benar akan dikirim nanti, bukan susunan ulang di peramban. */
  async function pcarePratinjau(kunjunganId) {
    const [k, o, t] = await Promise.all([
      sb.from('v_pcare_kunjungan').select('*').eq('kunjungan_id', kunjunganId).maybeSingle(),
      sb.from('v_pcare_obat').select('*').eq('kunjungan_id', kunjunganId),
      sb.from('v_pcare_tindakan').select('*').eq('kunjungan_id', kunjunganId)
    ]);
    if (k.error) throw k.error;
    return { kunjungan: k.data, obat: o.data || [], tindakan: t.data || [] };
  }

  async function observasiSatuSehat(kunjunganId) {
    const { data, error } = await sb.from('v_satusehat_observasi').select('*')
      .eq('kunjungan_id', kunjunganId).order('kelompok').order('urutan');
    if (error) throw error; return data;
  }

  async function kesiapanKode() {
    const { data, error } = await sb.from('v_kesiapan_kode').select('*');
    if (error) throw error; return data;
  }

  async function simpanPpk(rec) {
    const { data, error } = await sb.from('ref_ppk')
      .upsert({ ...rec, updated_at: new Date().toISOString() }, { onConflict: 'kode' })
      .select().single();
    if (error) throw error;
    delete _ref.ppk;                      // daftar berubah, cache tidak boleh basi
    return data;
  }

  /* Mengisi kolom kode_pcare (atau kode_loinc untuk sistem pemeriksaan
     fisik) pada tabel rujukan. Nama tabel TIDAK diambil mentah dari
     pemanggil: daftar putih di bawah yang menentukan, supaya satu nilai
     yang salah dari layar tidak bisa menulis ke tabel mana pun. */
  const TABEL_KODE = {
    ref_kesadaran: 'kode_pcare', ref_status_pulang: 'kode_pcare',
    ref_prognosa: 'kode_pcare', ref_subspesialis: 'kode_pcare',
    ref_sarana: 'kode_pcare', ref_alergi: 'kode_pcare',
    ref_sistem_fisik: 'kode_loinc'
  };

  async function simpanPemetaanKode(daftar) {
    for (const it of daftar) {
      const kolom = TABEL_KODE[it.tabel];
      if (!kolom) throw new Error(`Tabel "${it.tabel}" tidak boleh diubah dari sini.`);
      const { error } = await sb.from(it.tabel)
        .update({ [kolom]: it.nilai }).eq('kode', it.kode);
      if (error) throw error;
    }
    /* Seluruh cache rujukan dibuang: yang dipakai halaman pemeriksaan
       adalah salinan lama yang kodenya masih kosong. */
    Object.keys(_ref).forEach(k => delete _ref[k]);
    _refKesadaran = null; _refStatusPulang = null;
    return daftar.length;
  }

  /* --- Obat --- */
  async function daftarObat(kata = '', ikutNonaktif = false, batas = 300) {
    let q = sb.from('obat').select('*').order('nama').limit(batas);
    if (!ikutNonaktif) q = q.eq('aktif', true);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim();
      q = q.or(`nama.ilike.%${k}%,nama_generik.ilike.%${k}%,kode_internal.ilike.%${k}%,kode_kfa.ilike.%${k}%`);
    }
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function simpanObat(rec, id = null) {
    const q = id ? sb.from('obat').update(rec).eq('id', id).select().single()
                 : sb.from('obat').insert(rec).select().single();
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  /* Impor massal. Baris dicocokkan dengan kode_internal supaya bisa dijalankan
     berulang tanpa menggandakan data. */
  async function imporObat(baris) {
    if (!baris.length) return { jumlah: 0 };
    const { data, error } = await sb.from('obat')
      .upsert(baris, { onConflict: 'kode_internal' }).select('id');
    if (error) throw error;
    return { jumlah: data.length };
  }
  /* Hapus permanen. Obat yang sudah pernah dipakai di resep atau punya
     riwayat stok apotek DITOLAK oleh constraint foreign key di database —
     bukan dihapus paksa. Untuk obat semacam itu, nonaktifkan saja. */
  async function hapusObat(id) {
    const { error } = await sb.from('obat').delete().eq('id', id);
    if (error) throw error;
  }

  /* --- ICD-10 --- */
  async function daftarIcd10(kata = '', hanyaFavorit = false, batas = 200) {
    let q = sb.from('icd10').select('*').order('kode').limit(batas);
    if (hanyaFavorit) q = q.eq('sering_dipakai', true);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim();
      q = q.or(`kode.ilike.%${k}%,nama_id.ilike.%${k}%,nama_en.ilike.%${k}%`);
    }
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function simpanIcd10(rec, kode = null) {
    const q = kode ? sb.from('icd10').update(rec).eq('kode', kode).select().single()
                   : sb.from('icd10').insert(rec).select().single();
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  /* Hapus permanen. Ditolak database bila kode ini masih dipakai sebagai
     diagnosa pada suatu kunjungan. */
  async function hapusIcd10(kode) {
    const { error } = await sb.from('icd10').delete().eq('kode', kode);
    if (error) throw error;
  }
  /* Impor massal. Baris dicocokkan dengan `kode` — di tabel icd10, kode ITU
     SENDIRI adalah primary key (beda dari Obat yang punya kode_internal
     terpisah) — jadi impor yang sama bisa dijalankan berulang untuk
     memperbarui data atau menambah revisi baru tanpa menggandakannya.

     Dikirim per kelompok, bukan sekali kirim semuanya: berkas berisi
     ribuan baris (mis. impor awal ICD-10 lengkap) membuat satu perintah
     upsert tunggal kena "statement timeout" di Supabase. Kalau satu
     kelompok gagal, kelompok-kelompok sebelumnya SUDAH tersimpan —
     mengulang impor dari berkas yang sama aman, baris yang sudah masuk
     tidak akan dobel. onProgress, kalau diisi, dipanggil setelah tiap
     kelompok selesai supaya layar bisa menunjukkan kemajuannya. */
  async function imporIcd10(baris, onProgress = null) {
    if (!baris.length) return { jumlah: 0 };
    const UKURAN_KELOMPOK = 500;
    let jumlah = 0;
    for (let i = 0; i < baris.length; i += UKURAN_KELOMPOK) {
      const kelompok = baris.slice(i, i + UKURAN_KELOMPOK);
      const { data, error } = await sb.from('icd10')
        .upsert(kelompok, { onConflict: 'kode' }).select('kode');
      if (error) {
        error.message = `Berhenti setelah ${jumlah} dari ${baris.length} baris `
          + `(gagal pada kelompok baris ${i + 1}\u2013${Math.min(i + UKURAN_KELOMPOK, baris.length)}): `
          + error.message;
        throw error;
      }
      jumlah += data.length;
      if (onProgress) onProgress(jumlah, baris.length);
    }
    return { jumlah };
  }

  /* --- ICD-9-CM --- */
  async function daftarIcd9(kata = '', kategori = null, batas = 200) {
    let q = sb.from('icd9cm').select('*').order('kode').limit(batas);
    if (kategori) q = q.eq('kategori', kategori);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim();
      q = q.or(`kode.ilike.%${k}%,nama_id.ilike.%${k}%,nama_en.ilike.%${k}%`);
    }
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function simpanIcd9(rec, kode = null) {
    const q = kode ? sb.from('icd9cm').update(rec).eq('kode', kode).select().single()
                   : sb.from('icd9cm').insert(rec).select().single();
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  /* Hapus permanen. Ditolak database bila kode ini masih dipakai sebagai
     tindakan pada suatu kunjungan atau tarif kasir. */
  async function hapusIcd9(kode) {
    const { error } = await sb.from('icd9cm').delete().eq('kode', kode);
    if (error) throw error;
  }

  /* ===================== KESIAPAN DATA BRIDGING ====================== */

  /* Pasien yang datanya belum lengkap untuk bridging. Dipanggil juga oleh
     halaman pasien untuk menandai satu pasien saja. */
  async function kesiapanPasien({ hanyaKurang = true, pasienId = null, batas = 500 } = {}) {
    let q = sb.from('v_kesiapan_pasien').select('*').limit(batas);
    if (pasienId) q = q.eq('id', pasienId);
    const { data, error } = await q;
    if (error) throw error;
    const hasil = (data || []).map(r => ({ ...r, kekurangan: r.kekurangan || [] }));
    return hanyaKurang ? hasil.filter(r => r.kekurangan.length) : hasil;
  }

  async function kesiapanKunjungan({ hanyaKurang = true, batas = 500 } = {}) {
    const { data, error } = await sb.from('v_kesiapan_kunjungan').select('*')
      .order('tanggal', { ascending: false }).limit(batas);
    if (error) throw error;
    const hasil = (data || []).map(r => ({ ...r, kekurangan: r.kekurangan || [] }));
    return hanyaKurang ? hasil.filter(r => r.kekurangan.length) : hasil;
  }

  /* Ringkasan untuk halaman Pengaturan → Bridging */
  async function ringkasanKesiapan() {
    const [pasien, kunjungan] = await Promise.all([
      kesiapanPasien({ hanyaKurang: false, batas: 2000 }),
      kesiapanKunjungan({ hanyaKurang: false, batas: 2000 })
    ]);
    return {
      pasien_total: pasien.length,
      pasien_kurang: pasien.filter(p => p.kekurangan.length).length,
      kunjungan_total: kunjungan.length,
      kunjungan_kurang: kunjungan.filter(k => k.kekurangan.length).length
    };
  }

  /* ========================= APOTEK ================================== */

  /* PostgREST memulangkan paling banyak 1.000 baris per permintaan dan
     TIDAK memberi tanda apa pun kalau sisanya dipotong: yang kembali cuma
     array pendek yang kelihatan wajar. Selama riwayat apotek masih di
     bawah seribu baris tidak ada yang terasa, lalu suatu hari laporan
     bulan-bulan lama menyusut diam-diam.

     Urutan diberi pemutus seri (id) supaya batas antar-halaman tidak
     menggeser baris: satu penyerahan yang terpecah FEFO ke beberapa batch
     ditulis dalam satu perintah, jadi tanggal DAN created_at-nya kembar,
     dan untuk baris kembar Postgres tidak menjamin urutan yang sama antar
     permintaan. Tanpa pemutus seri, satu baris bisa terbawa dua kali atau
     terlewat sama sekali tepat di batas halaman. */
  const UKURAN_HALAMAN = 1000;

  async function ambilSemua(buatQuery) {
    let semua = [];
    for (let mulai = 0; ; mulai += UKURAN_HALAMAN) {
      const { data, error } = await buatQuery().range(mulai, mulai + UKURAN_HALAMAN - 1);
      if (error) throw error;
      semua = semua.concat(data || []);
      if (!data || data.length < UKURAN_HALAMAN) return semua;
    }
  }

  async function apotekBatch({ hanyaAda = false } = {}) {
    return await ambilSemua(() => {
      let q = sb.from('v_apotek_batch').select('*')
        .order('nama_obat').order('tgl_expired').order('id');
      if (hanyaAda) q = q.gt('stok_sisa', 0);
      return q;
    });
  }

  async function apotekStok({ hanyaAda = false } = {}) {
    let q = sb.from('v_apotek_stok').select('*').order('nama_obat');
    if (hanyaAda) q = q.gt('stok_total', 0);
    const { data, error } = await q;
    if (error) throw error; return data;
  }

  /* Riwayat transaksi. `dari` membatasi seberapa jauh ke belakang; tanpa
     itu seluruh riwayat klinik ikut terunduh setiap kali halaman dibuka. */
  async function apotekTransaksi({ dari = null, sampai = null, obatId = null,
                                   kunjunganId = null } = {}) {
    return await ambilSemua(() => {
      let q = sb.from('apotek_transaksi').select('*')
        .order('tanggal', { ascending: false })
        .order('id', { ascending: false });
      if (dari)        q = q.gte('tanggal', dari);
      if (sampai)      q = q.lte('tanggal', sampai);
      if (obatId)      q = q.eq('obat_id', obatId);
      if (kunjunganId) q = q.eq('kunjungan_id', kunjunganId);
      return q;
    });
  }

  async function apotekMasuk(r) {
    const { data, error } = await sb.rpc('apotek_masuk', {
      p_obat_id: r.obat_id, p_jumlah: r.jumlah, p_harga_beli: r.harga_beli,
      p_tgl_expired: r.tgl_expired, p_pbf: r.pbf,
      p_no_faktur: r.no_faktur || null, p_tgl_masuk: r.tgl_masuk || null,
      p_no_batch: r.no_batch || null, p_keterangan: r.keterangan || null,
      p_kolam: r.kolam || 'reguler'
    });
    if (error) throw error; return data;
  }

  /* `kolam` di sini adalah PREFERENSI, bukan syarat — lihat catatan di
     17_apotek_kolam.sql. Kosongkan untuk FEFO polos seperti sebelum kolam
     ada; database tetap boleh menyeberang kolam kalau yang disukai habis. */
  async function apotekKeluar(r) {
    const { data, error } = await sb.rpc('apotek_keluar', {
      p_obat_id: r.obat_id, p_jumlah: r.jumlah,
      p_kategori: r.kategori || 'Penjualan Bebas',
      p_tanggal: r.tanggal || null,
      p_kunjungan_id: r.kunjungan_id || null,
      p_resep_item_id: r.resep_item_id || null,
      p_batch_id: r.batch_id || null,
      p_keterangan: r.keterangan || null,
      p_kolam_disukai: r.kolam || null
    });
    if (error) throw error; return data;
  }

  async function apotekBatalkanGrup(grupId, alasan = null) {
    const { data, error } = await sb.rpc('apotek_batalkan_grup',
      { p_grup_id: grupId, p_alasan: alasan });
    if (error) throw error; return data;
  }

  async function apotekSerahkanResep(resepId, item, tanggal = null, catatan = null) {
    const { data, error } = await sb.rpc('apotek_serahkan_resep', {
      p_resep_id: resepId, p_item: item,
      p_tanggal: tanggal || null, p_catatan: catatan || null
    });
    if (error) throw error; return data;
  }

  /* Batch diubah langsung, bukan lewat RPC: perubahan identitas batch
     (faktur salah ketik, PBF tertukar) tidak menyentuh stok sama sekali.
     Yang menyentuh stok hanya fungsi di 08_apotek.sql. */
  async function simpanBatch(id, patch) {
    const { data, error } = await sb.from('apotek_batch')
      .update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  }

  /* Seluruh master obat untuk mencocokkan berkas impor — termasuk yang
     nonaktif, supaya obat yang pernah dinonaktifkan tidak lahir kembali
     sebagai duplikat lewat impor. Diambil bertahap karena PostgREST
     memotong di 1.000 baris tanpa memberi tanda apa pun. */
  async function obatUntukPencocokan() {
    return await ambilSemua(() =>
      sb.from('v_obat_pencocokan').select('*').order('nama').order('id'));
  }

  /* Seluruh berkas diproses dalam satu transaksi di database. Impor 80
     baris yang gagal di baris ke-63 tidak menyisakan 62 batch — apoteker
     tidak punya cara tahu di mana ia berhenti, dan mengulang dari awal
     akan menggandakan stok. */
  async function apotekImpor(baris, jenis) {
    const { data, error } = await sb.rpc('apotek_impor',
      { p_baris: baris, p_jenis: jenis || 'Pembelian' });
    if (error) throw error;
    return data;
  }

  async function antreanFarmasi({ tanggal = null, semua = false } = {}) {
    let q = sb.from('v_antrean_farmasi').select('*')
      .order('tanggal', { ascending: false }).order('no_antrian');
    if (tanggal) q = q.eq('tanggal', tanggal);
    if (!semua)  q = q.neq('status', 'DISERAHKAN');
    const { data, error } = await q.limit(300);
    if (error) throw error; return data;
  }

  /* Resep lengkap untuk layar penyerahan: butir + stok tiap obatnya, agar
     apoteker melihat "resep 30, stok 12" sebelum menekan apa pun. */
  async function resepUntukFarmasi(resepId) {
    const { data, error } = await sb.from('resep')
      .select(`*, item:resep_item(*),
               kunjungan:kunjungan_id(id,no_kunjungan,tanggal,cara_bayar,no_antrian,
                                      pasien:pasien_id(id,no_rm,nama,alamat,tanggal_lahir,jenis_kelamin),
                                      poli:poli_id(nama),
                                      dokter:dokter_id(nama,no_sip)),
               penulis:dibuat_oleh(nama),
               penyerahan:resep_penyerahan(*, item:resep_penyerahan_item(*),
                                           apoteker:apoteker_id(nama,no_sip))`)
      .eq('id', resepId).single();
    if (error) throw error;
    if (data.item) data.item.sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    if (data.penyerahan) data.penyerahan.sort((a, b) => (a.ke_berapa || 0) - (b.ke_berapa || 0));

    const ids = [...new Set((data.item || []).map(i => i.obat_id).filter(Boolean))];
    if (ids.length) {
      const { data: stok, error: e2 } = await sb.from('v_apotek_stok')
        .select('obat_id,stok_total,stok_layak,expired_terdekat,harga_jual')
        .in('obat_id', ids);
      if (e2) throw e2;
      const peta = Object.fromEntries((stok || []).map(s => [s.obat_id, s]));
      data.item.forEach(i => { i.stok = peta[i.obat_id] || null; });
    }
    return data;
  }

  /* Batch yang layak untuk satu obat, sudah urut FEFO. Dipakai layar
     "pilih batch tertentu" dan pratinjau pemotongan. */
  async function batchObat(obatId) {
    const { data, error } = await sb.from('v_apotek_batch').select('*')
      .eq('obat_id', obatId).gt('stok_sisa', 0)
      .order('tgl_expired').order('tgl_masuk').order('id');
    if (error) throw error; return data;
  }


  /* ========================= KASIR ================================== */

  async function kasirMenunggu({ tanggal = null } = {}) {
    let q = sb.from('v_kasir_menunggu').select('*')
      .order('tanggal', { ascending: false }).order('no_antrian');
    if (tanggal) q = q.eq('tanggal', tanggal);
    const { data, error } = await q.limit(300);
    if (error) throw error; return data;
  }

  async function kasirDaftarTagihan({ dari = null, sampai = null, status = null,
                                      pasienId = null, batas = 300 } = {}) {
    let q = sb.from('v_kasir_tagihan').select('*')
      .order('tanggal', { ascending: false }).order('created_at', { ascending: false })
      .limit(batas);
    if (dari)     q = q.gte('tanggal', dari);
    if (sampai)   q = q.lte('tanggal', sampai);
    if (status)   q = q.eq('status_bayar', status);
    if (pasienId) q = q.eq('pasien_id', pasienId);
    const { data, error } = await q;
    if (error) throw error; return data;
  }

  async function kasirTagihan(id) {
    const { data, error } = await sb.from('v_kasir_tagihan').select('*').eq('id', id).single();
    if (error) throw error; return data;
  }

  async function kasirItem(tagihanId) {
    const { data, error } = await sb.from('kasir_tagihan_item').select('*')
      .eq('tagihan_id', tagihanId).order('urutan').order('created_at');
    if (error) throw error; return data;
  }

  async function kasirPembayaran(tagihanId) {
    const { data, error } = await sb.from('kasir_pembayaran')
      .select('*, petugas:dibuat_oleh(nama)')
      .eq('tagihan_id', tagihanId).order('created_at');
    if (error) throw error; return data;
  }

  /* Semua yang dibutuhkan satu layar tagihan, dalam satu putaran. */
  async function kasirLengkap(tagihanId) {
    const [tagihan, item, bayar] = await Promise.all([
      kasirTagihan(tagihanId), kasirItem(tagihanId), kasirPembayaran(tagihanId)
    ]);
    return { tagihan, item, bayar };
  }

  async function kasirSusunDariKunjungan(kunjunganId) {
    const { data, error } = await sb.rpc('kasir_susun_dari_kunjungan',
      { p_kunjungan_id: kunjunganId });
    if (error) throw error; return data;   // uuid tagihan
  }

  async function kasirCatatPembayaran(r) {
    const { data, error } = await sb.rpc('kasir_catat_pembayaran', {
      p_tagihan_id: r.tagihan_id, p_jumlah: r.jumlah,
      p_tanggal: r.tanggal || null, p_metode: r.metode || 'tunai',
      p_catatan: r.catatan || null,
      p_uang_diterima: (r.uang_diterima || null)
    });
    if (error) throw error; return data;
  }

  async function kasirHapusPembayaran(id, alasan = null) {
    const { data, error } = await sb.rpc('kasir_hapus_pembayaran',
      { p_pembayaran_id: id, p_alasan: alasan });
    if (error) throw error; return data;
  }

  async function kasirHapusTagihan(id) {
    const { error } = await sb.rpc('kasir_hapus_tagihan', { p_tagihan_id: id });
    if (error) throw error;
  }

  async function kasirBuatTagihanBebas(rec) {
    const { data, error } = await sb.from('kasir_tagihan')
      .insert({ ...rec, dibuat_oleh: _saya?.id }).select().single();
    if (error) throw error; return data;
  }

  async function kasirTambahItem(rec) {
    const { data, error } = await sb.from('kasir_tagihan_item').insert(rec).select().single();
    if (error) throw error; return data;
  }
  /* Menjual obat langsung dari Kasir: satu panggilan memotong stok FEFO
     (kategori 'Penjualan Bebas') DAN menulis baris tagihan sekaligus,
     lewat RPC supaya keduanya satu transaksi — bukan dua panggilan
     terpisah yang bisa berselisih kalau salah satu gagal di tengah.
     Harga selalu dari obat.harga saat ini (lihat sql/21_...), jadi rec
     di sini TIDAK membawa harga_satuan sama sekali. */
  async function kasirJualObatBebas(rec) {
    const { data, error } = await sb.rpc('kasir_jual_obat_bebas', {
      p_tagihan_id: rec.tagihan_id,
      p_obat_id: rec.obat_id,
      p_qty: rec.qty,
      p_diskon_pct: rec.diskon_pct || 0,
      p_ditanggung_penjamin: !!rec.ditanggung_penjamin,
      p_urutan: rec.urutan ?? 99,
      p_keterangan: rec.keterangan || null
    });
    if (error) throw error; return data;
  }
  async function kasirUbahItem(id, patch) {
    const { data, error } = await sb.from('kasir_tagihan_item')
      .update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  }
  async function kasirHapusItem(id) {
    const { error } = await sb.from('kasir_tagihan_item').delete().eq('id', id);
    if (error) throw error;
  }

  async function daftarTarif({ jenis = null, kata = '', ikutNonaktif = false } = {}) {
    let q = sb.from('kasir_tarif').select('*')
      .order('jenis').order('nama').limit(500);
    if (jenis) q = q.eq('jenis', jenis);
    if (!ikutNonaktif) q = q.eq('aktif', true);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim();
      q = q.or(`nama.ilike.%${k}%,kode.ilike.%${k}%,kode_icd9.ilike.%${k}%`);
    }
    const { data, error } = await q;
    if (error) throw error; return data;
  }

  async function simpanTarif(rec, id = null) {
    const q = id ? sb.from('kasir_tarif').update(rec).eq('id', id).select().single()
                 : sb.from('kasir_tarif').insert(rec).select().single();
    const { data, error } = await q;
    if (error) throw error; return data;
  }

  /* Rekap uang masuk untuk tutup kas. Baris pembayaran, bukan tagihan:
     yang dihitung saat menutup laci adalah uang yang benar-benar
     diterima hari itu, bukan tagihan yang terbit hari itu. */
  async function kasirRekap({ dari, sampai }) {
    const { data, error } = await sb.from('kasir_pembayaran')
      .select('tanggal,metode,jumlah,uang_diterima,tagihan_id')
      .gte('tanggal', dari).lte('tanggal', sampai)
      .order('tanggal', { ascending: false });
    if (error) throw error; return data;
  }

  async function templateInvoice() {
    return await TemplateInvoice.muat(sb);
  }
  async function simpanTemplateInvoice(konfigurasi) {
    return await TemplateInvoice.simpan(sb, konfigurasi);
  }


  /* ------------------ Penunjang: lab, bacaan, arsip ---------------------- */
  /* Tidak ada satu pun fungsi unggah berkas di bagian ini, dan itu memang
     disengaja — lihat kepala sql/11_penunjang.sql. Yang disimpan adalah
     angka dan bacaannya; berkas fisiknya cukup dicatat nomor arsipnya. */

  /* Master pemeriksaan beserta nilai rujukannya, dimuat sekali per halaman. */
  async function refLab(hanyaAktif = true) {
    let q = sb.from('ref_lab').select('*, rujukan:ref_lab_rujukan(*)').order('kelompok').order('urutan');
    if (hanyaAktif) q = q.eq('aktif', true);
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function refLabPaket() {
    const { data, error } = await sb.from('ref_lab_paket')
      .select('*, item:ref_lab_paket_item(lab_id, urutan)')
      .eq('aktif', true).order('urutan');
    if (error) throw error; return data;
  }
  async function simpanRefLab(patch) {
    const { data, error } = patch.id
      ? await sb.from('ref_lab').update(patch).eq('id', patch.id).select().single()
      : await sb.from('ref_lab').insert(patch).select().single();
    if (error) throw error; return data;
  }
  async function simpanRujukan(patch) {
    const { data, error } = patch.id
      ? await sb.from('ref_lab_rujukan').update(patch).eq('id', patch.id).select().single()
      : await sb.from('ref_lab_rujukan').insert(patch).select().single();
    if (error) throw error; return data;
  }
  async function hapusRujukan(id) {
    const { error } = await sb.from('ref_lab_rujukan').delete().eq('id', id);
    if (error) throw error;
  }
  /* Hapus permanen pemeriksaan lab. Baris nilai rujukan miliknya (dan
     keanggotaan paket) ikut terhapus otomatis; ditolak database bila
     pemeriksaan ini sudah pernah punya hasil pasien. */
  async function hapusLab(id) {
    const { error } = await sb.from('ref_lab').delete().eq('id', id);
    if (error) throw error;
  }

  /* Permintaan & hasil */
  async function labMinta(kunjunganId, labIds, catatan = null,
                          asal = 'INTERNAL', namaLabLuar = null) {
    const { data, error } = await sb.rpc('lab_minta', {
      p_kunjungan_id: kunjunganId, p_lab_ids: labIds,
      p_catatan: catatan || null, p_asal: asal,
      p_nama_lab_luar: namaLabLuar || null
    });
    if (error) throw error; return data;
  }
  /* Hasil dari lab luar: pasien wajib, kunjungan boleh kosong. Dipisah
     dari labMinta() karena isian layarnya memang berbeda — yang satu
     memilih pemeriksaan untuk dikerjakan, yang satu menyalin lembar
     yang sudah jadi. */
  async function labMintaLuar({ pasien_id, kunjungan_id, lab_ids, tanggal,
                                nama_lab, no_lembar, catatan }) {
    const { data, error } = await sb.rpc('lab_minta', {
      p_kunjungan_id: kunjungan_id || null, p_lab_ids: lab_ids,
      p_catatan: catatan || null, p_asal: 'EKSTERNAL',
      p_nama_lab_luar: nama_lab || null, p_pasien_id: pasien_id,
      p_tanggal: tanggal || null, p_no_lembar_luar: no_lembar || null
    });
    if (error) throw error; return data;
  }
  async function labAntrean(dari, sampai, status = null) {
    let q = sb.from('v_lab_antrean').select('*')
      .gte('tanggal', dari).lte('tanggal', sampai)
      .order('tanggal', { ascending: false }).order('diminta_pada', { ascending: false });
    if (status) q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function labPermintaan(id) {
    const { data, error } = await sb.from('lab_permintaan')
      .select(`*, pasien:pasien_id(id,no_rm,nama,tanggal_lahir,jenis_kelamin,no_bpjs),
               kunjungan:kunjungan_id(id,no_kunjungan,tanggal,cara_bayar),
               peminta:diminta_oleh(nama), penutup:selesai_oleh(nama),
               hasil:lab_hasil(*, ref:lab_id(id,kode,nama,kelompok,satuan,jenis_nilai,pilihan,teks_normal,desimal))`)
      .eq('id', id).single();
    if (error) throw error;
    if (data && data.hasil) data.hasil.sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    return data;
  }
  async function labKunjungan(kunjunganId) {
    const { data, error } = await sb.from('lab_permintaan')
      .select(`*, hasil:lab_hasil(*, ref:lab_id(kode,nama,kelompok,satuan,jenis_nilai,desimal))`)
      .eq('kunjungan_id', kunjunganId).neq('status', 'BATAL')
      .order('diminta_pada');
    if (error) throw error; return data;
  }
  async function labPasien(pasienId, batas = 40) {
    const { data, error } = await sb.from('v_lab_antrean').select('*')
      .eq('pasien_id', pasienId).neq('status', 'BATAL')
      .order('tanggal', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }
  /* Satu nilai berubah = satu simpanan. Tidak dikirim borongan supaya
     kegagalan pada satu baris tidak menghapus ketikan baris lain. */
  async function simpanHasilLab(id, patch) {
    const { data, error } = await sb.from('lab_hasil')
      .update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  }
  async function labSelesaikan(id) {
    const { error } = await sb.rpc('lab_selesaikan', { p_permintaan_id: id });
    if (error) throw error;
  }
  async function labBukaKunci(id, alasan) {
    const { error } = await sb.rpc('lab_buka_kunci', { p_permintaan_id: id, p_alasan: alasan });
    if (error) throw error;
  }
  async function labBatalkan(id, alasan) {
    const { error } = await sb.rpc('lab_batalkan', { p_permintaan_id: id, p_alasan: alasan });
    if (error) throw error;
  }
  async function labTren(pasienId, labId, batas = 12) {
    const { data, error } = await sb.from('v_lab_tren').select('*')
      .eq('pasien_id', pasienId).eq('lab_id', labId)
      .order('tanggal', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }
  async function labBelumSelesai(kunjunganId) {
    const { data, error } = await sb.from('v_kasir_menunggu_lab')
      .select('lab_belum_selesai').eq('kunjungan_id', kunjunganId).maybeSingle();
    if (error) throw error;
    return data ? data.lab_belum_selesai : 0;
  }

  /* Bacaan penunjang */
  async function penunjangSimpan(p) {
    const { data, error } = await sb.rpc('penunjang_simpan', {
      p_id: p.id || null, p_pasien_id: p.pasien_id, p_kunjungan_id: p.kunjungan_id || null,
      p_tanggal: p.tanggal || null, p_jenis: p.jenis, p_judul: p.judul || null,
      p_asal: p.asal || 'INTERNAL', p_nama_tempat: p.nama_tempat || null,
      p_no_film: p.no_film || null, p_temuan: p.temuan || null,
      p_kesan: p.kesan, p_saran: p.saran || null, p_gigi: p.gigi || null
    });
    if (error) throw error; return data;
  }
  async function penunjangPasien(pasienId, batas = 40) {
    const { data, error } = await sb.from('v_penunjang_lengkap').select('*')
      .eq('pasien_id', pasienId).order('tanggal', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }
  async function penunjangKunjungan(kunjunganId) {
    const { data, error } = await sb.from('v_penunjang_lengkap').select('*')
      .eq('kunjungan_id', kunjunganId).order('dibaca_pada');
    if (error) throw error; return data;
  }
  /* Gigi mana saja yang pernah dirontgen — dipakai odontogram untuk
     memberi tanda kecil pada giginya. Satu permintaan untuk seluruh
     mulut, bukan 52 permintaan per gigi. */
  async function gigiBerbacaan(pasienId) {
    const { data, error } = await sb.from('penunjang_gigi')
      .select('fdi, penunjang!inner(id,tanggal,jenis,kesan,pasien_id)')
      .eq('penunjang.pasien_id', pasienId);
    if (error) throw error;
    const peta = {};
    (data || []).forEach(r => {
      if (!peta[r.fdi]) peta[r.fdi] = [];
      peta[r.fdi].push(r.penunjang);
    });
    Object.values(peta).forEach(a =>
      a.sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal))));
    return peta;
  }
  async function hapusPenunjang(id) {
    const { error } = await sb.from('penunjang').delete().eq('id', id);
    if (error) throw error;
  }

  /* Register arsip berkas fisik */
  async function lampiranPasien(pasienId, batas = 60) {
    const { data, error } = await sb.from('lampiran')
      .select('*, kunjungan:kunjungan_id(no_kunjungan,tanggal), pencatat:dibuat_oleh(nama)')
      .eq('pasien_id', pasienId)
      .order('tanggal_dokumen', { ascending: false, nullsFirst: false })
      .order('dibuat_pada', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }
  async function lampiranKunjungan(kunjunganId) {
    const { data, error } = await sb.from('lampiran').select('*')
      .eq('kunjungan_id', kunjunganId).order('dibuat_pada');
    if (error) throw error; return data;
  }
  async function simpanLampiran(patch) {
    const { data, error } = patch.id
      ? await sb.from('lampiran').update(patch).eq('id', patch.id).select().single()
      : await sb.from('lampiran').insert(patch).select().single();
    if (error) throw error; return data;
  }
  async function hapusLampiran(id) {
    const { error } = await sb.from('lampiran').delete().eq('id', id);
    if (error) throw error;
  }


  /* ======================================================================
     SURAT-SURAT KETERANGAN
     ====================================================================== */

  /* Nilai bawaan pengaturan surat. Pola yang sama dengan
     invoice_template.js: bawaan di JavaScript, isi database ditumpuk di
     atasnya. Menambah pengaturan baru nanti tidak butuh migrasi SQL —
     cukup satu kunci di sini, dan klinik yang belum menyimpannya tetap
     jalan. */
  const BAWAAN_SURAT = {
    /* Kota pada baris tanggal ("Manado, 3 September 2026"). Diambil dari
       kop klinik; boleh diganti lewat Pengaturan. */
    kota: 'Manado',
    catatan_kaki: 'Keaslian surat ini dapat diperiksa dengan menyebutkan nomor surat ' +
                  'kepada Klinik Pratama Imanuel.',
    tampilkan_kop: true,
    /* Garis di bawah kop. Bawaannya MATI karena gambar kop Klinik Imanuel
       sudah berakhir dengan garis hijau sendiri; garis hitam tepat di
       bawahnya terbaca seperti kesalahan cetak. Klinik yang mengunggah
       kop tanpa garis bisa menyalakannya. */
    garis_bawah_kop: false,
    /* Kop pengganti, bila klinik mengunggah yang baru. Kosong = memakai
       kop bawaan yang tertanam di js/kop_klinik.js. */
    kop_data_uri: null,
    kop_rasio: null
  };

  let _suratSetelan = null;

  async function suratPengaturan(paksaMuat = false) {
    if (_suratSetelan && !paksaMuat) return _suratSetelan;
    let simpanan = {};
    try {
      const { data, error } = await sb.from('sys_surat_pengaturan')
        .select('konfigurasi').eq('id', 1).maybeSingle();
      if (!error && data && data.konfigurasi) simpanan = data.konfigurasi;
    } catch (e) { /* pengaturan hilang bukan alasan surat gagal dicetak */ }
    _suratSetelan = Object.assign({}, BAWAAN_SURAT, simpanan);
    return _suratSetelan;
  }

  async function simpanSuratPengaturan(konfigurasi) {
    const { data, error } = await sb.from('sys_surat_pengaturan')
      .update({ konfigurasi, updated_by: _saya?.id }).eq('id', 1)
      .select('konfigurasi').single();
    if (error) throw error;
    _suratSetelan = Object.assign({}, BAWAAN_SURAT, data.konfigurasi || {});
    return _suratSetelan;
  }

  /* Pengaturan template cetak Resep (logo, ukuran kertas, tampil/sembunyi
     tiap bagian) — pola sama persis dengan pengaturan Surat di atas. */
  const BAWAAN_RESEP = {
    logo_data_uri: null,
    logo_rasio: null,
    ukuran_kertas: 'A5',
    tampil_bb: true,
    tampil_alergi: true,
    tampil_validasi_farmasi: true
  };

  let _resepSetelan = null;

  async function resepPengaturan(paksaMuat = false) {
    if (_resepSetelan && !paksaMuat) return _resepSetelan;
    let simpanan = {};
    try {
      const { data, error } = await sb.from('sys_resep_pengaturan')
        .select('konfigurasi').eq('id', 1).maybeSingle();
      if (!error && data && data.konfigurasi) simpanan = data.konfigurasi;
    } catch (e) { /* pengaturan hilang bukan alasan resep gagal dicetak */ }
    _resepSetelan = Object.assign({}, BAWAAN_RESEP, simpanan);
    return _resepSetelan;
  }

  async function simpanResepPengaturan(konfigurasi) {
    const { data, error } = await sb.from('sys_resep_pengaturan')
      .update({ konfigurasi, updated_by: _saya?.id }).eq('id', 1)
      .select('konfigurasi').single();
    if (error) throw error;
    _resepSetelan = Object.assign({}, BAWAAN_RESEP, data.konfigurasi || {});
    return _resepSetelan;
  }

  async function refJenisSurat(hanyaAktif = true) {
    let q = sb.from('ref_jenis_surat').select('*').order('urutan');
    if (hanyaAktif) q = q.eq('aktif', true);
    const { data, error } = await q;
    if (error) throw error; return data;
  }

  async function suratNomorBerikutnya(jenis, tahun) {
    const { data, error } = await sb.rpc('surat_nomor_berikutnya',
      { p_jenis: jenis, p_tahun: tahun });
    if (error) throw error; return data;
  }

  async function suratNomorTerpakai(jenis, tahun, nomor) {
    const { data, error } = await sb.rpc('surat_nomor_terpakai',
      { p_jenis: jenis, p_tahun: tahun, p_nomor: nomor });
    if (error) throw error; return data || null;
  }

  async function buatSurat(rec) {
    const { data, error } = await sb.from('surat')
      .insert({ ...rec, dibuat_oleh: _saya?.id }).select().single();
    if (error) throw error; return data;
  }

  async function ubahSurat(id, patch) {
    const { data, error } = await sb.from('surat')
      .update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  }

  async function surat(id) {
    const { data, error } = await sb.from('v_surat').select('*').eq('id', id).maybeSingle();
    if (error) throw error; return data;
  }

  async function daftarSurat(filter = {}) {
    let q = sb.from('v_surat').select('*')
      .order('tanggal_surat', { ascending: false })
      .order('dibuat_pada', { ascending: false })
      .limit(filter.batas || 300);
    if (filter.dari)      q = q.gte('tanggal_surat', filter.dari);
    if (filter.sampai)    q = q.lte('tanggal_surat', filter.sampai);
    if (filter.jenis)     q = q.eq('jenis_kode', filter.jenis);
    if (filter.status)    q = q.eq('status', filter.status);
    if (filter.pasien_id) q = q.eq('pasien_id', filter.pasien_id);
    if (filter.kata) {
      /* Satu kotak cari untuk tiga kolom. Koma adalah pemisah pada sintaks
         or() PostgREST, jadi ia dibuang dari kata kunci — kalau tidak,
         mengetik "Sitorus, Maria" menghasilkan galat sintaks, bukan hasil
         kosong, dan pengguna tidak akan pernah menebak sebabnya. */
      const k = String(filter.kata).replace(/[,()]/g, ' ').trim();
      if (k) q = q.or(`nomor_surat.ilike.%${k}%,nama_pasien.ilike.%${k}%,` +
                      `perihal.ilike.%${k}%,no_rm.ilike.%${k}%`);
    }
    const { data, error } = await q;
    if (error) throw error; return data;
  }

  async function suratKunjungan(kunjunganId) {
    const { data, error } = await sb.from('v_surat').select('*')
      .eq('kunjungan_id', kunjunganId).order('dibuat_pada');
    if (error) throw error; return data;
  }

  async function suratPasien(pasienId, batas = 40) {
    const { data, error } = await sb.from('v_surat').select('*')
      .eq('pasien_id', pasienId).order('tanggal_surat', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }

  async function suratBatalkan(id, alasan) {
    const { data, error } = await sb.rpc('surat_batalkan', { p_id: id, p_alasan: alasan });
    if (error) throw error; return data;
  }

  async function suratCatatCetak(id) {
    const { error } = await sb.rpc('surat_catat_cetak', { p_id: id });
    if (error) throw error;
  }

  /* --------------------------- Antrean ---------------------------------- */

  async function antreanHariIni() {
    const { data, error } = await sb.from('v_antrean_hari_ini').select('*');
    if (error) throw error; return data;
  }

  /* Kuota & jam buka hari ini per poli. Dipakai papan antrean dan
     halaman jadwal; poli yang tutup pun ikut terbawa (kolom `buka`)
     supaya petugas tahu bedanya "sepi" dan "libur". */
  async function antreanKuota() {
    const { data, error } = await sb.from('v_antrean_kuota').select('*');
    if (error) throw error; return data;
  }

  /* Nomor antrean baru dari loket, TANPA membuat kunjungan.
     Dipakai untuk pasien yang datang tetapi berkasnya belum lengkap —
     ia tetap mendapat nomor dan tidak perlu mengantre dua kali. */
  async function antreanAmbilLoket(rec) {
    const { data, error } = await sb.from('antrean')
      .insert({ ...rec, sumber: rec.sumber || 'LOKET', dibuat_oleh: _saya?.id })
      .select().single();
    if (error) throw error; return data;
  }

  async function antreanPanggil(id, tujuan = null) {
    const { data, error } = await sb.rpc('antrean_panggil',
      { p_antrean: id, p_tujuan: tujuan });
    if (error) throw error; return data;
  }
  async function antreanCheckin(id, { pasien_id, dokter_id = null,
                                      cara_bayar = 'BPJS', keluhan = null } = {}) {
    const { data, error } = await sb.rpc('antrean_checkin', {
      p_antrean: id, p_pasien: pasien_id, p_dokter: dokter_id,
      p_cara_bayar: cara_bayar, p_keluhan: keluhan
    });
    if (error) throw error; return data;
  }
  async function antreanMulaiLayan(id) {
    const { data, error } = await sb.rpc('antrean_mulai_layan', { p_antrean: id });
    if (error) throw error; return data;
  }
  async function antreanLewat(id, alasan = null) {
    const { data, error } = await sb.rpc('antrean_lewat', { p_antrean: id, p_alasan: alasan });
    if (error) throw error; return data;
  }
  async function antreanBatal(id, alasan = null) {
    const { data, error } = await sb.rpc('antrean_batal', { p_antrean: id, p_alasan: alasan });
    if (error) throw error; return data;
  }
  async function antreanUbah(id, patch) {
    const { data, error } = await sb.from('antrean').update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  }

  /* Riwayat panggilan hari ini — dipakai papan antrean untuk menampilkan
     "terakhir dipanggil" tanpa menunggu layar tunggu. */
  async function antreanPanggilanHariIni(batas = 20) {
    const { data, error } = await sb.from('antrean_panggilan')
      .select('id, waktu, tahap, tujuan, urutan, antrean:antrean_id(nomor, poli_id)')
      .order('id', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }

  /* Realtime: memberi tahu pemanggil setiap kali ada baris `antrean` yang
     berubah (nomor baru dari loket/Mobile JKN, dipanggil, check-in,
     selesai, dst). Sengaja HANYA memberi sinyal "ada perubahan" — bukan
     mengirim baris yang berubah — supaya pemanggil selalu memuat ulang
     lewat `v_antrean_hari_ini` (satu sumber kebenaran, sudah lengkap
     dengan join poli/dokter) alih-alih menyusun ulang baris dari payload
     realtime yang mentah. Tabel `antrean` harus didaftarkan ke publication
     `supabase_realtime` di Supabase dulu (lihat catatan migrasi) — kalau
     belum, fungsi ini tetap terpasang tanpa galat, hanya tidak pernah
     terpanggil, jadi pemanggil WAJIB tetap punya jalur penyegaran berkala
     sebagai jaring pengaman (baterai habis, wifi putus sebentar, dsb).
     Mengembalikan fungsi untuk berhenti berlangganan. */
  function langgananAntrean(callback) {
    const ch = sb.channel('antrean-perubahan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antrean' }, callback)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }

  /* ---- Jadwal & kuota ---- */
  async function poliJadwal() {
    const { data, error } = await sb.from('poli_jadwal')
      .select('*').order('hari').order('sesi');
    if (error) throw error; return data;
  }
  async function simpanJadwal(rec, id = null) {
    const q = id ? sb.from('poli_jadwal').update(rec).eq('id', id)
                 : sb.from('poli_jadwal').insert(rec);
    const { data, error } = await q.select().single();
    if (error) throw error; return data;
  }
  async function hapusJadwal(id) {
    const { error } = await sb.from('poli_jadwal').delete().eq('id', id);
    if (error) throw error;
  }
  async function poliLibur(dari = null) {
    let q = sb.from('poli_libur').select('*, poli:poli_id(nama)').order('tanggal');
    if (dari) q = q.gte('tanggal', dari);
    const { data, error } = await q;
    if (error) throw error; return data;
  }
  async function simpanLibur(rec) {
    const { data, error } = await sb.from('poli_libur')
      .insert({ ...rec, dibuat_oleh: _saya?.id }).select().single();
    if (error) throw error; return data;
  }
  async function hapusLibur(id) {
    const { error } = await sb.from('poli_libur').delete().eq('id', id);
    if (error) throw error;
  }

  /* ---- Pengaturan antrean & layar ---- */
  async function antreanPengaturan() {
    const { data, error } = await sb.from('sys_antrean_pengaturan')
      .select('konfigurasi, token_layar').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data || { konfigurasi: {}, token_layar: null };
  }
  async function simpanAntreanPengaturan(konfigurasi) {
    const { data, error } = await sb.from('sys_antrean_pengaturan')
      .update({ konfigurasi, updated_at: new Date().toISOString(), updated_by: _saya?.id })
      .eq('id', 1).select().single();
    if (error) throw error; return data;
  }
  async function antreanTokenBaru(token) {
    const { data, error } = await sb.rpc('antrean_token_baru', { p_token: token });
    if (error) throw error; return data;
  }

  /* Layar tunggu memanggil ini TANPA login. Dipakai display.html.
     Fungsinya security definer dan hanya memulangkan nomor — tidak ada
     nama, nomor rekam medis, atau data medis apa pun di dalamnya. */
  async function antreanLayar(token) {
    const { data, error } = await sb.rpc('antrean_layar', { p_token: token });
    if (error) throw error; return data;
  }

  /* ---- Akun web service Antrol ---- */
  async function antrolAkun() {
    const { data, error } = await sb.from('v_antrol_akun').select('*').order('username');
    if (error) throw error; return data;
  }
  async function antrolAkunSimpan(username, sandi, keterangan = null) {
    const { data, error } = await sb.rpc('antrol_akun_simpan',
      { p_username: username, p_sandi: sandi, p_keterangan: keterangan });
    if (error) throw error; return data;
  }
  async function antrolAkunHapus(username) {
    const { data, error } = await sb.rpc('antrol_akun_hapus', { p_username: username });
    if (error) throw error; return data;
  }
  async function antrolLog(batas = 50) {
    const { data, error } = await sb.from('antrol_log').select('*')
      .order('waktu', { ascending: false }).limit(batas);
    if (error) throw error; return data;
  }

  /* --------------------------- Bridging --------------------------------- */
  /* Aplikasi TIDAK pernah memegang kredensial. Ia hanya memanggil Edge
     Function, dan Edge Function-lah yang menyimpan rahasia serta berbicara
     dengan PCare / SatuSehat. */
  async function panggilBridging(fungsi, muatan) {
    const { data, error } = await sb.functions.invoke(fungsi, { body: muatan });
    if (error) throw error;
    return data;
  }
  async function riwayatBridging(kunjunganId) {
    const { data, error } = await sb.from('bridging_log').select('*')
      .eq('kunjungan_id', kunjunganId).order('waktu', { ascending: false });
    if (error) throw error; return data;
  }

  /* --------------------- Kronis: referensi & migrasi -------------------- */
  async function refKronisDiagnosa() {
    const { data, error } = await sb.from('ref_kronis_diagnosa')
      .select('kode,nama,pantau_obat,bulan_lab,alias,icd10_awal,urutan,aktif')
      .eq('aktif', true).order('urutan');
    if (error) throw error; return data;
  }

  /* Obat berkuota BPJS (statin) — dipakai dropdown di modal pendaftaran
     buku kronis halaman Periksa. */
  async function refKronisKuotaObat() {
    const { data, error } = await sb.from('ref_kronis_kuota_obat')
      .select('kunci,nama,maks,aktif').eq('aktif', true).order('nama');
    if (error) throw error; return data;
  }

  async function kronisImporRingkas() {
    const { data, error } = await sb.from('v_kronis_impor_ringkas').select('*').single();
    if (error) throw error; return data;
  }

  /* Baris titipan. `pasien` ikut diambil supaya daftar "sudah cocok" bisa
     menyebut nama tujuannya — tanpa itu petugas tidak punya cara memeriksa
     apakah tempelannya benar selain membatalkannya satu per satu. */
  async function kronisImporDaftar(status = 'MENUNGGU', cari = '', batas = 200) {
    let q = sb.from('kronis_impor_pasien')
      .select('id,kunci,nama_pasien,no_bpjs,no_telp,jml_obat,jml_lab,jml_kontrol,' +
              'punya_terapi,diagnosis_teks,status,pasien_id,alasan,dicocokkan_pada,' +
              'pasien:pasien_id(id,no_rm,nama,tanggal_lahir,jenis_kelamin,no_bpjs)')
      .order('punya_terapi', { ascending: false })
      .order('nama_pasien')
      .limit(batas);
    if (status) q = q.eq('status', status);
    if (cari) q = q.ilike('nama_pasien', `%${cari}%`);
    const { data, error } = await q;
    if (error) throw error; return data;
  }

  async function kronisImporBaris(imporId, batas = 60) {
    const { data, error } = await sb.from('kronis_impor_baris')
      .select('id,sumber,sumber_id,tanggal,isi,dituang')
      .eq('impor_id', imporId)
      .order('sumber').order('tanggal', { ascending: false, nullsFirst: false })
      .limit(batas);
    if (error) throw error; return data;
  }

  async function kronisImporUsulan(imporId, batas = 8) {
    const { data, error } = await sb.rpc('kronis_impor_usulan',
      { p_impor_id: imporId, p_batas: batas });
    if (error) throw error; return data || [];
  }

  async function kronisImporTampung(sumber, baris) {
    const { data, error } = await sb.rpc('kronis_impor_tampung',
      { p_sumber: sumber, p_baris: baris });
    if (error) throw error; return data;
  }

  async function kronisImporCocokkan(imporId, pasienId) {
    const { data, error } = await sb.rpc('kronis_impor_cocokkan',
      { p_impor_id: imporId, p_pasien_id: pasienId });
    if (error) throw error; return data;
  }

  async function kronisImporBatalCocok(imporId) {
    const { data, error } = await sb.rpc('kronis_impor_batal_cocok', { p_impor_id: imporId });
    if (error) throw error; return data;
  }

  async function kronisImporAbaikan(imporId, alasan = null) {
    const { data, error } = await sb.rpc('kronis_impor_abaikan',
      { p_impor_id: imporId, p_alasan: alasan });
    if (error) throw error; return data;
  }

  async function kronisImporOtomatis() {
    const { data, error } = await sb.rpc('kronis_impor_cocokkan_otomatis');
    if (error) throw error; return data;
  }

  async function kronisImporBersihkan(semua = false) {
    const { data, error } = await sb.rpc('kronis_impor_bersihkan', { p_semua: semua });
    if (error) throw error; return data;
  }

  /* --------------------- Pra-daftar pasien (migrasi dari nol) -----------
     Dipakai HANYA saat RME dipasang dari nol dan portal punya banyak orang
     yang perlu didaftarkan sekaligus sebelum Migrasi Portal (di atas) bisa
     menemukan pasangannya. Lihat sql/24_pasien_cari_mirip.sql dan
     js/pra_daftar_core.js untuk alasan lengkapnya. */
  async function pasienCariMirip(nama, nik = null, noBpjs = null, batas = 5) {
    const { data, error } = await sb.rpc('pasien_cari_mirip',
      { p_nama: nama, p_nik: nik, p_no_bpjs: noBpjs, p_batas: batas });
    if (error) throw error; return data || [];
  }

  /* Insert langsung ke tabel pasien — jalur PERSIS SAMA dengan pendaftaran
     satu-per-satu biasa (simpanPasien di atas), hanya saja sekaligus
     banyak baris. Trigger gen_no_rm() dan audit tetap berjalan per baris,
     jadi tiap pasien baru tetap dapat nomor RM berurutan dan tercatat di
     audit_log — TIDAK ada jalan pintas yang melewati keduanya. */
  async function pasienBuatMassal(baris) {
    const { data, error } = await sb.from('pasien').insert(baris)
      .select('id,no_rm,nama,tanggal_lahir,jenis_kelamin,nik,no_bpjs');
    if (error) throw error; return data || [];
  }

  /* --------------------- Kronis: pemantauan (Tahap 2) ------------------- */
  async function kronisPantauObat() {
    const { data, error } = await sb.from('v_kronis_obat_bulan_ini')
      .select('*').order('bulan_tertinggal', { ascending: false }).order('nama');
    if (error) throw error; return data;
  }

  async function kronisPantauLab() {
    const { data, error } = await sb.from('v_kronis_lab_jadwal')
      .select('*').order('hari_lewat_jadwal', { ascending: false }).order('nama');
    if (error) throw error; return data;
  }

  async function kronisPantauStatin() {
    const { data, error } = await sb.from('v_kronis_statin')
      .select('*').order('nama');
    if (error) throw error; return data;
  }

  async function kronisTelponH1() {
    const { data, error } = await sb.from('v_kronis_telpon_h1').select('*');
    if (error) throw error; return data;
  }

  /* Buku kronis pasien tertentu — dipakai halaman periksa & apotek.
     null (bukan galat) bila pasien tidak/belum terdaftar. */
  async function kronisPasien(pasienId) {
    const { data, error } = await sb.from('v_kronis_pasien')
      .select('*').eq('pasien_id', pasienId).maybeSingle();
    if (error) throw error; return data;
  }

  async function kronisStatinPasien(pasienId) {
    const { data, error } = await sb.from('v_kronis_statin')
      .select('*').eq('pasien_id', pasienId).maybeSingle();
    if (error) throw error; return data;
  }

  async function kronisUsulanDiagnosa(pasienId, kodeIcd10) {
    const { data, error } = await sb.rpc('kronis_usulan_diagnosa',
      { p_pasien_id: pasienId, p_kode_icd10: kodeIcd10 });
    if (error) throw error; return data || [];
  }

  async function kronisDaftarSimpan(p) {
    const { data, error } = await sb.rpc('kronis_daftar_simpan', {
      p_pasien_id: p.pasienId, p_diagnosa: p.diagnosa, p_obat: p.obat || [],
      p_statin_kunci: p.statinKunci || null, p_statin_obat_id: p.statinObatId || null,
      p_statin_nama: p.statinNama || null, p_statin_tgl_lab: p.statinTglLab || null,
      p_catatan: p.catatan || null
    });
    if (error) throw error; return data;
  }

  async function kronisTerapiSelesai(terapiId, alasan = null) {
    const { error } = await sb.rpc('kronis_terapi_selesai',
      { p_terapi_id: terapiId, p_alasan: alasan });
    if (error) throw error;
  }

  /* Peringatan H-3 (pengambilan obat kronis terlalu cepat). null = pasien
     ini tidak terdaftar di buku kronis — bukan galat, apotek/periksa cukup
     diam saja dalam keadaan itu. */
  async function kronisH3Cek(pasienId) {
    const { data, error } = await sb.rpc('kronis_h3_cek', { p_pasien_id: pasienId });
    if (error) throw error; return data;
  }

  /* ========================= LAPORAN — TAHAP 3 =========================
     Seluruhnya lewat ambilSemua(): rentang setahun bisa gampang menembus
     1000 baris bawaan PostgREST, dan laporan yang diam-diam terpotong
     tanpa galat apa pun adalah kelas kesalahan yang paling berbahaya —
     angkanya tetap tampil, hanya saja salah. */

  /* Baris mentah untuk Overview, tren, heatmap jam, dan rekap per dokter
     — seluruhnya dihitung di js/laporan_core.js dari kolom-kolom ini. */
  async function laporanKunjunganRentang({ dari, sampai }) {
    return await ambilSemua(() =>
      sb.from('v_riwayat_kunjungan')
        .select('tanggal,jenis_poli,cara_bayar,jenis_kunjungan,jam_daftar,nama_dokter,dokter_id')
        .gte('tanggal', dari).lte('tanggal', sampai));
  }

  async function laporanRujukan({ dari, sampai }) {
    return await ambilSemua(() =>
      sb.from('v_laporan_rujukan').select('*')
        .gte('tanggal', dari).lte('tanggal', sampai)
        .order('tanggal', { ascending: false }));
  }

  async function laporanKeuanganTagihan({ dari, sampai }) {
    return await ambilSemua(() =>
      sb.from('v_laporan_keuangan_tagihan').select('*')
        .gte('tanggal', dari).lte('tanggal', sampai));
  }

  async function laporanKeuanganPembayaran({ dari, sampai }) {
    return await ambilSemua(() =>
      sb.from('v_laporan_keuangan_pembayaran').select('*')
        .gte('tanggal', dari).lte('tanggal', sampai));
  }

  /* Register Poli Umum/Gigi berbagi sumber yang sama dengan Riwayat
     Kunjungan (v_riwayat_kunjungan) — bedanya cuma filter jenis_poli
     dan kolom identitas pasien yang ikut ditampilkan di sini. */
  async function laporanRegisterPoli({ dari, sampai, jenisPoli }) {
    return await ambilSemua(() => {
      let q = sb.from('v_riwayat_kunjungan').select('*')
        .gte('tanggal', dari).lte('tanggal', sampai);
      if (jenisPoli) q = q.eq('jenis_poli', jenisPoli);
      return q;
    });
  }

  /* Tindakan (ICD-9-CM) untuk sekumpulan kunjungan sekaligus — dipakai
     Register Poli Gigi menambahkan kolom "Tindakan" tanpa query per
     baris. `idKunjungan` boleh kosong (mengembalikan array kosong,
     bukan seluruh tabel — PostgREST membaca `.in('col', [])` sebagai
     "tidak ada satu pun yang cocok", tapi diperiksa di sini juga supaya
     jelas dan tidak bergantung ke perilaku itu). */
  async function laporanTindakanUntukKunjungan(idKunjungan) {
    if (!idKunjungan || !idKunjungan.length) return [];
    const { data, error } = await sb.from('v_tindakan_kunjungan')
      .select('kunjungan_id,kode_icd9,nama,fdi,jumlah')
      .in('kunjungan_id', idKunjungan);
    if (error) throw error; return data;
  }

  /* Baris mentah untuk rekap Puskesmas: satu baris per diagnosa, dengan
     tanggal kunjungan + usia & jenis kelamin pasien saat itu — bukan
     usia sekarang. Bentuk PostgREST bersarang (kunjungan.pasien) sengaja
     diratakan di sini, supaya laporan_core.js tidak perlu tahu bentuk
     query-nya (pola yang sama dengan diagnosaTeratas() di atas). */
  async function laporanDiagnosaPuskesmas({ dari, sampai }) {
    const rows = await ambilSemua(() =>
      sb.from('diagnosa')
        .select('kode_icd10,nama,kunjungan!inner(tanggal,pasien:pasien_id(tanggal_lahir,jenis_kelamin))')
        .gte('kunjungan.tanggal', dari).lte('kunjungan.tanggal', sampai));
    return rows.map(d => ({
      kode_icd10: d.kode_icd10,
      nama: d.nama,
      tanggal: d.kunjungan && d.kunjungan.tanggal,
      tanggal_lahir: d.kunjungan && d.kunjungan.pasien && d.kunjungan.pasien.tanggal_lahir,
      jenis_kelamin: d.kunjungan && d.kunjungan.pasien && d.kunjungan.pasien.jenis_kelamin
    }));
  }

  return {
    sb, masuk, keluar, sesi, saya, bolehTulis,
    hakAksesSaya, daftarHakAkses, simpanHakAkses,
    faskes, simpanFaskes,
    daftarPoli, daftarDokter, daftarPegawai, cariIcd, cariObat, cariObatJual, daftarSigna,
    cariPasien, pasien, simpanPasien, alergiPasien, tambahAlergi, hapusAlergi, catatAkses,
    antrianHariIni, daftarKunjungan, buatKunjungan, kunjungan, ubahKunjungan,
    kajian, simpanKajian,
    pemeriksaan, simpanPemeriksaan, finalisasi, tambahAddendum, daftarAddendum,
    diagnosa, simpanDiagnosa, resep, simpanResep, rekamMedisLengkap,
    statistikHariIni, diagnosaTeratas,
    refGigi, refKondisiGigi, refBidangGigi,
    odontogram, odontogramPadaKunjungan, simpanOdontogram, riwayatOdontogram,
    pemeriksaanGigi, simpanPemeriksaanGigi,
    cariIcd9, tindakan, simpanTindakan, tindakanTeratas,
    refKesadaran, refStatusPulang,
    refPrognosa, refTacc, refSubspesialis, refSarana, refAlergi, refPpk,
    refSistemFisik, refVital: refVitalSemua,
    alergiKode, setAlergiKode,
    pcarePratinjau, observasiSatuSehat, kesiapanKode, simpanPpk, simpanPemetaanKode,
    daftarObat, simpanObat, imporObat, hapusObat,
    daftarIcd10, simpanIcd10, hapusIcd10, imporIcd10, daftarIcd9, simpanIcd9, hapusIcd9,
    kesiapanPasien, kesiapanKunjungan, ringkasanKesiapan,
    ambilSemua,
    apotekBatch, apotekStok, apotekTransaksi, apotekMasuk, apotekKeluar,
    apotekBatalkanGrup, apotekSerahkanResep, simpanBatch,
    apotekImpor, obatUntukPencocokan,
    antreanFarmasi, resepUntukFarmasi, batchObat,
    kasirMenunggu, kasirDaftarTagihan, kasirTagihan, kasirItem, kasirPembayaran,
    kasirLengkap, kasirSusunDariKunjungan, kasirCatatPembayaran,
    kasirHapusPembayaran, kasirHapusTagihan, kasirBuatTagihanBebas,
    kasirTambahItem, kasirUbahItem, kasirHapusItem, kasirJualObatBebas,
    daftarTarif, simpanTarif, kasirRekap,
    templateInvoice, simpanTemplateInvoice,
    refLab, refLabPaket, simpanRefLab, simpanRujukan, hapusRujukan, hapusLab,
    labMinta, labMintaLuar, labAntrean, labPermintaan, labKunjungan, labPasien,
    simpanHasilLab, labSelesaikan, labBukaKunci, labBatalkan,
    labTren, labBelumSelesai,
    penunjangSimpan, penunjangPasien, penunjangKunjungan, gigiBerbacaan, hapusPenunjang,
    lampiranPasien, lampiranKunjungan, simpanLampiran, hapusLampiran,
    suratPengaturan, simpanSuratPengaturan, refJenisSurat,
    resepPengaturan, simpanResepPengaturan,
    suratNomorBerikutnya, suratNomorTerpakai,
    buatSurat, ubahSurat, surat, daftarSurat, suratKunjungan, suratPasien,
    suratBatalkan, suratCatatCetak,
    antreanHariIni, antreanKuota, antreanAmbilLoket, antreanPanggil,
    antreanCheckin, antreanMulaiLayan, antreanLewat, antreanBatal, antreanUbah,
    antreanPanggilanHariIni, langgananAntrean,
    poliJadwal, simpanJadwal, hapusJadwal, poliLibur, simpanLibur, hapusLibur,
    antreanPengaturan, simpanAntreanPengaturan, antreanTokenBaru, antreanLayar,
    antrolAkun, antrolAkunSimpan, antrolAkunHapus, antrolLog,
    panggilBridging, riwayatBridging,
    refKronisDiagnosa, refKronisKuotaObat,
    kronisImporRingkas, kronisImporDaftar, kronisImporBaris, kronisImporUsulan,
    kronisImporTampung, kronisImporCocokkan, kronisImporBatalCocok,
    kronisImporAbaikan, kronisImporOtomatis, kronisImporBersihkan,
    pasienCariMirip, pasienBuatMassal,
    kronisPantauObat, kronisPantauLab, kronisPantauStatin, kronisTelponH1,
    kronisPasien, kronisStatinPasien, kronisUsulanDiagnosa,
    kronisDaftarSimpan, kronisTerapiSelesai, kronisH3Cek,
    laporanKunjunganRentang, laporanRujukan,
    laporanKeuanganTagihan, laporanKeuanganPembayaran,
    laporanRegisterPoli, laporanTindakanUntukKunjungan, laporanDiagnosaPuskesmas
  };
})();

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
    _saya && (peranDiizinkan.includes(_saya.peran) || _saya.peran === 'admin');

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
  async function cariObat(kata, batas = 25) {
    let q = sb.from('obat').select('id,nama,satuan,bentuk_sediaan,kekuatan,kode_kfa,golongan')
      .eq('aktif', true).order('nama').limit(batas);
    if (kata && kata.length >= 2) q = q.or(`nama.ilike.%${kata}%,nama_generik.ilike.%${kata}%`);
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
  async function simpanResep(kunjunganId, item, catatan = null) {
    let r = await resep(kunjunganId);
    if (!r) {
      const { data, error } = await sb.from('resep')
        .insert({ kunjungan_id: kunjunganId, catatan, dibuat_oleh: _saya?.id }).select().single();
      if (error) throw error; r = data;
    } else {
      await sb.from('resep').update({ catatan }).eq('id', r.id);
      const { error } = await sb.from('resep_item').delete().eq('resep_id', r.id);
      if (error) throw error;
    }
    if (!item.length) return { ...r, item: [] };
    const rows = item.map((o, i) => ({
      resep_id: r.id, obat_id: o.obat_id || null, nama_obat: o.nama_obat,
      kode_kfa: o.kode_kfa || null, jumlah: o.jumlah, satuan: o.satuan,
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
    let q = sb.from('icd9cm').select('kode,nama_id,nama_en,kategori,per_gigi')
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
      p_no_batch: r.no_batch || null, p_keterangan: r.keterangan || null
    });
    if (error) throw error; return data;
  }

  async function apotekKeluar(r) {
    const { data, error } = await sb.rpc('apotek_keluar', {
      p_obat_id: r.obat_id, p_jumlah: r.jumlah,
      p_kategori: r.kategori || 'Penjualan Bebas',
      p_tanggal: r.tanggal || null,
      p_kunjungan_id: r.kunjungan_id || null,
      p_resep_item_id: r.resep_item_id || null,
      p_batch_id: r.batch_id || null,
      p_keterangan: r.keterangan || null
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
                                      pasien:pasien_id(id,no_rm,nama,tanggal_lahir,jenis_kelamin),
                                      poli:poli_id(nama)),
               penulis:dibuat_oleh(nama)`)
      .eq('id', resepId).single();
    if (error) throw error;
    if (data.item) data.item.sort((a, b) => (a.urutan || 0) - (b.urutan || 0));

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

  return {
    sb, masuk, keluar, sesi, saya, bolehTulis,
    faskes, simpanFaskes,
    daftarPoli, daftarDokter, daftarPegawai, cariIcd, cariObat, daftarSigna,
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
    daftarObat, simpanObat, imporObat,
    daftarIcd10, simpanIcd10, daftarIcd9, simpanIcd9,
    kesiapanPasien, kesiapanKunjungan, ringkasanKesiapan,
    ambilSemua,
    apotekBatch, apotekStok, apotekTransaksi, apotekMasuk, apotekKeluar,
    apotekBatalkanGrup, apotekSerahkanResep, simpanBatch,
    apotekImpor, obatUntukPencocokan,
    antreanFarmasi, resepUntukFarmasi, batchObat,
    kasirMenunggu, kasirDaftarTagihan, kasirTagihan, kasirItem, kasirPembayaran,
    kasirLengkap, kasirSusunDariKunjungan, kasirCatatPembayaran,
    kasirHapusPembayaran, kasirHapusTagihan, kasirBuatTagihanBebas,
    kasirTambahItem, kasirUbahItem, kasirHapusItem,
    daftarTarif, simpanTarif, kasirRekap,
    templateInvoice, simpanTemplateInvoice,
    refLab, refLabPaket, simpanRefLab, simpanRujukan, hapusRujukan,
    labMinta, labMintaLuar, labAntrean, labPermintaan, labKunjungan, labPasien,
    simpanHasilLab, labSelesaikan, labBukaKunci, labBatalkan,
    labTren, labBelumSelesai,
    penunjangSimpan, penunjangPasien, penunjangKunjungan, gigiBerbacaan, hapusPenunjang,
    lampiranPasien, lampiranKunjungan, simpanLampiran, hapusLampiran,
    panggilBridging, riwayatBridging
  };
})();

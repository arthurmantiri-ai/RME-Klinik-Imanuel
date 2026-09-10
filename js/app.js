/* =====================================================================
   APP — kerangka aplikasi: pemeriksaan sesi, menu sesuai peran,
   dan router berbasis tanda pagar (#/halaman).
   ===================================================================== */
const App = (() => {

  const view = () => document.getElementById('view');

  /* Menu — `peran: '*'` terbuka untuk semua peran aktif; `kode` dicocokkan
     ke daftar hak akses peran yang sedang login (lihat boleh() di bawah
     dan Pengaturan -> Hak Akses). Diganti dari daftar peran tetap ke kode
     hak akses 9 Sep 2026 — lihat sql/02_rls.sql bagian HAK AKSES. */
  const MENU = [
    { grup: 'Pelayanan' },
    { rute: '#/beranda',     label: 'Beranda',       ikon: 'beranda',   peran: '*' },
    { rute: '#/pendaftaran', label: 'Pendaftaran',   ikon: 'daftar',    kode: 'menu_pendaftaran' },
    { rute: '#/antrian',     label: 'Antrean Hari Ini', ikon: 'antrian', peran: '*', hitung: true },
    { rute: '#/lab',         label: 'Lab & Penunjang', ikon: 'stetoskop', peran: '*' },
    { rute: '#/apotek',      label: 'Apotek',        ikon: 'pil',       peran: '*' },
    { rute: '#/kasir',       label: 'Kasir',         ikon: 'jantung',   kode: 'menu_kasir' },
    { rute: '#/surat',       label: 'Surat Keterangan', ikon: 'surat',  peran: '*' },
    { grup: 'Data' },
    { rute: '#/pasien',      label: 'Data Pasien',   ikon: 'pasien',    peran: '*' },
    { rute: '#/riwayat',     label: 'Riwayat Kunjungan', ikon: 'rekam', peran: '*' },
    { rute: '#/pantau-kronis', label: 'Pemantauan Kronis', ikon: 'stetoskop', peran: '*' },
    { rute: '#/laporan',     label: 'Laporan',       ikon: 'laporan',   kode: 'menu_laporan' },
    { grup: 'Sistem' },
    { rute: '#/master',      label: 'Master Data',   ikon: 'pil',       kode: 'master_data' },
    { rute: '#/tarif',       label: 'Tarif & Invoice', ikon: 'laporan', kode: 'menu_tarif' },
    { rute: '#/jadwal',      label: 'Antrean & Layar', ikon: 'jam',     kode: 'antrean_pengaturan' },
    { rute: '#/migrasi',     label: 'Migrasi Portal', ikon: 'unduh',    kode: 'menu_migrasi' },
    { rute: '#/pengaturan',  label: 'Pengaturan',    ikon: 'setelan',   kode: 'menu_pengaturan' }
  ];

  const RUTE = {
    'beranda':     () => Beranda.render(view()),
    'pendaftaran': (p) => Pendaftaran.render(view(), p),
    'antrian':     () => Antrian.render(view()),
    'pasien':      (p) => Pasien.render(view(), p),
    'riwayat':     () => Rekam.renderRiwayat(view()),
    'pantau-kronis': (p) => PantauKronis.render(view(), p),
    'kajian':      (p) => Kajian.render(view(), p),
    'periksa':     (p) => Periksa.render(view(), p),
    'rekam':       (p) => Rekam.render(view(), p),
    'laporan':     (p) => Laporan.render(view(), p),
    'lab':         (p) => Lab.render(view(), p),
    'apotek':      (p) => Apotek.render(view(), p),
    'kasir':       (p) => Kasir.render(view(), p),
    'surat':       (p) => Surat.render(view(), p),
    'tarif':       (p) => Tarif.render(view(), p),
    'jadwal':      (p) => Jadwal.render(view(), p),
    'migrasi':     (p) => Migrasi.render(view(), p),
    'master':      (p) => Master.render(view(), p),
    'pengaturan':  (p) => Pengaturan.render(view(), p)
  };

  const JUDUL = {
    beranda: 'Beranda', pendaftaran: 'Pendaftaran Pasien', antrian: 'Antrean Hari Ini',
    pasien: 'Data Pasien', riwayat: 'Riwayat Kunjungan', 'pantau-kronis': 'Pemantauan Kronis', kajian: 'Kajian Awal',
    periksa: 'Pemeriksaan Dokter', rekam: 'Rekam Medis', laporan: 'Laporan',
    lab: 'Lab & Pemeriksaan Penunjang',
    apotek: 'Apotek', kasir: 'Kasir', surat: 'Surat Keterangan',
    tarif: 'Tarif & Tampilan Invoice',
    jadwal: 'Antrean & Layar Tunggu', migrasi: 'Migrasi Portal',
    master: 'Master Data', pengaturan: 'Pengaturan'
  };

  let profil = null;
  // Kode hak akses yang diizinkan untuk peran SENDIRI, dimuat sekali saat
  // masuk (lihat mulai()). master tidak butuh isinya sama sekali — boleh()
  // selalu meloloskan master lewat jaring pengaman, sama seperti di database.
  let hakSaya = new Set();

  /* ------------------------------ Menu -------------------------------- */
  function gambarMenu() {
    const nav = document.getElementById('nav');
    const rute = (location.hash || '#/beranda').split('/')[1] || 'beranda';
    const terlihat = (m) => m.peran === '*' || boleh(m.kode);
    const bagian = [];
    MENU.forEach(m => {
      if (m.grup) { bagian.push({ grup: m.grup, isi: [] }); return; }
      if (!terlihat(m)) return;
      if (!bagian.length) bagian.push({ grup: null, isi: [] });
      bagian[bagian.length - 1].isi.push(m);
    });

    nav.innerHTML = bagian.filter(b => b.isi.length).map(b => {
      const judul = b.grup ? `<div class="nav-label">${UI.esc(b.grup)}</div>` : '';
      const tautan = b.isi.map(m => {
        const aktif = ('#/' + rute) === m.rute ? 'active' : '';
        const hitung = m.hitung ? `<span class="badge-count" id="hitungAntrian">0</span>` : '';
        return `<a href="${m.rute}" class="${aktif}">${UI.ikon(m.ikon, 17)}
                  <span>${UI.esc(m.label)}</span>${hitung}</a>`;
      }).join('');
      return judul + tautan;
    }).join('');
    perbaruiHitungAntrian();
  }

  async function perbaruiHitungAntrian() {
    const el = document.getElementById('hitungAntrian');
    if (!el) return;
    try {
      /* Dihitung dari ANTREAN, bukan kunjungan: pemesanan Mobile JKN yang
         pasiennya belum datang belum punya kunjungan sama sekali, dan
         justru merekalah yang perlu terlihat oleh petugas loket. */
      const a = await DB.antreanHariIni();
      const belum = a.filter(x => AntreanCore.masihAktif(x)).length;
      el.textContent = belum;
      el.style.display = belum ? 'grid' : 'none';
    } catch (e) { el.style.display = 'none'; }
  }

  /* ------------------------------ Router ------------------------------ */
  async function jalankanRute() {
    const hash = location.hash || '#/beranda';
    const bagian = hash.slice(2).split('/');
    const nama = bagian[0] || 'beranda';
    const param = bagian.slice(1);

    document.getElementById('judulHalaman').textContent = JUDUL[nama] || 'RME';
    document.title = (JUDUL[nama] || 'RME') + ' — ' + CONFIG.NAMA_KLINIK;
    document.getElementById('sidebar').classList.remove('open');
    gambarMenu();

    const fn = RUTE[nama];
    if (!fn) {
      view().innerHTML = UI.kosong('Halaman tidak ditemukan',
        'Menu yang Anda tuju tidak tersedia.',
        '<a href="#/beranda" class="btn btn-primary">Kembali ke beranda</a>');
      return;
    }
    view().innerHTML = UI.memuat();
    try {
      await fn(param);
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      view().innerHTML = `<div class="banner err"><div>
        <b>Terjadi kesalahan saat memuat halaman.</b><br>${UI.esc(e.message || e)}
        </div></div>
        <button class="btn btn-secondary" onclick="location.reload()">Muat ulang</button>`;
    }
  }

  /* ------------------------------ Mulai ------------------------------- */
  async function mulai() {
    if (CONFIG.SUPABASE_URL.includes('GANTI-DENGAN')) {
      document.body.innerHTML = `<div style="padding:40px;max-width:600px;margin:0 auto">
        <div class="banner warn"><div><b>Aplikasi belum dikonfigurasi.</b><br>
        Buka <code>js/config.js</code>, isi <code>SUPABASE_URL</code> dan
        <code>SUPABASE_ANON_KEY</code>, lalu muat ulang halaman ini.</div></div></div>`;
      return;
    }

    const s = await DB.sesi();
    if (!s) { location.replace('index.html'); return; }

    try {
      profil = await DB.saya(true);
    } catch (e) {
      await DB.keluar(); location.replace('index.html'); return;
    }
    if (!profil || !profil.aktif) {
      alert('Akun Anda belum aktif atau belum terdaftar sebagai pegawai. Hubungi master klinik.');
      await DB.keluar(); location.replace('index.html'); return;
    }

    // Hak akses (9 Sep 2026): dimuat sekali di sini, dipakai boleh() di
    // seluruh sesi. master tidak perlu memuat apa pun (selalu lolos).
    try {
      hakSaya = profil.peran === 'master' ? new Set() : new Set(await DB.hakAksesSaya());
    } catch (e) {
      console.error('Gagal memuat hak akses:', e);
      hakSaya = new Set();
    }

    // Identitas klinik
    let f = null;
    try { f = await DB.faskes(); } catch (e) { /* pakai CONFIG saja */ }
    const nama = f?.nama || CONFIG.NAMA_KLINIK;
    document.getElementById('brandTeks').innerHTML =
      `${UI.esc(nama.replace(/^Klinik (Pratama )?/i, ''))}<small>Rekam Medis</small>`;
    document.getElementById('brandMark').textContent = CONFIG.SINGKATAN;
    document.getElementById('userNama').textContent = profil.nama;
    document.getElementById('userPeran').textContent = profil.peran;
    document.getElementById('userAvatar').textContent = UI.inisial(profil.nama);
    document.getElementById('tanggalHariIni').textContent = UI.tglIndo(new Date(), true);
    document.getElementById('btnKeluar').innerHTML = UI.ikon('keluar', 16);
    document.getElementById('btnMenu').innerHTML = UI.ikon('antrian', 18);

    document.getElementById('btnKeluar').addEventListener('click', async () => {
      if (await UI.konfirmasi('Keluar dari aplikasi?',
          'Anda perlu memasukkan email dan kata sandi lagi untuk masuk.', 'Keluar')) {
        await DB.keluar(); location.replace('index.html');
      }
    });
    document.getElementById('btnMenu').addEventListener('click', () =>
      document.getElementById('sidebar').classList.toggle('open'));

    window.addEventListener('hashchange', jalankanRute);
    if (!location.hash) location.hash = '#/beranda';
    await jalankanRute();

    // Segarkan hitungan antrian tiap 60 detik
    setInterval(perbaruiHitungAntrian, 60000);
  }

  /* Bantu halaman lain */
  const pergi = (rute) => { location.hash = rute; };
  const segarkan = () => jalankanRute();
  const siapa = () => profil;

  // 9 Sep 2026: `boleh(kode)` menggantikan `boleh(daftarPeran)` — satu kode
  // hak akses (lihat js/db.js -> hakAksesSaya(), diatur lewat Pengaturan ->
  // Hak Akses), bukan daftar peran tetap yang ditulis di kode lagi. master
  // selalu lolos, sama seperti di database (public.hak_akses_cek()).
  const boleh = (kode) => !!profil && (profil.peran === 'master' || hakSaya.has(kode));

  document.addEventListener('DOMContentLoaded', mulai);
  return { pergi, segarkan, siapa, boleh, perbaruiHitungAntrian };
})();

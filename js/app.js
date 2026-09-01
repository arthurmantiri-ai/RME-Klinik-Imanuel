/* =====================================================================
   APP — kerangka aplikasi: pemeriksaan sesi, menu sesuai peran,
   dan router berbasis tanda pagar (#/halaman).
   ===================================================================== */
const App = (() => {

  const view = () => document.getElementById('view');

  /* Menu — `peran` menentukan siapa yang melihat apa */
  const MENU = [
    { grup: 'Pelayanan' },
    { rute: '#/beranda',     label: 'Beranda',       ikon: 'beranda',   peran: '*' },
    { rute: '#/pendaftaran', label: 'Pendaftaran',   ikon: 'daftar',    peran: ['admin','pendaftaran','perawat','dokter'] },
    { rute: '#/antrian',     label: 'Antrian Hari Ini', ikon: 'antrian', peran: '*', hitung: true },
    { rute: '#/apotek',      label: 'Apotek',        ikon: 'pil',       peran: '*' },
    { rute: '#/kasir',       label: 'Kasir',         ikon: 'jantung',   peran: ['admin','kasir','pendaftaran'] },
    { grup: 'Data' },
    { rute: '#/pasien',      label: 'Data Pasien',   ikon: 'pasien',    peran: '*' },
    { rute: '#/riwayat',     label: 'Riwayat Kunjungan', ikon: 'rekam', peran: '*' },
    { rute: '#/laporan',     label: 'Laporan',       ikon: 'laporan',   peran: ['admin','dokter','pendaftaran'] },
    { grup: 'Sistem' },
    { rute: '#/master',      label: 'Master Data',   ikon: 'pil',       peran: ['admin'] },
    { rute: '#/tarif',       label: 'Tarif & Invoice', ikon: 'laporan', peran: ['admin'] },
    { rute: '#/pengaturan',  label: 'Pengaturan',    ikon: 'setelan',   peran: ['admin'] }
  ];

  const RUTE = {
    'beranda':     () => Beranda.render(view()),
    'pendaftaran': (p) => Pendaftaran.render(view(), p),
    'antrian':     () => Antrian.render(view()),
    'pasien':      (p) => Pasien.render(view(), p),
    'riwayat':     () => Rekam.renderRiwayat(view()),
    'kajian':      (p) => Kajian.render(view(), p),
    'periksa':     (p) => Periksa.render(view(), p),
    'rekam':       (p) => Rekam.render(view(), p),
    'laporan':     () => Laporan.render(view()),
    'apotek':      (p) => Apotek.render(view(), p),
    'kasir':       (p) => Kasir.render(view(), p),
    'tarif':       (p) => Tarif.render(view(), p),
    'master':      (p) => Master.render(view(), p),
    'pengaturan':  (p) => Pengaturan.render(view(), p)
  };

  const JUDUL = {
    beranda: 'Beranda', pendaftaran: 'Pendaftaran Pasien', antrian: 'Antrian Hari Ini',
    pasien: 'Data Pasien', riwayat: 'Riwayat Kunjungan', kajian: 'Kajian Awal',
    periksa: 'Pemeriksaan Dokter', rekam: 'Rekam Medis', laporan: 'Laporan',
    apotek: 'Apotek', kasir: 'Kasir', tarif: 'Tarif & Tampilan Invoice',
    master: 'Master Data', pengaturan: 'Pengaturan'
  };

  let profil = null;

  /* ------------------------------ Menu -------------------------------- */
  function gambarMenu() {
    const nav = document.getElementById('nav');
    const rute = (location.hash || '#/beranda').split('/')[1] || 'beranda';
    const terlihat = (m) => m.peran === '*' || m.peran.includes(profil.peran);
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
      const a = await DB.antrianHariIni();
      const belum = a.filter(x => x.status !== 'SELESAI' && x.status !== 'BATAL').length;
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
      alert('Akun Anda belum aktif atau belum terdaftar sebagai pegawai. Hubungi admin klinik.');
      await DB.keluar(); location.replace('index.html'); return;
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
  const boleh = (daftarPeran) => profil && (profil.peran === 'admin' || daftarPeran.includes(profil.peran));

  document.addEventListener('DOMContentLoaded', mulai);
  return { pergi, segarkan, siapa, boleh, perbaruiHitungAntrian };
})();

/* =====================================================================
   LAYAR TUNGGU — logika halaman display.html
   ---------------------------------------------------------------------
   Halaman ini TIDAK login. Ia hanya membawa token panjang di URL dan
   memanggil satu fungsi database, antrean_layar(), yang secara struktural
   tidak bisa memulangkan nama pasien, nomor rekam medis, atau apa pun
   selain nomor antrean. Karena itu tautan yang tercecer di ruang tunggu
   tidak membocorkan apa-apa: isinya kalimat yang memang diteriakkan.

   Tiga hal yang membuat berkas ini lebih panjang dari kelihatannya:

   1. SUARA HANYA BOLEH BERBUNYI SETELAH ADA YANG MENYENTUH LAYAR.
      Semua peramban modern menolak memainkan audio pada halaman yang
      belum pernah disentuh. Kalau ini diabaikan, layar akan tampak
      bekerja sempurna di komputer pengembang (yang layarnya disentuh
      terus) dan bisu di TV klinik. Karena itu ada tombol "Aktifkan
      suara" yang hilang sendiri setelah ditekan.

   2. LAYAR TIDAK BOLEH MENGULANG BUNYI SETIAP MENYEGARKAN DATA.
      Ia menyegarkan tiap 3 detik. Yang menentukan "ini panggilan baru"
      bukan isinya melainkan id baris panggilan yang selalu naik. Layar
      mengingat id tertinggi yang sudah dibunyikan.

   3. JARINGAN KLINIK PUTUS-NYAMBUNG.
      Kegagalan mengambil data TIDAK mengosongkan layar. Nomor terakhir
      tetap terpampang dan hanya titik kecil di pojok yang berubah merah,
      karena layar kosong membuat pasien mengira antreannya hilang.
   ===================================================================== */
(() => {

  const $ = (id) => document.getElementById(id);
  const A = AntreanCore;

  const token = new URLSearchParams(location.search).get('t') || '';

  let sb = null;
  let idTerakhirDibunyikan = 0;
  let suaraAktif = false;
  let audioCtx = null;
  let dataTerakhir = null;
  let gagalBerturut = 0;
  let sudahPernahBerhasil = false;

  const JEDA_MS = 3000;

  /* ------------------------------- Bunyi ------------------------------- */

  /* Bel dibuat dengan WebAudio, bukan berkas mp3. Alasannya bukan ukuran:
     berkas audio harus diunduh, dan panggilan pertama pagi hari sering
     jatuh persis saat jaringan klinik paling sibuk — bel yang belum
     selesai diunduh berarti pasien pertama tidak terpanggil. Nada yang
     dihitung sendiri selalu siap. */
  function bel() {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [880, 1174.7].forEach((hz, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const mulai = t0 + i * 0.18;
      gain.gain.setValueAtTime(0.0001, mulai);
      gain.gain.exponentialRampToValueAtTime(0.32, mulai + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, mulai + 0.55);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(mulai);
      osc.stop(mulai + 0.6);
    });
  }

  /* Pembaca suara. Suara Indonesia dipilih kalau ada; kalau tidak ada,
     suara apa pun tetap lebih baik daripada diam — kalimatnya pendek dan
     angkanya tetap terdengar. */
  function suaraIndonesia() {
    if (!('speechSynthesis' in window)) return null;
    const daftar = speechSynthesis.getVoices() || [];
    return daftar.find(v => /^id(-|_)/i.test(v.lang))
        || daftar.find(v => /indonesi/i.test(v.name))
        || null;
  }

  const antrianUcap = [];
  let sedangMengucap = false;

  function ucapBerikutnya() {
    if (sedangMengucap || !antrianUcap.length) return;
    if (!('speechSynthesis' in window)) { antrianUcap.length = 0; return; }
    sedangMengucap = true;
    const teks = antrianUcap.shift();
    const u = new SpeechSynthesisUtterance(teks);
    u.lang = 'id-ID';
    const v = suaraIndonesia();
    if (v) u.voice = v;
    u.rate = 0.92;      // sedikit lebih lambat: ini dibaca dari seberang ruangan
    u.pitch = 1;
    const selesai = () => { sedangMengucap = false; setTimeout(ucapBerikutnya, 250); };
    u.onend = selesai;
    u.onerror = selesai;
    speechSynthesis.speak(u);
  }

  /* Panggilan diantrikan, tidak ditumpuk. Dua nomor yang dipanggil dalam
     detik yang sama akan terdengar bergantian, bukan bersamaan — suara
     yang saling menimpa membuat keduanya tidak bisa dimengerti. */
  function umumkan(nomor, tujuan, ulang) {
    if (!suaraAktif) return;
    bel();
    const teks = A.teksPanggilan(nomor, tujuan, ulang);
    // Beri jarak dari bel supaya kalimatnya tidak tertutup nada.
    setTimeout(() => { antrianUcap.push(teks); ucapBerikutnya(); }, 700);
  }

  function nyalakanSuara() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }

    if ('speechSynthesis' in window) {
      // Ucapan kosong ini yang "membuka kunci" pembaca suara di iOS dan
      // sebagian Android. Tanpa ini, kalimat pertama tidak pernah keluar.
      try {
        const bisu = new SpeechSynthesisUtterance(' ');
        bisu.volume = 0;
        speechSynthesis.speak(bisu);
      } catch (e) { /* diabaikan */ }
    }

    suaraAktif = true;
    $('btnSuara').hidden = true;
    bel();
  }

  /* --------------------------- Layar tetap nyala ------------------------ */
  let kunciLayar = null;
  async function jagaLayarNyala() {
    if (!('wakeLock' in navigator)) return;
    try { kunciLayar = await navigator.wakeLock.request('screen'); }
    catch (e) { /* peramban menolak — layar akan meredup, tidak fatal */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !kunciLayar) jagaLayarNyala();
  });

  /* ------------------------------- Jam --------------------------------- */
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  function gambarJam() {
    const d = new Date();
    $('jam').textContent =
      `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    $('tanggal').textContent =
      `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  }

  /* ------------------------------ Tampilan ----------------------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function gambar(d) {
    dataTerakhir = d;

    $('namaKlinik').textContent = d.klinik || 'Klinik';
    $('judulLayar').textContent = d.judul || 'Antrean Pasien';
    $('logo').textContent = (d.klinik || 'K').replace(/^Klinik (Pratama )?/i, '')
      .split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'K';
    $('teksJalan').textContent = d.teks_berjalan || '';

    const panggilan = Array.isArray(d.panggilan) ? d.panggilan : [];
    const kini = panggilan[0] || null;

    if (kini) {
      $('nomorBesar').textContent  = kini.nomor;
      $('tujuanBesar').textContent = kini.tujuan || kini.poli || '';
      $('waktuBesar').textContent  = kini.waktu ? `dipanggil pukul ${kini.waktu}` : '';
      const u = $('ulangBesar');
      u.hidden = !(kini.ulang > 1);
      u.textContent = kini.ulang > 1 ? `Panggilan ke-${kini.ulang}` : '';
    } else {
      $('nomorBesar').textContent  = '—';
      $('tujuanBesar').textContent = 'Menunggu panggilan';
      $('waktuBesar').textContent  = '';
      $('ulangBesar').hidden = true;
    }

    /* Panggilan sebelumnya. Berguna bagi pasien yang baru masuk ruangan
       dan ingin tahu apakah nomornya sudah lewat. */
    const lain = panggilan.slice(1, 6);
    $('riwayat').hidden = !lain.length;
    $('riwayatIsi').innerHTML = lain.map(p =>
      `<li><b>${esc(p.nomor)}</b> · ${esc(p.tujuan || p.poli || '')} ${esc(p.waktu || '')}</li>`
    ).join('');

    const poli = Array.isArray(d.poli) ? d.poli : [];
    $('poliGrid').innerHTML = poli.map(p => {
      const berikut = Array.isArray(p.berikut) ? p.berikut : [];
      return `<div class="poli">
        <h2>${esc(p.nama)}</h2>
        <div class="kecil">Nomor dipanggil</div>
        <div class="besar ${p.dipanggil ? '' : 'kosong'}">${esc(p.dipanggil || '—')}</div>
        <div class="sisa">${p.sisa || 0} menunggu · ${p.selesai || 0} selesai</div>
        ${berikut.length
          ? `<div class="berikut">${berikut.map(n => `<span>${esc(n)}</span>`).join('')}</div>`
          : ''}
      </div>`;
    }).join('');

    /* Bunyikan hanya panggilan yang benar-benar baru.
       Pada pemuatan pertama, seluruh panggilan hari itu sudah ada di
       daftar — membunyikan semuanya berarti layar yang baru dinyalakan
       akan meneriakkan dua puluh nomor lama berturut-turut. Karena itu
       muatan pertama hanya DICATAT, tidak dibunyikan. */
    const idTerbaru = panggilan.length ? Number(panggilan[0].id) : 0;
    if (!sudahPernahBerhasil) {
      idTerakhirDibunyikan = idTerbaru;
      sudahPernahBerhasil = true;
    } else if (idTerbaru > idTerakhirDibunyikan) {
      const baru = panggilan
        .filter(p => Number(p.id) > idTerakhirDibunyikan)
        .sort((a, b) => Number(a.id) - Number(b.id));
      baru.forEach(p => umumkan(p.nomor, p.tujuan || p.poli, p.ulang || 1));
      idTerakhirDibunyikan = idTerbaru;

      const s = $('sorotan');
      s.classList.remove('nyala');
      void s.offsetWidth;               // paksa animasi mulai lagi
      s.classList.add('nyala');
      setTimeout(() => s.classList.remove('nyala'), 4000);
    }
  }

  function tampilkanPesan(judul, isi) {
    $('pesanJudul').textContent = judul;
    $('pesanIsi').innerHTML = isi;
    $('pesan').hidden = false;
  }
  const sembunyikanPesan = () => { $('pesan').hidden = true; };

  function tandaiKoneksi(ok) {
    $('titik').classList.toggle('putus', !ok);
    $('statusTeks').textContent = ok ? 'Terhubung' : 'Mencoba menyambung…';
  }

  /* ------------------------------- Ambil ------------------------------- */
  async function muat() {
    try {
      const d = await sb.rpc('antrean_layar', { p_token: token });
      if (d.error) throw d.error;
      const hasil = d.data;

      if (!hasil || hasil.galat) {
        tampilkanPesan('Tautan layar tidak dikenal', `
          Token pada alamat ini tidak cocok dengan yang tersimpan di klinik.
          Buka <code>Pengaturan → Antrean &amp; Layar</code> di aplikasi RME,
          salin ulang tautan layarnya, lalu buka alamat itu di sini.`);
        tandaiKoneksi(true);
        return;
      }

      sembunyikanPesan();
      gambar(hasil);
      gagalBerturut = 0;
      tandaiKoneksi(true);

    } catch (e) {
      gagalBerturut++;
      tandaiKoneksi(false);
      /* Layar TIDAK dikosongkan. Nomor terakhir tetap terpampang: pasien
         yang melihat layar kosong akan mengira antreannya hilang dan
         berbondong ke loket — tepat ketika petugas sedang menghadapi
         gangguan jaringan. Baru setelah gagal lama dan belum pernah
         berhasil sama sekali, pesan lengkap ditampilkan. */
      if (!sudahPernahBerhasil && gagalBerturut >= 3) {
        tampilkanPesan('Belum bisa menghubungi klinik', `
          Layar tidak dapat mengambil data antrean.
          Periksa sambungan internet perangkat ini, lalu tunggu —
          layar akan menyambung sendiri begitu jaringan kembali.`);
      }
    }
  }

  /* ------------------------------- Mulai ------------------------------- */
  function mulai() {
    gambarJam();
    setInterval(gambarJam, 1000);

    $('btnSuara').addEventListener('click', nyalakanSuara);
    // Menyentuh layar di mana pun juga menyalakan suara — di TV dengan
    // remote, tombol kecil di pojok bawah sulit dituju.
    document.addEventListener('click', () => { if (!suaraAktif) nyalakanSuara(); }, { once: false });

    if ('speechSynthesis' in window) {
      // Daftar suara sering baru terisi setelah peristiwa ini.
      speechSynthesis.onvoiceschanged = () => { /* cukup memicu pemuatan */ };
    }

    if (!token) {
      tampilkanPesan('Tautan layar belum lengkap', `
        Alamat ini harus memuat token layar, contohnya
        <code>display.html?t=…</code>.<br><br>
        Buka <code>Pengaturan → Antrean &amp; Layar</code> di aplikasi RME,
        tekan <b>Salin tautan layar</b>, lalu buka tautan itu di perangkat ini.`);
      return;
    }

    if (typeof CONFIG === 'undefined' || CONFIG.SUPABASE_URL.includes('GANTI-DENGAN')) {
      tampilkanPesan('Aplikasi belum dikonfigurasi', `
        Berkas <code>js/config.js</code> belum berisi alamat Supabase klinik.`);
      return;
    }

    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    jagaLayarNyala();
    muat();
    setInterval(muat, JEDA_MS);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mulai);
  else mulai();

  /* Dibuka untuk pengujian halaman (test/uji_antrean_halaman.js). */
  window.Layar = {
    gambar,
    get dataTerakhir() { return dataTerakhir; },
    get idTerakhirDibunyikan() { return idTerakhirDibunyikan; }
  };
})();

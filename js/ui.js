/* =====================================================================
   UI — fungsi bantu tampilan: notifikasi, modal, format tanggal,
   escape HTML, dan ikon.
   ===================================================================== */
const UI = (() => {

  /* ---------- Keamanan tampilan: selalu escape data dari database ------ */
  const esc = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------- Notifikasi ---------------------------------------------- */
  function toast(pesan, tipe = 'ok', durasi = 3600) {
    let wrap = document.getElementById('toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + tipe;
    el.innerHTML = `<span>${esc(pesan)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), durasi);
  }

  /* ---------- Modal ---------------------------------------------------- */
  function modal({ judul, isi, lebar = false, tombol = [], siap = null }) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg open';
      const tombolHtml = tombol.map((b, i) =>
        `<button class="btn ${b.kelas || 'btn-secondary'}" data-idx="${i}">${esc(b.teks)}</button>`
      ).join('');
      bg.innerHTML = `
        <div class="modal ${lebar ? 'wide' : ''}">
          <div class="modal-head">
            <h2>${esc(judul)}</h2>
            <button class="btn-icon" data-tutup="1" aria-label="Tutup">${ikon('x', 16)}</button>
          </div>
          <div class="modal-body">${isi}</div>
          ${tombol.length ? `<div class="modal-foot">${tombolHtml}</div>` : ''}
        </div>`;
      document.body.appendChild(bg);

      const tutup = (hasil) => { bg.remove(); resolve(hasil); };
      /* Sengaja TIDAK menutup saat mengklik area gelap di luar kotak modal
         (dulu: e.target === bg). Petugas sering mengetik data lumayan
         panjang (identitas pasien, dsb.) dan sebuah klik meleset sedikit
         di luar kotak langsung membuang seluruh isian tanpa konfirmasi.
         Sekarang modal HANYA tertutup lewat tombol X (data-tutup) atau
         tombol aksi eksplisit (mis. Batal) di bawah. */
      bg.addEventListener('click', async (e) => {
        if (e.target.closest('[data-tutup]')) { tutup(null); return; }
        const b = e.target.closest('[data-idx]');
        if (!b || b.disabled) return;
        const def = tombol[+b.dataset.idx];
        if (!def.aksi) { tutup(def.nilai); return; }

        /* Aksi boleh berupa fungsi asinkron. Modal harus menunggu hasilnya
           sebelum menutup, kalau tidak pesan kesalahan validasi ikut hilang
           bersama isian yang sudah diketik. Tombol dinonaktifkan selama
           menunggu supaya tidak tersimpan dua kali. */
        const teksAsli = b.innerHTML;
        b.disabled = true;
        let r;
        try {
          r = await def.aksi(bg.querySelector('.modal-body'));
        } catch (err) {
          console.error(err);
          toast(err.message || 'Terjadi kesalahan.', 'err');
          r = false;
        } finally {
          if (bg.isConnected) { b.disabled = false; b.innerHTML = teksAsli; }
        }
        if (r === false) return;             // aksi minta modal tetap terbuka
        tutup(r === undefined ? def.nilai : r);
      });
      /* Escape tetap menutup modal (sengaja TIDAK ikut dihapus seperti klik
         di luar kotak di atas) — beberapa uji Playwright yang sudah ada
         (mis. test/uji_lab_halaman.js) memakai tombol Escape untuk menutup
         dialog sebagai bagian alur pengujian, jadi menghapusnya akan
         merusak uji yang sudah lolos tanpa diminta. */
      document.addEventListener('keydown', function esc2(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', esc2); tutup(null); }
      });
      const badan = bg.querySelector('.modal-body');
      if (siap) { try { siap(badan); } catch (e) { console.error(e); } }
      const fokus = badan.querySelector('input, select, textarea');
      if (fokus) setTimeout(() => fokus.focus(), 60);
    });
  }

  async function konfirmasi(judul, pesan, tombolYa = 'Ya, lanjutkan', bahaya = false) {
    return await modal({
      judul,
      isi: `<p style="margin:0">${esc(pesan)}</p>`,
      tombol: [
        { teks: 'Batal', nilai: false },
        { teks: tombolYa, nilai: true, kelas: bahaya ? 'btn-danger' : 'btn-primary' }
      ]
    }) === true;
  }

  /* ---------- Format tanggal & angka ----------------------------------- */
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  const tglIndo = (t, denganHari = false) => {
    if (!t) return '-';
    const d = new Date(t);
    if (isNaN(d)) return '-';
    const s = `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
    return denganHari ? `${HARI[d.getDay()]}, ${s}` : s;
  };
  const tglPendek = (t) => {
    if (!t) return '-';
    const d = new Date(t);
    return isNaN(d) ? '-' : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };
  const jam = (t) => {
    if (!t) return '-';
    const d = new Date(t);
    return isNaN(d) ? '-' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  /* Tanggal hari ini menurut zona PERANGKAT, bukan UTC.
     Sebelumnya baris ini memakai toISOString(), yang selalu memulangkan
     tanggal UTC. Manado ada di WITA (UTC+8), jadi antara tengah malam dan
     pukul 08.00 pagi ia mengembalikan tanggal KEMARIN — persis jam klinik
     mulai bersiap. Akibatnya: statistik beranda menghitung kunjungan hari
     sebelumnya, rentang laporan bergeser sehari, dan form apotek/kasir
     terisi tanggal yang salah untuk semua input pagi.

     Bugnya tidak pernah terlihat saat diuji siang hari, karena setelah
     pukul 08.00 WITA hasil UTC dan lokal kembali sama. */
  const hariIni = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const bulanIni = () => hariIni().slice(0, 7);

  /* Geser bulan 'YYYY-MM' maju atau mundur. */
  function geserBulan(ym, langkah) {
    const th = parseInt(String(ym).slice(0, 4), 10);
    const bl = parseInt(String(ym).slice(5, 7), 10) - 1 + langkah;
    const d = new Date(th, bl, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const labelBulan = (ym) => {
    const bl = parseInt(String(ym).slice(5, 7), 10) - 1;
    return `${BULAN[bl] || '?'} ${String(ym).slice(0, 4)}`;
  };

  function umur(tglLahir) {
    if (!tglLahir) return null;
    const l = new Date(tglLahir), n = new Date();
    let th = n.getFullYear() - l.getFullYear();
    let bl = n.getMonth() - l.getMonth();
    let hr = n.getDate() - l.getDate();
    if (hr < 0) { bl--; hr += new Date(n.getFullYear(), n.getMonth(), 0).getDate(); }
    if (bl < 0) { th--; bl += 12; }
    return { tahun: th, bulan: bl, hari: hr };
  }
  function umurTeks(tglLahir) {
    const u = umur(tglLahir);
    if (!u) return '-';
    if (u.tahun >= 5)  return `${u.tahun} th`;
    if (u.tahun >= 1)  return `${u.tahun} th ${u.bulan} bl`;
    if (u.bulan >= 1)  return `${u.bulan} bl ${u.hari} hr`;
    return `${u.hari} hari`;
  }

  const rupiah = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
  // Gelar dilewati supaya avatar menampilkan inisial nama, bukan "DR"
  const GELAR = /^(dr|drg|ns|apt|prof|sp|s\.?kep|a\.?md|h|hj|tn|ny|sdr|sdri)\.?$/i;
  const inisial = (nama) => {
    const kata = (nama || '?').trim().split(/\s+/).filter(w => !GELAR.test(w.replace(/[.,]/g, '')));
    const dipakai = kata.length ? kata : [(nama || '?').trim()];
    return dipakai.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  };

  /* ---------- Lencana status ------------------------------------------ */
  const LABEL_STATUS = {
    MENUNGGU: ['Menunggu', 'b-menunggu'],
    KAJIAN_AWAL: ['Kajian awal', 'b-kajian'],
    MENUNGGU_DOKTER: ['Menunggu dokter', 'b-dokter'],
    PEMERIKSAAN: ['Diperiksa', 'b-periksa'],
    SELESAI: ['Selesai', 'b-selesai'],
    BATAL: ['Batal', 'b-batal']
  };
  function badgeStatus(status) {
    const [teks, kelas] = LABEL_STATUS[status] || [status, 'b-batal'];
    return `<span class="badge ${kelas}"><span class="dot"></span>${esc(teks)}</span>`;
  }
  function badgeBayar(cara) {
    const kelas = cara === 'BPJS' ? 'b-bpjs' : 'b-umum';
    return `<span class="badge ${kelas}">${esc(cara === 'ASURANSI_LAIN' ? 'Asuransi' : cara)}</span>`;
  }

  /* ---------- Ikon (SVG inline, tanpa unduhan luar) -------------------- */
  const PATH = {
    beranda:  '<path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1h-4v-4H8v4H4a1 1 0 0 1-1-1V9.5z"/>',
    daftar:   '<path d="M10 4v12M4 10h12"/>',
    antrian:  '<path d="M3 5h14M3 10h14M3 15h9"/>',
    pasien:   '<circle cx="10" cy="7" r="3"/><path d="M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5"/>',
    rekam:    '<path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M12 3v3h3"/><path d="M7 11h6M7 14h4"/>',
    laporan:  '<path d="M4 16V9M8 16V5M12 16v-4M16 16v-8"/>',
    setelan:  '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7"/>',
    keluar:   '<path d="M12 14l4-4-4-4M16 10H7M9 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/>',
    cari:     '<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>',
    x:        '<path d="M5 5l10 10M15 5L5 15"/>',
    cek:      '<path d="M4 10.5l4 4 8-9"/>',
    stetoskop:'<path d="M5 3v5a4 4 0 0 0 8 0V3"/><circle cx="15" cy="13" r="2.2"/><path d="M9 12v1a3 3 0 0 0 4 2.8"/>',
    pil:      '<rect x="3" y="7" width="14" height="6" rx="3"/><path d="M10 7v6"/>',
    cetak:    '<path d="M6 8V3h8v5M6 15H4v-5h12v5h-2M7 12h6v5H7z"/>',
    kembali:  '<path d="M12 15l-5-5 5-5"/>',
    plus:     '<path d="M10 4v12M4 10h12"/>',
    unduh:    '<path d="M10 3v9M6.5 9L10 12.5 13.5 9M4 16h12"/>',
    peringatan:'<path d="M10 3l7 13H3l7-13z"/><path d="M10 8v3.5M10 13.6v.1"/>',
    jantung:  '<path d="M10 16S3.5 12 3.5 7.8A3.3 3.3 0 0 1 10 6a3.3 3.3 0 0 1 6.5 1.8C16.5 12 10 16 10 16z"/>',
    jam:      '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>',
    surat:    '<rect x="3.5" y="4" width="13" height="12" rx="1.2"/><path d="M6.5 8h7M6.5 11h7M6.5 14h4"/>'
  };
  function ikon(nama, ukuran = 18) {
    const d = PATH[nama] || PATH.cek;
    return `<svg class="ico" width="${ukuran}" height="${ukuran}" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  /* ---------- Keadaan kosong & memuat ---------------------------------- */
  const kosong = (judul, pesan, aksiHtml = '') =>
    `<div class="empty">${ikon('rekam', 44)}<h3>${esc(judul)}</h3><p>${esc(pesan)}</p>${aksiHtml}</div>`;

  const memuat = (baris = 4) =>
    `<div style="padding:16px">${'<div class="skeleton sk-row"></div>'.repeat(baris)}</div>`;

  /* ---------- Ambil nilai form ---------------------------------------- */
  function nilaiForm(root) {
    const data = {};
    root.querySelectorAll('[name]').forEach(el => {
      const n = el.name;
      if (el.type === 'checkbox') { data[n] = el.checked; return; }
      if (el.type === 'radio') { if (el.checked) data[n] = el.value; return; }
      let v = el.value;
      if (v === '') v = null;
      else if (el.type === 'number' && v !== null) v = Number(v);
      data[n] = v;
    });
    return data;
  }

  function isiForm(root, data) {
    if (!data) return;
    root.querySelectorAll('[name]').forEach(el => {
      const v = data[el.name];
      if (v === undefined || v === null) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = (el.value === String(v));
      else el.value = v;
    });
  }

  /* ---------- Anti-spam saat mengetik --------------------------------- */
  function tunda(fn, ms = 280) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  /* ---------- Penilaian tanda vital ------------------------------------ */
  function vitalTidakNormal(kunci, nilai) {
    if (nilai === null || nilai === undefined || nilai === '') return false;
    const a = CONFIG.AMBANG_VITAL[kunci];
    if (!a) return false;
    const n = Number(nilai);
    return n < a.min || n > a.max;
  }

  return { esc, toast, modal, konfirmasi, tglIndo, tglPendek, jam, hariIni,
           bulanIni, geserBulan, labelBulan,
           umur, umurTeks, rupiah, inisial, badgeStatus, badgeBayar, ikon,
           kosong, memuat, nilaiForm, isiForm, tunda, vitalTidakNormal, HARI, BULAN };
})();

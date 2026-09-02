/* =====================================================================
   ODONTOGRAM — bagan gigi yang bisa diklik per bidang.
   ---------------------------------------------------------------------
   Cara pakai:
     const odo = Odontogram.buat(elemen, {
       kondisiRef,          // daftar dari ref_kondisi_gigi
       gigiRef,             // daftar dari ref_gigi
       data,                // { "36": {kondisi:null, bidang:{O:'car'}}, ... }
       umur,                // umur pasien dalam tahun, untuk memilih tampilan awal
       bacaan,              // { "36": [{tanggal, jenis, kesan}, …] } — bacaan rontgen per gigi
       bacaSaja,            // true di halaman rekam medis
       onUbah               // dipanggil tiap kali ada perubahan
     });
     odo.ambilData();       // → objek yang siap disimpan
     odo.hitungIndeks();    // → { dmft:{d,m,f,total}, deft:{d,e,f,total} }

   Cara kerja pengisian: dokter memilih satu kondisi di papan warna,
   lalu mengklik bidang gigi yang dimaksud. Sama seperti memakai stabilo.
   ===================================================================== */
const Odontogram = (() => {

  /* Geometri satu gigi dalam kotak 40×40.
     Empat segitiga mengelilingi satu kotak tengah. */
  const BENTUK = {
    atas:   'M0,0 L40,0 L27,13 L13,13 Z',
    kanan:  'M40,0 L40,40 L27,27 L27,13 Z',
    bawah:  'M0,40 L40,40 L27,27 L13,27 Z',
    kiri:   'M0,0 L0,40 L13,27 L13,13 Z',
    tengah: 'M13,13 L27,13 L27,27 L13,27 Z'
  };

  /* Susunan baris pada bagan. Kuadran kanan pasien tampil di kiri layar. */
  const BARIS = [
    { kunci: 'atas_tetap',   jenis: 'TETAP',  rahang: 'ATAS',
      kiriLayar: [18,17,16,15,14,13,12,11], kananLayar: [21,22,23,24,25,26,27,28] },
    { kunci: 'atas_sulung',  jenis: 'SULUNG', rahang: 'ATAS',
      kiriLayar: [55,54,53,52,51],          kananLayar: [61,62,63,64,65] },
    { kunci: 'bawah_sulung', jenis: 'SULUNG', rahang: 'BAWAH',
      kiriLayar: [85,84,83,82,81],          kananLayar: [71,72,73,74,75] },
    { kunci: 'bawah_tetap',  jenis: 'TETAP',  rahang: 'BAWAH',
      kiriLayar: [48,47,46,45,44,43,42,41], kananLayar: [31,32,33,34,35,36,37,38] }
  ];

  /* Bidang mana yang diwakili tiap segitiga, tergantung rahang dan sisi layar.
     Rahang atas digambar dengan sisi pipi menghadap ke atas kertas;
     rahang bawah sebaliknya. Sisi yang menghadap garis tengah = mesial. */
  function petaBidang(rahang, adaDiKiriLayar) {
    return {
      atas:   rahang === 'ATAS' ? 'V' : 'L',
      bawah:  rahang === 'ATAS' ? 'L' : 'V',
      kanan:  adaDiKiriLayar ? 'M' : 'D',
      kiri:   adaDiKiriLayar ? 'D' : 'M',
      tengah: 'O'
    };
  }

  const NAMA_BIDANG = { O: 'Oklusal/insisal', M: 'Mesial', D: 'Distal',
                        V: 'Vestibular (bukal/labial)', L: 'Lingual/palatal' };

  function buat(wadah, opsi = {}) {
    const kondisiRef = opsi.kondisiRef || [];
    const gigiRef    = opsi.gigiRef || [];
    const bacaSaja   = !!opsi.bacaSaja;
    const onUbah     = opsi.onUbah || (() => {});
    /* Gigi yang pernah dirontgen. Yang ditandai di bagan bukan gambarnya —
       gambarnya memang tidak disimpan — melainkan adanya bacaan, beserta
       kesan terakhirnya sebagai tooltip. Dokter jadi tahu gigi mana yang
       sudah punya keterangan radiologis tanpa membuka riwayat satu per satu. */
    const bacaanGigi = opsi.bacaan || {};

    /* Salin data supaya tidak mengubah objek milik pemanggil */
    let data = JSON.parse(JSON.stringify(opsi.data || {}));

    const petaKondisi = {};
    kondisiRef.forEach(k => { petaKondisi[k.kode] = k; });
    const petaGigi = {};
    gigiRef.forEach(g => { petaGigi[g.fdi] = g; });

    /* Tampilan awal mengikuti umur, tapi tetap bisa diganti manual */
    const umur = Number(opsi.umur);
    let tampilan = !isFinite(umur) ? 'CAMPURAN'
                 : umur < 6  ? 'SULUNG'
                 : umur <= 12 ? 'CAMPURAN'
                 : 'TETAP';

    let alatAktif = bacaSaja ? null : 'car';

    /* ---------------- Menggambar ---------------- */

    function gambarGigi(fdi, rahang, adaDiKiriLayar) {
      const g = petaGigi[String(fdi)];
      if (!g) return '';
      const d = data[String(fdi)] || {};
      const bidang = d.bidang || {};
      const kondisi = d.kondisi || null;
      const peta = petaBidang(rahang, adaDiKiriLayar);
      const kSeluruh = kondisi ? petaKondisi[kondisi] : null;

      /* Kondisi eksklusif (mis. gigi hilang) menutup seluruh kotak.
         Kondisi non-eksklusif (mis. perawatan saluran akar) hanya menjadi bingkai,
         supaya tambalan pada bidangnya tetap terlihat. */
      let isi = '';
      const menutup = kSeluruh && kSeluruh.eksklusif !== false;
      if (menutup) {
        const gelap = kondisi === 'mis' || kondisi === 'une';
        isi = `<rect x="0" y="0" width="40" height="40" rx="3"
                 fill="${kSeluruh.warna}" fill-opacity="${gelap ? '.35' : '.85'}"/>`;
        if (kondisi === 'mis') {
          isi += `<path d="M7,7 L33,33 M33,7 L7,33" stroke="#475569" stroke-width="3"
                    stroke-linecap="round" fill="none"/>`;
        } else if (kondisi === 'une' || kondisi === 'pre') {
          isi += `<rect x="1.5" y="1.5" width="37" height="37" rx="3" fill="none"
                    stroke="#64748B" stroke-width="2" stroke-dasharray="4 3"/>`;
        } else {
          isi += `<text x="20" y="25" text-anchor="middle" font-size="13" font-weight="700"
                    fill="#FFFFFF" style="pointer-events:none">${kondisi.toUpperCase()}</text>`;
        }
      } else {
        isi = Object.entries(BENTUK).map(([sisi, path]) => {
          const kodeBidang = peta[sisi];
          const nilai = bidang[kodeBidang];
          const k = nilai ? petaKondisi[nilai] : null;
          const warna = k && nilai !== 'sou' ? k.warna : 'var(--white)';
          return `<path d="${path}" fill="${warna}"
                    stroke="var(--ink-300)" stroke-width="1"
                    class="odo-bidang" data-fdi="${fdi}" data-bidang="${kodeBidang}"
                    ${bacaSaja ? '' : 'tabindex="0" role="button"'}
                    aria-label="${NAMA_BIDANG[kodeBidang]} gigi ${fdi}"><title>${
                      NAMA_BIDANG[kodeBidang]}${k ? ' — ' + k.nama : ''}</title></path>`;
        }).join('');
        if (kSeluruh) {
          isi += `<rect x="1.5" y="1.5" width="37" height="37" rx="3" fill="none"
                    stroke="${kSeluruh.warna}" stroke-width="3"
                    style="pointer-events:none"><title>${UI.esc(kSeluruh.nama)}</title></rect>`;
        }
      }

      const adaCatatan = d.catatan ? `<circle cx="36" cy="4" r="3" fill="var(--brand-700)"/>` : '';

      const bc = bacaanGigi[String(fdi)] || [];
      const adaBacaan = bc.length
        ? `<path d="M0,40 L12,40 L0,28 Z" fill="#7C3AED"><title>${UI.esc(
             bc.length + ' bacaan rontgen. Terakhir ' +
             (bc[0].tanggal || '') + ': ' + (bc[0].kesan || ''))}</title></path>`
        : '';

      return `
        <div class="odo-gigi ${kondisi === 'mis' ? 'hilang' : ''}" data-gigi="${fdi}">
          <svg viewBox="0 0 40 40" class="odo-svg" ${kSeluruh ? `data-kondisi="${kondisi}"` : ''}
               ${menutup ? 'data-menutup="1"' : ''}>
            ${isi}${adaCatatan}${adaBacaan}
          </svg>
          <button class="odo-nomor" data-nomor="${fdi}" ${bacaSaja ? 'disabled' : ''}
                  title="${UI.esc(g.nama)}">${fdi}</button>
        </div>`;
    }

    function gambarBaris(baris) {
      const kiri  = baris.kiriLayar.map(f => gambarGigi(f, baris.rahang, true)).join('');
      const kanan = baris.kananLayar.map(f => gambarGigi(f, baris.rahang, false)).join('');
      return `<div class="odo-baris" data-baris="${baris.kunci}">
                <div class="odo-sisi">${kiri}</div>
                <div class="odo-tengah"></div>
                <div class="odo-sisi">${kanan}</div>
              </div>`;
    }

    function barisTerlihat() {
      return BARIS.filter(b =>
        tampilan === 'CAMPURAN' ? true : b.jenis === tampilan);
    }

    function gambarPalet() {
      if (bacaSaja) return '';
      const grup = [
        ['Kondisi gigi', kondisiRef.filter(k => k.kategori === 'KONDISI')],
        ['Tambalan',     kondisiRef.filter(k => k.kategori === 'TAMBALAN')],
        ['Perawatan & protesa',
                         kondisiRef.filter(k => ['PERAWATAN','MAHKOTA','PROTESA'].includes(k.kategori))]
      ];
      return `
        <div class="odo-palet">
          ${grup.map(([judul, isi]) => !isi.length ? '' : `
            <div class="odo-grup">
              <div class="odo-grup-judul">${UI.esc(judul)}</div>
              <div class="odo-chips">
                ${isi.map(k => `
                  <button class="odo-chip ${alatAktif === k.kode ? 'on' : ''}" data-alat="${k.kode}"
                          title="${UI.esc(k.nama)}${k.per_bidang ? ' — ditandai per bidang' : ' — seluruh gigi'}">
                    <span class="odo-warna" style="background:${k.warna}"></span>
                    <span class="odo-kode">${k.kode}</span>
                  </button>`).join('')}
              </div>
            </div>`).join('')}
          <div class="odo-grup">
            <div class="odo-grup-judul">Alat</div>
            <div class="odo-chips">
              <button class="odo-chip ${alatAktif === '__hapus' ? 'on' : ''}" data-alat="__hapus"
                      title="Klik gigi atau bidang untuk mengosongkan tandanya">
                <span class="odo-warna" style="background:var(--white);border:1px dashed var(--ink-400)"></span>
                <span class="odo-kode">hapus</span>
              </button>
              <button class="odo-chip" data-catatan="1" title="Tambah catatan pada satu gigi">
                <span class="odo-kode">catatan…</span>
              </button>
            </div>
          </div>
        </div>`;
    }

    function gambarKeterangan() {
      const dipakai = new Set();
      Object.values(data).forEach(d => {
        if (d.kondisi) dipakai.add(d.kondisi);
        Object.values(d.bidang || {}).forEach(v => dipakai.add(v));
      });
      const adaBacaan = Object.keys(bacaanGigi).length > 0;
      if (!dipakai.size && !adaBacaan) return '';
      return `<div class="odo-legenda">
        ${[...dipakai].filter(k => petaKondisi[k]).map(k => {
          const c = petaKondisi[k];
          return `<span class="odo-legenda-item">
                    <span class="odo-warna" style="background:${c.warna}"></span>
                    <b>${c.kode}</b> ${UI.esc(c.nama)}</span>`;
        }).join('')}
        ${adaBacaan ? `<span class="odo-legenda-item">
            <span class="odo-warna" style="background:#7C3AED"></span>
            Sudut ungu = ada bacaan rontgen (arahkan kursor untuk kesannya)</span>` : ''}
      </div>`;
    }

    function gambarRingkasan() {
      const x = hitungIndeks();
      const catat = Object.entries(data)
        .filter(([, d]) => d.catatan || d.kondisi)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fdi, d]) => {
          const bagian = [];
          if (d.kondisi && petaKondisi[d.kondisi]) bagian.push(petaKondisi[d.kondisi].nama);
          if (d.catatan) bagian.push(d.catatan);
          return `<div class="text-xs"><b>Gigi ${fdi}:</b> ${UI.esc(bagian.join(' — '))}</div>`;
        }).join('');
      return `
        <div class="odo-ringkas">
          <div class="odo-indeks">
            <div><span class="k">DMF-T</span><span class="v">${x.dmft.total}</span>
              <span class="d">D ${x.dmft.d} · M ${x.dmft.m} · F ${x.dmft.f}</span></div>
            <div><span class="k">def-t</span><span class="v">${x.deft.total}</span>
              <span class="d">d ${x.deft.d} · e ${x.deft.e} · f ${x.deft.f}</span></div>
            <div><span class="k">Gigi ditandai</span><span class="v">${Object.keys(data).length}</span>
              <span class="d">dari 52 gigi</span></div>
          </div>
          ${catat ? `<div class="odo-catatan">${catat}</div>` : ''}
        </div>`;
    }

    function gambar() {
      wadah.innerHTML = `
        ${gambarPalet()}
        <div class="odo-bagan">
          <div class="odo-label-sisi">
            <span>Kanan pasien</span><span>Kiri pasien</span>
          </div>
          ${barisTerlihat().map(gambarBaris).join('')}
        </div>
        <div class="odo-kaki">
          <div class="odo-tampilan">
            ${['TETAP','CAMPURAN','SULUNG'].map(t => `
              <button class="odo-tab ${tampilan === t ? 'on' : ''}" data-tampilan="${t}">
                ${t === 'TETAP' ? 'Gigi tetap' : t === 'SULUNG' ? 'Gigi sulung' : 'Gigi campuran'}
              </button>`).join('')}
          </div>
          ${gambarKeterangan()}
        </div>
        ${gambarRingkasan()}`;
      pasangPeristiwa();
    }

    /* ---------------- Interaksi ---------------- */

    function terapkan(fdi, kodeBidang) {
      if (bacaSaja || !alatAktif) return;
      const kunci = String(fdi);
      if (!data[kunci]) data[kunci] = { kondisi: null, bidang: {} };
      const d = data[kunci];

      if (alatAktif === '__hapus') {
        if (kodeBidang && d.bidang && d.bidang[kodeBidang]) delete d.bidang[kodeBidang];
        else { d.kondisi = null; d.bidang = {}; }
        if (!d.kondisi && !Object.keys(d.bidang || {}).length && !d.catatan) delete data[kunci];
      } else {
        const k = petaKondisi[alatAktif];
        if (!k) return;
        if (k.per_bidang && kodeBidang) {
          d.bidang = d.bidang || {};
          if (d.bidang[kodeBidang] === alatAktif) delete d.bidang[kodeBidang];   // klik lagi = batal
          else d.bidang[kodeBidang] = alatAktif;
          // Tanda per bidang hanya membatalkan kondisi yang menutup seluruh gigi
          const lama = d.kondisi ? petaKondisi[d.kondisi] : null;
          if (lama && lama.eksklusif !== false) d.kondisi = null;
        } else {
          d.kondisi = d.kondisi === alatAktif ? null : alatAktif;
          if (d.kondisi && k.eksklusif !== false) d.bidang = {};
        }
        if (!d.kondisi && !Object.keys(d.bidang || {}).length && !d.catatan) delete data[kunci];
      }
      gambar();
      onUbah(ambilData(), hitungIndeks());
    }

    function pasangPeristiwa() {
      if (!bacaSaja) {
        wadah.querySelectorAll('[data-alat]').forEach(b =>
          b.addEventListener('click', () => { alatAktif = b.dataset.alat; gambar(); }));

        const btnCatatan = wadah.querySelector('[data-catatan]');
        if (btnCatatan) btnCatatan.addEventListener('click', tanyaCatatan);

        wadah.querySelectorAll('.odo-bidang').forEach(p => {
          p.addEventListener('click', () => terapkan(p.dataset.fdi, p.dataset.bidang));
          p.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault(); terapkan(p.dataset.fdi, p.dataset.bidang);
            }
          });
        });

        /* Klik nomor gigi = tandai seluruh gigi */
        wadah.querySelectorAll('[data-nomor]').forEach(b =>
          b.addEventListener('click', () => terapkan(b.dataset.nomor, null)));

        /* Gigi yang sudah punya kondisi seluruh gigi tetap bisa diklik untuk dibatalkan */
        wadah.querySelectorAll('.odo-svg[data-menutup]').forEach(s =>
          s.addEventListener('click', () => terapkan(s.closest('[data-gigi]').dataset.gigi, null)));
      }

      wadah.querySelectorAll('[data-tampilan]').forEach(b =>
        b.addEventListener('click', () => { tampilan = b.dataset.tampilan; gambar(); }));
    }

    async function tanyaCatatan() {
      const hasil = await UI.modal({
        judul: 'Catatan pada satu gigi',
        isi: `<div class="field"><label>Nomor gigi (FDI) <span class="req">*</span></label>
                <input type="text" name="fdi" placeholder="Contoh: 36" maxlength="2" inputmode="numeric"></div>
              <div class="field mb-0"><label>Catatan</label>
                <textarea name="catatan" rows="3"
                  placeholder="Contoh: goyang derajat 2, rencana pencabutan minggu depan"></textarea></div>`,
        tombol: [{ teks: 'Batal', nilai: null },
                 { teks: 'Simpan', kelas: 'btn-primary', aksi: (b) => {
                    const v = UI.nilaiForm(b);
                    if (!v.fdi || !petaGigi[v.fdi]) {
                      UI.toast('Nomor gigi tidak dikenal. Gunakan penomoran FDI, misalnya 36.', 'err');
                      return false;
                    }
                    return v;
                 }}]
      });
      if (!hasil) return;
      const kunci = String(hasil.fdi);
      if (!data[kunci]) data[kunci] = { kondisi: null, bidang: {} };
      data[kunci].catatan = hasil.catatan || null;
      if (!data[kunci].kondisi && !Object.keys(data[kunci].bidang || {}).length && !data[kunci].catatan)
        delete data[kunci];
      gambar();
      onUbah(ambilData(), hitungIndeks());
    }

    /* ---------------- Keluaran ---------------- */

    function ambilData() { return JSON.parse(JSON.stringify(data)); }

    function pasangData(baru) {
      data = JSON.parse(JSON.stringify(baru || {}));
      gambar();
    }

    /* DMF-T untuk gigi tetap, def-t untuk gigi sulung.
       Gigi berlubang menang atas tambalan: satu gigi hanya dihitung sekali. */
    function hitungIndeks() {
      const TAMBAL = ['amf','cof','gif','fis'];
      const hasil = { dmft: { d:0, m:0, f:0, total:0 }, deft: { d:0, e:0, f:0, total:0 } };

      Object.entries(data).forEach(([fdi, d]) => {
        const g = petaGigi[fdi];
        if (!g) return;
        const nilaiBidang = Object.values(d.bidang || {});
        const adaKaries  = d.kondisi === 'car' || nilaiBidang.includes('car');
        const adaTambal  = nilaiBidang.some(v => TAMBAL.includes(v));
        const sisaAkar   = d.kondisi === 'rrx';
        const hilang     = d.kondisi === 'mis';

        const ke = g.jenis === 'TETAP' ? hasil.dmft : hasil.deft;
        if (hilang)                   ke[g.jenis === 'TETAP' ? 'm' : 'e']++;
        else if (adaKaries || sisaAkar) ke.d++;
        else if (adaTambal)           ke.f++;
      });

      hasil.dmft.total = hasil.dmft.d + hasil.dmft.m + hasil.dmft.f;
      hasil.deft.total = hasil.deft.d + hasil.deft.e + hasil.deft.f;
      return hasil;
    }

    gambar();
    return { ambilData, pasangData, hitungIndeks, gambar };
  }

  /* Ringkasan teks untuk dicetak atau ditampilkan di rekam medis */
  function ringkasTeks(data, kondisiRef) {
    const peta = {};
    (kondisiRef || []).forEach(k => { peta[k.kode] = k.nama; });
    const baris = Object.entries(data || {}).sort(([a], [b]) => a.localeCompare(b)).map(([fdi, d]) => {
      const bagian = [];
      if (d.kondisi) bagian.push(peta[d.kondisi] || d.kondisi);
      Object.entries(d.bidang || {}).forEach(([b, v]) =>
        bagian.push(`${peta[v] || v} (${b})`));
      if (d.catatan) bagian.push(d.catatan);
      return bagian.length ? `Gigi ${fdi}: ${bagian.join(', ')}` : null;
    }).filter(Boolean);
    return baris;
  }

  return { buat, ringkasTeks, BARIS };
})();

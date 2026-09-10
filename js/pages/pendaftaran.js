/* ===================== PENDAFTARAN KUNJUNGAN ===================== */
const Pendaftaran = (() => {

  let pasienTerpilih = null;
  let daftarPoli = [], daftarDokter = [];

  async function render(el, param) {
    [daftarPoli, daftarDokter] = await Promise.all([DB.daftarPoli(), DB.daftarDokter()]);
    pasienTerpilih = null;
    if (param && param[0]) {
      try { pasienTerpilih = await DB.pasien(param[0]); } catch (e) { /* abaikan */ }
    }

    el.innerHTML = `
      <div class="page-header">
        <div class="page-heading">
          <h1>Pendaftaran Pasien</h1>
          <div class="page-sub">Cari pasien lama, atau daftarkan pasien baru bila belum pernah berobat.</div>
        </div>
      </div>

      <div class="split">
        <div>
          <div class="card mb-16" id="kartuPasien"></div>
          <div class="card" id="kartuKunjungan"></div>
        </div>

        <div class="work-panel">
          <div class="work-panel-head"><h2>Antrian hari ini</h2></div>
          <div id="antrianRingkas">${UI.memuat(3)}</div>
        </div>
      </div>`;

    gambarPemilihPasien();
    gambarFormKunjungan();
    muatAntrianRingkas();
  }

  /* ---------------- Langkah 1: pilih pasien ---------------- */
  function gambarPemilihPasien() {
    const k = document.getElementById('kartuPasien');

    if (pasienTerpilih) {
      const p = pasienTerpilih;
      k.innerHTML = `
        <div class="card-head done">
          <div class="flex-1"><div class="step-head"><span class="step-badge">${UI.ikon('cek',13)}</span>
            <h2>Pasien</h2></div><div class="sub">Sudah dipilih</div></div>
          <button class="btn btn-secondary btn-sm" id="btnGanti">Ganti pasien</button>
        </div>
        <div class="card-body">
          <div class="patient-mini">
            <div class="avatar lg">${UI.inisial(p.nama)}</div>
            <div class="pm-main">
              <b class="pm-name">${UI.esc(p.nama)}</b>
              <div class="text-sm text-muted">No. RM ${UI.esc(p.no_rm)} ·
                ${p.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} · ${UI.umurTeks(p.tanggal_lahir)}</div>
            </div>
            <div class="text-sm">
              <div class="text-muted text-xs">No. BPJS</div>
              <b class="mono">${UI.esc(p.no_bpjs || '—')}</b>
            </div>
          </div>
          ${p.catatan_penting ? `<div class="banner warn mt-12 mb-0">
            ${UI.ikon('peringatan',16)}<div class="banner-txt"><b>Catatan penting:</b> ${UI.esc(p.catatan_penting)}</div></div>` : ''}
          ${!p.no_bpjs ? `<div class="banner info mt-12 mb-0">
            <div class="banner-txt">Pasien ini belum punya nomor BPJS tersimpan. Pilih cara bayar
            <b>Umum</b>, atau lengkapi nomor BPJS lebih dulu.</div></div>` : ''}
        </div>`;
      k.querySelector('#btnGanti').addEventListener('click', () => {
        pasienTerpilih = null; gambarPemilihPasien(); gambarFormKunjungan();
      });
      return;
    }

    k.innerHTML = `
      <div class="card-head"><div class="flex-1"><div class="step-head">
        <span class="step-badge">1</span><h2>Pilih pasien</h2></div>
        <div class="sub">Ketik minimal 2 huruf untuk mencari</div></div></div>
      <div class="card-body">
        <div class="search-box mb-12">
          <span class="ico">${UI.ikon('cari',16)}</span>
          <input type="search" id="cariPasien" placeholder="Nama, no. RM, NIK, atau no. BPJS…" autofocus>
        </div>
        <div id="hasilCari"></div>
        ${App.boleh('pasien_simpan')
          ? `<div class="divider"></div>
             <button class="btn btn-secondary btn-block" id="btnPasienBaru">
               ${UI.ikon('plus',16)} Pasien belum pernah berobat — daftarkan baru</button>` : ''}
      </div>`;

    const hasil = k.querySelector('#hasilCari');
    k.querySelector('#cariPasien').addEventListener('input', UI.tunda(async (e) => {
      const kata = e.target.value.trim();
      if (kata.length < 2) { hasil.innerHTML = ''; return; }
      hasil.innerHTML = UI.memuat(2);
      const d = await DB.cariPasien(kata, 12);
      if (!d.length) {
        hasil.innerHTML = `<div class="banner info mb-0"><div class="banner-txt">Tidak ada pasien cocok dengan
          "<b>${UI.esc(kata)}</b>". Pastikan ejaan benar, atau daftarkan sebagai pasien baru.</div></div>`;
        return;
      }
      hasil.innerHTML = `<div class="result-list">
        ${d.map(p => `
          <div class="combo-item" data-id="${p.id}">
            <b>${UI.esc(p.nama)}</b>
            <span>No. RM ${UI.esc(p.no_rm)} · ${p.jenis_kelamin} · ${UI.umurTeks(p.tanggal_lahir)}
              ${p.no_bpjs ? ' · BPJS ' + UI.esc(p.no_bpjs) : ''}</span>
          </div>`).join('')}</div>`;
      hasil.querySelectorAll('[data-id]').forEach(row => {
        row.addEventListener('click', async () => {
          pasienTerpilih = await DB.pasien(row.dataset.id);
          gambarPemilihPasien(); gambarFormKunjungan();
        });
      });
    }));

    const btnBaru = k.querySelector('#btnPasienBaru');
    if (btnBaru) btnBaru.addEventListener('click', async () => {
      const p = await Pasien.modalPasien();
      if (p) { pasienTerpilih = p; gambarPemilihPasien(); gambarFormKunjungan(); }
    });
  }

  /* ---------------- Langkah 2: data kunjungan ---------------- */
  function gambarFormKunjungan() {
    const k = document.getElementById('kartuKunjungan');
    if (!pasienTerpilih) {
      k.innerHTML = `<div class="card-head"><h2>2. Data kunjungan</h2></div>
        <div class="card-body"><p class="text-muted mb-0">Pilih pasien terlebih dahulu.</p></div>`;
      return;
    }

    const p = pasienTerpilih;
    const dokterSaya = App.siapa().peran === 'dokter' ? App.siapa().id : '';

    k.innerHTML = `
      <div class="card-head"><div class="flex-1"><div class="step-head">
        <span class="step-badge">2</span><h2>Data kunjungan</h2></div>
        <div class="sub">Nomor antrian dibuat otomatis</div></div></div>
      <div class="card-body">
        <div id="galatKunjungan"></div>
        <div class="form-grid">
          <div class="field field-compact">
            <label for="k-poli">Poli tujuan <span class="req">*</span></label>
            <select id="k-poli" name="poli_id" required>
              ${daftarPoli.map(o => `<option value="${o.id}">${UI.esc(o.nama)}</option>`).join('')}
            </select>
          </div>
          <div class="field field-wide">
            <label for="k-dokter">Dokter pemeriksa</label>
            <select id="k-dokter" name="dokter_id"></select>
            <div class="hint" id="hintDokter"></div>
          </div>
        </div>

        <div class="field">
          <label>Cara bayar <span class="req">*</span></label>
          <div class="radio-row" id="caraBayar">
            ${[['BPJS','BPJS Kesehatan'],['UMUM','Umum / Bayar sendiri'],
               ['ASURANSI_LAIN','Asuransi lain'],['GRATIS','Gratis / Program']]
              .map(([v, t], i) => `<label class="radio-chip ${(p.no_bpjs ? v === 'BPJS' : v === 'UMUM') ? 'on' : ''}">
                <input type="radio" name="cara_bayar" value="${v}"
                  ${(p.no_bpjs ? v === 'BPJS' : v === 'UMUM') ? 'checked' : ''}>${t}</label>`).join('')}
          </div>
        </div>

        <div class="field">
          <label>Jenis kunjungan</label>
          <div class="radio-row" id="jenisSakit">
            <label class="radio-chip on"><input type="radio" name="kunjungan_sakit" value="true" checked>Kunjungan sakit</label>
            <label class="radio-chip"><input type="radio" name="kunjungan_sakit" value="false">Kunjungan sehat / kontrol</label>
          </div>
        </div>

        <div class="field mb-0">
          <label for="k-keluhan">Keluhan singkat <span class="opt">(ditulis petugas pendaftaran)</span></label>
          <input type="text" id="k-keluhan" name="keluhan_singkat"
                 placeholder="Contoh: Batuk dan demam sejak 3 hari">
        </div>
      </div>
      <div class="card-foot">
        <button class="btn btn-primary" id="btnDaftar">${UI.ikon('cek',16)} Daftarkan &amp; buat nomor antrian</button>
        <span class="text-sm text-muted">Setelah ini pasien masuk ke antrian.</span>
      </div>`;

    /* Pilihan dokter mengikuti poli: poli gigi menawarkan dokter gigi. */
    const selPoli = k.querySelector('#k-poli');
    const selDokter = k.querySelector('#k-dokter');
    const hintDokter = k.querySelector('#hintDokter');
    function perbaruiDokter() {
      const poli = daftarPoli.find(x => x.id === selPoli.value);
      const jenis = poli?.jenis === 'GIGI' ? 'GIGI' : poli?.jenis === 'UMUM' ? 'UMUM' : null;
      const cocok = !jenis ? daftarDokter
        : daftarDokter.filter(d => !d.jenis_dokter || d.jenis_dokter === jenis);
      const pilih = cocok.some(d => d.id === dokterSaya) ? dokterSaya : '';
      selDokter.innerHTML = `<option value="">— tentukan nanti —</option>`
        + cocok.map(o => `<option value="${o.id}" ${o.id === pilih ? 'selected' : ''}>
             ${UI.esc(o.nama)}</option>`).join('');
      hintDokter.textContent = jenis === 'GIGI'
        ? 'Menampilkan dokter gigi dan dokter yang belum ditandai jenisnya.'
        : (cocok.length < daftarDokter.length
            ? 'Menampilkan dokter yang sesuai poli ini.' : '');
    }
    selPoli.addEventListener('change', perbaruiDokter);
    perbaruiDokter();

    // Chip radio
    k.querySelectorAll('.radio-row').forEach(row => {
      row.addEventListener('click', e => {
        const lab = e.target.closest('.radio-chip'); if (!lab) return;
        row.querySelectorAll('.radio-chip').forEach(x => x.classList.remove('on'));
        lab.classList.add('on');
      });
    });

    k.querySelector('#btnDaftar').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const galat = k.querySelector('#galatKunjungan');
      const d = UI.nilaiForm(k);

      if (!d.poli_id) { galat.innerHTML = '<div class="banner err"><div class="banner-txt">Poli tujuan wajib dipilih.</div></div>'; return; }
      if (d.cara_bayar === 'BPJS' && !p.no_bpjs) {
        galat.innerHTML = `<div class="banner err"><div class="banner-txt">Pasien belum punya nomor BPJS tersimpan.
          Ubah data pasien lebih dulu, atau pilih cara bayar Umum.</div></div>`;
        return;
      }

      btn.disabled = true; btn.textContent = 'Menyimpan…';
      try {
        const kj = await DB.buatKunjungan({
          pasien_id: p.id,
          poli_id: d.poli_id,
          dokter_id: d.dokter_id || null,
          cara_bayar: d.cara_bayar || 'UMUM',
          kunjungan_sakit: d.kunjungan_sakit !== 'false',
          keluhan_singkat: d.keluhan_singkat || null,
          created_by: App.siapa().id
        });
        UI.toast(`Terdaftar. Nomor antrian ${kj.no_antrian}.`, 'ok');
        App.perbaruiHitungAntrian();
        await tampilkanBuktiDaftar(kj, p);
        pasienTerpilih = null;
        App.pergi('#/antrian');
      } catch (e) {
        galat.innerHTML = `<div class="banner err"><div class="banner-txt">${UI.esc(e.message || 'Gagal mendaftarkan.')}</div></div>`;
        btn.disabled = false; btn.innerHTML = `${UI.ikon('cek',16)} Daftarkan &amp; buat nomor antrian`;
      }
    });
  }

  /* ---------------- Bukti pendaftaran (bisa dicetak) ---------------- */
  async function tampilkanBuktiDaftar(kj, p) {
    const poli = daftarPoli.find(x => x.id === kj.poli_id);
    const f = await DB.faskes().catch(() => ({ nama: CONFIG.NAMA_KLINIK }));
    await UI.modal({
      judul: 'Pasien berhasil didaftarkan',
      isi: `
        <div id="bukti" class="receipt">
          <div class="receipt-clinic">${UI.esc(f.nama)}</div>
          <div class="receipt-date">${UI.tglIndo(kj.tanggal, true)}</div>
          <div class="receipt-label">Nomor Antrian</div>
          <div class="receipt-number">${kj.no_antrian}</div>
          <div class="receipt-rows">
            <div class="flex justify-between"><span class="text-muted">Nama</span>
              <b>${UI.esc(p.nama)}</b></div>
            <div class="flex justify-between"><span class="text-muted">No. RM</span>
              <b class="mono">${UI.esc(p.no_rm)}</b></div>
            <div class="flex justify-between"><span class="text-muted">Poli</span>
              <b>${UI.esc(poli?.nama || '-')}</b></div>
            <div class="flex justify-between"><span class="text-muted">Cara bayar</span>
              <b>${UI.esc(kj.cara_bayar)}</b></div>
            <div class="flex justify-between"><span class="text-muted">No. kunjungan</span>
              <b class="mono">${UI.esc(kj.no_kunjungan)}</b></div>
          </div>
        </div>`,
      tombol: [
        { teks: 'Cetak bukti', kelas: 'btn-secondary', aksi: (b) => { cetakBukti(b.querySelector('#bukti').innerHTML); return false; } },
        { teks: 'Selesai', kelas: 'btn-primary', nilai: true }
      ]
    });
  }

  function cetakBukti(html) {
    const w = window.open('', '_blank', 'width=380,height=560');
    w.document.write(`<html><head><title>Bukti Pendaftaran</title>
      <style>body{font-family:system-ui,-apple-system,Arial,sans-serif;padding:16px;font-size:13px}
      .flex{display:flex}.justify-between{justify-content:space-between}
      .text-muted{color:#666}.text-sm{font-size:12px}.mb-16{margin-bottom:16px}
      .mono{font-family:monospace}
      /* Berkas ini adalah dokumen cetak berdiri sendiri (window.open), jadi
         TIDAK bisa memuat css/style.css — kelas .receipt-* dari #bukti
         disalin ulang secukupnya di sini supaya tata letaknya tetap sama
         persis dengan pratinjau di modal. */
      .receipt{text-align:center;padding:8px 0 4px}
      .receipt-clinic{font-weight:700;font-size:15px}
      .receipt-date{font-size:12.5px;color:#666;margin-bottom:16px}
      .receipt-label{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.08em}
      .receipt-number{font-size:60px;font-weight:700;line-height:1;color:#0B6E64;margin:6px 0 14px}
      .receipt-rows{border-top:1px dashed #ccc;padding-top:14px;text-align:left;display:grid;gap:6px;font-size:13.5px}
      </style></head>
      <body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 350);
  }

  async function muatAntrianRingkas() {
    const w = document.getElementById('antrianRingkas');
    if (!w) return;
    try {
      const a = await DB.antrianHariIni();
      const aktif = a.filter(x => !['SELESAI','BATAL'].includes(x.status));
      w.innerHTML = aktif.length === 0
        ? `<div class="empty sm"><p class="mb-0">Belum ada antrian hari ini.</p></div>`
        : `<div class="work-list">${aktif.slice(0, 10).map(x => `
            <div class="work-row">
              <div class="wr-lead"><div class="queue-no sm">${x.no_antrian}</div></div>
              <div class="wr-main">
                <div class="wr-title">${UI.esc(x.nama_pasien)}</div>
                <div class="wr-sub">${UI.esc(x.nama_poli)}</div>
              </div>
              <div class="wr-actions">${UI.badgeStatus(x.status)}</div>
            </div>`).join('')}</div>`;
    } catch (e) { w.innerHTML = ''; }
  }

  return { render };
})();

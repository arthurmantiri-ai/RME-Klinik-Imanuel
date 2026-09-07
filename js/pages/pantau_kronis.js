/* =====================================================================
   PEMANTAUAN KRONIS (Tahap 2) — belum ambil obat, jadwal & kepatuhan
   lab, kuota statin, dan daftar telepon H-1.
   ---------------------------------------------------------------------
   Halaman ini MURNI MEMBACA. Mendaftarkan atau mengubah buku kronis
   seorang pasien dilakukan di halaman Periksa (di ruang periksa, oleh
   dokter/perawat) — bukan di sini. Menduplikasi tombol edit di dua
   halaman adalah kelas kesalahan yang sama dengan `poli.jenis` dulu:
   dua tempat untuk satu hal, yang lambat laun berselisih.
   ===================================================================== */
const PantauKronis = (() => {

  let tabAktif = 'obat';
  const CACHE = {};   // dimuat sekali per kunjungan ke halaman, per tab

  function bolehTelpon() {
    // Keputusan rancangan-kronis.md 4 Sep 2026: daftar "harus dihubungi
    // hari ini" terbuka untuk admin + pendaftaran. App.boleh([...]) selalu
    // bernilai benar untuk admin, jadi cukup sebut pendaftaran di sini.
    return App.boleh(['pendaftaran']);
  }

  async function render(el, param) {
    if (param && param[0]) tabAktif = param[0];
    if (tabAktif === 'telpon' && !bolehTelpon()) tabAktif = 'obat';

    const TAB = [
      ['obat', 'Belum Ambil Obat'],
      ['lab', 'Jadwal & Kepatuhan Lab'],
      ['statin', 'Kuota Statin'],
      ...(bolehTelpon() ? [['telpon', 'Telepon H-1']] : [])
    ];

    el.innerHTML = `
      <div class="mb-16"><h1>Pemantauan Kronis</h1>
        <p class="text-muted mb-0">Pasien pemegang buku kronis yang perlu diperhatikan:
          belum mengambil obat bulanan, terlambat kontrol lab, atau mendekati kuota
          statin BPJS. Mendaftarkan pasien baru dilakukan di halaman Periksa.</p></div>
      <div class="tabs" id="tabs">
        ${TAB.map(([k, t]) => `<button class="tab ${tabAktif === k ? 'on' : ''}" data-t="${k}">${UI.esc(t)}</button>`)
          .join('')}
      </div>
      <div id="isiTab">${UI.memuat(4)}</div>`;

    el.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tabAktif = b.dataset.t;
      history.replaceState(null, '', `#/pantau-kronis/${tabAktif}`);
      el.querySelectorAll('#tabs .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      gambarTab(el.querySelector('#isiTab'));
    });

    await gambarTab(el.querySelector('#isiTab'));
  }

  async function gambarTab(w) {
    w.innerHTML = UI.memuat(4);
    try {
      if (tabAktif === 'obat') return await tabObat(w);
      if (tabAktif === 'lab') return await tabLab(w);
      if (tabAktif === 'statin') return await tabStatin(w);
      if (tabAktif === 'telpon') return await tabTelpon(w);
    } catch (e) {
      w.innerHTML = `<div class="banner err"><div>${UI.esc(e.message || e)}</div></div>`;
    }
  }

  /* ==================================================================== */
  /*  TAB 1 — BELUM AMBIL OBAT                                            */
  /* ==================================================================== */

  async function tabObat(w) {
    const daftar = CACHE.obat || (CACHE.obat = await DB.kronisPantauObat());
    const perluPerhatian = daftar.filter(r => KronisPantauCore.statusObat(r) !== 'SUDAH');

    if (!daftar.length) {
      w.innerHTML = UI.kosong('Belum ada pasien terdaftar',
        'Daftarkan pasien ke buku kronis dari halaman Periksa terlebih dulu.');
      return;
    }

    w.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card stat"><div class="lbl">Pasien terpantau</div>
          <div class="val tabular">${daftar.length}</div></div>
        <div class="card stat"><div class="lbl">Sudah ambil bulan ini</div>
          <div class="val tabular">${daftar.length - perluPerhatian.length}</div></div>
        <div class="card stat"><div class="lbl">Perlu dihubungi</div>
          <div class="val tabular">${perluPerhatian.length}</div></div>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>Pasien</th><th>Diagnosis</th><th>Terakhir ambil</th>
            <th>Status</th><th></th></tr></thead>
          <tbody>${daftar.map(r => `
            <tr>
              <td><b>${UI.esc(r.nama)}</b>
                <div class="text-muted mono" style="font-size:.8rem">${UI.esc(r.no_rm)}</div></td>
              <td>${(r.diagnosa || []).map(k => `<span class="chip">${UI.esc(k)}</span>`).join(' ')}</td>
              <td>${r.terakhir_ambil ? UI.tglPendek(r.terakhir_ambil) : '<span class="text-muted">belum pernah</span>'}</td>
              <td><span class="badge b-${KronisPantauCore.warnaStatusObat(r)}">
                ${UI.esc(KronisPantauCore.labelStatusObat(r))}</span></td>
              <td>${tautanWA(r, KronisPantauCore.pesanPengingatObat(r))}</td>
            </tr>`).join('')}
          </tbody></table></div>
      </div></div>`;
  }

  /* ==================================================================== */
  /*  TAB 2 — JADWAL & KEPATUHAN LAB                                      */
  /* ==================================================================== */

  async function tabLab(w) {
    const daftar = CACHE.lab || (CACHE.lab = await DB.kronisPantauLab());
    if (!daftar.length) {
      w.innerHTML = UI.kosong('Tidak ada yang dipantau labnya',
        'Hanya pasien dengan diagnosis DM dan/atau Hipertensi yang punya jatah kontrol lab.');
      return;
    }
    const terlambat = daftar.filter(r => KronisPantauCore.statusLab(r) === 'TERLAMBAT');

    w.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card stat"><div class="lbl">Dipantau labnya</div>
          <div class="val tabular">${daftar.length}</div></div>
        <div class="card stat"><div class="lbl">Terlambat kontrol</div>
          <div class="val tabular">${terlambat.length}</div></div>
        <div class="card stat"><div class="lbl">Toleransi</div>
          <div class="val tabular">${KronisPantauCore.TOLERANSI_LAB_HARI} hari</div></div>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>Pasien</th><th>Diagnosis</th><th>Interval</th>
            <th>Lab terakhir</th><th>Jadwal berikutnya</th><th>Status</th><th></th></tr></thead>
          <tbody>${daftar.map(r => `
            <tr>
              <td><b>${UI.esc(r.nama)}</b>
                <div class="text-muted mono" style="font-size:.8rem">${UI.esc(r.no_rm)}</div></td>
              <td>${(r.diagnosa || []).map(k => `<span class="chip">${UI.esc(k)}</span>`).join(' ')}</td>
              <td>${r.interval_bulan} bulan</td>
              <td>${r.terakhir_lab ? UI.tglPendek(r.terakhir_lab) : '<span class="text-muted">belum pernah</span>'}</td>
              <td>${UI.tglPendek(r.jadwal_berikutnya)}</td>
              <td><span class="badge b-${KronisPantauCore.warnaStatusLab(r)}">
                ${UI.esc(KronisPantauCore.labelStatusLab(r))}</span></td>
              <td>${tautanWA(r, KronisPantauCore.pesanPengingatLab(r))}</td>
            </tr>`).join('')}
          </tbody></table></div>
      </div></div>`;
  }

  /* ==================================================================== */
  /*  TAB 3 — KUOTA STATIN                                                */
  /* ==================================================================== */

  async function tabStatin(w) {
    const daftar = CACHE.statin || (CACHE.statin = await DB.kronisPantauStatin());
    if (!daftar.length) {
      w.innerHTML = UI.kosong('Tidak ada pasien dengan statin terdaftar',
        'Statin ditandai di halaman Periksa saat mendaftarkan buku kronis pasien.');
      return;
    }
    w.innerHTML = `
      <div class="banner info" style="margin-bottom:16px">
        <div>Kuota dihitung sejak hasil LDL <b>terbaru</b> pasien (dari lembar hasil lab),
          atau sejak tanggal migrasi bila belum pernah periksa LDL di RME. Ini
          peringatan tampilan — apotek tetap boleh menyerahkan resep di atas kuota
          bila memang perlu secara klinis.</div>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>Pasien</th><th>Statin</th><th>Sejak</th><th>Pemakaian</th></tr></thead>
          <tbody>${daftar.map(r => `
            <tr>
              <td><b>${UI.esc(r.nama)}</b>
                <div class="text-muted mono" style="font-size:.8rem">${UI.esc(r.no_rm)}</div></td>
              <td>${UI.esc(r.statin_nama || r.statin_kunci)}</td>
              <td>${r.tgl_dasar ? UI.tglPendek(r.tgl_dasar) : '<span class="text-muted">—</span>'}</td>
              <td><span class="badge b-${KronisPantauCore.warnaStatin(r)}">
                ${UI.esc(KronisPantauCore.labelStatin(r))}</span></td>
            </tr>`).join('')}
          </tbody></table></div>
      </div></div>`;
  }

  /* ==================================================================== */
  /*  TAB 4 — TELEPON H-1                                                 */
  /* ==================================================================== */

  async function tabTelpon(w) {
    const daftar = CACHE.telpon || (CACHE.telpon = await DB.kronisTelponH1());
    if (!daftar.length) {
      w.innerHTML = UI.kosong('Tidak ada jadwal kontrol besok', '');
      return;
    }
    w.innerHTML = `
      <div class="card"><div class="card-body" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>Pasien</th><th>Poli / Dokter</th><th>Instruksi petugas</th><th></th></tr></thead>
          <tbody>${daftar.map(r => `
            <tr>
              <td><b>${UI.esc(r.nama)}</b>
                <div class="text-muted mono" style="font-size:.8rem">${UI.esc(r.no_rm)}
                  ${r.no_hp ? ' · ' + UI.esc(r.no_hp) : ''}</div></td>
              <td>${UI.esc(r.nama_poli || '—')}${r.nama_dokter ? ' · ' + UI.esc(r.nama_dokter) : ''}</td>
              <td>${r.kontrol_instruksi ? UI.esc(r.kontrol_instruksi)
                    : '<span class="text-muted">—</span>'}</td>
              <td>${tautanWA(r, KronisPantauCore.pesanTelponH1(r))}</td>
            </tr>`).join('')}
          </tbody></table></div>
      </div></div>`;
  }

  /* ==================================================================== */
  /*  Bantu                                                               */
  /* ==================================================================== */

  // Satu fungsi tautan WA dipakai tiap tab — pesannya beda tiap konteks
  // (diteruskan sebagai argumen), tapi cara membentuk tautannya (dan
  // menyembunyikannya bila pasien tidak punya nomor) sama persis.
  function tautanWA(r, pesan) {
    if (!r.no_hp) return '<span class="text-muted" style="font-size:.8rem">tanpa no. HP</span>';
    const tautan = KronisCore.waTautan(r.no_hp, pesan);
    if (!tautan) return '';
    return `<a href="${UI.esc(tautan)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
              ${UI.ikon('jam', 14)} WhatsApp</a>`;
  }

  return { render };
})();

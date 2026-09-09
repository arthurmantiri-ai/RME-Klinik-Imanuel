/* ===================== LAB & PENUNJANG =====================
   Tiga hal dalam satu halaman, karena ketiganya dikerjakan orang yang sama:

     Antrean lab   — permintaan dokter, pengisian hasil, penutupan lembar
     Bacaan        — hasil baca rontgen gigi / EKG / USG per pasien
     Arsip berkas  — register berkas fisik beserta nomor arsipnya

   Tidak ada tombol unggah di mana pun, dan itu memang disengaja. Alasan
   lengkapnya ada di kepala sql/11_penunjang.sql; ringkasnya: yang bernilai
   medis adalah angka dan bacaannya, dan keduanya muat di database tanpa
   menyentuh kuota penyimpanan berkas.
   =========================================================== */
const Lab = (() => {

  let master = [];        // ref_lab + nilai rujukannya
  let paket = [];
  let gigiRef = [];
  let tabAktif = 'antrean';
  let rentang = { dari: null, sampai: null };

  const bolehIsi   = () => App.boleh(['perawat', 'dokter']);
  const bolehBaca  = () => App.boleh(['dokter']);
  const bolehArsip = () => App.boleh(['pendaftaran', 'perawat', 'dokter']);
  const adminSaja  = () => App.siapa() && App.siapa().peran === 'admin';

  const TAB = { antrean: 'Antrean lab', penunjang: 'Bacaan penunjang', arsip: 'Arsip berkas' };

  /* ================================================================== */
  /*  Kerangka                                                          */
  /* ================================================================== */
  async function render(el, param) {
    if (param && param[0] === 'hasil' && param[1]) return await layarHasil(el, param[1]);
    if (param && param[0] && TAB[param[0]]) tabAktif = param[0];

    if (!master.length) master = await DB.refLab(true);
    if (!paket.length)  paket  = await DB.refLabPaket();

    el.innerHTML = `
      <div class="tabs" id="tabsLab">
        ${Object.entries(TAB).map(([k, t]) =>
          `<button class="tab ${tabAktif === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}
      </div>
      <div id="isiLab">${UI.memuat()}</div>`;

    el.querySelector('#tabsLab').addEventListener('click', (e) => {
      const b = e.target.closest('.tab'); if (!b) return;
      tabAktif = b.dataset.t;
      el.querySelectorAll('#tabsLab .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      gambarTab(el.querySelector('#isiLab'));
    });
    await gambarTab(el.querySelector('#isiLab'));
  }

  async function gambarTab(w) {
    w.innerHTML = UI.memuat();
    try {
      if (tabAktif === 'antrean')   return await tabAntrean(w);
      if (tabAktif === 'penunjang') return await tabPenunjang(w);
      if (tabAktif === 'arsip')     return await tabArsip(w);
    } catch (e) {
      console.error(e);
      w.innerHTML = `<div class="banner err"><div>${UI.esc(e.message || e)}</div></div>`;
    }
  }

  /* ================================================================== */
  /*  TAB 1 — Antrean lab                                               */
  /* ================================================================== */
  async function tabAntrean(w) {
    if (!rentang.dari) { rentang.dari = UI.hariIni(); rentang.sampai = UI.hariIni(); }

    w.innerHTML = `
      <div class="page-header">
        <div class="page-heading">
          <h2>Antrean pemeriksaan laboratorium</h2>
          <div class="page-sub">Permintaan dokter dan lembar hasil yang sedang berjalan</div>
        </div>
        ${bolehIsi() ? `<div class="page-actions"><button class="btn btn-secondary btn-sm" id="btnLuar">
          ${UI.ikon('plus',15)} Catat hasil lab luar</button></div>` : ''}
      </div>
      <div class="filter-bar">
        <div class="field"><label>Dari tanggal</label>
          <input type="date" id="fDari" class="control-auto" value="${rentang.dari}"></div>
        <div class="field"><label>Sampai</label>
          <input type="date" id="fSampai" class="control-auto" value="${rentang.sampai}"></div>
        <div class="field"><label>Status</label>
          <select id="fStatus" class="control-auto">
            <option value="AKTIF">Belum selesai</option>
            <option value="">Semua</option>
            <option value="SELESAI">Selesai</option>
            <option value="BATAL">Batal</option>
          </select></div>
        <button class="btn btn-secondary" id="btnMuat">Tampilkan</button>
      </div>
      <div class="card">
        <div class="card-body tight" id="tabelAntrean">${UI.memuat(4)}</div>
      </div>`;

    const muat = async () => {
      rentang.dari   = w.querySelector('#fDari').value   || UI.hariIni();
      rentang.sampai = w.querySelector('#fSampai').value || UI.hariIni();
      const st = w.querySelector('#fStatus').value;
      const filter = st === 'AKTIF' ? ['DIMINTA', 'DIKERJAKAN'] : (st || null);
      const data = await DB.labAntrean(rentang.dari, rentang.sampai, filter);
      gambarAntrean(w.querySelector('#tabelAntrean'), data);
    };
    w.querySelector('#btnMuat').addEventListener('click', muat);
    const btnLuar = w.querySelector('#btnLuar');
    if (btnLuar) btnLuar.addEventListener('click', modalLabLuar);
    await muat();
  }

  function gambarAntrean(t, data) {
    if (!data.length) {
      t.innerHTML = UI.kosong('Tidak ada permintaan',
        'Belum ada pemeriksaan laboratorium pada rentang tanggal ini.');
      return;
    }
    t.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th>No. lembar</th><th>Pasien</th><th>Diminta</th>
        <th>Pemeriksaan</th><th>Temuan</th><th>Status</th>
      </tr></thead><tbody>
      ${data.map(r => {
        const lengkap = r.jml_pemeriksaan > 0 && r.jml_terisi === r.jml_pemeriksaan;
        return `<tr class="clickable" data-id="${r.id}">
          <td><b class="mono">${UI.esc(r.no_lab)}</b>
              <div class="text-muted text-xs">${UI.tglPendek(r.tanggal)}</div></td>
          <td><b>${UI.esc(r.nama_pasien)}</b>
              <div class="text-muted text-xs">
                ${UI.esc(r.no_rm)} · ${r.jenis_kelamin === 'L' ? 'L' : 'P'} ·
                ${UI.umurTeks(r.tanggal_lahir)}</div></td>
          <td>${r.asal === 'EKSTERNAL'
                ? `<span class="badge b-info">Lab luar</span>
                   <div class="text-muted text-xs">${UI.esc(r.nama_lab_luar || '-')}</div>`
                : `${UI.esc(r.nama_dokter || '-')}
                   <div class="text-muted text-xs">${UI.esc(r.nama_poli || '-')}</div>`}</td>
          <td class="num">${r.jml_terisi} / ${r.jml_pemeriksaan}
              ${lengkap ? '' : '<div class="text-muted text-xs">belum lengkap</div>'}</td>
          <td>${r.jml_kritis > 0
                ? `<span class="badge b-danger">${r.jml_kritis} nilai kritis</span>`
                : r.jml_tak_normal > 0
                  ? `<span class="badge b-warn">${r.jml_tak_normal} di luar rujukan</span>`
                  : (r.jml_terisi > 0 ? '<span class="badge b-ok">Dalam batas</span>' : '<span class="text-muted">—</span>')}</td>
          <td>${lencanaStatus(r.status)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;

    t.querySelectorAll('tr[data-id]').forEach(tr =>
      tr.addEventListener('click', () => App.pergi('#/lab/hasil/' + tr.dataset.id)));
  }

  const lencanaStatus = (s) => ({
    DIMINTA:    '<span class="badge b-menunggu"><span class="dot"></span>Diminta</span>',
    DIKERJAKAN: '<span class="badge b-periksa"><span class="dot"></span>Dikerjakan</span>',
    SELESAI:    '<span class="badge b-selesai"><span class="dot"></span>Selesai</span>',
    BATAL:      '<span class="badge b-batal"><span class="dot"></span>Batal</span>'
  }[s] || UI.esc(s));

  /* ================================================================== */
  /*  Layar pengisian hasil                                             */
  /* ================================================================== */
  async function layarHasil(el, id) {
    if (!master.length) master = await DB.refLab(false);
    const p = await DB.labPermintaan(id);
    DB.catatAkses(p.pasien_id, 'Membuka lembar hasil laboratorium ' + p.no_lab);

    const terkunci = p.status === 'SELESAI' || p.status === 'BATAL' || !bolehIsi();
    const umurBln = LabCore.umurBulan(p.pasien.tanggal_lahir, p.tanggal);
    const ringkas = LabCore.ringkasLembar(p.hasil);

    /* Nilai rujukan yang berlaku untuk pasien ini, dihitung sekali di depan
       supaya tidak dicari ulang tiap kali satu angka diketik. */
    const rujukanPakai = {};
    p.hasil.forEach(h => {
      const m = master.find(x => x.id === h.lab_id);
      rujukanPakai[h.id] = m
        ? LabCore.pilihRujukan(m.rujukan || [], p.pasien.jenis_kelamin, umurBln)
        : null;
    });

    const grup = LabCore.kelompokkan(
      p.hasil.map(h => Object.assign({}, h, { kelompok: h.ref && h.ref.kelompok })), master);

    el.innerHTML = `
      <a href="#/lab" class="btn btn-ghost btn-sm mb-12 no-print">${UI.ikon('kembali',15)} Antrean lab</a>

      <div class="patient-bar">
        <div class="pb-avatar">${UI.inisial(p.pasien.nama)}</div>
        <div class="pb-main">
          <b>${UI.esc(p.pasien.nama)}</b>
          <span>No. RM ${UI.esc(p.pasien.no_rm)} ·
            ${p.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} ·
            ${UI.umurTeks(p.pasien.tanggal_lahir)}</span>
        </div>
        <div class="pb-meta">
          <div><span class="k">No. lembar</span><span class="v mono">${UI.esc(p.no_lab)}</span></div>
          <div><span class="k">Tanggal</span><span class="v">${UI.tglPendek(p.tanggal)}</span></div>
          <div><span class="k">Asal</span><span class="v">${p.asal === 'EKSTERNAL'
                ? UI.esc(p.nama_lab_luar || 'Lab luar') : 'Lab klinik'}</span></div>
          <div><span class="k">Status</span><span class="v">${lencanaStatus(p.status)}</span></div>
        </div>
      </div>

      ${p.status === 'SELESAI' ? `<div class="banner ok no-print">${UI.ikon('cek',16)}
        <div><b>Lembar hasil sudah ditutup</b>
        ${p.waktu_selesai ? 'pada ' + UI.tglIndo(p.waktu_selesai) + ' ' + UI.jam(p.waktu_selesai) : ''}
        ${p.penutup ? ' oleh ' + UI.esc(p.penutup.nama) : ''}.
        Isinya tidak dapat diubah lagi.
        ${adminSaja() ? 'Buka kunci bila memang ada koreksi — alasannya akan tercatat.' : ''}</div></div>` : ''}
      ${p.status === 'BATAL' ? `<div class="banner err no-print">${UI.ikon('peringatan',16)}
        <div><b>Lembar ini dibatalkan.</b> ${UI.esc(p.alasan_batal || '')}</div></div>` : ''}
      ${!bolehIsi() && p.status !== 'SELESAI' ? `<div class="banner info no-print">${UI.ikon('peringatan',16)}
        <div>Anda membuka halaman ini sebagai ${UI.esc(App.siapa().peran)}.
        Hasil laboratorium hanya dapat diisi perawat atau dokter, jadi halaman ini
        ditampilkan untuk dibaca saja.</div></div>` : ''}
      ${p.catatan_klinis ? `<div class="banner info no-print">${UI.ikon('rekam',16)}
        <div><b>Keterangan dari dokter:</b> ${UI.esc(p.catatan_klinis)}</div></div>` : ''}
      ${ringkas.kritis > 0 ? `<div class="banner err">${UI.ikon('peringatan',16)}
        <div><b>${ringkas.kritis} nilai kritis pada lembar ini.</b>
        Nilai kritis perlu segera diberitahukan ke dokter yang meminta, tidak menunggu
        pasien kembali.</div></div>` : ''}

      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Hasil pemeriksaan</h2>
            <div class="sub" id="ringkasLembar">${ringkas.terisi} dari ${ringkas.total} terisi</div></div>
          <div class="btn-group no-print">
            <button class="btn btn-secondary btn-sm" id="btnCetak">${UI.ikon('cetak',15)} Cetak</button>
            ${p.status === 'SELESAI' && adminSaja()
              ? `<button class="btn btn-secondary btn-sm" id="btnBuka">Buka kunci</button>` : ''}
            ${p.status !== 'SELESAI' && p.status !== 'BATAL' && bolehIsi()
              ? `<button class="btn btn-primary btn-sm" id="btnSelesai"
                   ${ringkas.siapDitutup ? '' : 'disabled'}>Selesaikan lembar</button>` : ''}
            ${p.status !== 'BATAL' && (bolehIsi() || bolehBaca())
              ? `<button class="btn btn-ghost btn-sm" id="btnBatal">Batalkan</button>` : ''}
          </div>
        </div>
        <div class="card-body tight">
          <div class="table-wrap"><table class="tbl">
            <thead><tr>
              <th class="col-w34p">Pemeriksaan</th><th class="col-w20p">Hasil</th>
              <th class="col-w10p">Satuan</th><th class="col-w18p">Nilai rujukan</th>
              <th class="col-w12p">Tanda</th><th class="col-w6p no-print"></th>
            </tr></thead>
            <tbody>
              ${grup.map(g => `
                <tr><td colspan="6" class="group-row">${UI.esc(g.kelompok)}</td></tr>
                ${g.isi.map(h => barisHasil(h, rujukanPakai[h.id], terkunci)).join('')}
              `).join('')}
            </tbody></table></div>
        </div>
        ${p.asal === 'EKSTERNAL' ? `<div class="card-foot text-muted text-sm">
          Hasil dari ${UI.esc(p.nama_lab_luar || 'lab luar')}
          ${p.no_lembar_luar ? '· lembar no. ' + UI.esc(p.no_lembar_luar) : ''}.
          Pemeriksaan ini tidak masuk tagihan karena bukan klinik yang mengerjakannya.
        </div>` : ''}
      </div>`;

    pasangIsian(el, p, rujukanPakai);

    el.querySelector('#btnCetak').addEventListener('click', () => cetakLembar(p, rujukanPakai));

    const bSelesai = el.querySelector('#btnSelesai');
    if (bSelesai) bSelesai.addEventListener('click', async () => {
      if (!await UI.konfirmasi('Selesaikan lembar hasil?',
        'Setelah ditutup, hasilnya terkunci dan hanya admin yang bisa membukanya kembali.',
        'Selesaikan')) return;
      try {
        await DB.labSelesaikan(p.id);
        UI.toast('Lembar hasil ditutup.');
        App.segarkan();
      } catch (e) { UI.toast(e.message || 'Gagal menutup lembar.', 'err'); }
    });

    const bBuka = el.querySelector('#btnBuka');
    if (bBuka) bBuka.addEventListener('click', async () => {
      const alasan = await modalAlasan('Buka kunci lembar hasil',
        'Alasan koreksi wajib diisi dan akan tersimpan pada lembar ini.');
      if (!alasan) return;
      try {
        await DB.labBukaKunci(p.id, alasan);
        UI.toast('Kunci dibuka. Koreksi sekarang bisa disimpan.');
        App.segarkan();
      } catch (e) { UI.toast(e.message || 'Gagal membuka kunci.', 'err'); }
    });

    const bBatal = el.querySelector('#btnBatal');
    if (bBatal) bBatal.addEventListener('click', async () => {
      const alasan = await modalAlasan('Batalkan lembar hasil',
        'Lembar yang dibatalkan tidak ikut ditagihkan dan tidak muncul di rekam medis.');
      if (!alasan) return;
      try {
        await DB.labBatalkan(p.id, alasan);
        UI.toast('Lembar dibatalkan.');
        App.pergi('#/lab');
      } catch (e) { UI.toast(e.message || 'Gagal membatalkan.', 'err'); }
    });
  }

  /* Satu baris pemeriksaan. Bentuk isiannya mengikuti jenis nilainya:
     angka pakai kotak teks (supaya koma desimal Indonesia bisa diketik
     apa adanya), pilihan pakai daftar, sisanya teks bebas. */
  function barisHasil(h, ruj, terkunci) {
    const m = h.ref || {};
    const nilai = m.jenis_nilai === 'ANGKA'
      ? (h.nilai_angka === null || h.nilai_angka === undefined ? ''
         : LabCore.formatNilai(h.nilai_angka, m.desimal))
      : (h.nilai_teks || '');

    let isian;
    if (terkunci) {
      isian = `<b>${UI.esc(nilai) || '<span class="text-muted">—</span>'}</b>`;
    } else if (m.jenis_nilai === 'PILIHAN') {
      isian = `<select data-hasil="${h.id}" class="w-full">
        <option value="">—</option>
        ${(m.pilihan || []).map(o =>
          `<option ${o === h.nilai_teks ? 'selected' : ''}>${UI.esc(o)}</option>`).join('')}
      </select>`;
    } else {
      isian = `<input type="text" data-hasil="${h.id}" class="w-full ${m.jenis_nilai === 'ANGKA' ? 'text-right' : ''}"
                 inputmode="decimal" value="${UI.esc(nilai)}">`;
    }

    return `<tr data-baris="${h.id}">
      <td>${UI.esc(h.nama)}
          ${m.kode ? `<span class="text-muted mono text-xs"> ${UI.esc(m.kode)}</span>` : ''}</td>
      <td>${isian}</td>
      <td class="muted">${UI.esc(h.satuan || '')}</td>
      <td class="muted mono text-sm">${UI.esc(h.rujukan_teks || LabCore.teksRujukan(ruj, m) || '—')}</td>
      <td data-tanda="${h.id}">${lencanaTanda(h.tanda)}</td>
      <td class="no-print">${m.jenis_nilai === 'ANGKA'
        ? `<button class="btn-icon" data-tren="${h.lab_id}" data-nama="${UI.esc(h.nama)}"
             title="Lihat tren">${UI.ikon('laporan',15)}</button>` : ''}</td>
    </tr>`;
  }

  function lencanaTanda(t) {
    const d = LabCore.TANDA[t] || LabCore.TANDA.BELUM;
    if (t === 'NORMAL') return `<span class="badge b-ok">Normal</span>`;
    if (t === 'BELUM' || !t) return `<span class="text-muted">—</span>`;
    const kelas = d.kelas === 'err' ? 'b-danger' : 'b-warn';
    return `<span class="badge ${kelas}">${UI.esc(d.label)}</span>`;
  }

  /* Menyimpan per baris, saat kotaknya ditinggalkan. Tidak ada tombol
     "Simpan semua": petugas lab mengisi sambil membaca alat, satu angka
     setiap beberapa menit, dan satu tombol di ujung layar berarti
     kehilangan seluruh ketikan kalau tab tertutup di tengah jalan. */
  function pasangIsian(el, p, rujukanPakai) {
    el.querySelectorAll('[data-hasil]').forEach(inp => {
      /* Pratinjau: tanda muncul sambil mengetik, sebelum apa pun dikirim ke
         server. Aturannya kembaran persis dari yang di database (lihat
         kepala js/lab_core.js); yang tersimpan tetap jawaban server. */
      inp.addEventListener('input', () => {
        const id = inp.dataset.hasil;
        const h = p.hasil.find(x => x.id === id);
        const m = h.ref || {};
        const ruj = rujukanPakai[id];
        const tanda = m.jenis_nilai === 'ANGKA'
          ? LabCore.tandaAngka(LabCore.bacaNilai(inp.value, m.desimal), ruj)
          : LabCore.tandaTeks(inp.value, m.teks_normal);
        const sel = el.querySelector(`[data-tanda="${id}"]`);
        if (sel) sel.innerHTML = lencanaTanda(tanda);
      });

      inp.addEventListener('change', async () => {
        const id = inp.dataset.hasil;
        const h = p.hasil.find(x => x.id === id);
        const m = h.ref || {};
        const patch = {};

        if (m.jenis_nilai === 'ANGKA') {
          const n = LabCore.bacaNilai(inp.value, m.desimal);
          if (inp.value.trim() !== '' && n === null) {
            UI.toast('"' + inp.value + '" bukan angka yang bisa dibaca.', 'err');
            inp.focus(); return;
          }
          const salah = LabCore.validasi(m, n, null);
          if (salah) { UI.toast(salah, 'err'); inp.focus(); return; }
          patch.nilai_angka = n; patch.nilai_teks = null;
          inp.value = n === null ? '' : LabCore.formatNilai(n, m.desimal);
        } else {
          const v = inp.value.trim() || null;
          const salah = LabCore.validasi(m, null, v);
          if (salah) { UI.toast(salah, 'err'); inp.focus(); return; }
          patch.nilai_teks = v; patch.nilai_angka = null;
        }

        try {
          const baru = await DB.simpanHasilLab(id, patch);
          Object.assign(h, baru);
          const sel = el.querySelector(`[data-tanda="${id}"]`);
          if (sel) sel.innerHTML = lencanaTanda(baru.tanda);

          const r = LabCore.ringkasLembar(p.hasil);
          const rk = el.querySelector('#ringkasLembar');
          if (rk) rk.textContent = `${r.terisi} dari ${r.total} terisi`;
          const bs = el.querySelector('#btnSelesai');
          if (bs) bs.disabled = !r.siapDitutup;

          if (baru.tanda === 'KRITIS_RENDAH' || baru.tanda === 'KRITIS_TINGGI')
            UI.toast(h.nama + ': nilai kritis. Beri tahu dokter sekarang.', 'err', 8000);
        } catch (e) {
          UI.toast(e.message || 'Gagal menyimpan hasil.', 'err');
        }
      });
    });

    el.querySelectorAll('[data-tren]').forEach(b =>
      b.addEventListener('click', () => modalTren(p.pasien_id, b.dataset.tren, b.dataset.nama)));
  }

  /* ------------------------------------------------------------------ */
  /*  Tren — hanya mungkin karena hasilnya angka, bukan foto lembar      */
  /* ------------------------------------------------------------------ */
  async function modalTren(pasienId, labId, nama) {
    const baris = await DB.labTren(pasienId, labId, 12);
    const deret = LabCore.susunTren(baris).reverse();
    const isi = !deret.length
      ? `<p class="text-muted mb-0">Belum ada hasil terdahulu untuk pemeriksaan ini.</p>`
      : `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Tanggal</th><th class="num">Hasil</th><th>Rujukan</th>
            <th class="num">Selisih</th><th>Tanda</th></tr></thead>
          <tbody>${deret.map(d => `<tr>
            <td>${UI.tglPendek(d.tanggal)}
                <div class="text-muted mono text-xs">${UI.esc(d.no_lab)}</div></td>
            <td class="num"><b>${UI.esc(String(d.nilai))}</b> ${UI.esc(d.satuan || '')}</td>
            <td class="muted mono text-sm">${UI.esc(d.rujukan_teks || '—')}</td>
            <td class="num">${d.selisih === null ? '<span class="text-muted">—</span>'
              : (d.selisih > 0 ? '+' : '') + UI.esc(String(d.selisih))}</td>
            <td>${lencanaTanda(d.tanda)}</td>
          </tr>`).join('')}</tbody></table></div>`;
    await UI.modal({ judul: 'Tren — ' + nama, isi, lebar: true,
                     tombol: [{ teks: 'Tutup', nilai: true }] });
  }

  async function modalAlasan(judul, penjelasan) {
    return await UI.modal({
      judul,
      isi: `<p class="text-muted mt-0 mb-12">${UI.esc(penjelasan)}</p>
            <div class="field mb-0"><label for="alasan">Alasan</label>
              <textarea id="alasan" rows="3" placeholder="Tulis sejelasnya…"></textarea></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: (b) => {
            const v = b.querySelector('#alasan').value.trim();
            if (!v) { UI.toast('Alasan wajib diisi.', 'err'); return false; }
            return v;
          } }
      ]
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Lembar hasil untuk dicetak                                        */
  /* ------------------------------------------------------------------ */
  async function cetakLembar(p, rujukanPakai) {
    const f = await DB.faskes().catch(() => null);
    const grup = LabCore.kelompokkan(
      p.hasil.map(h => Object.assign({}, h, { kelompok: h.ref && h.ref.kelompok })), master);

    const nilaiTeks = (h) => {
      const m = h.ref || {};
      if (m.jenis_nilai === 'ANGKA')
        return h.nilai_angka === null || h.nilai_angka === undefined ? '—'
             : LabCore.formatNilai(h.nilai_angka, m.desimal);
      return h.nilai_teks || '—';
    };

    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) { UI.toast('Pop-up diblokir peramban. Izinkan untuk mencetak.', 'err'); return; }
    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
      <title>Hasil Laboratorium ${UI.esc(p.no_lab)}</title>
      <style>
        body{font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:28px;color:#111}
        h1{font-size:15px;margin:0 0 2px} .sub{color:#555;font-size:11px}
        .kop{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
        .id{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;margin-bottom:14px;font-size:11.5px}
        .id b{display:inline-block;min-width:96px;font-weight:600}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        th{text-align:left;border-bottom:1.5px solid #111;padding:5px 6px;font-size:10.5px;
           text-transform:uppercase;letter-spacing:.04em}
        td{padding:4px 6px;border-bottom:1px solid #e5e5e5}
        .grp td{background:#f2f2f2;font-weight:700;font-size:10.5px;text-transform:uppercase}
        .num{text-align:right;font-variant-numeric:tabular-nums}
        .tandai{font-weight:700}
        .ttd{margin-top:36px;display:flex;justify-content:flex-end;text-align:center;font-size:11.5px}
        .catatan{margin-top:18px;font-size:10.5px;color:#555;border-top:1px solid #ddd;padding-top:8px}
        @page{margin:1.4cm}
      </style></head><body>
      <div class="kop">
        <h1>${UI.esc(f?.nama || CONFIG.NAMA_KLINIK)}</h1>
        <div class="sub">${UI.esc(f?.alamat || '')} ${f?.telepon ? '· Telp. ' + UI.esc(f.telepon) : ''}</div>
        <div class="sub mt-4"><b>HASIL PEMERIKSAAN LABORATORIUM</b></div>
      </div>
      <div class="id">
        <div><b>Nama</b> ${UI.esc(p.pasien.nama)}</div>
        <div><b>No. lembar</b> ${UI.esc(p.no_lab)}</div>
        <div><b>No. RM</b> ${UI.esc(p.pasien.no_rm)}</div>
        <div><b>Tanggal</b> ${UI.tglIndo(p.tanggal)}</div>
        <div><b>Jenis kelamin</b> ${p.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
        <div><b>Dokter</b> ${UI.esc(p.peminta?.nama || '-')}</div>
        <div><b>Umur</b> ${UI.umurTeks(p.pasien.tanggal_lahir)}</div>
        <div><b>Asal</b> ${p.asal === 'EKSTERNAL'
              ? UI.esc(p.nama_lab_luar || 'Lab luar') : 'Laboratorium klinik'}</div>
      </div>
      <table><thead><tr>
        <th class="col-w36p">Pemeriksaan</th><th class="num col-w16p">Hasil</th>
        <th class="col-w12p">Satuan</th><th class="col-w22p">Nilai rujukan</th>
        <th class="col-w14p">Tanda</th></tr></thead><tbody>
        ${grup.map(g => `<tr class="grp"><td colspan="5">${UI.esc(g.kelompok)}</td></tr>
          ${g.isi.map(h => {
            const t = LabCore.TANDA[h.tanda] || {};
            return `<tr>
              <td>${UI.esc(h.nama)}</td>
              <td class="num ${t.berat >= 2 ? 'tandai' : ''}">${UI.esc(nilaiTeks(h))}</td>
              <td>${UI.esc(h.satuan || '')}</td>
              <td>${UI.esc(h.rujukan_teks || LabCore.teksRujukan(rujukanPakai[h.id], h.ref) || '')}</td>
              <td class="${t.berat >= 2 ? 'tandai' : ''}">${UI.esc(t.pendek || '')} ${UI.esc(t.berat ? t.label : '')}</td>
            </tr>`;
          }).join('')}`).join('')}
      </tbody></table>
      <div class="ttd"><div>
        ${UI.esc(f?.kota || '')}${f?.kota ? ', ' : ''}${UI.tglIndo(p.waktu_selesai || p.tanggal)}<br>
        Petugas laboratorium<br><br><br>
        <u>${UI.esc(p.penutup?.nama || App.siapa()?.nama || '')}</u>
      </div></div>
      <div class="catatan">
        Nilai rujukan yang tercetak adalah nilai yang berlaku saat pemeriksaan dilakukan.
        Hasil laboratorium adalah penunjang; penafsirannya tetap oleh dokter dan
        harus dibaca bersama keadaan klinis pasien.
      </div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  /* ------------------------------------------------------------------ */
  /*  Mencatat hasil lab luar                                           */
  /* ------------------------------------------------------------------ */
  async function modalLabLuar() {
    let pasienTerpilih = null;
    const dipilih = new Set();

    const hasil = await UI.modal({
      judul: 'Catat hasil laboratorium dari luar',
      lebar: true,
      isi: `
        <div class="banner info mb-12">${UI.ikon('peringatan',16)}
          <div>Yang diketik di sini adalah <b>angkanya</b>, bukan lembar hasilnya.
          Lembar kertasnya dicatat di tab <b>Arsip berkas</b> agar dapat nomor arsip,
          lalu disimpan di klinik. Angka yang diketik ulang inilah yang bisa
          dibandingkan dengan hasil kunjungan berikutnya.</div></div>
        <div class="field"><label for="cariPasienLab">Pasien</label>
          <div id="cariPasienLab"></div>
          <div class="hint" id="pasienTerpilih">Belum ada pasien dipilih.</div></div>
        <div class="form-row c3">
          <div class="field"><label for="tglLuar">Tanggal pemeriksaan</label>
            <input type="date" id="tglLuar" value="${UI.hariIni()}"></div>
          <div class="field"><label for="namaLab">Nama laboratorium</label>
            <input type="text" id="namaLab" placeholder="mis. Lab Prodia"></div>
          <div class="field"><label for="noLembar">No. lembar hasil <span class="opt">opsional</span></label>
            <input type="text" id="noLembar"></div>
        </div>
        <div class="field mb-0"><label>Pemeriksaan yang ada hasilnya</label>
          <div class="chip-quick mb-8" id="paketLuar">
            ${paket.map(pk => `<button type="button" class="chip" data-paket="${pk.id}">
              ${UI.esc(pk.nama)}</button>`).join('')}
          </div>
          <div class="scroll-box" id="daftarLab">
            ${daftarPilihLab()}
          </div>
          <div class="hint" id="hitungPilih">Belum ada yang dipilih.</div>
        </div>`,
      siap: (b) => {
        Komponen.comboCari({
          wadah: b.querySelector('#cariPasienLab'),
          placeholder: 'Ketik nama atau nomor RM…',
          cariFn: async (q) => await DB.cariPasien(q),
          formatFn: (p) => `<b>${UI.esc(p.nama)}</b> <span class="text-muted">${UI.esc(p.no_rm)} ·
                          ${UI.umurTeks(p.tanggal_lahir)}</span>`,
          onPilih: (p) => {
            pasienTerpilih = p;
            b.querySelector('#pasienTerpilih').innerHTML =
              `Dipilih: <b>${UI.esc(p.nama)}</b> (${UI.esc(p.no_rm)})`;
          }
        });

        const perbarui = () => {
          b.querySelector('#hitungPilih').textContent = dipilih.size
            ? dipilih.size + ' pemeriksaan dipilih.' : 'Belum ada yang dipilih.';
        };
        b.querySelector('#daftarLab').addEventListener('change', (e) => {
          const c = e.target.closest('input[type=checkbox]'); if (!c) return;
          c.checked ? dipilih.add(c.value) : dipilih.delete(c.value);
          perbarui();
        });
        b.querySelector('#paketLuar').addEventListener('click', (e) => {
          const t = e.target.closest('[data-paket]'); if (!t) return;
          const pk = paket.find(x => x.id === t.dataset.paket);
          (pk.item || []).forEach(it => {
            dipilih.add(it.lab_id);
            const c = b.querySelector(`input[value="${it.lab_id}"]`);
            if (c) c.checked = true;
          });
          perbarui();
        });
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Buat lembar', kelas: 'btn-primary', aksi: (b) => {
            if (!pasienTerpilih) { UI.toast('Pilih pasiennya dulu.', 'err'); return false; }
            if (!dipilih.size)   { UI.toast('Pilih minimal satu pemeriksaan.', 'err'); return false; }
            const nama = b.querySelector('#namaLab').value.trim();
            if (!nama) { UI.toast('Nama laboratorium wajib diisi.', 'err'); return false; }
            return {
              pasien_id: pasienTerpilih.id,
              tanggal: b.querySelector('#tglLuar').value || UI.hariIni(),
              nama_lab: nama,
              no_lembar: b.querySelector('#noLembar').value.trim() || null,
              lab_ids: Array.from(dipilih)
            };
          } }
      ]
    });

    if (!hasil) return;
    try {
      const id = await DB.labMintaLuar(hasil);
      UI.toast('Lembar dibuat. Sekarang isi angkanya.');
      App.pergi('#/lab/hasil/' + id);
    } catch (e) { UI.toast(e.message || 'Gagal membuat lembar.', 'err'); }
  }

  function daftarPilihLab(terpilih = []) {
    const grup = {};
    master.filter(m => m.aktif !== false).forEach(m => {
      (grup[m.kelompok] = grup[m.kelompok] || []).push(m);
    });
    return Object.entries(grup).map(([k, isi]) => `
      <div class="mb-10">
        <div class="group-label">${UI.esc(k)}</div>
        <div class="form-row c3">
          ${isi.map(m => `<label class="check">
            <input type="checkbox" value="${m.id}" ${terpilih.includes(m.id) ? 'checked' : ''}>
            <span>${UI.esc(m.nama)}${m.satuan ? ` <span class="text-muted">(${UI.esc(m.satuan)})</span>` : ''}</span>
          </label>`).join('')}
        </div>
      </div>`).join('');
  }

  /* ================================================================== */
  /*  TAB 2 — Bacaan penunjang                                          */
  /* ================================================================== */
  async function tabPenunjang(w) {
    w.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Bacaan pemeriksaan penunjang</h2>
            <div class="sub">Rontgen gigi, EKG, USG — yang disimpan hasil bacanya,
              bukan gambarnya</div></div>
          ${bolehBaca() ? `<button class="btn btn-primary btn-sm" id="btnBacaanBaru">
            ${UI.ikon('plus',15)} Tulis bacaan</button>` : ''}
        </div>
        <div class="card-body">
          <div class="field mb-0"><label for="cariPasienPn">Cari pasien</label>
            <div id="cariPasienPn"></div></div>
        </div>
        <div class="card-body tight" id="daftarBacaan">
          ${UI.kosong('Pilih pasien', 'Bacaan penunjang ditampilkan per pasien.')}
        </div>
      </div>`;

    let pasienAktif = null;
    const muat = async () => {
      const t = w.querySelector('#daftarBacaan');
      if (!pasienAktif) return;
      t.innerHTML = UI.memuat(3);
      const data = await DB.penunjangPasien(pasienAktif.id);
      if (!data.length) {
        t.innerHTML = UI.kosong('Belum ada bacaan',
          'Belum ada pemeriksaan penunjang yang dibaca untuk pasien ini.');
        return;
      }
      t.innerHTML = `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>Gigi</th><th>Kesan</th>
          <th>Pembaca</th><th class="no-print"></th></tr></thead>
        <tbody>${data.map(d => `<tr>
          <td>${UI.tglPendek(d.tanggal)}</td>
          <td>${UI.esc(LabCore.labelJenis(d.jenis))}
              ${d.asal === 'EKSTERNAL'
                ? `<div class="text-muted text-xs">${UI.esc(d.nama_tempat || 'luar')}</div>` : ''}</td>
          <td class="mono">${UI.esc(d.daftar_gigi || '—')}</td>
          <td class="col-max-340">${UI.esc(d.kesan)}</td>
          <td class="muted">${UI.esc(d.nama_pembaca || '-')}</td>
          <td class="no-print">${bolehBaca()
            ? `<button class="btn btn-ghost btn-sm" data-sunting="${d.id}">Sunting</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;

      t.querySelectorAll('[data-sunting]').forEach(b => b.addEventListener('click', async () => {
        const rec = data.find(x => x.id === b.dataset.sunting);
        const gigi = (rec.daftar_gigi || '').split(',').map(s => s.trim()).filter(Boolean);
        if (await modalBacaan(pasienAktif, rec.kunjungan_id, Object.assign({}, rec, { gigi }))) muat();
      }));
    };

    Komponen.comboCari({
      wadah: w.querySelector('#cariPasienPn'),
      placeholder: 'Ketik nama atau nomor RM…',
      cariFn: async (q) => await DB.cariPasien(q),
      formatFn: (p) => `<b>${UI.esc(p.nama)}</b> <span class="text-muted">${UI.esc(p.no_rm)}</span>`,
      onPilih: (p) => { pasienAktif = p; muat(); }
    });

    const bBaru = w.querySelector('#btnBacaanBaru');
    if (bBaru) bBaru.addEventListener('click', async () => {
      if (!pasienAktif) { UI.toast('Pilih pasiennya dulu.', 'err'); return; }
      if (await modalBacaan(pasienAktif, null, null)) muat();
    });
  }

  /* ------------------------------------------------------------------
     Pemilih kunjungan.

     Dipakai saat bacaan atau berkas dicatat dari halaman Lab, bukan dari
     layar pemeriksaan dokter. Tanpa ini `kunjungan_id` tersimpan kosong,
     dan akibatnya berantai: bacaannya tidak pernah masuk tagihan, tidak
     muncul di rekam medis kunjungan itu, dan tidak ikut tercetak. Satu
     kolom kosong yang mematikan tiga hal sekaligus.
     ------------------------------------------------------------------ */
  async function pilihanKunjungan(pasienId, terpilih, tanggal) {
    let daftar = [];
    try { daftar = await DB.daftarKunjungan({ pasien_id: pasienId, batas: 25 }); }
    catch (e) { daftar = []; }
    const bawaan = terpilih
      || (daftar.find(k => String(k.tanggal) === String(tanggal)) || {}).id
      || (daftar[0] || {}).id || '';
    return { daftar, bawaan };
  }

  const kotakKunjungan = (id, { daftar, bawaan }) => `
    <div class="field"><label for="${id}">Kunjungan terkait</label>
      <select id="${id}">
        <option value="">— tidak terkait kunjungan tertentu —</option>
        ${daftar.map(k => `<option value="${k.id}" ${k.id === bawaan ? 'selected' : ''}>
          ${UI.tglPendek(k.tanggal)} · ${UI.esc(k.no_kunjungan)}
          ${k.nama_poli ? '· ' + UI.esc(k.nama_poli) : ''}</option>`).join('')}
      </select>
      <div class="hint">Kunjungan menentukan di rekam medis mana ini muncul, dan —
        untuk pemeriksaan yang dikerjakan klinik — apakah ia ikut ditagihkan.</div>
    </div>`;

  /* Modal tulis/sunting bacaan. Dipakai juga dari halaman pemeriksaan
     dokter, jadi diekspor. */
  async function modalBacaan(pasien, kunjunganId, awal) {
    if (!gigiRef.length) gigiRef = await DB.refGigi();
    const sahFdi = new Set(gigiRef.map(g => g.fdi));
    let gigi = (awal && awal.gigi) ? awal.gigi.slice() : [];

    /* Dari layar dokter kunjungannya sudah pasti; dari halaman Lab harus
       dipilih. */
    const pilihKunj = kunjunganId ? null
      : await pilihanKunjungan(pasien.id, awal ? awal.kunjungan_id : null,
                               awal ? awal.tanggal : UI.hariIni());

    const hasil = await UI.modal({
      judul: awal ? 'Sunting bacaan penunjang' : 'Tulis bacaan pemeriksaan penunjang',
      lebar: true,
      isi: `
        <div class="banner info mb-12">${UI.ikon('peringatan',16)}
          <div>Yang disimpan adalah <b>hasil bacanya</b>. Film atau rekamannya tetap
          disimpan sebagai berkas fisik — catat di tab <b>Arsip berkas</b> supaya
          dapat nomor dan bisa dicari lagi.</div></div>
        <div class="form-row c3">
          <div class="field"><label for="pnJenis">Jenis pemeriksaan</label>
            <select id="pnJenis">${LabCore.JENIS_PENUNJANG.map(j =>
              `<option value="${j.kode}" ${awal && awal.jenis === j.kode ? 'selected' : ''}>
                 ${UI.esc(j.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="pnTanggal">Tanggal pemeriksaan</label>
            <input type="date" id="pnTanggal" value="${awal?.tanggal || UI.hariIni()}"></div>
          <div class="field"><label for="pnAsal">Dikerjakan di</label>
            <select id="pnAsal">
              <option value="INTERNAL" ${awal?.asal !== 'EKSTERNAL' ? 'selected' : ''}>Klinik ini</option>
              <option value="EKSTERNAL" ${awal?.asal === 'EKSTERNAL' ? 'selected' : ''}>Tempat lain</option>
            </select></div>
        </div>
        <div class="form-row c2" id="barisLuar" ${awal?.asal === 'EKSTERNAL' ? '' : 'hidden'}>
          <div class="field"><label for="pnTempat">Nama tempat</label>
            <input type="text" id="pnTempat" value="${UI.esc(awal?.nama_tempat || '')}"></div>
          <div class="field"><label for="pnNoFilm">No. film / ekspertise</label>
            <input type="text" id="pnNoFilm" value="${UI.esc(awal?.no_film || '')}"></div>
        </div>
        ${pilihKunj ? kotakKunjungan('pnKunjungan', pilihKunj) : ''}
        <div class="field" id="fieldGigi">
          <label for="pnGigi">Gigi yang tampak <span class="opt">nomor FDI, pisahkan dengan spasi</span></label>
          <input type="text" id="pnGigi" placeholder="mis. 36 37" list="daftarFdi">
          <datalist id="daftarFdi">${gigiRef.map(g => `<option value="${g.fdi}">`).join('')}</datalist>
          <div class="chip-list" id="chipGigi"></div>
          <div class="hint">Gigi yang disebut di sini akan bertanda di odontogram,
            dan bacaan ini muncul saat giginya diklik.</div>
        </div>
        <div class="field"><label for="pnJudul">Judul <span class="opt">opsional</span></label>
          <input type="text" id="pnJudul" placeholder="mis. Periapikal regio 36-37"
                 value="${UI.esc(awal?.judul || '')}"></div>
        <div class="field"><label for="pnTemuan">Temuan <span class="opt">gambaran yang terlihat</span></label>
          <textarea id="pnTemuan" rows="3"
            placeholder="mis. Tampak area radiolusen pada mahkota gigi 36 mencapai kamar pulpa…">${UI.esc(awal?.temuan || '')}</textarea></div>
        <div class="field"><label for="pnKesan">Kesan <span class="text-danger">wajib</span></label>
          <textarea id="pnKesan" rows="2"
            placeholder="Kesimpulan bacaan — inilah yang dibaca dokter berikutnya">${UI.esc(awal?.kesan || '')}</textarea></div>
        <div class="field mb-0"><label for="pnSaran">Saran <span class="opt">opsional</span></label>
          <textarea id="pnSaran" rows="2">${UI.esc(awal?.saran || '')}</textarea></div>`,
      siap: (b) => {
        const gambarChip = () => {
          b.querySelector('#chipGigi').innerHTML = gigi.map(g =>
            `<span class="chip">${UI.esc(g)}<button type="button" data-buang="${UI.esc(g)}">×</button></span>`).join('');
          b.querySelectorAll('[data-buang]').forEach(x => x.addEventListener('click', () => {
            gigi = gigi.filter(v => v !== x.dataset.buang); gambarChip();
          }));
        };
        const tambahGigi = () => {
          const inp = b.querySelector('#pnGigi');
          const calon = inp.value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
          const salah = [];
          calon.forEach(c => {
            if (!sahFdi.has(c)) { salah.push(c); return; }
            if (!gigi.includes(c)) gigi.push(c);
          });
          inp.value = '';
          gigi.sort();
          gambarChip();
          if (salah.length)
            UI.toast('Bukan nomor gigi FDI: ' + salah.join(', '), 'err');
        };
        b.querySelector('#pnGigi').addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === ',') { e.preventDefault(); tambahGigi(); }
        });
        b.querySelector('#pnGigi').addEventListener('blur', tambahGigi);
        gambarChip();

        const aturJenis = () => {
          const j = b.querySelector('#pnJenis').value;
          b.querySelector('#fieldGigi').style.display = LabCore.jenisPakaiGigi(j) ? '' : 'none';
        };
        b.querySelector('#pnJenis').addEventListener('change', aturJenis);
        aturJenis();

        const aturAsal = () => {
          b.querySelector('#barisLuar').hidden =
            b.querySelector('#pnAsal').value !== 'EKSTERNAL';
        };
        b.querySelector('#pnAsal').addEventListener('change', aturAsal);
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan bacaan', kelas: 'btn-primary', aksi: async (b) => {
            const kesan = b.querySelector('#pnKesan').value.trim();
            if (!kesan) {
              UI.toast('Kesan wajib diisi — bacaan tanpa kesimpulan tidak berguna.', 'err');
              return false;
            }
            const jenis = b.querySelector('#pnJenis').value;
            try {
              await DB.penunjangSimpan({
                id: awal ? awal.id : null,
                pasien_id: pasien.id,
                kunjungan_id: kunjunganId
                  || (b.querySelector('#pnKunjungan') ? b.querySelector('#pnKunjungan').value || null : null)
                  || (awal ? awal.kunjungan_id : null),
                tanggal: b.querySelector('#pnTanggal').value || UI.hariIni(),
                jenis,
                judul: b.querySelector('#pnJudul').value.trim() || null,
                asal: b.querySelector('#pnAsal').value,
                nama_tempat: b.querySelector('#pnTempat')?.value.trim() || null,
                no_film: b.querySelector('#pnNoFilm')?.value.trim() || null,
                temuan: b.querySelector('#pnTemuan').value.trim() || null,
                kesan,
                saran: b.querySelector('#pnSaran').value.trim() || null,
                gigi: LabCore.jenisPakaiGigi(jenis) ? gigi : null
              });
              UI.toast('Bacaan tersimpan.');
              return true;
            } catch (e) {
              UI.toast(e.message || 'Gagal menyimpan bacaan.', 'err');
              return false;
            }
          } }
      ]
    });
    return hasil === true;
  }

  /* ================================================================== */
  /*  TAB 3 — Register arsip berkas                                     */
  /* ================================================================== */
  async function tabArsip(w) {
    w.innerHTML = `
      <div class="banner info mb-12">${UI.ikon('peringatan',16)}
        <div><b>Berkasnya tetap kertas, nomornya yang disimpan di sini.</b>
        Catat berkasnya, sistem memberi nomor arsip, tulis nomor itu di pojok
        berkasnya, lalu simpan berurutan menurut nomor. Mencari film gigi dari
        dua tahun lalu jadi soal membaca satu nomor, bukan membongkar lemari.</div></div>

      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Register arsip berkas</h2>
            <div class="sub">Film rontgen, lembar hasil lab luar, surat rujukan,
              informed consent</div></div>
          ${bolehArsip() ? `<button class="btn btn-primary btn-sm" id="btnArsipBaru">
            ${UI.ikon('plus',15)} Catat berkas</button>` : ''}
        </div>
        <div class="card-body">
          <div class="field mb-0"><label for="cariPasienAr">Cari pasien</label>
            <div id="cariPasienAr"></div></div>
        </div>
        <div class="card-body tight" id="daftarArsip">
          ${UI.kosong('Pilih pasien', 'Register arsip ditampilkan per pasien.')}
        </div>
      </div>`;

    let pasienAktif = null;
    const muat = async () => {
      if (!pasienAktif) return;
      const t = w.querySelector('#daftarArsip');
      t.innerHTML = UI.memuat(3);
      const data = await DB.lampiranPasien(pasienAktif.id);
      if (!data.length) {
        t.innerHTML = UI.kosong('Belum ada berkas tercatat',
          'Belum ada berkas fisik yang didaftarkan untuk pasien ini.');
        return;
      }
      t.innerHTML = `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>No. arsip</th><th>Berkas</th><th>Tanggal</th>
          <th>Asal</th><th>Disimpan di</th><th class="no-print"></th></tr></thead>
        <tbody>${data.map(d => `<tr>
          <td><b class="mono">${UI.esc(d.no_arsip)}</b></td>
          <td>${UI.esc(d.judul)}
              <div class="text-muted text-xs">
                ${UI.esc(LabCore.labelLampiran(d.jenis))}
                ${d.no_dokumen ? ' · ' + UI.esc(d.no_dokumen) : ''}</div></td>
          <td>${d.tanggal_dokumen ? UI.tglPendek(d.tanggal_dokumen) : '—'}</td>
          <td class="muted">${UI.esc(d.asal || '—')}</td>
          <td class="muted">${UI.esc(d.lokasi_simpan || '—')}</td>
          <td class="no-print">${bolehArsip()
            ? `<button class="btn btn-ghost btn-sm" data-sunting="${d.id}">Sunting</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;

      t.querySelectorAll('[data-sunting]').forEach(b => b.addEventListener('click', async () => {
        if (await modalArsip(pasienAktif, null, data.find(x => x.id === b.dataset.sunting))) muat();
      }));
    };

    Komponen.comboCari({
      wadah: w.querySelector('#cariPasienAr'),
      placeholder: 'Ketik nama atau nomor RM…',
      cariFn: async (q) => await DB.cariPasien(q),
      formatFn: (p) => `<b>${UI.esc(p.nama)}</b> <span class="text-muted">${UI.esc(p.no_rm)}</span>`,
      onPilih: (p) => { pasienAktif = p; muat(); }
    });

    const bBaru = w.querySelector('#btnArsipBaru');
    if (bBaru) bBaru.addEventListener('click', async () => {
      if (!pasienAktif) { UI.toast('Pilih pasiennya dulu.', 'err'); return; }
      if (await modalArsip(pasienAktif, null, null)) muat();
    });
  }

  async function modalArsip(pasien, kunjunganId, awal) {
    const pilihKunj = kunjunganId ? null
      : await pilihanKunjungan(pasien.id, awal ? awal.kunjungan_id : null,
                               awal ? awal.tanggal_dokumen : UI.hariIni());

    const hasil = await UI.modal({
      judul: awal ? 'Sunting catatan arsip' : 'Catat berkas fisik',
      isi: `
        <div class="form-row c2">
          <div class="field"><label for="arJenis">Jenis berkas</label>
            <select id="arJenis">${LabCore.JENIS_LAMPIRAN.map(j =>
              `<option value="${j.kode}" ${awal && awal.jenis === j.kode ? 'selected' : ''}>
                 ${UI.esc(j.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="arTanggal">Tanggal dokumen</label>
            <input type="date" id="arTanggal" value="${awal?.tanggal_dokumen || UI.hariIni()}"></div>
        </div>
        ${pilihKunj ? kotakKunjungan('arKunjungan', pilihKunj) : ''}
        <div class="field"><label for="arJudul">Nama berkas</label>
          <input type="text" id="arJudul" placeholder="mis. Film periapikal gigi 36"
                 value="${UI.esc(awal?.judul || '')}"></div>
        <div class="form-row c2">
          <div class="field"><label for="arAsal">Diterbitkan oleh <span class="opt">opsional</span></label>
            <input type="text" id="arAsal" placeholder="mis. Lab Prodia"
                   value="${UI.esc(awal?.asal || '')}"></div>
          <div class="field"><label for="arNoDok">No. pada dokumen <span class="opt">opsional</span></label>
            <input type="text" id="arNoDok" value="${UI.esc(awal?.no_dokumen || '')}"></div>
        </div>
        <div class="field"><label for="arLokasi">Disimpan di mana</label>
          <input type="text" id="arLokasi" placeholder="mis. Lemari B, laci 2"
                 value="${UI.esc(awal?.lokasi_simpan || '')}"></div>
        <div class="field mb-0"><label for="arCatatan">Catatan <span class="opt">opsional</span></label>
          <textarea id="arCatatan" rows="2">${UI.esc(awal?.catatan || '')}</textarea></div>
        ${awal ? `<div class="banner ok mt-16 mb-0">${UI.ikon('cek',16)}
          <div>Nomor arsip berkas ini <b class="mono">${UI.esc(awal.no_arsip)}</b>.
          Pastikan nomor itu tertulis di berkasnya.</div></div>` : ''}`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (b) => {
            const judul = b.querySelector('#arJudul').value.trim();
            if (!judul) { UI.toast('Nama berkas wajib diisi.', 'err'); return false; }
            try {
              const rec = await DB.simpanLampiran({
                id: awal ? awal.id : undefined,
                pasien_id: pasien.id,
                kunjungan_id: kunjunganId
                  || (b.querySelector('#arKunjungan') ? b.querySelector('#arKunjungan').value || null : null)
                  || (awal ? awal.kunjungan_id : null),
                jenis: b.querySelector('#arJenis').value,
                judul,
                tanggal_dokumen: b.querySelector('#arTanggal').value || null,
                asal: b.querySelector('#arAsal').value.trim() || null,
                no_dokumen: b.querySelector('#arNoDok').value.trim() || null,
                lokasi_simpan: b.querySelector('#arLokasi').value.trim() || null,
                catatan: b.querySelector('#arCatatan').value.trim() || null
              });
              if (!awal) {
                await UI.modal({
                  judul: 'Berkas tercatat',
                  isi: `<p class="mt-0 mb-10">Nomor arsipnya:</p>
                        <p class="mono nomor-arsip mt-0 mb-12">
                          ${UI.esc(rec.no_arsip)}</p>
                        <p class="text-muted mb-0">Tulis nomor ini di pojok berkasnya,
                        lalu simpan berurutan menurut nomor. Itu yang membuatnya bisa
                        ditemukan lagi tanpa mencari satu per satu.</p>`,
                  tombol: [{ teks: 'Sudah saya catat', nilai: true, kelas: 'btn-primary' }]
                });
              } else UI.toast('Catatan arsip diperbarui.');
              return true;
            } catch (e) {
              UI.toast(e.message || 'Gagal menyimpan.', 'err');
              return false;
            }
          } }
      ]
    });
    return hasil === true;
  }

  return { render, modalBacaan, modalArsip, daftarPilihLab, lencanaTanda, lencanaStatus };
})();

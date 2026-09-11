/* =====================================================================
   KASIR — tagihan per kunjungan, pembayaran, struk thermal, dan
   kwitansi PDF.

   Tiga aturan yang diwarisi dari invoice generator portal, dan alasannya
   masing-masing sudah dibayar dengan bug nyata di sana:

   1. Halaman ini TIDAK PERNAH menulis status_bayar atau amount_paid.
      Keduanya dijaga trigger database. Menuliskannya dari sini
      menghasilkan tagihan yang statusnya MUNDUR begitu pembayaran
      berikutnya dicatat.

   2. Satu sumber status. Judul dokumen, cap di kanan atas, dan baris
      sisa tagihan semuanya membaca hitungBayar(). Portal pernah
      mencetak satu lembar berjudul "KWITANSI" dengan stempel
      "BELUM LUNAS" di kakinya, karena judul membaca kolom status
      sementara stempel menghitung sendiri dari nominal.

   3. Kembalian tidak pernah disimpan — selalu dihitung dari uang yang
      diterima dikurangi yang dibayarkan, saat struk disusun.
   ===================================================================== */
const Kasir = (() => {

  let tab = 'menunggu';
  let menunggu = [], daftar = [], rekap = [];
  let filter = { dari: UI.hariIni(), sampai: UI.hariIni(), status: '' };
  let templateSiap = false;

  const bolehTulis = () => App.boleh('kasir');
  const rp = (n) => UI.rupiah(n);

  const LABEL_METODE = { tunai: 'Tunai', transfer: 'Transfer', qris: 'QRIS',
                         debit: 'Debit', kartu_kredit: 'Kartu kredit', lainnya: 'Lainnya' };
  const LABEL_STATUS = { lunas: 'Lunas', sebagian: 'Bayar sebagian', belum_lunas: 'Belum lunas' };
  const KELAS_STATUS = { lunas: 'b-ok', sebagian: 'b-warn', belum_lunas: 'b-danger' };

  /* Cerminan persis kasir_sync_bayar() di 09_kasir.sql dan ringkasBayar()
     di struk_core.js. Selama ketiganya sepakat, mustahil satu layar
     menyebut lunas sementara layar lain menyebut belum. */
  function hitungBayar(t, bayar) {
    const total = Number(t.total) || 0;
    const dibayar = Array.isArray(bayar) && bayar.length
      ? bayar.reduce((s, b) => s + (Number(b.jumlah) || 0), 0)
      : (Number(t.amount_paid) || 0);
    const sisa = Math.max(0, total - dibayar);
    let status;
    if (total <= 0.5)            status = 'lunas';
    else if (dibayar <= 0)       status = 'belum_lunas';
    else if (sisa <= 0.5)        status = 'lunas';
    else                         status = 'sebagian';
    return { total, dibayar, sisa, status };
  }

  const lencana = (s) =>
    `<span class="badge ${KELAS_STATUS[s] || 'b-danger'}">${UI.esc(LABEL_STATUS[s] || s)}</span>`;

  /* ------------------------------------------------------------------
     MUAT
     ------------------------------------------------------------------ */
  async function muat() {
    const [m, d] = await Promise.all([
      DB.kasirMenunggu({}),
      DB.kasirDaftarTagihan({ dari: filter.dari, sampai: filter.sampai,
                              status: filter.status || null })
    ]);
    menunggu = m; daftar = d;
    if (!templateSiap) {
      try { await DB.templateInvoice(); } catch (e) { console.warn('template invoice:', e.message); }
      templateSiap = true;
    }
  }

  async function segarkan() { await muat(); gambarIsi(); gambarRingkasan(); }

  /* ------------------------------------------------------------------
     KERANGKA
     ------------------------------------------------------------------ */
  async function render(el, param) {
    await muat();
    const langsung = (param && param[0]) || null;

    el.innerHTML = `
      <div class="page-header">
        <div class="page-heading">
          <h1>Kasir</h1>
          <div class="page-sub">Tagihan disusun dari tindakan dokter dan obat yang
            benar-benar diserahkan apotek.</div>
        </div>
        ${bolehTulis() ? `<div class="page-actions">
          <button class="btn btn-secondary btn-sm" id="btnBebas">
            ${UI.ikon('plus',16)} Penjualan bebas</button>
        </div>` : ''}
      </div>

      <div class="grid grid-4 mb-16" id="ringkasKasir"></div>

      <div class="tabs" id="tabKasir">
        <button class="tab" data-t="menunggu">Menunggu ditagih
          <span class="badge b-info" id="hitMenunggu">0</span></button>
        <button class="tab" data-t="tagihan">Tagihan</button>
        <button class="tab" data-t="rekap">Rekap kas</button>
      </div>
      <div id="isiKasir"></div>`;

    el.querySelector('#tabKasir').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tab = b.dataset.t; gambarIsi();
    });
    if (bolehTulis()) el.querySelector('#btnBebas').addEventListener('click', dialogPenjualanBebas);

    gambarRingkasan();
    gambarIsi();
    if (langsung) bukaTagihan(langsung);
  }

  function gambarRingkasan() {
    const el = document.getElementById('ringkasKasir');
    if (!el) return;
    const hariIni = daftar.filter(t => t.tanggal === UI.hariIni());
    const masuk = hariIni.reduce((s, t) => s + Number(t.amount_paid), 0);
    const piutang = daftar.filter(t => t.status_bayar !== 'lunas')
      .reduce((s, t) => s + Number(t.sisa), 0);
    const bpjs = hariIni.filter(t => t.penjamin === 'BPJS')
      .reduce((s, t) => s + Number(t.subtotal), 0);

    el.innerHTML = `
      <div class="stat accent"><div class="lbl">Uang masuk (rentang terpilih)</div>
        <div class="val">${rp(masuk)}</div>
        <div class="hint">${hariIni.length} tagihan</div></div>
      <div class="stat"><div class="lbl">Menunggu ditagih</div>
        <div class="val">${menunggu.length}</div>
        <div class="hint">kunjungan belum punya tagihan</div></div>
      <div class="stat"><div class="lbl">Belum lunas</div>
        <div class="val text-warn">${rp(piutang)}</div>
        <div class="hint">${daftar.filter(t => t.status_bayar !== 'lunas').length} tagihan</div></div>
      <div class="stat"><div class="lbl">Nilai layanan BPJS</div>
        <div class="val">${rp(bpjs)}</div>
        <div class="hint">tercatat, tidak ditagihkan</div></div>`;
    const h = document.getElementById('hitMenunggu');
    if (h) h.textContent = menunggu.length;
  }

  function gambarIsi() {
    document.querySelectorAll('#tabKasir .tab').forEach(b =>
      b.classList.toggle('on', b.dataset.t === tab));
    const el = document.getElementById('isiKasir');
    if (!el) return;
    ({ menunggu: gambarMenunggu, tagihan: gambarDaftar, rekap: gambarRekap }[tab])(el);
  }

  /* ------------------------------------------------------------------
     TAB 1 — MENUNGGU DITAGIH
     ------------------------------------------------------------------ */
  function gambarMenunggu(el) {
    if (!menunggu.length) {
      el.innerHTML = `<div class="card"><div class="card-body">
        ${UI.kosong('Semua kunjungan sudah ditagih',
          'Kunjungan yang selesai diperiksa akan muncul di sini.')}</div></div>`;
      return;
    }
    el.innerHTML = `<div class="card">
      <div class="card-head"><div><h2>Kunjungan menunggu ditagih</h2>
        <div class="sub">Menyusun tagihan menarik tindakan dari catatan dokter dan obat
          dari apa yang sudah diserahkan apotek.</div></div></div>
      <div class="card-body tight"><div class="table-wrap"><table class="tbl">
        <thead><tr><th class="col-w56">No.</th><th>Pasien</th><th>Poli / dokter</th>
          <th>Bayar</th><th>Isi</th><th>Status</th><th class="col-shrink"></th></tr></thead>
        <tbody>${menunggu.map(m => `<tr>
          <td><div class="queue-no">${m.no_antrian ?? '-'}</div></td>
          <td><b>${UI.esc(m.nama_pasien)}</b>
            <div class="text-xs text-muted">${UI.esc(m.no_rm)} · ${UI.tglPendek(m.tanggal)}</div></td>
          <td class="text-xs">${UI.esc(m.nama_poli)}
            <div class="text-muted">${UI.esc(m.nama_dokter || '—')}</div></td>
          <td>${UI.badgeBayar(m.cara_bayar)}</td>
          <td class="text-xs text-muted">${m.jumlah_tindakan} tindakan · ${m.jumlah_obat} obat</td>
          <td>${m.resep_belum_diserahkan
            ? '<span class="badge b-warn">Resep belum diserahkan</span>'
            : UI.badgeStatus(m.status_kunjungan)}</td>
          <td class="nowrap">${bolehTulis()
            ? `<button class="btn btn-primary btn-sm" data-susun="${m.kunjungan_id}">Susun tagihan</button>`
            : ''}</td></tr>`).join('')}</tbody></table></div></div></div>`;

    el.querySelectorAll('[data-susun]').forEach(b =>
      b.addEventListener('click', () => susunTagihan(b.dataset.susun)));
  }

  async function susunTagihan(kunjunganId) {
    const m = menunggu.find(x => x.kunjungan_id === kunjunganId);
    /* Lab yang belum selesai jauh lebih berbahaya daripada resep yang belum
       diserahkan: tagihan yang sudah DIBAYAR tidak bisa disusun ulang, jadi
       biaya lab yang keluar sepuluh menit kemudian tidak sekadar terlewat —
       ia hilang permanen kecuali kasir mengetiknya manual. */
    let labTertunda = 0;
    try { labTertunda = await DB.labBelumSelesai(kunjunganId); } catch (e) { labTertunda = 0; }
    if (labTertunda > 0) {
      const ok = await UI.konfirmasi('Pemeriksaan lab belum selesai',
        `Masih ada ${labTertunda} lembar pemeriksaan laboratorium yang berjalan pada `
        + 'kunjungan ini. Kalau tagihan disusun sekarang lalu dibayar, biaya lab yang '
        + 'keluar setelahnya tidak bisa dimasukkan lagi ke tagihan ini.',
        'Susun sekarang');
      if (!ok) return;
    }
    if (m && m.resep_belum_diserahkan) {
      const ok = await UI.konfirmasi('Resep belum diserahkan',
        'Obat yang belum diserahkan apotek tidak akan masuk tagihan ini. '
        + 'Sebaiknya tunggu apotek selesai, atau susun ulang setelahnya.',
        'Susun sekarang');
      if (!ok) return;
    }
    try {
      const id = await DB.kasirSusunDariKunjungan(kunjunganId);
      await muat();
      gambarRingkasan();
      await bukaTagihan(id);
    } catch (e) { UI.toast('Gagal menyusun tagihan: ' + e.message, 'err'); }
  }

  /* ------------------------------------------------------------------
     TAB 2 — DAFTAR TAGIHAN
     ------------------------------------------------------------------ */
  function gambarDaftar(el) {
    el.innerHTML = `
      <div class="filter-bar">
        <div class="field"><label for="fDari">Dari tanggal</label>
          <input type="date" id="fDari" class="control-auto" value="${filter.dari}"></div>
        <div class="field"><label for="fSampai">Sampai tanggal</label>
          <input type="date" id="fSampai" class="control-auto" value="${filter.sampai}"></div>
        <div class="field"><label for="fStatus">Status</label>
          <select id="fStatus" class="control-auto">
            <option value="">Semua status</option>
            <option value="belum_lunas">Belum lunas</option>
            <option value="sebagian">Bayar sebagian</option>
            <option value="lunas">Lunas</option>
          </select></div>
      </div>
      <div class="card">
        <div class="card-body tight" id="isiDaftar"></div>
      </div>`;

    el.querySelector('#fStatus').value = filter.status;
    ['fDari', 'fSampai', 'fStatus'].forEach(id =>
      el.querySelector('#' + id).addEventListener('change', async (e) => {
        filter[{ fDari: 'dari', fSampai: 'sampai', fStatus: 'status' }[id]] = e.target.value;
        await muat(); gambarDaftar(el); gambarRingkasan();
      }));

    const w = el.querySelector('#isiDaftar');
    if (!daftar.length) {
      w.innerHTML = UI.kosong('Belum ada tagihan', 'Tidak ada tagihan pada rentang ini.');
      return;
    }
    w.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Nomor</th><th>Pasien</th><th>Tanggal</th><th>Penjamin</th>
      <th class="text-right">Total</th><th class="text-right">Dibayar</th>
      <th class="text-right">Sisa</th><th>Status</th><th class="col-shrink"></th>
      </tr></thead><tbody>${daftar.map(t => `<tr>
        <td class="mono text-xs">${UI.esc(t.nomor)}</td>
        <td><b>${UI.esc(t.nama_pasien || t.nama_pembayar)}</b>
          ${t.no_rm ? `<div class="text-xs text-muted">${UI.esc(t.no_rm)}
            ${t.nama_poli ? '· ' + UI.esc(t.nama_poli) : ''}</div>` : ''}</td>
        <td class="mono text-xs">${UI.tglPendek(t.tanggal)}</td>
        <td>${UI.badgeBayar(t.penjamin)}</td>
        <td class="text-right"><b>${rp(t.total)}</b>
          ${Number(t.subtotal) > Number(t.total)
            ? `<div class="text-xs text-muted">nilai ${rp(t.subtotal)}</div>` : ''}</td>
        <td class="text-right">${rp(t.amount_paid)}</td>
        <td class="text-right">${Number(t.sisa) > 0
          ? `<b class="text-warn">${rp(t.sisa)}</b>` : '—'}</td>
        <td>${lencana(t.status_bayar)}</td>
        <td class="nowrap"><button class="btn btn-secondary btn-sm" data-buka="${t.id}">Buka</button></td>
      </tr>`).join('')}</tbody></table></div>`;

    w.querySelectorAll('[data-buka]').forEach(b =>
      b.addEventListener('click', () => bukaTagihan(b.dataset.buka)));
  }

  /* ------------------------------------------------------------------
     TAB 3 — REKAP KAS
     ------------------------------------------------------------------ */
  async function gambarRekap(el) {
    el.innerHTML = `<div class="card"><div class="card-body">${UI.memuat(3)}</div></div>`;
    try { rekap = await DB.kasirRekap({ dari: filter.dari, sampai: filter.sampai }); }
    catch (e) { el.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`; return; }

    const perMetode = {};
    rekap.forEach(b => {
      perMetode[b.metode] = (perMetode[b.metode] || 0) + Number(b.jumlah);
    });
    const total = Object.values(perMetode).reduce((s, v) => s + v, 0);

    el.innerHTML = `
      <div class="filter-bar">
        <div class="field flex-1"><label>Rekap kas</label>
          <div class="text-sm text-muted">Uang yang benar-benar diterima pada rentang ini —
            bukan tagihan yang terbit. Ini angka yang dicocokkan saat menutup laci.</div></div>
        <div class="field"><label for="rDari">Dari tanggal</label>
          <input type="date" id="rDari" class="control-auto" value="${filter.dari}"></div>
        <div class="field"><label for="rSampai">Sampai tanggal</label>
          <input type="date" id="rSampai" class="control-auto" value="${filter.sampai}"></div>
      </div>
      <div class="card">
      <div class="card-body">
        <div class="grid grid-3 mb-16">
          <div class="stat accent"><div class="lbl">Total diterima</div>
            <div class="val">${rp(total)}</div>
            <div class="hint">${rekap.length} pembayaran</div></div>
          <div class="stat"><div class="lbl">Tunai</div>
            <div class="val">${rp(perMetode.tunai || 0)}</div></div>
          <div class="stat"><div class="lbl">Non-tunai</div>
            <div class="val">${rp(total - (perMetode.tunai || 0))}</div></div>
        </div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Metode</th><th class="text-right">Jumlah transaksi</th>
            <th class="text-right">Total</th></tr></thead>
          <tbody>${Object.entries(perMetode).map(([m, v]) => `<tr>
            <td>${UI.esc(LABEL_METODE[m] || m)}</td>
            <td class="text-right">${rekap.filter(r => r.metode === m).length}</td>
            <td class="text-right"><b>${rp(v)}</b></td></tr>`).join('')
            || '<tr><td colspan="3" class="text-muted">Belum ada pembayaran pada rentang ini.</td></tr>'}
          </tbody></table></div>
      </div></div>`;

    ['rDari', 'rSampai'].forEach(id =>
      el.querySelector('#' + id).addEventListener('change', (e) => {
        filter[id === 'rDari' ? 'dari' : 'sampai'] = e.target.value;
        gambarRekap(el);
      }));
  }

  /* ==================================================================
     LAYAR SATU TAGIHAN
     ================================================================== */
  async function bukaTagihan(id) {
    let d;
    try { d = await DB.kasirLengkap(id); }
    catch (e) { UI.toast('Gagal memuat tagihan: ' + e.message, 'err'); return; }

    const t = d.tagihan;
    const rb = hitungBayar(t, d.bayar);
    const terkunci = d.bayar.length > 0;
    const bpjs = t.penjamin === 'BPJS' || t.penjamin === 'GRATIS';

    await UI.modal({
      judul: `Tagihan ${t.nomor}`,
      lebar: true,
      isi: `
        <div class="patient-bar mb-14">
          <div class="pb-avatar">${UI.inisial(t.nama_pasien || t.nama_pembayar)}</div>
          <div class="pb-main"><b>${UI.esc(t.nama_pasien || t.nama_pembayar)}</b>
            <span>${t.no_rm ? 'No. RM ' + UI.esc(t.no_rm) + ' · ' : ''}
              ${UI.tglIndo(t.tanggal)}${t.nama_poli ? ' · ' + UI.esc(t.nama_poli) : ''}</span></div>
          <div class="pb-meta">
            <div><span class="k">Penjamin</span><span class="v">${UI.esc(t.penjamin)}</span></div>
            <div><span class="k">Status</span><span class="v">${LABEL_STATUS[rb.status]}</span></div>
          </div>
        </div>

        ${bpjs ? `<div class="banner info mb-16"><div>Kunjungan <b>${UI.esc(t.penjamin)}</b>.
          Barisnya dicatat lengkap dengan nilainya untuk laporan, tetapi
          <b>tidak ditagihkan ke pasien</b>. Bila ada obat atau layanan di luar
          tanggungan, hilangkan centang "Ditanggung" pada baris itu.</div></div>` : ''}
        ${terkunci ? `<div class="banner warn mb-16"><div>Tagihan ini sudah menerima
          pembayaran, jadi rinciannya terkunci. Hapus pembayarannya lebih dulu bila
          memang perlu dikoreksi — penghapusan tercatat di audit log.</div></div>` : ''}

        <div id="isiItem"></div>

        ${bolehTulis() && !terkunci ? `<div class="btn-group mt-12 mb-12">
          <button class="btn btn-secondary btn-sm" id="btnItemManual">+ Baris manual</button>
          ${t.kunjungan_id ? `<button class="btn btn-secondary btn-sm" id="btnSusunUlang">
            Susun ulang dari kunjungan</button>` : ''}
        </div>` : ''}

        <div id="isiBayar" class="mt-16"></div>`,
      siap: (badan) => {
        gambarItem(badan, d, terkunci, bpjs);
        gambarBayar(badan, d, rb);

        badan.querySelector('#btnItemManual')?.addEventListener('click', async () => {
          if (await dialogItemManual(t.id, bpjs)) { await muatUlangModal(badan, t.id); }
        });
        badan.querySelector('#btnSusunUlang')?.addEventListener('click', async () => {
          const ok = await UI.konfirmasi('Susun ulang tagihan?',
            'Baris tindakan, obat, dan layanan akan ditulis ulang dari data kunjungan. '
            + 'Baris manual yang Anda tambahkan tetap dipertahankan.', 'Susun ulang');
          if (!ok) return;
          try {
            await DB.kasirSusunDariKunjungan(t.kunjungan_id);
            await muatUlangModal(badan, t.id);
            UI.toast('Tagihan disusun ulang.');
          } catch (e) { UI.toast(e.message, 'err'); }
        });
      },
      tombol: [
        { teks: 'Tutup', nilai: null },
        { teks: 'Cetak', kelas: 'btn-secondary', aksi: async () => {
            const baru = await DB.kasirLengkap(t.id);
            await dialogCetak(baru);
            return false;
          } },
        ...(bolehTulis() && rb.sisa > 0.5 ? [{
          teks: 'Terima pembayaran', kelas: 'btn-primary', aksi: async (badan) => {
            const baru = await DB.kasirLengkap(t.id);
            const ok = await dialogBayar(baru);
            if (!ok) return false;
            await muatUlangModal(badan, t.id);
            return false;
          } }] : [])
      ]
    });

    await segarkan();
  }

  /* Menggambar ulang isi modal tanpa menutupnya — kasir tidak perlu
     membuka kembali tagihan yang sama setelah setiap perubahan. */
  async function muatUlangModal(badan, id) {
    const d = await DB.kasirLengkap(id);
    const rb = hitungBayar(d.tagihan, d.bayar);
    const terkunci = d.bayar.length > 0;
    const bpjs = d.tagihan.penjamin === 'BPJS' || d.tagihan.penjamin === 'GRATIS';
    gambarItem(badan, d, terkunci, bpjs);
    gambarBayar(badan, d, rb);
  }

  function gambarItem(badan, d, terkunci, bpjs) {
    const wadah = badan.querySelector('#isiItem');
    const t = d.tagihan;
    if (!d.item.length) {
      wadah.innerHTML = `<div class="banner warn"><div>Tagihan ini belum punya baris apa pun.
        ${t.kunjungan_id ? 'Coba "Susun ulang dari kunjungan".' : 'Tambahkan baris manual.'}</div></div>`;
      return;
    }

    const SUMBER = { TINDAKAN: 'Tindakan', OBAT: 'Obat', LAYANAN: 'Layanan', MANUAL: 'Manual' };
    wadah.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Uraian</th><th class="text-right">Qty</th><th class="text-right">Harga</th>
      <th class="text-right">Diskon</th><th class="text-right">Jumlah</th>
      <th class="col-shrink">Ditagih</th>${!terkunci && bolehTulis() ? '<th class="col-shrink"></th>' : ''}
      </tr></thead><tbody>${d.item.map(i => `<tr${i.ditanggung_penjamin ? ' class="row-muted"' : ''}>
        <td>${UI.esc(i.nama)}
          <div class="text-xs text-muted">${UI.esc(SUMBER[i.sumber] || i.sumber)}
            ${i.ref_kode ? ' · ' + UI.esc(i.ref_kode) : ''}
            ${i.harga_satuan == 0 && i.sumber === 'TINDAKAN'
              ? ' · <span class="text-warn">tarif belum diisi</span>' : ''}</div></td>
        <td class="text-right">${i.qty}</td>
        <td class="text-right">${rp(i.harga_satuan)}</td>
        <td class="text-right">${Number(i.diskon_pct) ? i.diskon_pct + '%' : '—'}</td>
        <td class="text-right"><b>${rp(i.total_baris)}</b></td>
        <td class="text-center">${terkunci || !bolehTulis()
          ? (i.ditanggung_penjamin ? '<span class="badge b-info">penjamin</span>' : '✓')
          : `<input type="checkbox" data-tagih="${i.id}" ${i.ditanggung_penjamin ? '' : 'checked'}
                 title="Hilangkan centang bila ditanggung penjamin">`}</td>
        ${!terkunci && bolehTulis()
          ? `<td><button class="btn btn-secondary btn-sm" data-hapus-item="${i.id}">×</button></td>` : ''}
      </tr>`).join('')}
      <tr class="row-tint summary">
        <td colspan="4">Nilai seluruh layanan</td>
        <td class="text-right">${rp(t.subtotal)}</td>
        <td colspan="${!terkunci && bolehTulis() ? 2 : 1}"></td></tr>
      <tr class="row-tint summary fw-700">
        <td colspan="4">Ditagihkan ke pasien</td>
        <td class="text-right text-lg">${rp(t.total)}</td>
        <td colspan="${!terkunci && bolehTulis() ? 2 : 1}"></td></tr>
      </tbody></table></div>`;

    wadah.querySelectorAll('[data-tagih]').forEach(c =>
      c.addEventListener('change', async () => {
        try {
          await DB.kasirUbahItem(c.dataset.tagih, { ditanggung_penjamin: !c.checked });
          await muatUlangModal(badan, t.id);
        } catch (e) { UI.toast(e.message, 'err'); c.checked = !c.checked; }
      }));
    wadah.querySelectorAll('[data-hapus-item]').forEach(b =>
      b.addEventListener('click', async () => {
        try {
          await DB.kasirHapusItem(b.dataset.hapusItem);
          await muatUlangModal(badan, t.id);
        } catch (e) { UI.toast(e.message, 'err'); }
      }));
  }

  function gambarBayar(badan, d, rb) {
    const wadah = badan.querySelector('#isiBayar');
    /* Menghapus pembayaran dibatasi ke master — sama seperti di database.
       Uangnya sudah diterima dan struknya sudah dicetak; barisnya hilang
       berarti tagihan tampak belum lunas dan selisih di laci tidak dicari. */
    const adminBoleh = App.siapa()?.peran === 'master';
    wadah.innerHTML = `
      <div class="grid grid-3 mb-16">
        <div class="stat"><div class="lbl">Total tagihan</div><div class="val">${rp(rb.total)}</div></div>
        <div class="stat"><div class="lbl">Sudah dibayar</div><div class="val">${rp(rb.dibayar)}</div></div>
        <div class="stat"><div class="lbl">Sisa</div>
          <div class="val ${rb.sisa > 0.5 ? 'text-warn' : 'text-ok'}">
            ${rp(rb.sisa)}</div></div>
      </div>
      ${d.bayar.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Tanggal</th><th>Metode</th><th>Petugas</th>
          <th class="text-right">Jumlah</th>${adminBoleh ? '<th class="col-shrink"></th>' : ''}
        </tr></thead><tbody>${d.bayar.map(b => {
          const kembali = (Number(b.uang_diterima) || 0) - Number(b.jumlah);
          return `<tr>
            <td class="mono text-xs">${UI.tglPendek(b.tanggal)}</td>
            <td>${UI.esc(LABEL_METODE[b.metode] || b.metode)}
              ${kembali > 0.5 ? `<div class="text-xs text-muted">diterima
                ${rp(b.uang_diterima)}, kembali ${rp(kembali)}</div>` : ''}
              ${b.catatan ? `<div class="text-xs text-muted">${UI.esc(b.catatan)}</div>` : ''}</td>
            <td class="text-xs text-muted">${UI.esc(b.petugas?.nama || '—')}</td>
            <td class="text-right"><b>${rp(b.jumlah)}</b></td>
            ${adminBoleh ? `<td><button class="btn btn-secondary btn-sm"
              data-hapus-bayar="${b.id}" title="Hapus pembayaran">×</button></td>` : ''}
          </tr>`; }).join('')}</tbody></table></div>`
        : '<p class="text-muted text-xs mb-0">Belum ada pembayaran tercatat.</p>'}`;

    wadah.querySelectorAll('[data-hapus-bayar]').forEach(b =>
      b.addEventListener('click', async () => {
        const alasan = await dialogAlasanHapus();
        if (alasan === null) return;
        try {
          await DB.kasirHapusPembayaran(b.dataset.hapusBayar, alasan);
          await muatUlangModal(badan, d.tagihan.id);
          UI.toast('Pembayaran dihapus, status dihitung ulang.');
        } catch (e) { UI.toast(e.message, 'err'); }
      }));
  }

  async function dialogAlasanHapus() {
    let alasan = null;
    await UI.modal({
      judul: 'Hapus pembayaran?',
      isi: `<div class="banner err mb-16"><div>Uangnya mungkin sudah diterima dan struknya
        sudah dicetak. Setelah baris ini hilang, tagihan akan terlihat belum lunas dan
        selisih di laci tidak akan tercari. Penghapusan tercatat di audit log dengan
        nama Anda.</div></div>
        <div class="field"><label>Alasan *</label>
          <input type="text" name="alasan" placeholder="Salah input, pembayaran dibatalkan, …"></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Ya, hapus', kelas: 'btn-danger', aksi: (badan) => {
            const v = badan.querySelector('[name=alasan]').value.trim();
            if (!v) { UI.toast('Alasan wajib diisi.', 'err'); return false; }
            alasan = v; return true;
          } }
      ]
    });
    return alasan;
  }

  /* ==================================================================
     DIALOG — TERIMA PEMBAYARAN
     ================================================================== */
  const SARAN_UANG = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

  function saranUang(sisa) {
    const keluar = new Set([Math.ceil(sisa)]);
    SARAN_UANG.forEach(n => { if (n >= sisa) keluar.add(n); });
    // Pembulatan ke atas terdekat yang wajar diserahkan orang.
    [5000, 10000, 20000, 50000, 100000].forEach(n => {
      const bulat = Math.ceil(sisa / n) * n;
      if (bulat >= sisa) keluar.add(bulat);
    });
    return [...keluar].sort((a, b) => a - b).slice(0, 6);
  }

  async function dialogBayar(d) {
    const rb = hitungBayar(d.tagihan, d.bayar);
    let berhasil = false;

    await UI.modal({
      judul: 'Terima pembayaran',
      isi: `
        <div class="grid grid-2 mb-16">
          <div class="stat"><div class="lbl">Sisa tagihan</div>
            <div class="val">${rp(rb.sisa)}</div></div>
          <div class="stat"><div class="lbl">Tagihan</div>
            <div class="val sm">${UI.esc(d.tagihan.nomor)}</div>
            <div class="hint">${UI.esc(d.tagihan.nama_pasien || d.tagihan.nama_pembayar)}</div></div>
        </div>
        <div class="form-row c2">
          <div class="field"><label>Jumlah dibayar *</label>
            <input type="number" name="jumlah" step="any" min="1" value="${Math.round(rb.sisa)}"></div>
          <div class="field"><label>Metode</label>
            <select name="metode">${Object.entries(LABEL_METODE).map(([k, v]) =>
              `<option value="${k}">${v}</option>`).join('')}</select></div>
        </div>
        <div id="blokTunai">
          <div class="field"><label>Uang diterima</label>
            <input type="number" name="uang_diterima" step="any" min="0"
                   placeholder="Kosongkan bila uang pas">
            <div class="radio-row mt-8">${saranUang(rb.sisa).map(n =>
              `<button type="button" class="radio-chip" data-uang="${n}">${rp(n)}</button>`).join('')}</div>
            <div id="kembalian" class="hint"></div></div>
        </div>
        <div class="form-row c2">
          <div class="field"><label>Tanggal</label>
            <input type="date" name="tanggal" value="${UI.hariIni()}"></div>
          <div class="field"><label>Catatan</label><input type="text" name="catatan"></div>
        </div>`,
      siap: (badan) => {
        const inpUang = badan.querySelector('[name=uang_diterima]');
        const inpJml = badan.querySelector('[name=jumlah]');
        const selMet = badan.querySelector('[name=metode]');
        const blok = badan.querySelector('#blokTunai');

        const hitung = () => {
          const u = Number(inpUang.value) || 0;
          const j = Number(inpJml.value) || 0;
          const el = badan.querySelector('#kembalian');
          el.classList.remove('text-danger');
          if (!u) { el.textContent = 'Kosong berarti uang pas.'; return; }
          if (u < j) {
            el.textContent = `Kurang ${rp(j - u)}.`;
            el.classList.add('text-danger');
          } else {
            el.innerHTML = `Kembalian <b>${rp(u - j)}</b>`;
          }
        };
        const toggleTunai = () => {
          blok.hidden = selMet.value !== 'tunai';
          if (selMet.value !== 'tunai') inpUang.value = '';
        };
        inpUang.addEventListener('input', hitung);
        inpJml.addEventListener('input', hitung);
        selMet.addEventListener('change', toggleTunai);
        badan.querySelectorAll('[data-uang]').forEach(b =>
          b.addEventListener('click', () => { inpUang.value = b.dataset.uang; hitung(); }));
        toggleTunai(); hitung();
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan pembayaran', kelas: 'btn-primary', aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            if (!f.jumlah || Number(f.jumlah) <= 0) {
              UI.toast('Jumlah harus lebih dari nol.', 'err'); return false;
            }
            try {
              const h = await DB.kasirCatatPembayaran({
                tagihan_id: d.tagihan.id, jumlah: Number(f.jumlah),
                tanggal: f.tanggal, metode: f.metode, catatan: f.catatan,
                uang_diterima: Number(f.uang_diterima) || null
              });
              berhasil = true;
              const kembali = Number(h.kembalian) || 0;
              UI.toast(kembali > 0.5
                ? `Tersimpan. Kembalian ${rp(kembali)}.`
                : `Tersimpan. ${LABEL_STATUS[h.status_bayar]}.`);

              /* Pelunasan adalah saat kwitansi diserahkan, jadi kotak cetak
                 dibuka langsung — kasir tidak perlu mencari lagi tagihan
                 yang baru saja dibayarnya. */
              if (h.status_bayar === 'lunas') {
                const baru = await DB.kasirLengkap(d.tagihan.id);
                setTimeout(() => dialogCetak(baru), 120);
              }
              return true;
            } catch (e) { UI.toast(e.message, 'err'); return false; }
          } }
      ]
    });
    return berhasil;
  }

  /* ==================================================================
     DIALOG — BARIS MANUAL & PENJUALAN BEBAS
     ================================================================== */
  async function dialogItemManual(tagihanId, bpjs) {
    let simpan = false;
    let obatTerpilih = null;   // { obat_id, nama_obat, satuan, harga_jual, stok_layak }
    const tarif = await DB.daftarTarif({}).catch(() => []);

    await UI.modal({
      judul: 'Tambah baris',
      isi: `
        <div class="field"><label>Cari obat — memotong stok apotek otomatis</label>
          <div id="cariObatBebas"></div>
          <div class="hint" id="infoObatBebas">Kosongkan sama sekali kalau baris ini bukan obat
            (mis. tindakan, surat, biaya lain-lain).</div></div>
        <div class="field"><label>Atau ambil dari master tarif</label>
          <select id="pilihTarif"><option value="">— ketik sendiri di bawah —</option>
            ${tarif.map(t => `<option value="${UI.esc(t.id)}" data-nama="${UI.esc(t.nama)}"
              data-tarif="${t.tarif}">${UI.esc(t.nama)} — ${rp(t.tarif)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Uraian *</label><input type="text" name="nama"></div>
        <div class="form-row c3">
          <div class="field"><label>Qty</label><input type="number" name="qty" value="1" min="0.01" step="any"></div>
          <div class="field"><label>Harga satuan</label>
            <input type="number" name="harga_satuan" value="0" min="0" step="any"></div>
          <div class="field"><label>Diskon (%)</label>
            <input type="number" name="diskon_pct" value="0" min="0" max="100" step="any"></div>
        </div>
        ${bpjs ? `<div class="field"><label class="check">
          <input type="checkbox" name="ditanggung_penjamin">
          <span>Ditanggung penjamin (tidak ditagihkan ke pasien)</span></label>
          <div class="hint">Kunjungan BPJS. Untuk layanan di luar tanggungan —
            surat keterangan, obat non-formularium — biarkan tidak tercentang.</div></div>` : ''}`,
      siap: (badan) => {
        const namaEl = badan.querySelector('[name=nama]');
        const hargaEl = badan.querySelector('[name=harga_satuan]');
        const selTarif = badan.querySelector('#pilihTarif');
        const info = badan.querySelector('#infoObatBebas');

        const pakaiObat = (o) => {
          obatTerpilih = o;
          selTarif.value = '';
          namaEl.value = o.nama_obat;
          namaEl.readOnly = true;
          hargaEl.value = o.harga_jual || 0;
          hargaEl.readOnly = true;
          info.innerHTML = `<b>${UI.esc(o.nama_obat)}</b> dipilih — harga &amp; potong stok
            otomatis dari master Obat. Stok layak: <b>${o.stok_layak} ${UI.esc(o.satuan)}</b>.
            <button type="button" class="btn btn-secondary btn-sm" id="btnBatalObatBebas"
              style="margin-left:8px">Batalkan pilihan</button>`;
          info.querySelector('#btnBatalObatBebas').addEventListener('click', lepasObat);
        };
        const lepasObat = () => {
          obatTerpilih = null;
          namaEl.readOnly = false; namaEl.value = '';
          hargaEl.readOnly = false; hargaEl.value = 0;
          info.textContent = 'Kosongkan sama sekali kalau baris ini bukan obat '
            + '(mis. tindakan, surat, biaya lain-lain).';
        };

        Komponen.comboCari({
          wadah: badan.querySelector('#cariObatBebas'),
          placeholder: 'Cari nama obat… (contoh: paracetamol, amox)',
          cariFn: (kata) => DB.cariObatJual(kata),
          formatFn: (o) => `<b>${UI.esc(o.nama_obat)}</b>
            <span>${rp(o.harga_jual)} · stok layak ${o.stok_layak} ${UI.esc(o.satuan)}</span>`,
          onPilih: (o) => pakaiObat(o)
        });

        selTarif.addEventListener('change', (e) => {
          const o = e.target.selectedOptions[0];
          if (!o.value) return;
          if (obatTerpilih) lepasObat();
          namaEl.value = o.dataset.nama;
          hargaEl.value = o.dataset.tarif;
        });
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Tambah', kelas: 'btn-primary', aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            try {
              if (obatTerpilih) {
                const qty = Number(f.qty) || 0;
                if (qty <= 0) { UI.toast('Jumlah harus lebih dari nol.', 'err'); return false; }
                await DB.kasirJualObatBebas({
                  tagihan_id: tagihanId, obat_id: obatTerpilih.obat_id, qty,
                  diskon_pct: Number(f.diskon_pct) || 0,
                  ditanggung_penjamin: !!f.ditanggung_penjamin, urutan: 99
                });
              } else {
                if (!f.nama) { UI.toast('Uraian wajib diisi.', 'err'); return false; }
                const sel = badan.querySelector('#pilihTarif');
                await DB.kasirTambahItem({
                  tagihan_id: tagihanId, sumber: 'MANUAL',
                  ref_id: sel.value || null,
                  nama: f.nama, qty: Number(f.qty) || 1,
                  harga_satuan: Number(f.harga_satuan) || 0,
                  diskon_pct: Number(f.diskon_pct) || 0,
                  ditanggung_penjamin: !!f.ditanggung_penjamin, urutan: 99
                });
              }
              simpan = true; return true;
            } catch (e) { UI.toast(e.message, 'err'); return false; }
          } }
      ]
    });
    return simpan;
  }

  async function dialogPenjualanBebas() {
    await UI.modal({
      judul: 'Penjualan bebas',
      isi: `<div class="banner info mb-16"><div>Untuk pembeli yang tidak lewat
          pendaftaran. Tagihannya tidak tertaut kunjungan mana pun, jadi barisnya
          diisi manual. Stok obat tetap dipotong dari layar Apotek → Obat keluar.</div></div>
        <div class="field"><label>Nama pembeli *</label>
          <input type="text" name="nama_pembayar" placeholder="Nama di kwitansi"></div>
        <div class="field"><label>Catatan</label><input type="text" name="catatan"></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Buat tagihan', kelas: 'btn-primary', aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            if (!f.nama_pembayar) { UI.toast('Nama pembeli wajib diisi.', 'err'); return false; }
            try {
              const t = await DB.kasirBuatTagihanBebas({
                nama_pembayar: f.nama_pembayar, catatan: f.catatan,
                penjamin: 'UMUM', tanggal: UI.hariIni()
              });
              await segarkan();
              setTimeout(() => bukaTagihan(t.id), 100);
              return true;
            } catch (e) { UI.toast(e.message, 'err'); return false; }
          } }
      ]
    });
  }

  /* ==================================================================
     CETAK — struk thermal & kwitansi PDF
     ================================================================== */
  function modulStrukSiap() {
    return typeof StrukCore !== 'undefined' && typeof StrukPrinter !== 'undefined';
  }

  /* Memetakan bentuk data RME ke bentuk yang dipahami struk_core.js.
     struk_core sengaja TIDAK diubah agar tetap sama persis dengan yang
     dipakai portal — kalau kelak kedua sistem digabung, berkas itu tidak
     bercabang. Penyesuaian bentuk dikerjakan di sini. */
  function dataStruk(d, lebarMm) {
    const t = TemplateInvoice.get();
    const tg = d.tagihan;
    const rb = hitungBayar(tg, d.bayar);
    const bpjs = (tg.penjamin === 'BPJS' || tg.penjamin === 'GRATIS') && rb.total <= 0.5;

    return {
      bisnis: { nama: t.identitas.nama, alamat: t.identitas.alamat,
                telp: t.identitas.telepon, catatanKaki: t.struk.catatanKaki },
      tpl: t.struk,
      inv: {
        invoice_number: tg.nomor,
        invoice_date:   tg.tanggal,
        customer_name:  tg.nama_pasien || tg.nama_pembayar,
        no_rm:          tg.no_rm || null,
        penjamin:       tg.penjamin,
        total:          rb.total,
        amount_paid:    rb.dibayar,
        payment_status: rb.status,
        notes:          tg.catatan
      },
      items: d.item.map(i => ({
        item_name:    i.nama + (i.ditanggung_penjamin ? ' (ditanggung)' : ''),
        quantity:     Number(i.qty),
        unit_price:   Number(i.harga_satuan),
        discount_pct: Number(i.diskon_pct),
        /* Baris yang ditanggung penjamin dicetak dengan nilai nol supaya
           jumlah di struk sama dengan yang dibayar pasien. Nilai
           ekonominya tetap ada di sistem untuk laporan; struk pasien
           bukan tempatnya. */
        line_total:   i.ditanggung_penjamin ? 0 : Number(i.total_baris)
      })),
      payments: d.bayar.map(b => ({
        paid_at: b.tanggal, amount: Number(b.jumlah), method: b.metode,
        cash_received: Number(b.uang_diterima) || 0, note: b.catatan
      })),
      opsi: {
        lebarMm,
        judul: bpjs ? TemplateInvoice.get().pdf.judulPenjamin : null,
        petugas: App.siapa()?.nama || null,
        dicetakPada: 'Dicetak ' + UI.tglIndo(new Date()) + ', ' + UI.jam(new Date()) + ' WITA'
      }
    };
  }

  async function dialogCetak(d) {
    if (!modulStrukSiap()) {
      UI.toast('Berkas struk_core.js / struk_printer.js belum dimuat.', 'err');
      return;
    }
    let lebar = StrukPrinter.lebarTersimpan() || TemplateInvoice.get().struk.lebarBaku;

    await UI.modal({
      judul: `Cetak ${d.tagihan.nomor}`,
      lebar: true,
      isi: `
        <div class="split">
          <div>
            <div class="field"><label>Lebar kertas</label>
              <div class="radio-row">
                <button type="button" class="radio-chip" data-lebar="58">58 mm</button>
                <button type="button" class="radio-chip" data-lebar="80">80 mm</button>
              </div></div>
            <div class="field"><label>Printer</label>
              <div id="statusPrinter" class="hint"></div>
              <div class="btn-group mt-8" id="tombolPrinter"></div></div>
            <div class="btn-group mt-16">
              <button class="btn btn-primary" id="btnCetakStruk">Cetak struk</button>
              <button class="btn btn-secondary" id="btnPdf">Unduh kwitansi PDF</button>
            </div>
            <div class="hint mt-8" id="catatanCetak"></div>
          </div>
          <div>
            <label>Pratinjau</label>
            <pre id="pratinjauStruk" class="struk-preview"></pre>
          </div>
        </div>`,
      siap: (badan) => {
        const gambar = () => {
          badan.querySelectorAll('[data-lebar]').forEach(b =>
            b.classList.toggle('on', Number(b.dataset.lebar) === lebar));
          const susun = StrukCore.susunStruk(dataStruk(d, lebar));
          badan.querySelector('#pratinjauStruk').textContent = StrukCore.keTeks(susun, lebar);
        };
        badan.querySelectorAll('[data-lebar]').forEach(b =>
          b.addEventListener('click', () => {
            lebar = Number(b.dataset.lebar);
            StrukPrinter.setLebar(lebar);
            gambar();
          }));

        const dukung = StrukPrinter.dukungan();
        const st = StrukPrinter.status();
        badan.querySelector('#statusPrinter').innerHTML = st.terhubung
          ? `Tersambung ke <b>${UI.esc(st.nama)}</b> (${st.mode.toUpperCase()}).`
          : 'Belum ada printer tersambung — tombol Cetak akan membuka dialog cetak biasa.';

        /* Tombol yang mustahil tidak ditampilkan. iOS tidak akan pernah
           punya Web Bluetooth maupun WebUSB; menampilkan tombolnya lalu
           gagal hanya membuat orang mengira aplikasinya rusak. */
        const tb = badan.querySelector('#tombolPrinter');
        tb.innerHTML = [
          dukung.ble ? '<button class="btn btn-secondary btn-sm" id="btnBt">Sambungkan Bluetooth</button>' : '',
          dukung.usb ? '<button class="btn btn-secondary btn-sm" id="btnUsb">Sambungkan USB</button>' : ''
        ].join('');
        if (dukung.ios) {
          badan.querySelector('#catatanCetak').textContent =
            'Di iPhone dan iPad, printer Bluetooth tidak bisa diakses dari peramban. '
            + 'Tombol Cetak membuka dialog cetak sistem — pilih printer thermal dari sana.';
        }

        badan.querySelector('#btnBt')?.addEventListener('click', async (e) => {
          try { await StrukPrinter.pilihBluetooth(); UI.toast('Printer tersambung.'); }
          catch (err) { UI.toast(err.message, 'err'); }
        });
        badan.querySelector('#btnUsb')?.addEventListener('click', async () => {
          try { await StrukPrinter.pilihUsb(true); UI.toast('Printer tersambung.'); }
          catch (err) { UI.toast(err.message, 'err'); }
        });

        badan.querySelector('#btnCetakStruk').addEventListener('click', async () => {
          const susun = StrukCore.susunStruk(dataStruk(d, lebar));
          const tpl = TemplateInvoice.get().struk;
          try {
            await StrukPrinter.cetak(
              StrukCore.keEscPos(susun, { lebarMm: lebar,
                barisKosongAkhir: tpl.barisKosongAkhir, potongKertas: tpl.potongKertas }),
              { htmlCadangan: StrukCore.keHtml(susun,
                  { lebarMm: lebar, judul: d.tagihan.nomor }) });
          } catch (err) { UI.toast(err.message, 'err'); }
        });

        badan.querySelector('#btnPdf').addEventListener('click', () => cetakPdf(d));
        gambar();
      },
      tombol: [{ teks: 'Tutup', nilai: null }]
    });
  }

  /* ------------------------------------------------------------------
     KWITANSI PDF (pdfmake) — tata letak diturunkan dari portal
     ------------------------------------------------------------------ */
  const td = (t, a) => ({ text: t ?? '', alignment: a || 'left', margin: [0, 3] });
  const th = (t, a) => ({ text: t ?? '', bold: true, fontSize: 9, color: '#334155',
                          alignment: a || 'left', margin: [0, 3] });
  const tataGaris = {
    hLineWidth: (i, n) => (i === 0 || i === n.table.body.length || i === 1) ? 0.7 : 0.4,
    vLineWidth: () => 0, hLineColor: () => '#e2e8f0',
    paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 5, paddingBottom: () => 5
  };

  /* pdfmake dimuat saat dibutuhkan, bukan di setiap halaman.
     vfs_fonts.js sendirian hampir 1,5 MB; memuatnya di app.html berarti
     setiap orang yang membuka Beranda menunggu berkas yang hanya dipakai
     kasir saat mencetak kwitansi. Di jaringan klinik itu terasa. */
  let pdfSiap = null;
  function muatPdfMake() {
    if (typeof pdfMake !== 'undefined') return Promise.resolve();
    if (pdfSiap) return pdfSiap;
    const ambil = (src) => new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = () => gagal(new Error('Gagal memuat ' + src));
      document.head.appendChild(s);
    });
    const dasar = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/';
    pdfSiap = ambil(dasar + 'pdfmake.min.js')
      .then(() => ambil(dasar + 'vfs_fonts.js'))
      .catch(e => { pdfSiap = null; throw e; });
    return pdfSiap;
  }

  async function cetakPdf(d) {
    try {
      UI.toast('Menyiapkan PDF…');
      await muatPdfMake();
    } catch (e) {
      UI.toast('Pustaka PDF gagal dimuat. Periksa koneksi internet, atau cetak struk '
             + 'thermal sebagai gantinya.', 'err');
      return;
    }
    const t  = TemplateInvoice.get();
    const tp = t.pdf;
    const tg = d.tagihan;
    const rb = hitungBayar(tg, d.bayar);
    const bpjs = (tg.penjamin === 'BPJS' || tg.penjamin === 'GRATIS') && rb.total <= 0.5;

    const judul = bpjs ? tp.judulPenjamin
                : rb.status === 'lunas' ? tp.judulLunas : tp.judulBelumLunas;
    const cap = bpjs ? tp.judulPenjamin
              : rb.status === 'lunas' ? tp.capLunas
              : rb.status === 'sebagian' ? tp.capSebagian : tp.capBelumLunas;
    const warnaCap = bpjs ? { bg: '#eff6ff', ink: '#1d4ed8' }
                   : rb.status === 'lunas' ? { bg: '#e6f4e6', ink: tp.warnaTotal }
                   : rb.status === 'sebagian' ? { bg: '#fff7e6', ink: '#b45309' }
                   : { bg: '#fdeceb', ink: '#c81e0f' };

    const kolDiskon = tp.tampilKolomDiskon;
    const kepala = [th('No'), th('Uraian'), th('Qty', 'right'), th('Harga', 'right')];
    if (kolDiskon) kepala.push(th('Diskon', 'right'));
    kepala.push(th('Jumlah', 'right'));

    const baris = d.item.map((i, n) => {
      const r = [td(String(n + 1)), td(i.nama), td(String(i.qty), 'right'),
                 td(rp(i.harga_satuan), 'right')];
      if (kolDiskon) r.push(td(Number(i.diskon_pct) ? i.diskon_pct + '%' : '—', 'right'));
      r.push(td(i.ditanggung_penjamin ? 'Ditanggung' : rp(i.total_baris), 'right'));
      return r;
    });

    const tt = tp.tandaTangan;
    const doc = {
      pageMargins: [40, 46, 40, 58],
      content: [
        { columns: [
          { width: '*', stack: [
            { text: t.identitas.nama, style: 'biz' },
            { text: t.identitas.alamat, style: 'muted' },
            { text: tp.tampilEmail && t.identitas.email
                ? `${t.identitas.telepon}  •  ${t.identitas.email}` : t.identitas.telepon,
              style: 'muted' },
            (tp.tampilVisi && t.identitas.visi)
              ? { text: '“' + t.identitas.visi + '”', style: 'visi', margin: [0, 5, 0, 0] } : {}
          ] },
          { width: 'auto', stack: [
            { text: judul, style: 'judul', alignment: 'right' },
            { text: tg.nomor, style: 'muted', alignment: 'right' },
            { columns: [{ width: '*', text: '' }, {
                table: { body: [[{ text: cap, bold: true, fontSize: 11,
                  color: warnaCap.ink, margin: [10, 4, 10, 4] }]] },
                layout: { fillColor: () => warnaCap.bg, hLineWidth: () => 0, vLineWidth: () => 0 }
              }], margin: [0, 8, 0, 0] }
          ] }
        ] },
        { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8,
                     lineWidth: 1, lineColor: tp.warnaAksen }], margin: [0, 10, 0, 0] },

        { columns: [
          [ { text: 'DITAGIHKAN KEPADA', style: 'eyebrow', margin: [0, 14, 0, 4] },
            { text: tg.nama_pasien || tg.nama_pembayar, style: 'tebal' },
            (tp.tampilNomorRm && tg.no_rm) ? { text: 'No. RM ' + tg.no_rm, style: 'muted' } : {},
            (tp.tampilPenjamin) ? { text: 'Penjamin: ' + tg.penjamin, style: 'muted' } : {} ],
          [ { text: 'TANGGAL', style: 'eyebrow', alignment: 'right', margin: [0, 14, 0, 4] },
            { text: UI.tglIndo(tg.tanggal), alignment: 'right' },
            (tp.tampilPoliDokter && tg.nama_poli)
              ? { text: tg.nama_poli + (tg.nama_dokter ? ' · ' + tg.nama_dokter : ''),
                  style: 'muted', alignment: 'right' } : {} ]
        ] },

        { style: 'bungkusTabel', table: {
            headerRows: 1,
            widths: kolDiskon ? ['auto', '*', 'auto', 'auto', 'auto', 'auto']
                              : ['auto', '*', 'auto', 'auto', 'auto'],
            body: [kepala, ...baris]
          }, layout: tataGaris },

        { columns: [{ width: '*', text: '' }, { width: 240, table: { widths: ['*', 'auto'], body: [
            [{ text: 'Nilai seluruh layanan', style: 'muted', border: [false, false, false, false] },
             { text: rp(tg.subtotal), alignment: 'right', border: [false, false, false, false] }],
            ...(Number(tg.subtotal) > Number(tg.total) ? [[
             { text: 'Ditanggung penjamin', style: 'muted', border: [false, false, false, false] },
             { text: '− ' + rp(Number(tg.subtotal) - Number(tg.total)), alignment: 'right',
               color: '#2563eb', border: [false, false, false, false] }]] : []),
            [{ text: 'DIBAYAR PASIEN', bold: true, fontSize: 12,
               border: [false, true, false, false], borderColor: ['', '#0f172a', '', ''],
               margin: [0, 4, 0, 0] },
             { text: rp(rb.total), alignment: 'right', bold: true, fontSize: 12,
               color: tp.warnaTotal, border: [false, true, false, false],
               borderColor: ['', '#0f172a', '', ''], margin: [0, 4, 0, 0] }]
          ] }, layout: { vLineWidth: () => 0,
            hLineWidth: (i, n) => i === n.table.body.length - 1 ? 1 : 0,
            hLineColor: () => '#0f172a', paddingTop: () => 4, paddingBottom: () => 4 } }],
          margin: [0, 10, 0, 0] },

        (d.bayar.length && tp.tampilRiwayatBayar)
          ? { text: 'RIWAYAT PEMBAYARAN', style: 'eyebrow', margin: [0, 22, 0, 5] } : {},
        (d.bayar.length && tp.tampilRiwayatBayar) ? { table: {
            headerRows: 1, widths: ['auto', '*', 'auto'],
            body: [[th('Tanggal'), th('Metode'), th('Jumlah', 'right')],
              ...d.bayar.map(b => {
                const diterima = Number(b.uang_diterima) || 0;
                const kembali = diterima - Number(b.jumlah);
                return [td(UI.tglIndo(b.tanggal)),
                        td((LABEL_METODE[b.metode] || b.metode)
                          + (b.catatan ? ' — ' + b.catatan : '')
                          + (kembali > 0.5
                             ? ` (diterima ${rp(diterima)}, kembali ${rp(kembali)})` : '')),
                        td(rp(b.jumlah), 'right')];
              })]
          }, layout: tataGaris } : {},

        rb.dibayar > 0 ? { columns: [{ width: '*', text: '' },
          { width: 240, table: { widths: ['*', 'auto'], body: [
            [{ text: 'Total dibayar', style: 'muted', border: [false, false, false, false] },
             { text: rp(rb.dibayar), alignment: 'right', border: [false, false, false, false] }],
            [{ text: rb.sisa > 0.5 ? 'SISA TAGIHAN' : 'Sisa', bold: rb.sisa > 0.5,
               border: [false, true, false, false], borderColor: ['', '#0f172a', '', ''],
               margin: [0, 4, 0, 0] },
             { text: rp(rb.sisa), alignment: 'right', bold: true,
               color: rb.sisa > 0.5 ? '#b45309' : tp.warnaTotal,
               border: [false, true, false, false], borderColor: ['', '#0f172a', '', ''],
               margin: [0, 4, 0, 0] }]
          ] }, layout: { vLineWidth: () => 0, hLineWidth: (i) => i === 1 ? 1 : 0,
            hLineColor: () => '#0f172a', paddingTop: () => 4, paddingBottom: () => 4 } }],
          margin: [0, 8, 0, 0] } : {},

        tg.catatan ? { text: 'Catatan', style: 'eyebrow', margin: [0, 20, 0, 3] } : {},
        tg.catatan ? { text: tg.catatan, style: 'muted' } : {},

        tt.aktif ? { columns: [{ width: '*', text: '' }, { width: 210, stack: [
            { text: (tt.kota ? tt.kota + ', ' : '') + UI.tglIndo(tg.tanggal),
              style: 'muted', alignment: 'center' },
            tt.jabatan ? { text: tt.jabatan, style: 'muted', alignment: 'center',
                           margin: [0, 2, 0, 0] } : {},
            { text: ' ', margin: [0, 32, 0, 0] },
            { text: tt.nama || (tp.tampilPetugas ? (App.siapa()?.nama || '') : '')
                 || '(...................................)',
              alignment: 'center', bold: true }
          ] }], margin: [0, 26, 0, 0] } : {}
      ],
      footer: (kini, jml) => ({ columns: [
        { text: tp.catatanKaki || '', style: 'muted', margin: [40, 0, 0, 0] },
        { text: `Halaman ${kini} / ${jml}`, style: 'muted', alignment: 'right',
          margin: [0, 0, 40, 0] }
      ], margin: [0, 10, 0, 0] }),
      styles: {
        biz:     { fontSize: 15, bold: true, color: '#0f172a', margin: [0, 0, 0, 2] },
        judul:   { fontSize: 22, bold: true, color: tp.warnaAksen },
        eyebrow: { fontSize: 8, bold: true, color: '#94a3b8', characterSpacing: 0.5 },
        tebal:   { fontSize: 12, bold: true, margin: [0, 0, 0, 1] },
        muted:   { fontSize: 9.5, color: '#64748b' },
        visi:    { fontSize: 9.5, italics: true, color: tp.warnaTotal },
        bungkusTabel: { margin: [0, 18, 0, 0] }
      },
      defaultStyle: { fontSize: 10, color: '#0f172a' }
    };

    try { pdfMake.createPdf(doc).download(`${tg.nomor}.pdf`); }
    catch (e) { UI.toast('Gagal membuat PDF: ' + e.message, 'err'); }
  }

  return { render, bukaTagihan };
})();

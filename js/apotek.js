/* =====================================================================
   APOTEK — antrean resep, stok batch (FEFO), riwayat, kartu stok,
   dan laporan bulanan.

   Perhitungannya TIDAK ada di sini. Kartu stok dan pratinjau FEFO
   dikerjakan apotek_core.js (fungsi murni, teruji di Node); pemotongan
   stok yang sebenarnya dikerjakan fungsi database di 08_apotek.sql yang
   mengunci barisnya lebih dulu. Berkas ini hanya menempelkan tampilan
   di atas keduanya.
   ===================================================================== */
const Apotek = (() => {

  const K = ApotekCore;

  let batch = [];        // v_apotek_batch
  let stok = [];         // v_apotek_stok
  let transaksi = [];    // apotek_transaksi (90 hari terakhir)
  let antrean = [];      // v_antrean_farmasi
  let grupTerbuka = new Set();
  let tab = 'antrean';
  let cari = '';
  let bulanLaporan = UI.bulanIni();
  let kartu = { mode: 'obat', obatId: '', bulan: UI.bulanIni(), tanggal: UI.hariIni() };

  const bolehTulis = () => App.boleh('apotek');
  const rp = (n) => UI.rupiah(n);

  /* Rentang riwayat yang diunduh saat halaman dibuka. Seluruh riwayat
     klinik tidak perlu ada di memori untuk menampilkan layar hari ini;
     kartu stok bulan lama mengambil ulang sesuai kebutuhan. */
  const HARI_RIWAYAT = 120;

  function tglMundur(hari) {
    const d = new Date();
    d.setDate(d.getDate() - hari);
    return K.hariIniLokal(d);
  }

  /* ------------------------------------------------------------------
     MUAT DATA
     ------------------------------------------------------------------ */
  async function muat() {
    const [b, s, t, a, sd] = await Promise.all([
      DB.apotekBatch(),
      DB.apotekStok(),
      DB.apotekTransaksi({ dari: tglMundur(HARI_RIWAYAT) }),
      DB.antreanFarmasi({}),
      // Resep yang statusnya sudah DISERAHKAN SENGAJA dikecualikan dari
      // panggilan di atas (supaya antrean "Menunggu" tidak tenggelam oleh
      // seluruh arsip resep klinik). Tapi tab "Sudah diserahkan" di bawah
      // butuh sebagian dari resep DISERAHKAN itu juga — misalnya untuk
      // mencetak ulang Salinan Resep — jadi diambil terpisah, dibatasi
      // HARI INI saja supaya tidak menarik seluruh riwayat resep klinik.
      DB.antreanFarmasi({ tanggal: UI.hariIni(), semua: true })
    ]);
    batch = b; stok = s; transaksi = t;
    antrean = [...a, ...sd.filter(x => x.status === 'DISERAHKAN')];
  }

  async function segarkan() {
    await muat();
    gambarIsi();
    gambarRingkasan();
  }

  /* ------------------------------------------------------------------
     KERANGKA HALAMAN
     ------------------------------------------------------------------ */
  async function render(el, param) {
    await muat();

    /* Rute #/apotek/<resep_id> membuka layar penyerahan langsung —
       dipakai tombol "Serahkan obat" dari layar dokter dan dari antrian. */
    const resepLangsung = (param && param[0]) || null;

    el.innerHTML = `
      <div class="page-header">
        <div class="page-heading">
          <h1>Apotek</h1>
          <div class="page-sub">Antrean resep, stok batch, dan laporan pemakaian obat.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" id="btnEkspor">${UI.ikon('unduh',16)} Ekspor Excel</button>
          ${bolehTulis() ? `
          <button class="btn btn-secondary btn-sm" id="btnImpor">${UI.ikon('rekam',16)} Impor Excel</button>
          <button class="btn btn-secondary btn-sm" id="btnKeluar">${UI.ikon('pil',16)} Obat keluar</button>
          <button class="btn btn-primary btn-sm" id="btnMasuk">${UI.ikon('plus',16)} Obat masuk</button>` : ''}
        </div>
      </div>

      <div class="grid grid-4 mb-16" id="ringkasan"></div>

      <div class="tabs" id="tabApotek">
        <button class="tab" data-t="antrean">Antrean resep <span class="badge b-info" id="hitAntrean">0</span></button>
        <button class="tab" data-t="stok">Stok saat ini</button>
        <button class="tab" data-t="riwayat">Riwayat</button>
        <button class="tab" data-t="kartu">Kartu stok</button>
        <button class="tab" data-t="laporan">Laporan bulanan</button>
      </div>

      <div id="isiApotek"></div>`;

    el.querySelector('#tabApotek').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tab = b.dataset.t;
      gambarIsi();
    });
    el.querySelector('#btnEkspor').addEventListener('click', dialogEkspor);
    if (bolehTulis()) {
      el.querySelector('#btnMasuk').addEventListener('click', dialogObatMasuk);
      el.querySelector('#btnKeluar').addEventListener('click', () => dialogObatKeluar());
      el.querySelector('#btnImpor').addEventListener('click', dialogImpor);
    }

    gambarRingkasan();
    gambarIsi();

    if (resepLangsung) dialogSerahResep(resepLangsung);
  }

  function gambarRingkasan() {
    const r = K.ringkasStok(batch);
    const el = document.getElementById('ringkasan');
    if (!el) return;
    el.innerHTML = `
      <div class="stat accent">
        <div class="lbl">Nilai aset obat</div>
        <div class="val">${rp(r.nilaiAset)}</div>
        <div class="hint">harga beli, ${r.jenisObat} jenis obat</div>
        ${r.nilaiKronis > 0 ? `<div class="hint">reguler ${rp(r.nilaiReguler)} ·
          kronis ${rp(r.nilaiKronis)}</div>` : ''}
      </div>
      <div class="stat">
        <div class="lbl">Batch aktif</div>
        <div class="val">${r.jumlahBatch}</div>
        <div class="hint">${r.menipis} batch sisa di bawah 10</div>
      </div>
      <div class="stat">
        <div class="lbl">Menunggu diserahkan</div>
        <div class="val">${antrean.filter(a => a.status !== 'DISERAHKAN').length}</div>
        <div class="hint">resep dari dokter</div>
      </div>
      <div class="stat">
        <div class="lbl">Perlu perhatian</div>
        <div class="val text-danger">${r.kadaluwarsa}</div>
        <div class="hint">${r.kadaluwarsa} kadaluwarsa, ${r.segera} habis dalam 30 hari</div>
      </div>`;
    const h = document.getElementById('hitAntrean');
    if (h) h.textContent = antrean.filter(a => a.status !== 'DISERAHKAN').length;
  }

  function gambarIsi() {
    document.querySelectorAll('#tabApotek .tab').forEach(b =>
      b.classList.toggle('on', b.dataset.t === tab));
    const el = document.getElementById('isiApotek');
    if (!el) return;
    ({ antrean: gambarAntrean, stok: gambarStok, riwayat: gambarRiwayat,
       kartu: gambarKartu, laporan: gambarLaporan }[tab] || gambarAntrean)(el);
  }

  /* ------------------------------------------------------------------
     TAB 1 — ANTREAN RESEP
     ------------------------------------------------------------------ */
  function gambarAntrean(el) {
    const belum = antrean.filter(a => a.status !== 'DISERAHKAN');
    const sudah = antrean.filter(a => a.status === 'DISERAHKAN').slice(0, 20);

    el.innerHTML = `
      <div class="card mb-16">
        <div class="card-head">
          <div><h2>Menunggu diserahkan</h2>
            <div class="sub">Resep dari dokter yang belum diambil pasien.</div></div>
        </div>
        <div class="card-body tight" id="antreanBelum"></div>
      </div>
      ${sudah.length ? `<div class="card">
        <div class="card-head"><div><h2>Sudah diserahkan</h2>
          <div class="sub">20 terakhir.</div></div></div>
        <div class="card-body tight" id="antreanSudah"></div>
      </div>` : ''}`;

    gambarTabelAntrean(document.getElementById('antreanBelum'), belum, false);
    if (sudah.length) gambarTabelAntrean(document.getElementById('antreanSudah'), sudah, true);
  }

  function gambarTabelAntrean(wadah, data, selesai) {
    if (!data.length) {
      wadah.innerHTML = `<div class="empty compact">${UI.ikon('pil',40)}
        <h3>${selesai ? 'Belum ada penyerahan' : 'Tidak ada resep menunggu'}</h3>
        <p>${selesai ? 'Resep yang sudah diserahkan akan muncul di sini.'
                     : 'Resep yang ditulis dokter akan muncul di sini secara otomatis.'}</p></div>`;
      return;
    }
    wadah.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th class="col-w56">No.</th><th>Pasien</th><th>Obat</th>
        <th>Poli / dokter</th><th>Bayar</th><th>Status</th><th class="col-shrink"></th>
      </tr></thead><tbody>${data.map(a => `
        <tr>
          <td><div class="queue-no">${a.no_antrian ?? '-'}</div></td>
          <td><b>${UI.esc(a.nama_pasien)}</b>
            <div class="text-xs text-muted">${UI.esc(a.no_rm)} · ${UI.umurTeks(a.tanggal_lahir)}
              · ${UI.esc(a.no_resep || '')}</div></td>
          <td class="col-max-280">
            <div class="text-xs">${UI.esc(a.daftar_obat || '—')}</div>
            ${a.item_tanpa_master > 0
              ? `<div class="text-xs text-warn">
                   ${a.item_tanpa_master} butir belum tertaut master obat</div>` : ''}</td>
          <td class="text-xs">${UI.esc(a.nama_poli)}<div class="text-muted">${UI.esc(a.nama_dokter || '—')}</div></td>
          <td>${UI.badgeBayar(a.cara_bayar)}</td>
          <td>${lencanaResep(a)}</td>
          <td class="nowrap">
            ${!selesai && bolehTulis()
              ? `<button class="btn btn-primary btn-sm" data-serah="${a.resep_id}">
                   ${a.status === 'ITER_BERJALAN' ? 'Serahkan iter' : 'Serahkan'}</button>`
              : `<button class="btn btn-secondary btn-sm" data-lihat="${a.resep_id}">Lihat</button>`}
          </td>
        </tr>`).join('')}</tbody></table></div>`;

    wadah.addEventListener('click', (e) => {
      const s = e.target.closest('[data-serah]');
      if (s) { dialogSerahResep(s.dataset.serah); return; }
      const l = e.target.closest('[data-lihat]');
      if (l) { dialogSerahResep(l.dataset.lihat, true); }
    });
  }

  function lencanaResep(a) {
    if (a.status === 'DISERAHKAN') {
      return a.diserahkan_sebagian
        ? '<span class="badge b-warn">Sebagian</span>'
        : '<span class="badge b-ok">Diserahkan</span>';
    }
    if (a.status === 'ITER_BERJALAN') {
      return `<span class="badge b-info">Iter ${a.iter_terpakai || 0}/${(a.iter_maks || 0) + 1}</span>`;
    }
    return '<span class="badge b-info">Menunggu</span>';
  }

  /* ------------------------------------------------------------------
     TAB 2 — STOK SAAT INI (grup per obat, batch urutan FEFO)
     ------------------------------------------------------------------ */
  let filterKolamStok = '';

  function gambarStok(el) {
    el.innerHTML = `
      <div class="filter-bar">
        <div class="search-box filter-search">
          <span class="ico">${UI.ikon('cari',16)}</span>
          <input type="text" id="cariStok" placeholder="Cari nama obat, PBF, atau no. faktur…"
                 value="${UI.esc(cari)}">
        </div>
        <div class="field">
          <label for="fKolamStok">Kolam</label>
          <select id="fKolamStok" class="control-auto">
            <option value="">Semua kolam</option>
            ${K.KOLAM.map(k => `<option value="${k.kunci}">${UI.esc(k.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card">
        <div class="banner info mb-0"><div>
          Stok dikelompokkan per obat. Klik nama obat untuk melihat rincian batch.
          Urutan batch = urutan keluar <b>FEFO</b>: yang paling dekat kadaluwarsa keluar lebih
          dulu, tanggal masuk hanya jadi pemutus seri. <b>Kolam</b> hanya pencatatan — bukan
          sekat, batch tetap bisa saling menutupi kalau salah satu kolam kehabisan stok.</div></div>
        <div class="card-body tight" id="isiStok"></div>
      </div>`;

    const inp = el.querySelector('#cariStok');
    inp.addEventListener('input', UI.tunda(() => { cari = inp.value; gambarTabelStok(); }, 200));
    const selKolam = el.querySelector('#fKolamStok');
    selKolam.value = filterKolamStok;
    selKolam.addEventListener('change', () => { filterKolamStok = selKolam.value; gambarTabelStok(); });
    gambarTabelStok();
  }

  function gambarTabelStok() {
    const wadah = document.getElementById('isiStok');
    if (!wadah) return;
    const q = cari.trim().toLowerCase();
    const hariIni = UI.hariIni();

    let list = batch.filter(b => Number(b.stok_sisa) > 0);
    if (filterKolamStok) list = list.filter(b => (b.kolam || 'reguler') === filterKolamStok);
    if (q) list = list.filter(b =>
      (b.nama_obat || '').toLowerCase().includes(q) ||
      (b.pbf || '').toLowerCase().includes(q) ||
      (b.no_faktur || '').toLowerCase().includes(q));

    if (!list.length) {
      wadah.innerHTML = `<div class="empty compact">${UI.ikon('pil',40)}
        <h3>${q ? 'Tidak ada yang cocok' : 'Belum ada stok'}</h3>
        <p>${q ? 'Coba kata kunci lain.'
               : 'Gunakan tombol Obat masuk untuk mencatat penerimaan pertama.'}</p></div>`;
      return;
    }

    const grup = {};
    list.forEach(b => { (grup[b.obat_id] = grup[b.obat_id] || []).push(b); });

    let html = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th class="col-w30p">Obat / batch</th><th>Faktur</th><th>PBF</th>
      <th>Masuk</th><th>Kadaluwarsa</th><th class="text-right">Harga beli</th>
      <th class="text-right">Sisa</th><th class="text-right">Nilai</th>
      <th>Status</th><th class="col-shrink"></th></tr></thead><tbody>`;

    Object.keys(grup)
      .sort((a, b) => String(grup[a][0].nama_obat).localeCompare(String(grup[b][0].nama_obat)))
      .forEach(obatId => {
        const bs = K.urutFefo(grup[obatId]);
        const total = bs.reduce((s, b) => s + Number(b.stok_sisa), 0);
        const nilai = bs.reduce((s, b) => s + Number(b.stok_sisa) * Number(b.harga_beli), 0);
        const buka = grupTerbuka.has(obatId) || q.length > 0;
        const adaExp = bs.some(b => String(b.tgl_expired) <= hariIni);
        const totalKronis = bs.filter(b => b.kolam === 'kronis')
          .reduce((s, b) => s + Number(b.stok_sisa), 0);

        /* Baris grup sengaja TIDAK mengisi kolom faktur/PBF/tanggal:
           nilai-nilai itu milik batch, bukan milik obat, dan menaruh
           salah satunya di sana membuat orang membaca faktur batch
           pertama sebagai faktur seluruh stok obat tersebut. */
        const terdekat = bs[0];
        html += `<tr class="grup-row clickable row-tint summary" data-grup="${UI.esc(obatId)}">
          <td><b>${UI.esc(bs[0].nama_obat)}</b>
            <span class="text-xs text-muted">(${bs.length} batch)</span>
            <div class="text-xs text-muted">
              ${UI.esc([bs[0].bentuk_sediaan, bs[0].kekuatan].filter(Boolean).join(' · ') || '—')}
              ${bs[0].harga_jual > 0 ? ' · jual ' + rp(bs[0].harga_jual) : ''}</div></td>
          <td colspan="5" class="text-xs text-muted">
            Batch terdepan kadaluwarsa ${UI.tglPendek(terdekat.tgl_expired)}
            ${totalKronis > 0 ? ` · reguler ${total - totalKronis}, kronis ${totalKronis}` : ''}</td>
          <td class="text-right"><b>${total}</b> <small>${UI.esc(bs[0].satuan)}</small></td>
          <td class="text-right"><b>${rp(nilai)}</b></td>
          <td>${adaExp ? '<span class="badge b-danger">Ada kadaluwarsa</span>'
                : total < 10 ? '<span class="badge b-warn">Menipis</span>'
                : '<span class="badge b-ok">Aman</span>'}</td>
          <td></td></tr>`;

        bs.forEach((b, i) => {
          const exp = String(b.tgl_expired) <= hariIni;
          html += `<tr class="batch-row" data-induk="${UI.esc(obatId)}" ${buka ? '' : 'hidden'}>
            <td class="text-xs text-muted col-indent">
              Batch ${i + 1}${b.no_batch ? ' · ' + UI.esc(b.no_batch) : ''}
              ${b.kolam === 'kronis' ? '<span class="badge b-info">Kronis</span>' : ''}
              ${i === 0 && !exp ? '<span class="badge b-info">keluar duluan</span>' : ''}</td>
            <td class="text-xs">${UI.esc(b.no_faktur || '—')}</td>
            <td class="text-xs">${UI.esc(b.pbf || '—')}</td>
            <td class="mono text-xs">${UI.tglPendek(b.tgl_masuk)}</td>
            <td class="mono text-xs">${UI.tglPendek(b.tgl_expired)}</td>
            <td class="text-right">${rp(b.harga_beli)}</td>
            <td class="text-right"><b>${b.stok_sisa}</b></td>
            <td class="text-right">${rp(b.nilai_beli)}</td>
            <td>${exp ? '<span class="badge b-danger">Kadaluwarsa</span>'
                  : b.segera_kadaluwarsa ? `<span class="badge b-warn">${b.hari_ke_expired} hari lagi</span>`
                  : Number(b.stok_sisa) < 10 ? '<span class="badge b-warn">Menipis</span>'
                  : '<span class="badge b-ok">Aman</span>'}</td>
            <td class="nowrap">${bolehTulis()
              ? `<button class="btn btn-secondary btn-sm" data-edit="${b.id}">Edit</button>` : ''}</td>
          </tr>`;
        });
      });

    wadah.innerHTML = html + '</tbody></table></div>';

    wadah.querySelectorAll('.grup-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = row.dataset.grup;
        const buka = grupTerbuka.has(id);
        if (buka) grupTerbuka.delete(id); else grupTerbuka.add(id);
        wadah.querySelectorAll(`.batch-row[data-induk="${CSS.escape(id)}"]`)
          .forEach(r => { r.hidden = buka; });
      });
    });
    wadah.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => dialogEditBatch(b.dataset.edit)));
  }

  /* ------------------------------------------------------------------
     TAB 3 — RIWAYAT TRANSAKSI
     ------------------------------------------------------------------ */
  let filterRiwayat = { jenis: '', bulan: '', kolam: '' };

  function gambarRiwayat(el) {
    el.innerHTML = `
      <div class="banner info">
        <div>Riwayat ${HARI_RIWAYAT} hari terakhir. Salah input bisa dibatalkan selama
          belum lewat 7 hari; pembatalan mengembalikan stok dan membuka kembali resepnya.</div>
      </div>
      <div class="filter-bar">
        <div class="field">
          <label for="fJenis">Jenis</label>
          <select id="fJenis" class="control-auto">
            <option value="">Semua jenis</option>
            <option value="MASUK">Masuk</option>
            <option value="KELUAR">Keluar</option>
          </select>
        </div>
        <div class="field">
          <label for="fKolamRiwayat">Kolam</label>
          <select id="fKolamRiwayat" class="control-auto">
            <option value="">Semua kolam</option>
            ${K.KOLAM.map(k => `<option value="${k.kunci}">${UI.esc(k.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="fBulan">Bulan</label>
          <input type="month" id="fBulan" class="control-auto" value="${UI.esc(filterRiwayat.bulan)}">
        </div>
      </div>
      <div class="card">
        <div class="card-body tight" id="isiRiwayat"></div>
      </div>`;

    el.querySelector('#fJenis').value = filterRiwayat.jenis;
    el.querySelector('#fJenis').addEventListener('change', (e) => {
      filterRiwayat.jenis = e.target.value; gambarTabelRiwayat();
    });
    el.querySelector('#fKolamRiwayat').value = filterRiwayat.kolam;
    el.querySelector('#fKolamRiwayat').addEventListener('change', (e) => {
      filterRiwayat.kolam = e.target.value; gambarTabelRiwayat();
    });
    el.querySelector('#fBulan').addEventListener('change', (e) => {
      filterRiwayat.bulan = e.target.value; gambarTabelRiwayat();
    });
    gambarTabelRiwayat();
  }

  function gambarTabelRiwayat() {
    const wadah = document.getElementById('isiRiwayat');
    if (!wadah) return;
    let d = transaksi;
    if (filterRiwayat.jenis) d = d.filter(t => t.jenis === filterRiwayat.jenis);
    if (filterRiwayat.kolam) d = d.filter(t => (t.kolam || 'reguler') === filterRiwayat.kolam);
    if (filterRiwayat.bulan) d = d.filter(t => String(t.tanggal).slice(0, 7) === filterRiwayat.bulan);
    d = d.slice(0, 400);

    if (!d.length) {
      wadah.innerHTML = UI.kosong('Belum ada transaksi', 'Belum ada pergerakan stok pada rentang ini.');
      return;
    }

    /* Berapa baris dalam satu grup — dipakai menandai "1/3" pada input
       yang terpecah FEFO, supaya jelas kenapa satu penyerahan muncul
       sebagai beberapa baris. */
    const hitGrup = {};
    transaksi.forEach(t => { hitGrup[t.grup_id] = (hitGrup[t.grup_id] || 0) + 1; });
    const urutDalamGrup = {};

    wadah.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Obat</th><th>Kolam</th>
      <th class="text-right">Jumlah</th><th class="text-right">Nilai</th>
      <th>Keterangan</th><th class="col-shrink"></th></tr></thead><tbody>
      ${d.map(t => {
        urutDalamGrup[t.grup_id] = (urutDalamGrup[t.grup_id] || 0) + 1;
        const n = hitGrup[t.grup_id] || 1;
        const umur = hariSelisih(t.tanggal);
        const bisaBatal = !t.dibatalkan && umur <= 7 && bolehTulis();
        return `<tr${t.dibatalkan ? ' class="row-void"' : ''}>
          <td class="mono text-xs">${UI.tglPendek(t.tanggal)}</td>
          <td>${t.jenis === 'MASUK'
                ? '<span class="badge b-ok">Masuk</span>'
                : '<span class="badge b-danger">Keluar</span>'}</td>
          <td class="text-xs">${UI.esc(t.kategori)}</td>
          <td>${UI.esc(t.nama_obat)}
            ${n > 1 ? `<span class="text-xs text-muted"> (${urutDalamGrup[t.grup_id]}/${n})</span>` : ''}</td>
          <td class="text-xs">${t.kolam === 'kronis' ? '<span class="badge b-info">Kronis</span>' : 'Reguler'}</td>
          <td class="text-right">${t.jumlah} <small>${UI.esc(t.satuan)}</small></td>
          <td class="text-right">${rp(t.total_nilai)}</td>
          <td class="text-xs text-muted col-max-200">${UI.esc(t.keterangan || t.no_faktur || '—')}</td>
          <td class="nowrap">${
            t.dibatalkan ? '<span class="text-xs text-muted">dibatalkan</span>'
            : bisaBatal ? `<button class="btn btn-secondary btn-sm" data-batal="${UI.esc(t.grup_id)}">Batalkan</button>`
            : `<span class="text-xs text-muted" title="Lewat batas 7 hari">terkunci</span>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;

    wadah.querySelectorAll('[data-batal]').forEach(b =>
      b.addEventListener('click', () => dialogBatalkan(b.dataset.batal)));
  }

  function hariSelisih(tgl) {
    const a = new Date(UI.hariIni() + 'T00:00:00');
    const b = new Date(String(tgl).slice(0, 10) + 'T00:00:00');
    return Math.round((a - b) / 864e5);
  }

  /* ------------------------------------------------------------------
     TAB 4 — KARTU STOK
     ------------------------------------------------------------------ */
  function gambarKartu(el) {
    const daftar = K.daftarObat(batch, transaksi);
    if (!kartu.obatId && daftar.length) kartu.obatId = daftar[0].obat_id;

    el.innerHTML = `
      <div class="banner info">
        <div>Pengganti buku catatan: berapa masuk, berapa keluar, sisa berapa.
          Saldo ditarik mundur dari stok yang ada sekarang, jadi baris terakhir bulan
          berjalan selalu cocok dengan tab Stok saat ini.</div>
      </div>
      <div class="filter-bar">
        <div class="field"><label>Tampilan</label>
          <select id="kMode" class="control-auto">
            <option value="obat">Per obat — satu bulan</option>
            <option value="tanggal">Per tanggal — semua obat</option>
          </select></div>
        <div class="field" id="wrapObat"><label>Obat</label>
          <select id="kObat">${daftar.map(o =>
            `<option value="${UI.esc(o.obat_id)}">${UI.esc(o.nama)}</option>`).join('')}</select></div>
        <div class="field" id="wrapWaktu"></div>
      </div>
      <div class="grid grid-4 mb-16" id="kartuRingkas"></div>
      <div class="card"><div class="card-body" id="kartuTabel"></div></div>`;

    el.querySelector('#kMode').value = kartu.mode;
    el.querySelector('#kObat').value = kartu.obatId;
    el.querySelector('#kMode').addEventListener('change', (e) => {
      kartu.mode = e.target.value; gambarKartu(el);
    });
    el.querySelector('#kObat').addEventListener('change', (e) => {
      kartu.obatId = e.target.value; hitungKartu();
    });

    const w = el.querySelector('#wrapWaktu');
    if (kartu.mode === 'obat') {
      w.innerHTML = `<label>Bulan</label><input type="month" id="kBulan" value="${kartu.bulan}">`;
      w.querySelector('#kBulan').addEventListener('change', (e) => {
        kartu.bulan = e.target.value; hitungKartu();
      });
    } else {
      el.querySelector('#wrapObat').hidden = true;
      w.innerHTML = `<label>Tanggal</label><input type="date" id="kTanggal" value="${kartu.tanggal}">`;
      w.querySelector('#kTanggal').addEventListener('change', (e) => {
        kartu.tanggal = e.target.value; hitungKartu();
      });
    }
    hitungKartu();
  }

  function hitungKartu() {
    const ringkas = document.getElementById('kartuRingkas');
    const tabel = document.getElementById('kartuTabel');
    if (!tabel) return;

    if (kartu.mode === 'obat') {
      if (!kartu.obatId) { tabel.innerHTML = UI.kosong('Belum ada obat', 'Belum ada stok maupun riwayat.'); return; }
      const k = K.kartuObat({ transaksi, batch, obatId: kartu.obatId, bulan: kartu.bulan });
      ringkas.innerHTML = kotakEmpat(
        ['Saldo awal', k.saldoAwal], ['Total masuk', k.total.masukQty],
        ['Total keluar', k.total.keluarQty], ['Saldo akhir', k.saldoAkhir]);

      if (!k.baris.length) {
        tabel.innerHTML = `<div class="banner info"><div>Tidak ada pergerakan
          <b>${UI.esc(k.nama)}</b> pada ${UI.labelBulan(kartu.bulan)}.
          Saldo tetap <b>${k.saldoAkhir} ${UI.esc(k.satuan)}</b>.</div></div>`;
        return;
      }
      tabel.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
        <th>Tanggal</th><th class="text-right">Masuk</th><th class="text-right">Keluar</th>
        <th class="text-right">Resep</th><th class="text-right">Expired/rusak</th>
        <th class="text-right">Saldo</th></tr></thead><tbody>
        ${k.baris.map(b => `<tr>
          <td class="mono text-xs">${UI.tglPendek(b.tanggal)}</td>
          <td class="text-right">${b.masukQty || '—'}</td>
          <td class="text-right">${b.keluarQty || '—'}</td>
          <td class="text-right text-xs text-muted">${b.perKat['Resep Pasien'].qty || '—'}</td>
          <td class="text-right text-xs text-muted">${
            (b.perKat['Obat Expired'].qty + b.perKat['Obat Rusak'].qty) || '—'}</td>
          <td class="text-right"><b>${b.saldo}</b></td></tr>`).join('')}
        <tr class="row-tint summary">
          <td>Jumlah</td><td class="text-right">${k.total.masukQty}</td>
          <td class="text-right">${k.total.keluarQty}</td><td colspan="2"></td>
          <td class="text-right">${k.saldoAkhir}</td></tr>
        </tbody></table></div>`;
    } else {
      const r = K.rekapHarian({ transaksi, batch, tanggal: kartu.tanggal });
      ringkas.innerHTML = kotakEmpat(
        ['Obat bergerak', r.jumlahObat], ['Total masuk', r.total.masukQty],
        ['Total keluar', r.total.keluarQty], ['Nilai keluar', rp(r.total.keluarRp)]);
      if (!r.baris.length) {
        tabel.innerHTML = `<div class="banner info"><div>Tidak ada pergerakan obat pada
          ${UI.tglIndo(kartu.tanggal)}.</div></div>`;
        return;
      }
      tabel.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
        <th>Obat</th><th class="text-right">Masuk</th><th class="text-right">Keluar</th>
        <th class="text-right">Nilai keluar</th><th class="text-right">Saldo akhir hari</th>
        </tr></thead><tbody>${r.baris.map(b => `<tr>
          <td>${UI.esc(b.nama)}</td>
          <td class="text-right">${b.masukQty || '—'}</td>
          <td class="text-right">${b.keluarQty || '—'}</td>
          <td class="text-right">${rp(b.keluarRp)}</td>
          <td class="text-right"><b>${b.saldo}</b> <small>${UI.esc(b.satuan)}</small></td>
        </tr>`).join('')}</tbody></table></div>`;
    }
  }

  const kotakEmpat = (...pasang) => pasang.map(([l, v]) =>
    `<div class="stat"><div class="lbl">${UI.esc(l)}</div><div class="val">${UI.esc(v)}</div></div>`).join('');

  /* ------------------------------------------------------------------
     TAB 5 — LAPORAN BULANAN
     ------------------------------------------------------------------ */
  let filterKolamLaporan = '';

  function gambarLaporan(el) {
    const sumberLap = filterKolamLaporan
      ? transaksi.filter(t => (t.kolam || 'reguler') === filterKolamLaporan)
      : transaksi;
    const lap = K.laporanBulan(sumberLap, bulanLaporan);
    el.innerHTML = `
      <div class="filter-bar">
        <div class="field flex-1">
          <label>Laporan</label>
          <div class="text-sm"><b>${UI.labelBulan(bulanLaporan)}</b> ·
            ${lap.jumlahTransaksi} transaksi
            ${filterKolamLaporan ? ' · kolam ' + K.labelKolam(filterKolamLaporan) : ''}</div>
        </div>
        <div class="field">
          <label for="lapKolam">Kolam</label>
          <select id="lapKolam" class="control-auto">
            <option value="">Semua kolam</option>
            ${K.KOLAM.map(k => `<option value="${k.kunci}">${UI.esc(k.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="lapBulan">Bulan</label>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" id="lapPrev">‹</button>
            <input type="month" id="lapBulan" class="control-auto" value="${bulanLaporan}">
            <button class="btn btn-secondary btn-sm" id="lapNext">›</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="grid grid-3 mb-16">
            <div class="stat"><div class="lbl">Pembelian obat</div>
              <div class="val">${rp(lap.pembelianRp)}</div>
              <div class="hint">${lap.pembelianQty} satuan masuk</div></div>
            <div class="stat"><div class="lbl">Nilai obat keluar</div>
              <div class="val">${rp(lap.keluarRp)}</div>
              <div class="hint">${lap.keluarQty} satuan keluar</div></div>
            <div class="stat"><div class="lbl">Selisih</div>
              <div class="val">${rp(lap.selisihRp)}</div>
              <div class="hint">masuk − keluar</div></div>
          </div>

          ${lap.saldoAwalRp > 0 ? `<div class="banner info mb-16"><div>
            Bulan ini ada <b>${rp(lap.saldoAwalRp)}</b> stok yang dimuat sebagai
            <b>saldo awal</b> (${lap.saldoAwalQty} satuan). Nilai itu sengaja
            <b>tidak</b> dihitung sebagai pembelian — barangnya sudah ada di rak
            sebelum sistem dipakai, jadi memasukkannya ke angka belanja akan membuat
            bulan ini mustahil dibandingkan dengan bulan berikutnya.</div></div>` : ''}

          <h3 class="subhead">Obat keluar per kategori</h3>
          <div class="table-wrap mb-16"><table class="tbl"><tbody>
            ${Object.entries(lap.perKategori).filter(([, v]) => v.qty > 0).map(([k, v]) =>
              `<tr><td>${UI.esc(k)}</td>
                   <td class="text-right text-muted">${v.qty} satuan</td>
                   <td class="text-right"><b>${rp(v.rp)}</b></td></tr>`).join('')
              || '<tr><td class="text-muted">Belum ada obat keluar bulan ini.</td></tr>'}
          </tbody></table></div>

          <h3 class="subhead">Rincian per obat</h3>
          <div class="table-wrap"><table class="tbl"><thead><tr>
            <th>Obat</th><th class="text-right">Masuk</th><th class="text-right">Keluar</th>
            <th class="text-right">Resep</th><th class="text-right">Expired</th>
            <th class="text-right">Rusak</th><th class="text-right">Nilai keluar</th>
          </tr></thead><tbody>${lap.perObat.map(o => `<tr>
            <td>${UI.esc(o.nama)}</td>
            <td class="text-right">${o.masukQty || '—'}</td>
            <td class="text-right">${o.keluarQty || '—'}</td>
            <td class="text-right text-muted">${o.perKat['Resep Pasien'].qty || '—'}</td>
            <td class="text-right text-muted">${o.perKat['Obat Expired'].qty || '—'}</td>
            <td class="text-right text-muted">${o.perKat['Obat Rusak'].qty || '—'}</td>
            <td class="text-right">${rp(o.keluarRp)}</td></tr>`).join('')
            || '<tr><td colspan="7" class="text-muted">Belum ada data bulan ini.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>`;

    const pindah = (langkah) => {
      bulanLaporan = UI.geserBulan(bulanLaporan, langkah);
      gambarLaporan(el);
    };
    el.querySelector('#lapKolam').value = filterKolamLaporan;
    el.querySelector('#lapKolam').addEventListener('change', (e) => {
      filterKolamLaporan = e.target.value; gambarLaporan(el);
    });
    el.querySelector('#lapPrev').addEventListener('click', () => pindah(-1));
    el.querySelector('#lapNext').addEventListener('click', () => pindah(1));
    el.querySelector('#lapBulan').addEventListener('change', (e) => {
      bulanLaporan = e.target.value; gambarLaporan(el);
    });
  }

  /* ==================================================================
     DIALOG — OBAT MASUK
     ================================================================== */
  async function dialogObatMasuk() {
    let obatDipilih = null;

    await UI.modal({
      judul: 'Catat obat masuk',
      lebar: true,
      isi: `
        <div class="banner info mb-16"><div>Setiap penerimaan dicatat sebagai
          <b>batch</b> tersendiri, dibedakan dari tanggal kadaluwarsa, nomor faktur,
          PBF, dan harga beli. Penerimaan dengan gabungan yang persis sama akan
          <b>menambah stok batch yang ada</b>, bukan membuat baris baru.</div></div>

        <div class="field"><label>Obat *</label><div id="cariObat"></div>
          <div class="hint">Belum ada di Master Data? Ketik nama lengkapnya, lalu pilih
            "Tambah baru" yang muncul di bawah kotak pencarian.</div>
          <div id="obatTerpilih" class="chip-list"></div></div>

        <div class="form-row c2">
          <div class="field"><label>Jumlah masuk *</label>
            <input type="number" name="jumlah" min="1" step="any" required></div>
          <div class="field"><label>Harga beli per satuan (Rp) *</label>
            <input type="number" name="harga_beli" min="0" step="any" required></div>
        </div>
        <div class="form-row c2">
          <div class="field"><label>Tanggal kadaluwarsa *</label>
            <input type="date" name="tgl_expired" required></div>
          <div class="field"><label>Tanggal masuk *</label>
            <input type="date" name="tgl_masuk" value="${UI.hariIni()}" required></div>
        </div>
        <div class="form-row c3">
          <div class="field"><label>No. faktur</label><input type="text" name="no_faktur"></div>
          <div class="field"><label>PBF / distributor *</label><input type="text" name="pbf" required></div>
          <div class="field"><label>No. batch pabrik</label><input type="text" name="no_batch"></div>
        </div>
        <div class="field"><label>Kolam pencatatan</label>
          <select name="kolam">${K.KOLAM.map(k =>
            `<option value="${k.kunci}"${k.kunci === 'reguler' ? ' selected' : ''}>${UI.esc(k.label)}</option>`).join('')}</select>
          <div class="hint">Bukan sekat — hanya menentukan kolam mana yang dilaporkan terpisah
            dan diutamakan FEFO saat obat ini dikeluarkan. Bisa dikoreksi lewat Edit Batch.</div></div>
        <div class="field"><label>Keterangan</label><input type="text" name="keterangan"></div>
        <div class="banner ok" id="pratinjauMasuk"><div>Total nilai: <b>Rp 0</b></div></div>`,
      siap: (badan) => {
        const pilihObat = (o) => {
          obatDipilih = o;
          badan.querySelector('#obatTerpilih').innerHTML =
            `<span class="chip">${UI.esc(o.nama)} <span class="text-xs">(${UI.esc(o.satuan)})</span></span>`;
        };

        Komponen.comboCari({
          wadah: badan.querySelector('#cariObat'),
          placeholder: 'Ketik nama obat…',
          cariFn: (k) => DB.cariObat(k, 25),
          formatFn: (o) => `<b>${UI.esc(o.nama)}</b>
            <span class="text-xs text-muted">${UI.esc(o.satuan)}${o.kekuatan ? ' · ' + UI.esc(o.kekuatan) : ''}</span>`,
          onPilih: pilihObat,
          /* 11 Sep 2026: dulu obat baru harus dibuat lebih dulu di halaman
             Master Data (langkah terpisah), baru dicari lagi di sini. Sekarang
             kata yang diketik tapi belum cocok apa pun menawarkan "Tambah baru",
             yang membuka form Tambah Obat yang SAMA dengan di Master Data
             (Master.modalObat — satu logika simpan, bukan disalin ke sini) dengan
             nama sudah terisi. Obat yang baru dibuat langsung terpilih. */
          bolehBuatBaru: true,
          teksBuatBaru: (kata) => `Tambah obat baru: "${kata}"`,
          onBuatBaru: async (kata) => {
            const dibuat = await Master.modalObat({ nama: kata });
            if (dibuat) pilihObat(dibuat);
          }
        });
        const hitung = () => {
          const f = UI.nilaiForm(badan);
          const t = (Number(f.jumlah) || 0) * (Number(f.harga_beli) || 0);
          badan.querySelector('#pratinjauMasuk').innerHTML =
            `<div>Total nilai: <b>${rp(t)}</b></div>`;
        };
        badan.querySelector('[name=jumlah]').addEventListener('input', hitung);
        badan.querySelector('[name=harga_beli]').addEventListener('input', hitung);
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            if (!obatDipilih) { UI.toast('Pilih obat lebih dulu.', 'err'); return false; }
            if (!f.jumlah || Number(f.jumlah) <= 0) { UI.toast('Jumlah harus lebih dari nol.', 'err'); return false; }
            if (!f.tgl_expired) { UI.toast('Tanggal kadaluwarsa wajib diisi.', 'err'); return false; }
            if (!f.pbf) { UI.toast('PBF wajib diisi.', 'err'); return false; }

            /* Konfirmasi menyorot dua hal yang paling sering luput saat
               input cepat: tanggal kadaluwarsa yang sudah lewat, dan batch
               yang akan MENYATU dengan batch lama alih-alih jadi batch baru. */
            if (!await konfirmasiMasuk(obatDipilih, f)) return false;

            await DB.apotekMasuk({ ...f, obat_id: obatDipilih.id, jumlah: Number(f.jumlah),
                                   harga_beli: Number(f.harga_beli) || 0,
                                   kolam: f.kolam || 'reguler' });
            UI.toast('Obat masuk tercatat.');
            await segarkan();
          } }
      ]
    });
  }

  async function konfirmasiMasuk(obat, f) {
    const hariKeExp = Math.round(
      (new Date(f.tgl_expired + 'T00:00:00') - new Date(UI.hariIni() + 'T00:00:00')) / 864e5);
    const gabung = batch.find(b =>
      b.obat_id === obat.id &&
      String(b.tgl_expired) === f.tgl_expired &&
      String(b.no_faktur || '') === String(f.no_faktur || '') &&
      String(b.pbf || '').toLowerCase() === String(f.pbf || '').toLowerCase() &&
      Number(b.harga_beli) === Number(f.harga_beli) &&
      (b.kolam || 'reguler') === (f.kolam || 'reguler'));

    let peringatan = '';
    if (hariKeExp <= 0) {
      peringatan = `<div class="banner err"><div><b>Tanggal kadaluwarsa sudah lewat.</b>
        Obat ini tidak akan bisa dikeluarkan untuk pasien — hanya lewat kategori pemusnahan.</div></div>`;
    } else if (hariKeExp <= 90) {
      peringatan = `<div class="banner warn"><div>Kadaluwarsa tinggal
        <b>${hariKeExp} hari</b> lagi. Dengan urutan FEFO, batch ini akan keluar
        lebih dulu daripada stok yang sudah ada.</div></div>`;
    }
    if (gabung) {
      peringatan += `<div class="banner info"><div>Sudah ada batch dengan kadaluwarsa,
        faktur, PBF, dan harga yang persis sama (sisa ${gabung.stok_sisa}).
        Stoknya akan <b>ditambah menjadi ${Number(gabung.stok_sisa) + Number(f.jumlah)}</b>,
        bukan dibuat batch baru.</div></div>`;
    }

    return await UI.modal({
      judul: 'Periksa dulu sebelum disimpan',
      isi: `${peringatan}
        <div class="table-wrap"><table class="tbl"><tbody>
          <tr><td class="text-muted">Obat</td><td><b>${UI.esc(obat.nama)}</b></td></tr>
          <tr><td class="text-muted">Jumlah</td><td><b>${f.jumlah}</b> ${UI.esc(obat.satuan)}</td></tr>
          <tr><td class="text-muted">Harga beli</td><td>${rp(f.harga_beli)} / ${UI.esc(obat.satuan)}</td></tr>
          <tr><td class="text-muted">Total nilai</td>
              <td><b>${rp(Number(f.jumlah) * Number(f.harga_beli || 0))}</b></td></tr>
          <tr><td class="text-muted">Kadaluwarsa</td><td>${UI.tglIndo(f.tgl_expired)}</td></tr>
          <tr><td class="text-muted">Faktur / PBF</td>
              <td>${UI.esc(f.no_faktur || '—')} · ${UI.esc(f.pbf)}</td></tr>
          <tr><td class="text-muted">Kolam</td><td>${UI.esc(K.labelKolam(f.kolam || 'reguler'))}</td></tr>
        </tbody></table></div>`,
      tombol: [
        { teks: 'Periksa lagi', nilai: false },
        { teks: 'Ya, simpan', nilai: true, kelas: 'btn-primary' }
      ]
    }) === true;
  }

  /* ==================================================================
     DIALOG — OBAT KELUAR (non-resep)
     ================================================================== */
  async function dialogObatKeluar() {
    let obatDipilih = null;
    let batchObat = [];

    await UI.modal({
      judul: 'Catat obat keluar',
      lebar: true,
      isi: `
        <div class="banner warn mb-16"><div>Pengeluaran untuk pasien lewat resep
          sebaiknya dilakukan dari tab <b>Antrean resep</b> supaya tertaut ke
          kunjungan dan otomatis masuk tagihan kasir. Layar ini untuk penjualan
          bebas, pemusnahan, dan penyesuaian stok.</div></div>

        <div class="field"><label>Kategori *</label>
          <select name="kategori">${K.KATEGORI_KELUAR.filter(k => k !== 'Resep Pasien')
            .map(k => `<option value="${UI.esc(k)}">${UI.esc(k)}</option>`).join('')}</select>
          <div class="hint" id="hintKategori"></div></div>

        <div class="field"><label>Obat *</label><div id="cariObat"></div>
          <div id="obatTerpilih" class="chip-list"></div></div>

        <div class="form-row c2">
          <div class="field"><label>Jumlah keluar *</label>
            <input type="number" name="jumlah" min="1" step="any" required></div>
          <div class="field"><label>Tanggal *</label>
            <input type="date" name="tanggal" value="${UI.hariIni()}" required></div>
        </div>

        <div class="field"><label>Utamakan kolam</label>
          <select name="kolam">
            <option value="">Tidak masalah (FEFO biasa)</option>
            ${K.KOLAM.map(k => `<option value="${k.kunci}">Utamakan ${UI.esc(k.label)}</option>`).join('')}
          </select>
          <div class="hint">Hanya urutan pengambilan — kalau kolam yang diutamakan kosong,
            tetap diambil dari kolam lain.</div></div>

        <div class="field"><label>Ambil dari batch</label>
          <select name="batch_id"><option value="">Otomatis (FEFO — kadaluwarsa terdekat dulu)</option></select>
          <div class="hint">Pilih batch tertentu hanya bila memang batch itu yang
            dikeluarkan, misalnya saat memusnahkan obat kadaluwarsa.</div></div>

        <div class="field"><label>Keterangan</label>
          <input type="text" name="keterangan" placeholder="Nama pembeli, nomor berita acara, alasan…"></div>

        <div id="pratinjauKeluar"></div>`,
      siap: (badan) => {
        const selBatch = badan.querySelector('[name=batch_id]');
        const selKat = badan.querySelector('[name=kategori]');
        const selKolam = badan.querySelector('[name=kolam]');
        const hintKat = badan.querySelector('#hintKategori');

        const perbaruiHintKat = () => {
          hintKat.textContent = K.KATEGORI_PEMUSNAHAN.includes(selKat.value)
            ? 'Kategori pemusnahan — batch kadaluwarsa boleh dikeluarkan.'
            : 'Batch yang sudah kadaluwarsa tidak akan ikut dihitung.';
        };

        const gambarBatch = () => {
          const boleh = K.batchBolehKeluar(batchObat, selKat.value);
          selBatch.innerHTML = '<option value="">Otomatis (FEFO — kadaluwarsa terdekat dulu)</option>'
            + K.urutFefo(boleh, selKolam.value || null).map(b =>
                `<option value="${UI.esc(b.id)}">[${UI.esc(K.labelKolam(b.kolam))}]
                 Exp ${UI.tglPendek(b.tgl_expired)} · ${UI.esc(b.pbf || '—')}
                 · sisa ${b.stok_sisa} · ${rp(b.harga_beli)}</option>`).join('');
          pratinjau();
        };

        const pratinjau = () => {
          const kotak = badan.querySelector('#pratinjauKeluar');
          const f = UI.nilaiForm(badan);
          const jml = Number(f.jumlah) || 0;
          if (!obatDipilih || jml <= 0) { kotak.innerHTML = ''; return; }

          let kandidat = K.batchBolehKeluar(batchObat, f.kategori);
          if (f.batch_id) kandidat = kandidat.filter(b => b.id === f.batch_id);
          const sim = K.simulasiFefo(kandidat, jml, f.kolam || null);
          const terkunci = batchObat.reduce((s, b) => s + Number(b.stok_sisa), 0)
                         - kandidat.reduce((s, b) => s + Number(b.stok_sisa), 0);

          kotak.innerHTML = sim.kurang > 0
            ? `<div class="banner err"><div><b>Stok tidak cukup — kurang ${sim.kurang}
                ${UI.esc(obatDipilih.satuan)}.</b>${terkunci > 0
                  ? ` Ada ${terkunci} lagi di batch kadaluwarsa yang tidak boleh dikeluarkan
                      lewat kategori ini.` : ''}</div></div>`
            : `<div class="banner ok"><div>Akan dipotong dari
                <b>${sim.potongan.length} batch</b>, nilai beli
                <b>${rp(sim.totalNilai)}</b><br>
                <span class="text-xs">${sim.potongan.map(p =>
                  `${p.ambil} dari batch exp ${UI.tglPendek(p.batch.tgl_expired)}`).join(' + ')}</span>
                </div></div>`;
        };

        Komponen.comboCari({
          wadah: badan.querySelector('#cariObat'),
          placeholder: 'Ketik nama obat…',
          cariFn: async (k) => (await DB.apotekStok({ hanyaAda: true }))
            .filter(o => !k || String(o.nama_obat).toLowerCase().includes(k.toLowerCase()))
            .slice(0, 25),
          formatFn: (o) => `<b>${UI.esc(o.nama_obat)}</b>
            <span class="text-xs text-muted">sisa ${o.stok_total} ${UI.esc(o.satuan)}</span>`,
          onPilih: async (o) => {
            obatDipilih = { id: o.obat_id, nama: o.nama_obat, satuan: o.satuan };
            badan.querySelector('#obatTerpilih').innerHTML =
              `<span class="chip">${UI.esc(o.nama_obat)} <span class="text-xs">sisa ${o.stok_total}</span></span>`;
            batchObat = await DB.batchObat(o.obat_id);
            gambarBatch();
          }
        });

        selKat.addEventListener('change', () => { perbaruiHintKat(); gambarBatch(); });
        selKolam.addEventListener('change', gambarBatch);
        selBatch.addEventListener('change', pratinjau);
        badan.querySelector('[name=jumlah]').addEventListener('input', pratinjau);
        perbaruiHintKat();
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Keluarkan', kelas: 'btn-danger', aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            if (!obatDipilih) { UI.toast('Pilih obat lebih dulu.', 'err'); return false; }
            if (!f.jumlah || Number(f.jumlah) <= 0) { UI.toast('Jumlah harus lebih dari nol.', 'err'); return false; }
            await DB.apotekKeluar({ ...f, obat_id: obatDipilih.id, jumlah: Number(f.jumlah),
                                    kolam: f.kolam || null });
            UI.toast('Obat keluar tercatat.');
            await segarkan();
          } }
      ]
    });
  }

  /* ==================================================================
     DIALOG — PENYERAHAN RESEP
     ================================================================== */
  async function dialogSerahResep(resepId, hanyaLihat = false) {
    let r;
    try { r = await DB.resepUntukFarmasi(resepId); }
    catch (e) { UI.toast('Gagal memuat resep: ' + e.message, 'err'); return; }

    const k = r.kunjungan || {};
    const p = k.pasien || {};
    const sudah = r.status === 'DISERAHKAN';
    const bacaSaja = hanyaLihat || sudah || !bolehTulis();

    /* iter (resep boleh diulang): iter_maks = jumlah pengulangan SELAIN
       penyerahan pertama, jadi total jatah penyerahan = iter_maks + 1.
       Lihat sql/23_salinan_resep.sql untuk aturan penguncian di database —
       tampilan di sini hanya mengikuti status yang sudah dihitung sana. */
    const iterMaks = r.iter_maks || 0;
    const iterTerpakai = r.iter_terpakai || 0;
    const totalJatah = iterMaks + 1;
    const iterBerjalan = r.status === 'ITER_BERJALAN';
    const riwayat = r.penyerahan || [];

    const judulIter = iterMaks > 0 ? ` — iter ${iterTerpakai}/${totalJatah} terpakai` : '';

    const baganRiwayat = riwayat.length ? `
      <div class="field mt-14 mb-0">
        <label>Riwayat penyerahan</label>
        <div class="table-wrap"><table class="tbl text-xs"><thead><tr>
          <th>Ke-</th><th>Tanggal</th><th>Apoteker</th><th>Status</th><th class="col-shrink"></th>
        </tr></thead><tbody>${riwayat.map(pn => `
          <tr>
            <td>${pn.ke_berapa}</td>
            <td>${UI.tglIndo(pn.tanggal)}</td>
            <td>${UI.esc(pn.apoteker?.nama || '—')}</td>
            <td>${pn.lengkap ? '<span class="badge b-ok">Lengkap</span>'
                             : '<span class="badge b-warn">Sebagian</span>'}</td>
            <td><button type="button" class="btn btn-ghost btn-sm no-print"
                  data-cetak-salinan="${pn.id}">${UI.ikon('cetak',14)} Salinan</button></td>
          </tr>`).join('')}</tbody></table></div>
      </div>` : '';

    const baris = (r.item || []).map((it, i) => {
      const s = it.stok || {};
      const layak = Number(s.stok_layak || 0);
      const kurang = layak < Number(it.jumlah);
      const nilaiAwal = sudah ? (it.jumlah_diserahkan ?? 0)
                              : Math.min(Number(it.jumlah), layak);
      return `<tr>
        <td>
          <b>${UI.esc(it.nama_obat)}</b>
          <div class="text-xs text-muted">${UI.esc(it.signa || '')}${it.rute ? ' · ' + UI.esc(it.rute) : ''}</div>
          ${!it.obat_id ? `<div class="text-xs text-danger">
            Belum tertaut master obat — stok tidak bisa dipotong.</div>` : ''}
        </td>
        <td class="text-right">${it.jumlah} <small>${UI.esc(it.satuan || '')}</small></td>
        <td class="text-right ${kurang ? 'text-danger fw-700' : 'text-muted'}">
          ${it.obat_id ? layak : '—'}</td>
        <td class="col-w120">
          <input type="number" data-item="${UI.esc(it.id)}" min="0" step="any"
                 max="${it.obat_id ? layak : 0}" value="${nilaiAwal}"
                 ${bacaSaja || !it.obat_id ? 'disabled' : ''}></td>
      </tr>`;
    }).join('');

    const adaKurang = (r.item || []).some(it =>
      it.obat_id && Number((it.stok || {}).stok_layak || 0) < Number(it.jumlah));

    // Peringatan kronis (Tahap 2) — H-3 (terlalu cepat) dan kuota statin.
    // Keduanya PERINGATAN, bukan penolakan (keputusan 4 Sep 2026): apoteker
    // sudah berhadapan dengan pasiennya, sistem hanya mengingatkan.
    // Diam-diam dilewati kalau gagal dimuat (mis. RLS/izin) — modul ini
    // tidak boleh menghalangi penyerahan resep yang sebenarnya normal.
    let banerKronis = '';
    if (!sudah && p.id) {
      try {
        const kronis = await DB.kronisPasien(p.id);
        if (kronis) {
          const idObatKronis = new Set((kronis.obat || []).map(o => o.obat_id).filter(Boolean));
          const punyaObatKronis = (r.item || []).some(it => idObatKronis.has(it.obat_id));
          if (punyaObatKronis) {
            const h3 = await DB.kronisH3Cek(p.id);
            const pesanH3 = KronisPantauCore.pesanH3(h3);
            if (pesanH3) banerKronis += `<div class="banner warn mb-16">${UI.ikon('peringatan')}
              <div><b>Pengambilan lebih cepat dari jadwal.</b> ${UI.esc(pesanH3)}</div></div>`;
          }
          const punyaStatin = kronis.statin_kunci && kronis.statin_obat_id
            && (r.item || []).some(it => it.obat_id === kronis.statin_obat_id);
          if (punyaStatin) {
            const statin = await DB.kronisStatinPasien(p.id);
            const info = statin && KronisPantauCore.statinInfo(statin);
            if (info && (info.peringatan || info.mendekati)) {
              banerKronis += `<div class="banner ${info.peringatan ? 'err' : 'warn'} mb-16">
                ${UI.ikon('peringatan')}<div><b>Kuota ${UI.esc(statin.statin_nama || statin.statin_kunci)}
                  BPJS: ${UI.esc(KronisPantauCore.labelStatin(statin))}.</b> Tetap boleh diserahkan
                  bila memang perlu secara klinis.</div></div>`;
            }
          }
        }
      } catch (e) { /* diam-diam dilewati — lihat catatan di atas */ }
    }

    await UI.modal({
      judul: sudah ? `Resep ${r.no_resep || ''} — sudah diserahkan`
           : iterBerjalan ? `Serahkan resep ${r.no_resep || ''}${judulIter} — lanjutan iter`
                          : `Serahkan resep ${r.no_resep || ''}${judulIter}`,
      lebar: true,
      isi: `
        <div class="patient-bar mb-14">
          <div class="pb-avatar">${UI.inisial(p.nama)}</div>
          <div class="pb-main"><b>${UI.esc(p.nama || '—')}</b>
            <span>No. RM ${UI.esc(p.no_rm || '—')} · ${UI.umurTeks(p.tanggal_lahir)}
              · ${UI.esc(k.poli?.nama || '')} · ${UI.esc(k.cara_bayar || '')}</span></div>
        </div>

        ${banerKronis}
        ${sudah ? `<div class="banner ok mb-16"><div>Diserahkan
            ${UI.tglIndo(r.diserahkan_pada)} ${UI.jam(r.diserahkan_pada)}.
            ${r.diserahkan_sebagian ? '<b>Sebagian butir tidak diserahkan.</b>' : ''}
            ${iterMaks > 0 ? ' Jatah iter sudah habis (' + totalJatah + '/' + totalJatah + ').' : ''}</div></div>`
          : iterBerjalan ? `<div class="banner info mb-16"><div>Resep iter — sudah diserahkan
              <b>${iterTerpakai}</b> dari <b>${totalJatah}</b> jatah. Ini akan dicatat sebagai
              penyerahan ke-${iterTerpakai + 1}, dan Salinan Resep baru akan tercetak untuk
              pasien setelah disimpan.</div></div>`
          : adaKurang ? `<div class="banner warn mb-16"><div>Ada butir yang stoknya
              <b>kurang dari jumlah resep</b>. Isi jumlah yang benar-benar diserahkan —
              itulah yang dicatat keluar dan yang ditagihkan ke pasien, bukan angka resepnya.
              ${iterMaks > 0 ? ' Karena resep ini iter, pasien bisa kembali lagi memakai '
                + 'jatah iter untuk kekurangannya.' : ''}</div></div>`
          : `<div class="banner info mb-16"><div>Isi kolom terakhir dengan jumlah yang
              <b>benar-benar diserahkan</b>. Stok dipotong urutan FEFO, tertaut ke kunjungan
              pasien ini, dan langsung muncul di tagihan kasir.</div></div>`}

        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>Obat</th><th class="text-right">Resep</th>
          <th class="text-right">Stok layak</th><th>Diserahkan</th>
        </tr></thead><tbody>${baris || '<tr><td colspan="4">Resep tanpa butir obat.</td></tr>'}</tbody></table></div>

        ${r.catatan ? `<div class="field mt-14">
          <label>Catatan dokter</label><div class="text-xs">${UI.esc(r.catatan)}</div></div>` : ''}
        ${bacaSaja ? '' : `<div class="field mt-14">
          <label>Catatan apoteker</label><input type="text" name="catatan"></div>`}
        ${baganRiwayat}`,
      siap: (badan) => {
        badan.addEventListener('click', (e) => {
          const c = e.target.closest('[data-cetak-salinan]');
          if (c) cetakSalinanResep(r, c.dataset.cetakSalinan);
        });
      },
      tombol: bacaSaja
        ? [{ teks: 'Tutup', nilai: null }]
        : [{ teks: 'Batal', nilai: null },
           { teks: iterBerjalan ? 'Serahkan iter & potong stok' : 'Serahkan & potong stok',
             kelas: 'btn-primary', aksi: async (badan) => {
              const item = [...badan.querySelectorAll('[data-item]')]
                .map(i => ({ resep_item_id: i.dataset.item, jumlah: Number(i.value) || 0 }))
                .filter(i => i.jumlah > 0);
              if (!item.length) { UI.toast('Belum ada butir yang diisi.', 'err'); return false; }

              const semua = (r.item || []).filter(i => i.obat_id).length;
              if (item.length < semua) {
                const ok = await UI.konfirmasi('Serahkan sebagian?',
                  `${item.length} dari ${semua} butir akan diserahkan. Resep akan ditandai `
                  + 'diserahkan sebagian, dan hanya butir ini yang masuk tagihan kasir.',
                  'Ya, serahkan');
                if (!ok) return false;
              }

              const catatan = badan.querySelector('[name=catatan]')?.value || null;
              let hasil;
              try {
                hasil = await DB.apotekSerahkanResep(resepId, item, UI.hariIni(), catatan);
              } catch (e) { UI.toast(e.message || 'Gagal menyerahkan resep.', 'err', 6000); return false; }
              UI.toast(iterMaks > 0 && hasil?.iter_sisa > 0
                ? `Obat diserahkan, stok terpotong. Sisa jatah iter: ${hasil.iter_sisa}.`
                : 'Obat diserahkan, stok terpotong.');
              await segarkan();

              // Cetak Salinan Resep dari data terbaru (termasuk penyerahan yang
              // baru saja tercatat) — legal sebagai bukti obat yang benar-benar
              // diserahkan, bukan sekadar apa yang ditulis dokter.
              if (hasil?.penyerahan_id) {
                try {
                  const r2 = await DB.resepUntukFarmasi(resepId);
                  cetakSalinanResep(r2, hasil.penyerahan_id);
                } catch (e) { /* pencetakan gagal tidak boleh mengulang penyerahan */ }
              }
            } }]
    });
  }

  /* ==================================================================
     CETAK SALINAN RESEP (apograph) — Permenkes 73/2016: tiap kali obat
     diserahkan (termasuk tiap iterasi resep iter), pasien berhak atas
     dokumen ini. Menandai per butir: det (diserahkan penuh), det
     sebagian (kurang dari resep), atau nedet (tidak diserahkan sama
     sekali — habis/kadaluarsa/dll), plus tanda p.c.c. dan identitas
     apoteker (APA) yang menyerahkan.
     ================================================================== */
  async function cetakSalinanResep(r, penyerahanId) {
    const pn = (r.penyerahan || []).find(x => x.id === penyerahanId);
    if (!pn) { UI.toast('Data penyerahan tidak ditemukan.', 'err'); return; }

    const [f, rs] = await Promise.all([
      DB.faskes().catch(() => ({ nama: CONFIG.NAMA_KLINIK })),
      DB.resepPengaturan().catch(() => ({}))
    ]);
    const k = r.kunjungan || {};
    const p = k.pasien || {};
    const dokter = k.dokter?.nama || '';
    const sipDokter = k.dokter?.no_sip || '';
    const apoteker = pn.apoteker || {};

    const alamatFaskes = [f.alamat, f.kelurahan, f.kecamatan, f.kabupaten]
      .filter(Boolean).join(', ');
    const logoHtml = rs.logo_data_uri
      ? `<img src="${rs.logo_data_uri}" alt="" style="flex-shrink:0;max-width:44px;max-height:44px">`
      : `<span style="flex-shrink:0">${KopKlinik.LOGO_RESEP_BAWAAN}</span>`;

    // Salinan Resep wajib memuat SETIAP butir resep asli, bukan hanya yang
    // disebut di p_item saat menyerahkan — butir yang samasekali tidak
    // dimasukkan apoteker (habis/kadaluarsa, dilewati begitu saja) tetap
    // harus tercatat "nedet", bukan hilang begitu saja dari salinannya.
    const olehItemId = new Map((pn.item || []).map(pi => [pi.resep_item_id, pi]));
    const barisObat = (r.item || []).map(it => {
      const pi = olehItemId.get(it.id);
      const diminta = Number((pi ? pi.jumlah_diminta : it.jumlah) || 0);
      const diserahkan = Number((pi && pi.jumlah_diserahkan) || 0);
      const tanda = !pi || diserahkan <= 0 ? 'nedet'
        : diserahkan < diminta ? `det ${diserahkan} dari ${diminta} ${UI.esc(it.satuan || '')}`
        : 'det';
      return `<div class="obat">
        <div class="nm">${UI.esc(it.nama_obat || '—')} &nbsp; No. ${UI.esc(String(diminta))}
          &nbsp; <i>(${tanda})</i></div>
        <div class="sg">S. ${UI.esc(it.signa || '')}</div>
      </div>`;
    }).join('');

    const iterMaks = r.iter_maks || 0;
    const totalJatah = iterMaks + 1;
    const ketIter = iterMaks > 0
      ? `<div class="baris"><span>iter ${iterMaks}× — penyerahan ke-${pn.ke_berapa} dari ${totalJatah}</span></div>`
      : '';

    const w = window.open('', '_blank', 'width=760,height=900');
    w.document.write(`<html><head><title>Salinan Resep — ${UI.esc(p.nama || '')}</title><style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:9mm;font-size:9.7pt;color:#000}
      .lembar{border:1.6px solid #000}
      .kop{display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:2.2px solid #000}
      .kop .teks{flex:1;text-align:center}
      .kop .teks h1{margin:0;font-size:12.5pt;letter-spacing:.4px}
      .kop .teks p{margin:1px 0;font-size:8pt}
      .judul{text-align:center;font-weight:bold;font-size:11pt;letter-spacing:2.5px;
        padding:4px;border-bottom:1.4px solid #000;position:relative}
      .pcc{position:absolute;right:10px;top:4px;font-style:italic;font-weight:normal;
        font-size:9.5pt;letter-spacing:normal;border:1.2px solid #000;padding:1px 6px;border-radius:3px}
      .identitas{padding:7px 10px;border-bottom:1.4px solid #000}
      .baris{display:flex;gap:14px;margin-bottom:4px}
      .baris > span{flex:1}
      .badan{padding:10px 14px}
      .rx{font-size:20pt;font-weight:bold;font-family:Georgia,'Times New Roman',serif;margin:0 0 6px}
      .obat{margin:0 0 10px 20px}
      .obat .nm{font-size:10pt;font-weight:600}
      .obat .nm i{font-weight:normal;font-size:8.5pt}
      .obat .sg{margin-left:16px;font-style:italic;font-size:9pt}
      .apa{padding:10px 14px 16px;text-align:right}
      .apa .garis{margin:34px 0 3px;border-top:1px solid #000;width:220px;margin-left:auto}
      .apa .nm{font-weight:600}
      @media print{@page{size:${rs.ukuran_kertas === 'A6' ? 'A6' : 'A5'} portrait;margin:8mm}}
    </style></head><body><div class="lembar">
      <div class="kop">
        ${logoHtml}
        <div class="teks">
          <h1>${UI.esc(f.nama || '')}</h1>
          <p>${UI.esc(alamatFaskes)}</p>
          <p>${f.telepon ? 'Telp. ' + UI.esc(f.telepon) : ''}</p>
          ${f.no_sia ? `<p>No. SIA: ${UI.esc(f.no_sia)}</p>` : ''}
        </div>
      </div>
      <div class="judul">SALINAN RESEP<span class="pcc">p.c.c.</span></div>

      <div class="identitas">
        <div class="baris"><span>No. Resep : ${UI.esc(r.no_resep || '—')}</span>
          <span>Tgl. resep : ${UI.tglIndo(k.tanggal)}</span></div>
        <div class="baris"><span>Nama dokter : ${UI.esc(dokter)}</span>
          <span>SIP : ${UI.esc(sipDokter)}</span></div>
        <div class="baris"><span>Nama pasien : ${UI.esc(p.nama || '')}</span>
          <span>Usia : ${UI.umurTeks(p.tanggal_lahir)}</span></div>
        <div class="baris"><span>Tgl. penyerahan ini : ${UI.tglIndo(pn.tanggal)}</span></div>
        ${ketIter}
      </div>

      <div class="badan">
        <div class="rx">R/</div>
        ${barisObat}
      </div>

      <div class="apa">
        <div>${UI.esc([f.kelurahan, f.kabupaten].filter(Boolean).join(', '))}, ${UI.tglIndo(pn.tanggal)}</div>
        <div>Pengelola Apotek,</div>
        <div class="garis"></div>
        <div class="nm">${UI.esc(apoteker.nama || '—')}</div>
        <div>SIPA : ${UI.esc(apoteker.no_sip || '—')}</div>
      </div>
    </div></body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { w.print(); }, 400);
  }

  /* ==================================================================
     DIALOG — EDIT BATCH & PEMBATALAN
     ================================================================== */
  async function dialogEditBatch(id) {
    const b = batch.find(x => x.id === id);
    if (!b) { UI.toast('Batch tidak ditemukan.', 'err'); return; }

    await UI.modal({
      judul: 'Koreksi identitas batch',
      isi: `
        <div class="banner warn mb-16"><div>Layar ini hanya memperbaiki
          <b>keterangan</b> batch: faktur salah ketik, nama PBF tertukar, tanggal
          kadaluwarsa salah baca. Jumlah stok <b>tidak bisa</b> diubah dari sini —
          stok hanya berubah lewat transaksi masuk, keluar, atau pembatalan, supaya
          setiap perubahan punya jejak.</div></div>
        <div class="field"><label>Obat</label>
          <input type="text" value="${UI.esc(b.nama_obat)}" disabled></div>
        <div class="form-row c2">
          <div class="field"><label>Sisa stok</label>
            <input type="text" value="${b.stok_sisa} ${UI.esc(b.satuan)}" disabled></div>
          <div class="field"><label>Harga beli (Rp)</label>
            <input type="number" name="harga_beli" step="any" min="0" value="${b.harga_beli}"></div>
        </div>
        <div class="form-row c2">
          <div class="field"><label>Tanggal kadaluwarsa</label>
            <input type="date" name="tgl_expired" value="${UI.esc(b.tgl_expired)}"></div>
          <div class="field"><label>Tanggal masuk</label>
            <input type="date" name="tgl_masuk" value="${UI.esc(b.tgl_masuk)}"></div>
        </div>
        <div class="form-row c3">
          <div class="field"><label>No. faktur</label>
            <input type="text" name="no_faktur" value="${UI.esc(b.no_faktur || '')}"></div>
          <div class="field"><label>PBF</label>
            <input type="text" name="pbf" value="${UI.esc(b.pbf || '')}"></div>
          <div class="field"><label>No. batch pabrik</label>
            <input type="text" name="no_batch" value="${UI.esc(b.no_batch || '')}"></div>
        </div>
        <div class="field"><label>Kolam pencatatan</label>
          <select name="kolam">${K.KOLAM.map(k =>
            `<option value="${k.kunci}"${(b.kolam || 'reguler') === k.kunci ? ' selected' : ''}>
              ${UI.esc(k.label)}</option>`).join('')}</select>
          <div class="hint">Memindahkan batch ini ke kolam lain untuk pencatatan berikutnya.
            Transaksi yang sudah tercatat sebelumnya tidak ikut berubah.</div></div>
        <div class="field"><label>Keterangan</label>
          <input type="text" name="keterangan" value="${UI.esc(b.keterangan || '')}"></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            await DB.simpanBatch(id, {
              harga_beli: Number(f.harga_beli) || 0,
              tgl_expired: f.tgl_expired, tgl_masuk: f.tgl_masuk,
              no_faktur: f.no_faktur, pbf: f.pbf, no_batch: f.no_batch,
              kolam: f.kolam || 'reguler',
              keterangan: f.keterangan
            });
            UI.toast('Batch diperbarui.');
            await segarkan();
          } }
      ]
    });
  }

  async function dialogBatalkan(grupId) {
    const baris = transaksi.filter(t => t.grup_id === grupId && !t.dibatalkan);
    if (!baris.length) return;
    const t0 = baris[0];
    const total = baris.reduce((s, t) => s + Number(t.jumlah), 0);

    const ok = await UI.modal({
      judul: 'Batalkan transaksi ini?',
      isi: `
        <div class="banner err mb-16"><div>Stok akan dikembalikan seperti sebelum
          transaksi ini${t0.resep_item_id ? ', dan resepnya dibuka kembali supaya bisa '
          + 'diserahkan ulang' : ''}. Baris aslinya tetap tersimpan sebagai jejak,
          ditandai dibatalkan.</div></div>
        <div class="table-wrap"><table class="tbl"><tbody>
          <tr><td class="text-muted">Jenis</td><td>${UI.esc(t0.jenis)} · ${UI.esc(t0.kategori)}</td></tr>
          <tr><td class="text-muted">Obat</td><td><b>${UI.esc(t0.nama_obat)}</b></td></tr>
          <tr><td class="text-muted">Jumlah</td>
              <td><b>${total}</b> ${UI.esc(t0.satuan)}${baris.length > 1
                ? ` <span class="text-xs text-muted">(terpecah ke ${baris.length} batch — dibatalkan serentak)</span>` : ''}</td></tr>
          <tr><td class="text-muted">Tanggal</td><td>${UI.tglIndo(t0.tanggal)}</td></tr>
        </tbody></table></div>
        <div class="field mt-14"><label>Alasan pembatalan</label>
          <input type="text" name="alasan" placeholder="Salah input, pasien membatalkan, …"></div>`,
      tombol: [
        { teks: 'Tidak', nilai: false },
        { teks: 'Ya, batalkan', kelas: 'btn-danger', aksi: async (badan) => {
            const alasan = badan.querySelector('[name=alasan]').value || null;
            await DB.apotekBatalkanGrup(grupId, alasan);
            UI.toast('Transaksi dibatalkan, stok dikembalikan.');
            await segarkan();
            return true;
          } }
      ]
    });
    return ok;
  }

  /* ==================================================================
     EXCEL — pemuatan pustaka
     ==================================================================
     SheetJS hampir 900 KB. Memuatnya di app.html berarti setiap orang
     yang membuka Beranda menunggu berkas yang hanya dipakai apoteker
     sesekali; di jaringan klinik itu terasa. Diambil saat dibutuhkan,
     lalu tinggal di memori sampai halaman ditutup. */
  let sheetSiap = null;
  function muatSheetJS() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    if (sheetSiap) return sheetSiap;
    sheetSiap = new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = ok;
      s.onerror = () => gagal(new Error('gagal memuat'));
      document.head.appendChild(s);
    }).catch(e => { sheetSiap = null; throw e; });
    return sheetSiap;
  }

  async function siapkanExcel() {
    try {
      await muatSheetJS();
      return true;
    } catch (e) {
      UI.toast('Pustaka Excel gagal dimuat. Periksa koneksi internet, lalu coba lagi.', 'err');
      return false;
    }
  }

  /* Menyusun satu berkas .xlsx dari beberapa lembar dan mengunduhnya.
     `lembar` berbentuk [{ nama, aoa }]. */
  function unduhExcel(namaBerkas, lembar) {
    const wb = XLSX.utils.book_new();
    lembar.forEach(l => {
      const ws = XLSX.utils.aoa_to_sheet(l.aoa);
      ws['!cols'] = ApotekExcel.lebarKolom(l.aoa);
      /* Nama lembar Excel dibatasi 31 karakter dan tidak boleh memuat
         : \ / ? * [ ] — melanggarnya membuat berkas gagal dibuka, bukan
         sekadar tampil aneh. */
      XLSX.utils.book_append_sheet(wb, ws,
        String(l.nama).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));
    });
    XLSX.writeFile(wb, namaBerkas);
  }

  /* ==================================================================
     DIALOG — EKSPOR
     ================================================================== */
  async function dialogEkspor() {
    const awalBulan = UI.bulanIni() + '-01';
    const daftar = K.daftarObat(batch, transaksi);

    await UI.modal({
      judul: 'Ekspor stok apotek ke Excel',
      lebar: true,
      isi: `
        <div class="banner info mb-16"><div>Satu berkas .xlsx berisi lembar yang Anda
          pilih di bawah. Angkanya ditulis sebagai <b>angka</b>, bukan teks berformat
          rupiah, jadi masih bisa dijumlahkan dan disaring di Excel.</div></div>

        <div class="field"><label>Lembar yang disertakan</label>
          <div class="form-row c2">
            <label class="check mb-8"><input type="checkbox" name="l_obat" checked>
              <span>Stok per obat</span></label>
            <label class="check mb-8"><input type="checkbox" name="l_batch" checked>
              <span>Stok per batch</span></label>
            <label class="check mb-8"><input type="checkbox" name="l_ringkas" checked>
              <span>Ringkasan &amp; perhatian</span></label>
            <label class="check mb-8"><input type="checkbox" name="l_riwayat" checked>
              <span>Riwayat transaksi</span></label>
            <label class="check mb-8"><input type="checkbox" name="l_rekap" checked>
              <span>Rekap 12 bulan</span></label>
            <label class="check mb-8"><input type="checkbox" name="l_kartu">
              <span>Kartu stok satu obat</span></label>
          </div>
          <div class="hint">Lembar <b>Stok per batch</b> memakai judul kolom yang sama
            dengan template impor, jadi hasil ekspornya bisa langsung dipakai untuk
            memuat ulang stok di tempat lain.</div></div>

        <div class="form-row c2">
          <div class="field"><label>Riwayat dari tanggal</label>
            <input type="date" name="dari" value="${awalBulan}"></div>
          <div class="field"><label>Sampai tanggal</label>
            <input type="date" name="sampai" value="${UI.hariIni()}"></div>
        </div>

        <div class="form-row c2" id="barisKartu" hidden>
          <div class="field"><label>Kartu stok untuk obat</label>
            <select name="kartu_obat">${daftar.map(o =>
              `<option value="${UI.esc(o.obat_id)}">${UI.esc(o.nama)}</option>`).join('')}</select></div>
          <div class="field"><label>Bulan</label>
            <input type="month" name="kartu_bulan" value="${UI.bulanIni()}"></div>
        </div>`,
      siap: (badan) => {
        const c = badan.querySelector('[name=l_kartu]');
        const baris = badan.querySelector('#barisKartu');
        c.addEventListener('change', () => { baris.hidden = !c.checked; });
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Unduh berkas', kelas: 'btn-primary', aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            if (!['l_obat','l_batch','l_ringkas','l_riwayat','l_rekap','l_kartu'].some(k => f[k])) {
              UI.toast('Pilih minimal satu lembar.', 'err'); return false;
            }
            if (!await siapkanExcel()) return false;

            const lembar = [];
            if (f.l_ringkas) lembar.push({ nama: 'Ringkasan',
              aoa: ApotekExcel.lembarRingkasan({
                stok, batch, ringkasStok: K.ringkasStok(batch),
                namaKlinik: CONFIG.NAMA_KLINIK,
                tanggal: UI.tglIndo(new Date(), true) }) });
            if (f.l_obat)  lembar.push({ nama: 'Stok per Obat',  aoa: ApotekExcel.lembarStokPerObat(stok) });
            if (f.l_batch) lembar.push({ nama: 'Stok per Batch', aoa: ApotekExcel.lembarStokPerBatch(batch) });

            if (f.l_riwayat) {
              /* Rentang yang diminta bisa lebih panjang dari riwayat yang
                 sudah ada di memori (halaman hanya memuat 120 hari), jadi
                 diambil ulang sesuai rentangnya. */
              const trx = await DB.apotekTransaksi({ dari: f.dari, sampai: f.sampai });
              lembar.push({ nama: 'Riwayat Transaksi', aoa: ApotekExcel.lembarRiwayat(trx) });
            }
            if (f.l_rekap) {
              const setahun = await DB.apotekTransaksi({
                dari: UI.geserBulan(UI.bulanIni(), -12) + '-01' });
              lembar.push({ nama: 'Rekap 12 Bulan',
                aoa: ApotekExcel.lembarRekapBulanan(setahun, UI.bulanIni(), 12) });
            }
            if (f.l_kartu && f.kartu_obat) {
              const kartuData = K.kartuObat({
                transaksi, batch, obatId: f.kartu_obat, bulan: f.kartu_bulan || UI.bulanIni() });
              lembar.push({ nama: 'Kartu Stok', aoa: ApotekExcel.lembarKartuStok(kartuData) });
            }

            unduhExcel(`stok-apotek-${UI.hariIni()}.xlsx`, lembar);
            UI.toast('Berkas Excel diunduh.');
          } }
      ]
    });
  }

  /* ==================================================================
     DIALOG — IMPOR
     ================================================================== */
  let imp = null;   // { jenis, hasil, master }

  async function dialogImpor() {
    imp = { jenis: 'Pembelian', hasil: null, master: null };

    await UI.modal({
      judul: 'Impor stok dari Excel',
      lebar: true,
      isi: `
        <div class="field"><label>Jenis impor</label>
          <div class="radio-row" id="jenisImpor">${ApotekExcel.JENIS_IMPOR.map(j =>
            `<button type="button" class="radio-chip" data-jenis="${UI.esc(j.kunci)}">${UI.esc(j.judul)}</button>`).join('')}</div>
          <div class="hint" id="bantuJenis"></div></div>

        <!-- Dua langkah pertama menyusut jadi satu baris begitu berkasnya
             terbaca. Penjelasannya berguna sekali, lalu hanya jadi penghalang
             antara apoteker dan tabel yang justru harus ia periksa. -->
        <div id="langkahAwal"></div>

        <div id="hasilImpor"></div>`,
      siap: (badan) => {
        const pilihJenis = (j) => {
          imp.jenis = j;
          badan.querySelectorAll('[data-jenis]').forEach(b =>
            b.classList.toggle('on', b.dataset.jenis === j));
          badan.querySelector('#bantuJenis').textContent =
            (ApotekExcel.JENIS_IMPOR.find(x => x.kunci === j) || {}).bantu || '';
          if (imp.hasil) gambarPratinjauImpor(badan);
        };
        badan.querySelectorAll('[data-jenis]').forEach(b =>
          b.addEventListener('click', () => pilihJenis(b.dataset.jenis)));
        pilihJenis('Pembelian');
        pasangLangkahAwal(badan);
      },
      tombol: [{ teks: 'Tutup', nilai: null }]
    });
    imp = null;
  }

  /* Dua langkah pertama, dipasang ulang saat pengguna menekan
     "Ganti berkas". Isinya dan pemasangan pendengarnya disatukan di sini
     supaya tidak ada dua salinan HTML yang bisa berbeda diam-diam. */
  function pasangLangkahAwal(badan) {
    const awal = badan.querySelector('#langkahAwal');
    awal.innerHTML = `
      <div class="card mb-14"><div class="card-body">
        <b class="text-sm">Langkah 1 — unduh template</b>
        <p class="text-xs text-muted step-note">Berisi lembar Data
          dengan judul kolom yang benar, satu baris contoh, dan lembar Petunjuk.</p>
        <button class="btn btn-secondary btn-sm" id="btnTemplate">
          ${UI.ikon('unduh',15)} Unduh template Excel</button>
      </div></div>

      <div class="card mb-14"><div class="card-body">
        <b class="text-sm">Langkah 2 — unggah berkas yang sudah diisi</b>
        <p class="text-xs text-muted step-note">Semua baris diperiksa
          dulu dan ditampilkan. <b>Tidak ada yang tersimpan</b> sebelum Anda menekan
          Proses di bawah.</p>
        <input type="file" id="berkasImpor" accept=".xlsx,.xls,.csv">
      </div></div>`;

    awal.querySelector('#btnTemplate').addEventListener('click', async () => {
      if (!await siapkanExcel()) return;
      unduhExcel(`template-impor-stok-${UI.hariIni()}.xlsx`, [
        { nama: 'Data',     aoa: ApotekExcel.lembarTemplate() },
        { nama: 'Petunjuk', aoa: ApotekExcel.lembarPetunjuk(imp.jenis) }
      ]);
    });

    awal.querySelector('#berkasImpor').addEventListener('change', async (e) => {
      const berkas = e.target.files && e.target.files[0];
      if (!berkas) return;
      const kotak = badan.querySelector('#hasilImpor');
      kotak.innerHTML = UI.memuat(2);
      try {
        if (!await siapkanExcel()) { kotak.innerHTML = ''; return; }
        if (!imp.master) imp.master = await DB.obatUntukPencocokan();

        const buf = await berkas.arrayBuffer();
        /* raw: true — angka dan tanggal dibaca apa adanya, lalu
           ditafsirkan sendiri oleh apotek_excel.js. Membiarkan SheetJS
           mengubah serial jadi objek Date memindahkan penafsiran zona
           waktu ke tempat yang tidak bisa diuji. */
        const wb = XLSX.read(buf, { type: 'array', raw: true });
        const nama = wb.SheetNames.find(n => /data/i.test(n)) || wb.SheetNames[0];
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nama],
          { header: 1, raw: true, defval: null, blankrows: false });

        imp.hasil = ApotekExcel.bacaLembar(aoa, imp.master, { hariIni: UI.hariIni() });
        imp.namaBerkas = berkas.name;
        imp.namaLembar = nama;
        gambarPratinjauImpor(badan);
      } catch (err) {
        kotak.innerHTML = `<div class="banner err"><div><b>Berkas tidak bisa dibaca.</b><br>
          ${UI.esc(err.message || err)}</div></div>`;
      }
    });
  }

  function gambarPratinjauImpor(badan) {
    const kotak = badan.querySelector('#hasilImpor');
    const h = imp.hasil;
    if (!h) { kotak.innerHTML = ''; return; }

    if (h.galatBerkas) {
      kotak.innerHTML = `<div class="banner err"><div><b>Berkas belum bisa dipakai.</b><br>
        ${UI.esc(h.galatBerkas)}</div></div>`;
      return;
    }

    const r = ApotekExcel.ringkas(h.baris);
    const jenisLabel = (ApotekExcel.JENIS_IMPOR.find(x => x.kunci === imp.jenis) || {}).judul;

    // Beri seluruh ruang layar kepada tabel yang harus diperiksa.
    const awal = badan.querySelector('#langkahAwal');
    if (awal && !awal.dataset.ringkas) {
      awal.dataset.ringkas = '1';
      awal.innerHTML = `<div class="banner ok mb-16 items-center"><div class="flex-1">
          Berkas terbaca: <b>${UI.esc(imp.namaBerkas)}</b></div>
          <button class="btn btn-secondary btn-sm" id="btnGantiBerkas">Ganti berkas</button>
        </div>`;
      awal.querySelector('#btnGantiBerkas').addEventListener('click', () => {
        delete awal.dataset.ringkas;
        imp.hasil = null;
        badan.querySelector('#hasilImpor').innerHTML = '';
        pasangLangkahAwal(badan);
      });
    }

    kotak.innerHTML = `
      <div class="card"><div class="card-head">
        <div class="flex-1"><h2>Periksa lalu proses</h2>
          <div class="sub">${UI.esc(imp.namaBerkas)} · lembar "${UI.esc(imp.namaLembar)}"
            · ${h.baris.length} baris berisi data</div></div>
      </div>
      <div class="card-body">
        <div class="grid grid-4 mb-16">
          <div class="stat"><div class="lbl">Siap diproses</div>
            <div class="val text-ok">${r.siap}</div></div>
          <div class="stat"><div class="lbl">Perlu diperbaiki</div>
            <div class="val ${r.galat ? 'text-danger' : ''}">${r.galat}</div></div>
          <div class="stat"><div class="lbl">Obat baru</div>
            <div class="val">${r.obatBaru}</div>
            ${r.tertunda ? `<div class="hint text-warn">
              ${r.tertunda} belum dicentang</div>` : ''}</div>
          <div class="stat"><div class="lbl">Nilai yang masuk</div>
            <div class="val sm">${rp(r.nilai)}</div></div>
        </div>

        ${h.kolomTakDikenal.length ? `<div class="banner warn mb-16"><div>
          Kolom yang tidak dikenali dan diabaikan:
          <b>${UI.esc(h.kolomTakDikenal.join(', '))}</b>.</div></div>` : ''}

        ${h.adaAmbigu ? `<div class="banner warn mb-16"><div>
          Ada tanggal yang ditulis seperti <code>03/04/2028</code> — bentuk itu bisa
          dibaca dua cara. Sistem membacanya <b>hari dulu, baru bulan</b>. Periksa
          kolom Kadaluwarsa di bawah: tanggalnya ditulis lengkap supaya salah baca
          langsung terlihat.</div></div>` : ''}

        ${r.tertunda ? `<div class="banner info mb-16"><div>
          ${r.tertunda} baris obatnya belum ada di Master Data. Centang kolom
          <b>Buat</b> untuk membuatnya, atau tekan nama yang mirip untuk memakai obat
          yang sudah ada. Selama masih ada yang belum diputuskan, tombol Proses
          tetap terkunci.</div></div>` : ''}

        <div class="table-wrap scroll-tall">
          <table class="tbl"><thead><tr>
            <th class="col-w56">Baris</th><th>Obat</th>
            <th class="text-right">Jumlah</th><th class="text-right">Harga beli</th>
            <th>Kadaluwarsa</th><th>PBF / faktur</th><th>Kolam</th>
            <th class="col-w56">Buat</th><th>Catatan</th>
          </tr></thead><tbody>${h.baris.map((b, i) => barisPratinjau(b, i)).join('')}</tbody></table>
        </div>

        <div class="btn-group items-center mt-14">
          <button class="btn btn-primary" id="btnProses" ${r.bisaDiproses ? '' : 'disabled'}>
            Proses ${r.siap} baris sebagai ${UI.esc(jenisLabel)}</button>
          ${r.galat ? `<span class="hint text-danger">
            Perbaiki ${r.galat} baris bergalat di Excel, lalu unggah ulang.</span>` : ''}
        </div>
      </div></div>`;

    kotak.querySelectorAll('[data-buat]').forEach(c =>
      c.addEventListener('change', () => {
        h.baris[+c.dataset.buat].buatObat = c.checked;
        gambarPratinjauImpor(badan);
      }));
    kotak.querySelectorAll('[data-pakai]').forEach(t =>
      t.addEventListener('click', () => {
        const [i, id] = t.dataset.pakai.split('|');
        const b = h.baris[+i];
        b.obat = imp.master.find(o => String(o.id) === id) || null;
        b.caraCocok = 'manual';
        b.buatObat = false;
        ApotekExcel.periksaBaris(b, { hariIni: UI.hariIni() });
        if (b.obat) b.peringatan.unshift(`Dipilih manual: ${b.obat.nama}.`);
        gambarPratinjauImpor(badan);
      }));

    const btn = kotak.querySelector('#btnProses');
    if (btn) btn.addEventListener('click', () => prosesImpor(badan, btn));
  }

  function barisPratinjau(b, i) {
    const s = ApotekExcel.statusBaris(b);
    const kelasBaris = { galat: 'row-galat', tertunda: 'row-tertunda' }[s] || '';
    const catatan = [
      ...b.galat.map(g => `<div class="text-danger">${UI.esc(g)}</div>`),
      ...b.peringatan.map(p => `<div class="text-muted">${UI.esc(p)}</div>`)
    ].join('') || '<span class="text-muted">—</span>';

    const mirip = (!b.obat && b.mirip && b.mirip.length)
      ? `<div class="chip-list">${b.mirip.map(m =>
          `<button type="button" class="chip chip-btn" data-pakai="${i}|${UI.esc(m.obat.id)}"
             >pakai: ${UI.esc(m.obat.nama)}</button>`).join('')}</div>`
      : '';

    return `<tr class="${kelasBaris}">
      <td class="text-xs text-muted">${b.nomorBaris}</td>
      <td><b>${UI.esc(b.nama_obat || '—')}</b>
        ${b.obat && b.obat.nama !== b.nama_obat
          ? `<div class="text-xs text-muted">→ ${UI.esc(b.obat.nama)}</div>` : ''}
        ${b.kode_obat ? `<div class="text-xs text-muted mono">${UI.esc(b.kode_obat)}</div>` : ''}
        ${mirip}</td>
      <td class="text-right">${b.jumlah === null ? '—' : b.jumlah}</td>
      <td class="text-right">${b.harga_beli === null ? '—' : rp(b.harga_beli)}</td>
      <td class="text-xs">${b.tgl_expired
        ? UI.tglIndo(b.tgl_expired) + (b.tglAmbigu
            ? '<div class="text-warn">dibaca hari-bulan</div>' : '')
        : '<span class="text-danger">tidak terbaca</span>'}</td>
      <td class="text-xs">${UI.esc(b.pbf || '—')}
        ${b.no_faktur ? `<div class="text-muted">${UI.esc(b.no_faktur)}</div>` : ''}</td>
      <td class="text-xs">${b.kolam === 'kronis' ? '<span class="badge b-info">Kronis</span>' : 'Reguler'}</td>
      <td class="text-center">${b.obat ? '<span class="text-muted">—</span>'
        : `<input type="checkbox" data-buat="${i}" ${b.buatObat ? 'checked' : ''}
             title="Buat obat ini di Master Data">`}</td>
      <td class="text-xs col-max-260">${catatan}</td>
    </tr>`;
  }

  async function prosesImpor(badan, btn) {
    const h = imp.hasil;
    const muatan = ApotekExcel.keMuatan(h.baris);
    const r = ApotekExcel.ringkas(h.baris);
    if (!muatan.length) { UI.toast('Tidak ada baris yang siap diproses.', 'err'); return; }

    const ok = await UI.konfirmasi(
      `Proses ${muatan.length} baris?`,
      `${muatan.length} batch akan masuk sebagai "${imp.jenis}", senilai ${rp(r.nilai)}.`
      + (r.obatBaru ? ` ${r.obatBaru} obat baru akan ditambahkan ke Master Data.` : '')
      + ' Seluruh berkas diproses sekaligus — kalau ada satu baris yang ditolak database,'
      + ' tidak ada satu pun yang tersimpan.',
      'Ya, proses');
    if (!ok) return;

    const lama = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Memproses…';
    try {
      const hasil = await DB.apotekImpor(muatan, imp.jenis);
      await segarkan();
      UI.toast(`${hasil.baris} baris masuk — ${hasil.batch_baru} batch baru, `
             + `${hasil.batch_digabung} digabung ke batch lama.`);

      badan.querySelector('#hasilImpor').innerHTML = `
        <div class="banner ok"><div>
          <b>Impor selesai.</b><br>
          ${hasil.baris} baris diproses sebagai <b>${UI.esc(hasil.jenis)}</b>,
          senilai ${rp(hasil.total_nilai)}.<br>
          ${hasil.batch_baru} batch baru dibuat, ${hasil.batch_digabung} ditambahkan
          ke batch yang sudah ada.
          ${hasil.obat_baru ? `<br>${hasil.obat_baru} obat baru ditambahkan ke Master Data:
            <b>${UI.esc((hasil.nama_obat_baru || []).join(', '))}</b>.` : ''}
        </div></div>`;
      imp.hasil = null;
    } catch (e) {
      btn.disabled = false; btn.innerHTML = lama;
      /* Pesan dari database sudah menyebut nomor barisnya. Ditampilkan
         apa adanya, tidak diringkas — nomor baris itulah satu-satunya
         cara apoteker menemukan sel yang harus dibetulkan. */
      UI.modal({
        judul: 'Impor dibatalkan',
        isi: `<div class="banner err"><div><b>Tidak ada satu baris pun yang tersimpan.</b><br>
            ${UI.esc(e.message || e)}</div></div>
          <p class="text-xs text-muted mt-12">Perbaiki baris tersebut di
            berkas Excel, simpan, lalu unggah ulang. Karena tidak ada yang tersimpan,
            berkasnya bisa diunggah utuh tanpa risiko stok tercatat dua kali.</p>`,
        tombol: [{ teks: 'Mengerti', nilai: null }]
      });
    }
  }

  return { render };
})();

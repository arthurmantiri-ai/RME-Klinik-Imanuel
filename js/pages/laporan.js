/* =====================================================================
   LAPORAN — Tahap 3 menambah lima tab lanjutan di atas tab Ringkasan yang
   sudah ada sejak awal (Ringkasan tetap terbuka lewat kode `menu_laporan`,
   TIDAK diubah perilakunya): Overview & Tren, Rujukan, Register Poli,
   Keuangan, dan Puskesmas — kelimanya di balik kode `laporan_lanjutan`
   (9 Sep 2026, bisa diatur lewat Pengaturan -> Hak Akses; bawaannya hanya
   master, sama seperti admin lama).

   Kenapa dibatasi DI SINI, bukan di RLS: sama seperti kronis_telpon_h1 di
   Tahap 2 — RLS tabel aslinya sudah membuka baca untuk semua staf (kasir
   dan dokter memang perlu kasir_tagihan/pemeriksaan dari layar lain),
   jadi menutupnya di RLS akan mengunci layar yang sudah sah itu juga.
   `App.boleh('laporan_lanjutan')` itulah gerbangnya.

   Kenapa "Overview & Tren" jauh lebih kaya dari tab lain: diminta eksplisit
   ("Analitik penuh seperti portal lama", bukan versi ringkas) untuk menyamai
   dashboard.html portal sipantau — snapshot harian, tren 7 hari, kalender
   heatmap bulanan, pola jam kunjungan, kinerja dokter, enam grafik performa
   6 bulan, dan sepuluh besar penyakit. Tab Rujukan/Register/Keuangan/
   Puskesmas TIDAK butuh perlakuan sama: di portal sendiri, layar-layar itu
   adalah tabel cari+filter biasa tanpa grafik (dashboard.html bagian
   "Pencarian Data"/"Register Poli") — rujukan.html/laporan_keuangan.html/
   laporan_puskesmas.html yang terpisah cuma FORMULIR ENTRI manual, sudah
   digantikan otomatis oleh transaksi sungguhan RME (lihat catatan di
   sql/19_laporan.sql). Jadi kesetaraan sungguhan ada di sini: tabel
   cari+filter+ekspor CSV, bukan grafik yang tidak pernah ada di sana.

   Penyederhanaan yang SENGAJA diambil di Overview (dicatat di sini supaya
   terlihat sebagai keputusan, bukan kelupaan):
   - "Perbandingan Antar Bulan" selalu membandingkan bulan kalender penuh.
     Portal punya mode "periode sebanding" (memotong kedua bulan ke tanggal
     yang sama) untuk bulan berjalan yang belum lengkap — di sini cukup
     diberi keterangan "bulan berjalan, belum lengkap" di judul kartu.
   - Kalender heatmap memetakan jumlah kunjungan (Total/Umum/Gigi) saja,
     bukan pendapatan — grafik "Uang Masuk per Bulan" di bagian performa
     6 bulan sudah menutupi kebutuhan melihat tren pendapatan.
   - Tidak ada kartu/grafik obat kronis di sini — cakupan itu milik
     Pemantauan Kronis (Tahap 2, js/pages/pantau_kronis.js). Menduplikasinya
     di sini adalah kelas kesalahan yang sama dengan dua tempat untuk satu
     hal (lihat catatan poli.jenis).

   Chart.js dimuat lazy dari CDN persis seperti SheetJS/xlsx di apotek.js
   (lihat muatChartJS di bawah) — tidak dibebankan ke setiap orang yang
   membuka halaman lain. Untuk pengujian Chromium (test/uji_laporan_halaman.js),
   permintaan ke CDN dialihkan ke salinan npm `chart.js`, sama seperti xlsx
   di test/uji_impor_halaman.js — lihat test/README.md.
   ===================================================================== */
const Laporan = (() => {

  let tabAktif = 'ringkasan';

  /* ---- state tab Overview & Tren (bertahan selama sesi SPA ini) ------- */
  let ovData = null;                 // cache tarikan 6 bulan {kunjungan,rujukan,tagihan,pembayaran,monthKeys}
  let ovBulanA = null, ovBulanB = null;      // perbandingan antar bulan
  let ovBulanHeatmap = UI.bulanIni();
  let ovMetrikHeatmap = 'total';              // 'total' | 'umum' | 'gigi'
  let ovBulanJam = UI.bulanIni();
  let ovBulanDokter = UI.bulanIni();

  function bolehAdmin() { return App.boleh('laporan_lanjutan'); }

  /* ==================================================================== */
  /*  RENDER HALAMAN & TAB                                                */
  /* ==================================================================== */

  async function render(el, param) {
    if (param && param[0]) tabAktif = param[0];
    if (tabAktif !== 'ringkasan' && !bolehAdmin()) tabAktif = 'ringkasan';

    const TAB = [
      ['ringkasan', 'Ringkasan'],
      ...(bolehAdmin() ? [
        ['overview', 'Overview & Tren'],
        ['rujukan', 'Rujukan'],
        ['register', 'Register Poli'],
        ['keuangan', 'Keuangan'],
        ['puskesmas', 'Puskesmas']
      ] : [])
    ];

    el.innerHTML = `
      <div class="page-header mb-16">
        <div class="page-heading">
          <h1>Laporan</h1>
          <div class="page-sub">Rekap kunjungan, rujukan, keuangan, dan indikator Puskesmas.</div>
        </div>
      </div>
      <div class="tabs" id="tabs">
        ${TAB.map(([k, t]) => `<button class="tab ${tabAktif === k ? 'on' : ''}" data-t="${k}">${UI.esc(t)}</button>`)
          .join('')}
      </div>
      <div id="isiTab">${UI.memuat(4)}</div>`;

    el.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tabAktif = b.dataset.t;
      history.replaceState(null, '', `#/laporan/${tabAktif}`);
      el.querySelectorAll('#tabs .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      gambarTab(el.querySelector('#isiTab'));
    });

    await gambarTab(el.querySelector('#isiTab'));
  }

  async function gambarTab(w) {
    w.innerHTML = UI.memuat(4);
    try {
      if (tabAktif === 'ringkasan') return await tabRingkasan(w);
      if (tabAktif === 'overview')  return await tabOverview(w);
      if (tabAktif === 'rujukan')   return await tabRujukan(w);
      if (tabAktif === 'register')  return await tabRegister(w);
      if (tabAktif === 'keuangan')  return await tabKeuangan(w);
      if (tabAktif === 'puskesmas') return await tabPuskesmas(w);
    } catch (e) {
      w.innerHTML = `<div class="banner err"><div>${UI.esc(e.message || e)}</div></div>`;
    }
  }

  /* ==================================================================== */
  /*  BANTU BERSAMA — CSV, peringkat penyakit, grafik Chart.js            */
  /* ==================================================================== */

  function unduhCsv(data, kolom, namaFile) {
    if (!data.length) { UI.toast('Tidak ada data untuk diunduh.', 'warn'); return; }
    const bersih = (v) => {
      const s = (v ?? '').toString().replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const nilai = (r, k) => (typeof k[2] === 'function' ? k[2](r) : r[k[0]]);
    const isi = [kolom.map(k => k[1]).join(';'),
                 ...data.map(r => kolom.map(k => bersih(nilai(r, k))).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = namaFile;
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast('Berkas CSV diunduh.', 'ok');
  }

  /* Daftar peringkat bergaya-batang, dipakai tab Ringkasan DAN Overview
     (sepuluh besar penyakit) — satu tampilan, tidak dua salinan markup. */
  function daftarPeringkat(top) {
    if (!top.length) return '<p class="text-muted mb-0">Belum ada diagnosa pada periode ini.</p>';
    const maks = Math.max(1, ...top.map(t => t.jml));
    return top.map((t, i) => `
      <div class="mb-12">
        <div class="flex justify-between items-center gap-8 mb-8">
          <div class="min-w-0"><b>${i + 1}. ${UI.esc(t.nama)}</b>
            <span class="text-xs text-muted mono">${UI.esc(t.kode)}</span></div>
          <b class="tabular">${t.jml}</b>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${t.jml / maks * 100}%"></div>
        </div>
      </div>`).join('');
  }

  /* ---- Chart.js: dimuat sekali, tinggal di memori sampai halaman ditutup,
     persis pola muatSheetJS() di js/pages/apotek.js. ---- */
  let chartSiap = null;
  function muatChartJS() {
    if (typeof Chart !== 'undefined') return Promise.resolve();
    if (chartSiap) return chartSiap;
    chartSiap = new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js';
      s.onload = ok;
      s.onerror = () => gagal(new Error('gagal memuat'));
      document.head.appendChild(s);
    }).catch(e => { chartSiap = null; throw e; });
    return chartSiap;
  }
  async function siapkanChart() {
    try { await muatChartJS(); return true; }
    catch (e) {
      UI.toast('Pustaka grafik gagal dimuat. Periksa koneksi internet, lalu coba lagi.', 'err');
      return false;
    }
  }

  /* Satu instance Chart.js per kunci, dihancurkan sebelum dibuat ulang —
     canvas yang dipakai ulang tanpa destroy() adalah kebocoran memori dan,
     pada Chart.js, bisa gagal dengan "Canvas is already in use". */
  const grafikPeta = {};
  function buatGrafik(kunci, canvas, config) {
    if (grafikPeta[kunci]) { try { grafikPeta[kunci].destroy(); } catch (e) { /* abaikan */ } }
    const c = new Chart(canvas, config);
    grafikPeta[kunci] = c;
    return c;
  }
  function hancurkanSemuaGrafik() {
    Object.keys(grafikPeta).forEach(k => {
      try { grafikPeta[k].destroy(); } catch (e) { /* abaikan */ }
      delete grafikPeta[k];
    });
  }

  const OPSI_BAR = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  function ringkasRp(v) {
    const n = Number(v) || 0;
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + ' M';
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + ' jt';
    if (abs >= 1e3) return (n / 1e3).toFixed(0) + ' rb';
    return String(n);
  }

  /* Semua tanggal dalam satu bulan ('YYYY-MM' -> ['YYYY-MM-01', ...]),
     dibangun lewat konstruktor Date(tahun,bulan,hari) lokal — BUKAN lewat
     new Date(teksIso) atau toISOString(), yang keduanya diketahui
     bermasalah untuk WITA (lihat catatan UI.hariIni()). */
  function tanggalSebulan(kunciBulan) {
    const [y, m] = kunciBulan.split('-').map(Number);
    const jumlahHari = new Date(y, m, 0).getDate();
    const hasil = [];
    for (let h = 1; h <= jumlahHari; h++) {
      hasil.push(`${y}-${String(m).padStart(2, '0')}-${String(h).padStart(2, '0')}`);
    }
    return hasil;
  }

  function badgePoliKelas(jenisPoli) {
    if (jenisPoli === 'UMUM') return 'b-info';
    if (jenisPoli === 'GIGI') return 'b-dokter';   // ungu — dipinjam dari lencana peran dokter
    if (jenisPoli === 'KIA') return 'b-warn';
    return 'b-umum';
  }

  /* ==================================================================== */
  /*  TAB 1 — RINGKASAN (tidak berubah dari sebelum Tahap 3)              */
  /* ==================================================================== */

  const KOLOM_KUNJUNGAN = [
    ['tanggal', 'Tanggal'], ['no_kunjungan', 'No Kunjungan'], ['no_rm', 'No RM'],
    ['nama_pasien', 'Nama Pasien'], ['nama_poli', 'Poli'], ['nama_dokter', 'Dokter'],
    ['cara_bayar', 'Cara Bayar'], ['icd_primer', 'ICD Primer'], ['daftar_diagnosa', 'Diagnosa'],
    ['status', 'Status']
  ];

  async function tabRingkasan(w) {
    const akhir = UI.hariIni();
    const awal = akhir.slice(0, 8) + '01';

    w.innerHTML = `
      <div class="card mb-16">
        <div class="card-body">
          <div class="flex items-center gap-12 flex-wrap">
            <div class="flex items-center gap-8 periode-group">
              <label class="mb-0">Periode</label>
              <input type="date" id="dari" value="${awal}" class="control-auto">
              <span class="text-muted">s.d.</span>
              <input type="date" id="sampai" value="${akhir}" class="control-auto">
            </div>
            <button class="btn btn-primary btn-sm" id="btnTampil">Tampilkan</button>
            <div class="flex-1"></div>
            <button class="btn btn-secondary btn-sm" id="btnUnduh">${UI.ikon('unduh', 15)} Unduh CSV</button>
          </div>
        </div>
      </div>

      <div id="isiLaporan">${UI.memuat(4)}</div>`;

    const muat = async () => {
      const dari = w.querySelector('#dari').value;
      const sampai = w.querySelector('#sampai').value;
      const isi = w.querySelector('#isiLaporan');
      isi.innerHTML = UI.memuat(4);
      try {
        const [kunjungan, top, tindakan] = await Promise.all([
          DB.daftarKunjungan({ dari, sampai, batas: 2000 }),
          DB.diagnosaTeratas(dari, sampai, 10),
          DB.tindakanTeratas(dari, sampai, 12)
        ]);
        gambarRingkasan(isi, kunjungan, top, tindakan, dari, sampai);
      } catch (e) {
        isi.innerHTML = `<div class="banner err">${UI.esc(e.message)}</div>`;
      }
    };

    w.querySelector('#btnTampil').addEventListener('click', muat);
    w.querySelector('#btnUnduh').addEventListener('click', async () => {
      const dari = w.querySelector('#dari').value, sampai = w.querySelector('#sampai').value;
      const d = await DB.daftarKunjungan({ dari, sampai, batas: 5000 });
      unduhCsv(d, KOLOM_KUNJUNGAN, `kunjungan_${dari}_sd_${sampai}.csv`);
    });

    await muat();
  }

  function gambarRingkasan(w, kunjungan, top, tindakan, dari, sampai) {
    const total = kunjungan.length;
    const bpjs = kunjungan.filter(k => k.cara_bayar === 'BPJS').length;
    const selesai = kunjungan.filter(k => k.status === 'SELESAI').length;
    const perPoli = {};
    kunjungan.forEach(k => { perPoli[k.nama_poli] = (perPoli[k.nama_poli] || 0) + 1; });

    w.innerHTML = `
      <div class="grid grid-4 mb-16">
        <div class="stat accent"><div class="lbl">Total kunjungan</div>
          <div class="val tabular">${total}</div>
          <div class="hint">${UI.tglPendek(dari)} – ${UI.tglPendek(sampai)}</div></div>
        <div class="stat"><div class="lbl">Peserta BPJS</div>
          <div class="val tabular">${bpjs}</div>
          <div class="hint">${total ? Math.round(bpjs / total * 100) : 0}% dari total</div></div>
        <div class="stat"><div class="lbl">Umum &amp; lainnya</div>
          <div class="val tabular">${total - bpjs}</div></div>
        <div class="stat"><div class="lbl">Selesai dilayani</div>
          <div class="val tabular">${selesai}</div>
          <div class="hint">${total - selesai} belum selesai</div></div>
      </div>

      <div class="split">
        <div class="card">
          <div class="card-head"><h2>Sepuluh besar penyakit</h2></div>
          <div class="card-body">${daftarPeringkat(top)}</div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><h2>Kunjungan per poli</h2></div>
            <div class="card-body">
              ${Object.keys(perPoli).length === 0 ? '<p class="text-muted mb-0">Tidak ada data.</p>'
                : Object.entries(perPoli).sort((a, b) => b[1] - a[1]).map(([nama, jml]) => `
                  <div class="flex justify-between items-center row-line">
                    <span>${UI.esc(nama)}</span><b class="tabular">${jml}</b></div>`).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div class="flex-1"><h2>Tindakan terbanyak</h2>
              <div class="sub">Berdasarkan kode ICD-9-CM</div></div></div>
            <div class="card-body">
              ${!tindakan.length ? '<p class="text-muted mb-0">Belum ada tindakan tercatat pada periode ini.</p>'
                : tindakan.map(t => `
                  <div class="flex justify-between items-center gap-8 row-line">
                    <div class="min-w-0"><span>${UI.esc(t.nama)}</span>
                      <span class="text-xs text-muted mono"> ${UI.esc(t.kode)}</span></div>
                    <b class="tabular">${t.jml}</b></div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ==================================================================== */
  /*  TAB 2 — OVERVIEW & TREN                                             */
  /* ==================================================================== */

  async function ambilDataOverview(paksaMuat) {
    if (ovData && !paksaMuat) return ovData;
    const monthKeys = LaporanCore.daftarBulanMundur(6, UI.bulanIni());
    const dari = monthKeys[0] + '-01';
    const sampai = UI.hariIni();
    const [kunjungan, rujukan, tagihan, pembayaran] = await Promise.all([
      DB.laporanKunjunganRentang({ dari, sampai }),
      DB.laporanRujukan({ dari, sampai }),
      DB.laporanKeuanganTagihan({ dari, sampai }),
      DB.laporanKeuanganPembayaran({ dari, sampai })
    ]);
    ovData = { kunjungan, rujukan, tagihan, pembayaran, monthKeys, dari, sampai };
    return ovData;
  }

  async function tabOverview(w) {
    hancurkanSemuaGrafik();
    w.innerHTML = UI.memuat(6);
    let data;
    try {
      data = await ambilDataOverview();
    } catch (e) {
      w.innerHTML = `<div class="banner err"><div>${UI.esc(e.message || e)}</div></div>`;
      return;
    }

    w.innerHTML = `
      <div class="flex justify-between items-center mb-16">
        <p class="text-muted mb-0">Data enam bulan terakhir (${LaporanCore.labelBulanPendek(data.monthKeys[0])}
          – ${UI.tglIndo(UI.hariIni())}).</p>
        <button class="btn btn-secondary btn-sm" id="ovSegarkan">Segarkan data</button>
      </div>
      <div id="ovSnapshot" class="mb-16"></div>
      <div class="card mb-16"><div class="card-head"><h2>Tren Kunjungan 7 Hari Terakhir</h2></div>
        <div class="card-body"><div id="ovTrenBox" class="chart-box">
          <canvas id="ovTren"></canvas></div></div></div>
      <div id="ovBanding" class="mb-16"></div>
      <div id="ovHeatmap" class="mb-16"></div>
      <div id="ovJam" class="mb-16"></div>
      <div id="ovDokter" class="mb-16"></div>
      <h2 class="mb-12">Performa 6 Bulan Terakhir</h2>
      <div id="ovGrafik" class="mb-16 grafik-grid"></div>
      <div id="ovDiagnosa"></div>`;

    gambarSnapshot(w.querySelector('#ovSnapshot'), data);
    gambarBanding(w.querySelector('#ovBanding'), data);
    gambarHeatmap(w.querySelector('#ovHeatmap'), data);
    await gambarJam(w.querySelector('#ovJam'), data);
    gambarDokter(w.querySelector('#ovDokter'), data);

    if (await siapkanChart()) {
      gambarTrenChart(w.querySelector('#ovTren'), data);
      await gambarGrafikBulanan(w.querySelector('#ovGrafik'), data);
    } else {
      w.querySelector('#ovTrenBox').innerHTML =
        '<div class="banner warn"><div>Grafik tidak dapat dimuat tanpa koneksi internet.</div></div>';
      w.querySelector('#ovGrafik').innerHTML =
        '<div class="banner warn"><div>Grafik performa bulanan tidak dapat dimuat tanpa koneksi internet.</div></div>';
    }

    try {
      const diagnosaTop = await DB.diagnosaTeratas(data.monthKeys[0] + '-01', UI.hariIni(), 10);
      w.querySelector('#ovDiagnosa').innerHTML = `<div class="card"><div class="card-head">
        <div class="flex-1"><h2>Sepuluh Besar Penyakit</h2><div class="sub">Enam bulan terakhir.</div></div></div>
        <div class="card-body">${daftarPeringkat(diagnosaTop)}</div></div>`;
    } catch (e) { /* bagian lain tetap ditampilkan walau ini gagal */ }

    w.querySelector('#ovSegarkan').addEventListener('click', async () => {
      ovData = null;
      await tabOverview(w);
    });
  }

  /* ---- A. Snapshot hari ini ------------------------------------------ */
  function gambarSnapshot(w, data) {
    const hari = UI.hariIni();
    const r = LaporanCore.rekapPerHari(data.kunjungan).get(hari) || LaporanCore.kunjunganKosong();
    const rujukanHariIni = data.rujukan.filter(x => x.tanggal === hari).length;
    const uangMasukHariIni = data.pembayaran
      .filter(x => x.tanggal === hari)
      .reduce((a, x) => a + (Number(x.uang_masuk) || 0), 0);

    w.innerHTML = `
      <div class="grid grid-3">
        <div class="stat accent"><div class="lbl">Total Kunjungan Hari Ini</div>
          <div class="val tabular">${r.total}</div>
          <div class="hint">${UI.tglIndo(hari)}</div></div>
        <div class="stat"><div class="lbl">Poli Umum</div><div class="val tabular">${r.umum}</div></div>
        <div class="stat"><div class="lbl">Poli Gigi</div><div class="val tabular">${r.gigi}</div></div>
        <div class="stat"><div class="lbl">Peserta BPJS</div>
          <div class="val tabular">${r.bpjs}</div>
          <div class="hint">${r.total ? Math.round(r.bpjs / r.total * 100) : 0}% dari total</div></div>
        <div class="stat"><div class="lbl">Rujukan Hari Ini</div><div class="val tabular">${rujukanHariIni}</div></div>
        <div class="stat"><div class="lbl">Uang Masuk Hari Ini</div>
          <div class="val tabular">${UI.rupiah(uangMasukHariIni)}</div></div>
      </div>`;
  }

  /* ---- B. Tren 7 hari (Chart.js line) ---------------------------------- */
  function gambarTrenChart(canvas, data) {
    const hari = UI.hariIni();
    const tanggalList = [];
    for (let i = 6; i >= 0; i--) tanggalList.push(SuratCore.tambahHari(hari, -i));
    const deret = LaporanCore.rekapTrenHarian(data.kunjungan, tanggalList);
    buatGrafik('tren', canvas, {
      type: 'line',
      data: {
        labels: tanggalList.map(SuratCore.namaHari),
        datasets: [{
          label: 'Total Kunjungan', data: deret.map(d => d.total),
          borderColor: '#0F8B7E', backgroundColor: 'rgba(15,139,126,.14)',
          fill: true, tension: 0.3, pointRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  /* ---- C. Perbandingan antar bulan ------------------------------------ */
  function metrikBulan(bulan, data) {
    const kv = LaporanCore.rekapPerBulan(data.kunjungan, [bulan])[0];
    const rj = LaporanCore.rekapRujukanPerBulan(data.rujukan, [bulan])[0].jumlah;
    const um = LaporanCore.rekapUangMasukPerBulan(data.pembayaran, [bulan], false)[0].total;
    const hariAktif = new Set(data.kunjungan
      .filter(k => LaporanCore.kunciBulan(k.tanggal) === bulan)
      .map(k => k.tanggal)).size;
    return {
      total: kv.total, umum: kv.umum, gigi: kv.gigi, kia: kv.kia,
      pctBpjs: kv.total ? kv.bpjs / kv.total * 100 : 0,
      pctBaru: kv.total ? kv.baru / kv.total * 100 : 0,
      rujukan: rj, uangMasuk: um, hariAktif,
      rataPerHariAktif: hariAktif ? kv.total / hariAktif : 0
    };
  }

  function badgeDelta(now, prev) {
    if (!prev) return now > 0 ? '<span class="badge b-ok">▲ baru</span>' : '';
    const pct = (now - prev) / prev * 100;
    const naik = pct >= 0;
    return `<span class="badge ${naik ? 'b-ok' : 'b-danger'}">${naik ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`;
  }
  function badgeDeltaPP(now, prev) {
    const beda = now - prev;
    if (Math.abs(beda) < 0.05) return '<span class="badge b-umum">≈ sama</span>';
    const naik = beda >= 0;
    return `<span class="badge ${naik ? 'b-ok' : 'b-danger'}">${naik ? '▲' : '▼'} ${Math.abs(beda).toFixed(1)} pp</span>`;
  }

  function gambarBanding(w, data) {
    if (!data.monthKeys.includes(ovBulanB)) ovBulanB = data.monthKeys[data.monthKeys.length - 1];
    if (!ovBulanA || !data.monthKeys.includes(ovBulanA)) ovBulanA = UI.geserBulan(ovBulanB, -1);

    const A = metrikBulan(ovBulanA, data), B = metrikBulan(ovBulanB, data);
    const kartu = (label, nowVal, prevVal, tampil, delta) => `
      <div class="stat"><div class="lbl">${UI.esc(label)}</div>
        <div class="val tabular">${tampil(nowVal)}</div>
        <div class="hint">${delta(nowVal, prevVal)} <span class="text-muted">vs ${UI.labelBulan(ovBulanA)}</span></div></div>`;

    w.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Perbandingan Antar Bulan</h2>
            <div class="sub">${UI.labelBulan(ovBulanB)} dibandingkan ${UI.labelBulan(ovBulanA)}${
              ovBulanB === UI.bulanIni() ? ' — bulan berjalan, belum lengkap' : ''}</div></div>
          <button class="btn btn-secondary btn-sm" id="ovSwap" title="Tukar bulan">⇄</button>
        </div>
        <div class="card-body">
          <div class="flex gap-16 flex-wrap mb-16">
            <div class="flex items-center gap-8">
              <label class="mb-0">Bulan pembanding</label>
              <button class="btn btn-secondary btn-sm" id="ovAPrev">‹</button>
              <input type="month" id="ovABulan" class="control-auto" value="${ovBulanA}">
              <button class="btn btn-secondary btn-sm" id="ovANext">›</button>
            </div>
            <div class="flex items-center gap-8">
              <label class="mb-0">Bulan ini</label>
              <button class="btn btn-secondary btn-sm" id="ovBPrev">‹</button>
              <input type="month" id="ovBBulan" class="control-auto" value="${ovBulanB}">
              <button class="btn btn-secondary btn-sm" id="ovBNext">›</button>
            </div>
          </div>
          <div class="grid grid-4">
            ${kartu('Total Kunjungan', B.total, A.total, v => v, badgeDelta)}
            ${kartu('Poli Umum', B.umum, A.umum, v => v, badgeDelta)}
            ${kartu('Poli Gigi', B.gigi, A.gigi, v => v, badgeDelta)}
            ${kartu('Uang Masuk', B.uangMasuk, A.uangMasuk, UI.rupiah, badgeDelta)}
            ${kartu('Peserta BPJS', B.pctBpjs, A.pctBpjs, v => v.toFixed(1) + '%', badgeDeltaPP)}
            ${kartu('Pasien Baru', B.pctBaru, A.pctBaru, v => v.toFixed(1) + '%', badgeDeltaPP)}
            ${kartu('Rujukan', B.rujukan, A.rujukan, v => v, badgeDelta)}
            ${kartu('Rata-rata/Hari Buka', B.rataPerHariAktif, A.rataPerHariAktif, v => v.toFixed(1), badgeDelta)}
          </div>
        </div>
      </div>`;

    const gantiA = (kunci) => { ovBulanA = kunci; gambarBanding(w, data); };
    const gantiB = (kunci) => { ovBulanB = kunci; gambarBanding(w, data); };
    w.querySelector('#ovAPrev').addEventListener('click', () => gantiA(UI.geserBulan(ovBulanA, -1)));
    w.querySelector('#ovANext').addEventListener('click', () => gantiA(UI.geserBulan(ovBulanA, 1)));
    w.querySelector('#ovABulan').addEventListener('change', (e) => gantiA(e.target.value));
    w.querySelector('#ovBPrev').addEventListener('click', () => gantiB(UI.geserBulan(ovBulanB, -1)));
    w.querySelector('#ovBNext').addEventListener('click', () => gantiB(UI.geserBulan(ovBulanB, 1)));
    w.querySelector('#ovBBulan').addEventListener('change', (e) => gantiB(e.target.value));
    w.querySelector('#ovSwap').addEventListener('click', () => {
      const t = ovBulanA; ovBulanA = ovBulanB; ovBulanB = t; gambarBanding(w, data);
    });
  }

  /* ---- D. Kalender heatmap bulanan ------------------------------------- */
  const OV_HEAT_WARNA = ['#F1F5F9', '#D6F2EE', '#8FDCD1', '#16A394', '#085048'];
  const OV_HEAT_TEKS  = ['#334155', '#334155', '#0F172A', '#FFFFFF', '#FFFFFF'];

  function gambarHeatmap(w, data) {
    if (!data.monthKeys.includes(ovBulanHeatmap)) ovBulanHeatmap = data.monthKeys[data.monthKeys.length - 1];
    const tanggalList = tanggalSebulan(ovBulanHeatmap);
    const peta = LaporanCore.rekapPerHari(data.kunjungan);
    const hari = UI.hariIni();
    const ambil = (r) => ovMetrikHeatmap === 'umum' ? r.umum : ovMetrikHeatmap === 'gigi' ? r.gigi : r.total;
    const nilai = tanggalList.map(t => ambil(peta.get(t) || LaporanCore.kunjunganKosong()));
    const maks = Math.max(1, ...nilai);
    const [y, m] = ovBulanHeatmap.split('-').map(Number);
    const offset = new Date(y, m - 1, 1).getDay();

    const kelasAktif = (m2) => m2 === ovMetrikHeatmap ? 'btn-primary' : 'btn-secondary';
    const hariBerjalan = tanggalList.filter(t => t <= hari).length;
    const hariAktif = tanggalList.filter((t, i) => t <= hari && nilai[i] > 0).length;
    const totalBulan = nilai.reduce((a, b) => a + b, 0);
    let idxMaks = -1;
    nilai.forEach((v, i) => { if (v > 0 && (idxMaks < 0 || v > nilai[idxMaks])) idxMaks = i; });

    w.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Kalender Kunjungan</h2><div class="sub">Intensitas kunjungan per hari.</div></div>
          <div class="btn-group mr-8">
            <button class="btn btn-sm ${kelasAktif('total')}" data-m="total">Total</button>
            <button class="btn btn-sm ${kelasAktif('umum')}" data-m="umum">Umum</button>
            <button class="btn btn-sm ${kelasAktif('gigi')}" data-m="gigi">Gigi</button>
          </div>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" id="hmPrev">‹</button>
            <input type="month" id="hmBulan" class="control-auto" value="${ovBulanHeatmap}">
            <button class="btn btn-secondary btn-sm" id="hmNext">›</button>
          </div>
        </div>
        <div class="card-body">
          <div class="heatmap-grid mb-4">
            ${UI.HARI.map(h => `<div class="text-center text-muted text-xs">${h.slice(0, 3)}</div>`).join('')}
          </div>
          <div class="heatmap-grid">
            ${Array(offset).fill('<div></div>').join('')}
            ${tanggalList.map((t, i) => {
              if (t > hari) {
                return `<div class="heat-cell heat-future">${i + 1}</div>`;
              }
              const level = nilai[i] === 0 ? 0 : Math.min(4, Math.ceil(nilai[i] / maks * 4));
              return `<div title="${UI.tglIndo(t)}: ${nilai[i]}" class="heat-cell heat-${level}">${i + 1}</div>`;
            }).join('')}
          </div>
          <div class="grid grid-3 mt-16">
            <div class="stat"><div class="lbl">Total bulan ini</div><div class="val tabular">${totalBulan}</div></div>
            <div class="stat"><div class="lbl">Hari ada kunjungan</div>
              <div class="val tabular">${hariAktif}/${hariBerjalan}</div></div>
            <div class="stat"><div class="lbl">Tersibuk</div>
              <div class="val tabular">${idxMaks >= 0 ? nilai[idxMaks] : '—'}</div>
              <div class="hint">${idxMaks >= 0 ? UI.tglIndo(tanggalList[idxMaks]) : ''}</div></div>
          </div>
        </div>
      </div>`;

    w.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
      ovMetrikHeatmap = b.dataset.m; gambarHeatmap(w, data);
    }));
    w.querySelector('#hmPrev').addEventListener('click', () => { ovBulanHeatmap = UI.geserBulan(ovBulanHeatmap, -1); gambarHeatmap(w, data); });
    w.querySelector('#hmNext').addEventListener('click', () => { ovBulanHeatmap = UI.geserBulan(ovBulanHeatmap, 1); gambarHeatmap(w, data); });
    w.querySelector('#hmBulan').addEventListener('change', (e) => { ovBulanHeatmap = e.target.value; gambarHeatmap(w, data); });
  }

  /* ---- E. Pola jam kunjungan (Chart.js bar, per bulan) ----------------- */
  async function gambarJam(w, data) {
    if (!data.monthKeys.includes(ovBulanJam)) ovBulanJam = data.monthKeys[data.monthKeys.length - 1];
    const rows = data.kunjungan.filter(k => LaporanCore.kunciBulan(k.tanggal) === ovBulanJam);
    const rekap = LaporanCore.rekapJamKunjungan(rows);
    const labelJam = [];
    for (let j = rekap.jamAwal; j < rekap.jamAkhir; j++) {
      labelJam.push(`${String(j).padStart(2, '0')}–${String(j + 1).padStart(2, '0')}`);
    }
    let idxSibuk = -1;
    rekap.ember.forEach((v, i) => { if (idxSibuk < 0 || v > rekap.ember[idxSibuk]) idxSibuk = i; });

    w.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Pola Jam Kunjungan</h2>
            <div class="sub">Pukul ${rekap.jamAwal}.00–${rekap.jamAkhir}.00, seluruh poli.</div></div>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" id="jamPrev">‹</button>
            <input type="month" id="jamBulan" class="control-auto" value="${ovBulanJam}">
            <button class="btn btn-secondary btn-sm" id="jamNext">›</button>
          </div>
        </div>
        <div class="card-body">
          <div id="jamGrafikBox" class="chart-box"><canvas id="jamCanvas"></canvas></div>
          <div class="grid grid-4 mt-16">
            <div class="stat"><div class="lbl">Terpetakan</div><div class="val tabular">${rekap.terhitung}/${rekap.total}</div></div>
            <div class="stat"><div class="lbl">Jam tersibuk</div>
              <div class="val tabular">${idxSibuk >= 0 ? labelJam[idxSibuk] : '—'}</div>
              <div class="hint">${idxSibuk >= 0 ? rekap.ember[idxSibuk] + ' kunjungan' : ''}</div></div>
            <div class="stat"><div class="lbl">Rata-rata/slot jam</div>
              <div class="val tabular">${rekap.ember.length ? (rekap.terhitung / rekap.ember.length).toFixed(1) : '0'}</div></div>
            <div class="stat"><div class="lbl">Tanpa jam tercatat</div><div class="val tabular">${rekap.tanpaJam}</div></div>
          </div>
        </div>
      </div>`;

    w.querySelector('#jamPrev').addEventListener('click', () => { ovBulanJam = UI.geserBulan(ovBulanJam, -1); gambarJam(w, data); });
    w.querySelector('#jamNext').addEventListener('click', () => { ovBulanJam = UI.geserBulan(ovBulanJam, 1); gambarJam(w, data); });
    w.querySelector('#jamBulan').addEventListener('change', (e) => { ovBulanJam = e.target.value; gambarJam(w, data); });

    if (await siapkanChart()) {
      const warnaBar = rekap.ember.map((v, i) => i === idxSibuk ? '#085048' : '#0F8B7E');
      buatGrafik('jam', w.querySelector('#jamCanvas'), {
        type: 'bar',
        data: { labels: labelJam, datasets: [{ label: 'Kunjungan', data: rekap.ember, backgroundColor: warnaBar }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { title: (items) => 'Pukul ' + items[0].label } } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    } else {
      w.querySelector('#jamGrafikBox').innerHTML =
        '<div class="banner warn"><div>Grafik tidak dapat dimuat tanpa koneksi internet.</div></div>';
    }
  }

  /* ---- F. Kinerja dokter (daftar peringkat, per bulan) ------------------ */
  function gambarDokter(w, data) {
    if (!data.monthKeys.includes(ovBulanDokter)) ovBulanDokter = data.monthKeys[data.monthKeys.length - 1];
    const rows = data.kunjungan.filter(k => LaporanCore.kunciBulan(k.tanggal) === ovBulanDokter);
    const daftar = LaporanCore.rekapDokter(rows);
    const diisi = daftar.filter(d => !d.kosong);
    const totalPasien = daftar.reduce((a, d) => a + d.jml, 0);
    const totalDiisi = diisi.reduce((a, d) => a + d.jml, 0);
    const maks = Math.max(1, ...daftar.map(d => d.jml));

    w.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Kinerja Dokter</h2><div class="sub">${UI.labelBulan(ovBulanDokter)}</div></div>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" id="dokPrev">‹</button>
            <input type="month" id="dokBulan" class="control-auto" value="${ovBulanDokter}">
            <button class="btn btn-secondary btn-sm" id="dokNext">›</button>
          </div>
        </div>
        <div class="card-body">
          ${!daftar.length ? '<p class="text-muted mb-0">Belum ada kunjungan bulan ini.</p>' : daftar.map((d, i) => `
            <div class="mb-12">
              <div class="flex justify-between items-center gap-8 mb-8">
                <div class="flex items-center gap-8 min-w-0">
                  <span class="badge badge-num ${i < 3 && !d.kosong ? 'b-ok' : 'b-umum'}">${i + 1}</span>
                  <b>${UI.esc(d.nama)}</b>
                  <span class="badge ${badgePoliKelas(d.jenisPoli)}">${UI.esc(d.jenisPoli)}</span>
                </div>
                <b class="tabular">${d.jml} <span class="text-muted text-xs">(${totalPasien ? Math.round(d.jml / totalPasien * 100) : 0}%)</span></b>
              </div>
              <div class="bar-track">
                <div class="bar-fill${d.kosong ? ' muted' : ''}" style="width:${d.jml / maks * 100}%"></div>
              </div>
            </div>`).join('')}
          ${daftar.length ? `<div class="grid grid-3 mt-16">
            <div class="stat"><div class="lbl">Total diperiksa</div><div class="val tabular">${totalPasien}</div></div>
            <div class="stat"><div class="lbl">Dokter bertugas</div><div class="val tabular">${diisi.length}</div></div>
            <div class="stat"><div class="lbl">Rata-rata/dokter</div>
              <div class="val tabular">${diisi.length ? (totalDiisi / diisi.length).toFixed(1) : '0'}</div></div>
          </div>` : ''}
        </div>
      </div>`;

    w.querySelector('#dokPrev').addEventListener('click', () => { ovBulanDokter = UI.geserBulan(ovBulanDokter, -1); gambarDokter(w, data); });
    w.querySelector('#dokNext').addEventListener('click', () => { ovBulanDokter = UI.geserBulan(ovBulanDokter, 1); gambarDokter(w, data); });
    w.querySelector('#dokBulan').addEventListener('change', (e) => { ovBulanDokter = e.target.value; gambarDokter(w, data); });
  }

  /* ---- G. Enam grafik performa 6 bulan (Chart.js) ---------------------- */
  function grafikBox(kunci, judul) {
    return `<div class="card"><div class="card-head"><h2>${UI.esc(judul)}</h2></div>
      <div class="card-body"><div id="grafik-box-${kunci}" class="chart-box tall">
        <canvas id="grafik-${kunci}"></canvas></div></div></div>`;
  }

  async function gambarGrafikBulanan(w, data) {
    const mk = data.monthKeys;
    const labels = mk.map(LaporanCore.labelBulanPendek);
    const kv = LaporanCore.rekapPerBulan(data.kunjungan, mk);
    const rj = LaporanCore.rekapRujukanPerBulan(data.rujukan, mk);
    const um = LaporanCore.rekapUangMasukPerBulan(data.pembayaran, mk, true);

    w.innerHTML =
      grafikBox('kunjunganBulan', 'Kunjungan per Bulan (Umum / Gigi / KIA)') +
      grafikBox('pendapatanBulan', 'Uang Masuk per Bulan (Umum vs Gigi)') +
      grafikBox('bpjsBulan', 'BPJS vs Non-BPJS per Bulan') +
      grafikBox('baruLamaBulan', 'Pasien Baru vs Lama per Bulan') +
      grafikBox('rujukanBulan', 'Rujukan per Bulan');

    if (!(await siapkanChart())) {
      w.innerHTML = '<div class="banner warn"><div>Grafik tidak dapat dimuat tanpa koneksi internet.</div></div>';
      return;
    }

    buatGrafik('kunjunganBulan', w.querySelector('#grafik-kunjunganBulan'), {
      type: 'bar',
      data: {
        labels, datasets: [
          { label: 'Umum', data: kv.map(x => x.umum), backgroundColor: '#1D4ED8' },
          { label: 'Gigi', data: kv.map(x => x.gigi), backgroundColor: '#6D28D9' },
          { label: 'KIA', data: kv.map(x => x.kia), backgroundColor: '#B45309' }
        ]
      },
      options: OPSI_BAR
    });

    buatGrafik('pendapatanBulan', w.querySelector('#grafik-pendapatanBulan'), {
      type: 'bar',
      data: {
        labels, datasets: [
          { label: 'Umum', data: um.map(x => x.umum), backgroundColor: '#15803D' },
          { label: 'Gigi', data: um.map(x => x.gigi), backgroundColor: '#B45309' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${UI.rupiah(i.raw)}` } }
        },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => ringkasRp(v) } } }
      }
    });

    buatGrafik('bpjsBulan', w.querySelector('#grafik-bpjsBulan'), {
      type: 'bar',
      data: {
        labels, datasets: [
          { label: 'BPJS', data: kv.map(x => x.bpjs), backgroundColor: '#0F8B7E' },
          { label: 'Non-BPJS', data: kv.map(x => x.nonBpjs), backgroundColor: '#94A3B8' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
      }
    });

    buatGrafik('baruLamaBulan', w.querySelector('#grafik-baruLamaBulan'), {
      type: 'bar',
      data: {
        labels, datasets: [
          { label: 'Baru', data: kv.map(x => x.baru), backgroundColor: '#15803D' },
          { label: 'Lama', data: kv.map(x => x.lama), backgroundColor: '#CBD5E1' }
        ]
      },
      options: OPSI_BAR
    });

    buatGrafik('rujukanBulan', w.querySelector('#grafik-rujukanBulan'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Rujukan', data: rj.map(x => x.jumlah), backgroundColor: '#1D4ED8' }] },
      options: { ...OPSI_BAR, plugins: { legend: { display: false } } }
    });
  }

  /* ==================================================================== */
  /*  TAB 3 — RUJUKAN                                                     */
  /* ==================================================================== */

  const KOLOM_RUJUKAN = [
    ['tanggal', 'Tanggal'], ['no_rm', 'No RM'], ['nama_pasien', 'Nama Pasien'],
    ['no_bpjs', 'No BPJS'], ['no_hp', 'No HP'], ['nama_poli_asal', 'Poli Asal'], ['nama_dokter', 'Dokter'],
    ['jenis_rujukan', 'Jenis Rujukan', r => LaporanCore.labelJenisRujukan(r.jenis_rujukan)],
    ['tujuan', 'Tujuan', r => LaporanCore.tujuanRujukan(r).teks],
    ['rujuk_alasan', 'Alasan'], ['daftar_diagnosa', 'Diagnosa']
  ];

  function badgeRujukanKelas(kode) {
    if (kode === 'RUJUK_IGD') return 'b-danger';
    if (kode === 'RUJUK_LANJUT') return 'b-bpjs';
    return 'b-info';
  }

  async function tabRujukan(w) {
    const akhir = UI.hariIni();
    const awal = UI.bulanIni() + '-01';
    w.innerHTML = `
      <div class="card mb-16"><div class="card-body">
        <div class="flex items-center gap-12 flex-wrap">
          <div class="flex items-center gap-8 periode-group">
            <label class="mb-0">Periode</label>
            <input type="date" id="rjDari" value="${awal}" class="control-auto">
            <span class="text-muted">s.d.</span>
            <input type="date" id="rjSampai" value="${akhir}" class="control-auto">
          </div>
          <select id="rjJenis" class="control-auto">
            <option value="">Semua jenis rujukan</option>
            <option value="RUJUK_INTERNAL">Rujukan Internal</option>
            <option value="RUJUK_LANJUT">Rujukan Lanjut (BPJS)</option>
            <option value="RUJUK_IGD">Rujukan IGD</option>
          </select>
          <button class="btn btn-primary btn-sm" id="rjTampil">Tampilkan</button>
          <div class="search-box min-w-200">
            <span class="ico">${UI.ikon('cari', 16)}</span>
            <input type="search" id="rjCari" placeholder="Cari nama, no. RM, atau no. BPJS…">
          </div>
          <div class="flex-1"></div>
          <button class="btn btn-secondary btn-sm" id="rjUnduh">${UI.ikon('unduh', 15)} Unduh CSV</button>
        </div>
      </div></div>
      <div id="rjIsi">${UI.memuat(4)}</div>`;

    let rows = [];
    const muat = async () => {
      const dari = w.querySelector('#rjDari').value, sampai = w.querySelector('#rjSampai').value;
      const isi = w.querySelector('#rjIsi');
      isi.innerHTML = UI.memuat(4);
      try {
        rows = await DB.laporanRujukan({ dari, sampai });
        saring();
      } catch (e) { isi.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`; }
    };

    const saring = () => {
      const jenis = w.querySelector('#rjJenis').value;
      const q = w.querySelector('#rjCari').value.trim().toLowerCase();
      let tampil = rows;
      if (jenis) tampil = tampil.filter(r => r.jenis_rujukan === jenis);
      if (q) tampil = tampil.filter(r =>
        (r.nama_pasien || '').toLowerCase().includes(q) ||
        (r.no_rm || '').toLowerCase().includes(q) ||
        (r.no_bpjs || '').includes(q));
      gambarRujukan(w.querySelector('#rjIsi'), tampil);
    };

    w.querySelector('#rjTampil').addEventListener('click', muat);
    w.querySelector('#rjJenis').addEventListener('change', saring);
    w.querySelector('#rjCari').addEventListener('input', UI.tunda(saring, 250));
    w.querySelector('#rjUnduh').addEventListener('click', () => unduhCsv(rows, KOLOM_RUJUKAN,
      `rujukan_${w.querySelector('#rjDari').value}_sd_${w.querySelector('#rjSampai').value}.csv`));

    await muat();
  }

  function gambarRujukan(w, rows) {
    if (!rows.length) { w.innerHTML = UI.kosong('Tidak ada rujukan', 'Tidak ada rujukan pada periode dan filter ini.'); return; }
    w.innerHTML = `
      <div class="card"><div class="card-body tight"><div class="table-wrap"><table>
        <thead><tr><th>Tanggal</th><th>Pasien</th><th>Poli / Dokter</th><th>Jenis</th><th>Tujuan</th><th>Diagnosa</th></tr></thead>
        <tbody>${rows.map(r => {
          const t = LaporanCore.tujuanRujukan(r);
          return `<tr>
            <td>${UI.tglPendek(r.tanggal)}</td>
            <td><b>${UI.esc(r.nama_pasien)}</b><div class="text-muted mono text-xs">${UI.esc(r.no_rm)}</div></td>
            <td>${UI.esc(r.nama_poli_asal || '—')}${r.nama_dokter ? '<div class="text-muted text-xs">' + UI.esc(r.nama_dokter) + '</div>' : ''}</td>
            <td><span class="badge ${badgeRujukanKelas(r.jenis_rujukan)}">${UI.esc(LaporanCore.labelJenisRujukan(r.jenis_rujukan))}</span></td>
            <td>${UI.esc(t.teks)}${t.rinci.length ? '<div class="text-muted text-xs">' + t.rinci.map(x => UI.esc(x)).join(' · ') + '</div>' : ''}</td>
            <td>${UI.esc(r.daftar_diagnosa || '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div></div></div>`;
  }

  /* ==================================================================== */
  /*  TAB 4 — REGISTER POLI                                               */
  /* ==================================================================== */

  const KOLOM_REGISTER = [
    ['tanggal', 'Tanggal'], ['no_kunjungan', 'No Kunjungan'], ['no_rm', 'No RM'], ['nama_pasien', 'Nama Pasien'],
    ['jenis_kelamin', 'L/P'], ['tanggal_lahir', 'Tanggal Lahir'], ['cara_bayar', 'Cara Bayar'],
    ['nama_poli', 'Poli'], ['nama_dokter', 'Dokter'], ['daftar_diagnosa', 'Diagnosa'], ['status', 'Status']
  ];

  async function tabRegister(w) {
    const akhir = UI.hariIni();
    const awal = UI.bulanIni() + '-01';
    w.innerHTML = `
      <div class="card mb-16"><div class="card-body">
        <div class="flex items-center gap-12 flex-wrap">
          <div class="flex items-center gap-8 periode-group">
            <label class="mb-0">Periode</label>
            <input type="date" id="rgDari" value="${awal}" class="control-auto">
            <span class="text-muted">s.d.</span>
            <input type="date" id="rgSampai" value="${akhir}" class="control-auto">
          </div>
          <select id="rgPoli" class="control-auto">
            <option value="">Semua poli</option>
            <option value="UMUM">Poli Umum</option>
            <option value="GIGI">Poli Gigi</option>
            <option value="KIA">Poli KIA</option>
          </select>
          <button class="btn btn-primary btn-sm" id="rgTampil">Tampilkan</button>
          <div class="search-box min-w-200">
            <span class="ico">${UI.ikon('cari', 16)}</span>
            <input type="search" id="rgCari" placeholder="Cari nama atau no. RM…">
          </div>
          <div class="flex-1"></div>
          <button class="btn btn-secondary btn-sm" id="rgUnduh">${UI.ikon('unduh', 15)} Unduh CSV</button>
        </div>
      </div></div>
      <div id="rgIsi">${UI.memuat(4)}</div>`;

    let rows = [], tindakanPeta = {};
    const muat = async () => {
      const dari = w.querySelector('#rgDari').value, sampai = w.querySelector('#rgSampai').value;
      const jenisPoli = w.querySelector('#rgPoli').value;
      const isi = w.querySelector('#rgIsi');
      isi.innerHTML = UI.memuat(4);
      try {
        rows = await DB.laporanRegisterPoli({ dari, sampai, jenisPoli });
        tindakanPeta = {};
        if (jenisPoli === 'GIGI' && rows.length) {
          const daftarTindakan = await DB.laporanTindakanUntukKunjungan(rows.map(r => r.id));
          daftarTindakan.forEach(t => {
            (tindakanPeta[t.kunjungan_id] = tindakanPeta[t.kunjungan_id] || []).push(t.nama);
          });
        }
        saring();
      } catch (e) { isi.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`; }
    };

    const saring = () => {
      const q = w.querySelector('#rgCari').value.trim().toLowerCase();
      const tampil = q ? rows.filter(r =>
        (r.nama_pasien || '').toLowerCase().includes(q) || (r.no_rm || '').toLowerCase().includes(q)) : rows;
      gambarRegister(w.querySelector('#rgIsi'), tampil, tindakanPeta, w.querySelector('#rgPoli').value);
    };

    w.querySelector('#rgTampil').addEventListener('click', muat);
    w.querySelector('#rgPoli').addEventListener('change', muat);
    w.querySelector('#rgCari').addEventListener('input', UI.tunda(saring, 250));
    w.querySelector('#rgUnduh').addEventListener('click', () => {
      const jenisPoli = w.querySelector('#rgPoli').value;
      const kolom = jenisPoli === 'GIGI'
        ? [...KOLOM_REGISTER, ['tindakan', 'Tindakan', r => (tindakanPeta[r.id] || []).join('; ')]]
        : KOLOM_REGISTER;
      unduhCsv(rows, kolom, `register-poli_${w.querySelector('#rgDari').value}_sd_${w.querySelector('#rgSampai').value}.csv`);
    });

    await muat();
  }

  function gambarRegister(w, rows, tindakanPeta, jenisPoli) {
    if (!rows.length) { w.innerHTML = UI.kosong('Tidak ada kunjungan', 'Tidak ada kunjungan pada periode dan filter ini.'); return; }
    const tampilTindakan = jenisPoli === 'GIGI';
    w.innerHTML = `
      <div class="card"><div class="card-body tight"><div class="table-wrap"><table>
        <thead><tr><th>Tanggal</th><th>No Kunjungan</th><th>Pasien</th><th>L/P</th><th>Cara Bayar</th>
          <th>Poli</th><th>Dokter</th>${tampilTindakan ? '<th>Tindakan</th>' : ''}<th>Diagnosa</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${UI.tglPendek(r.tanggal)}</td>
          <td class="mono text-xs">${UI.esc(r.no_kunjungan)}</td>
          <td><b>${UI.esc(r.nama_pasien)}</b><div class="text-muted mono text-xs">${UI.esc(r.no_rm)}</div></td>
          <td>${UI.esc(r.jenis_kelamin || '—')}</td>
          <td>${UI.badgeBayar(r.cara_bayar)}</td>
          <td>${UI.esc(r.nama_poli)}</td>
          <td>${UI.esc(r.nama_dokter || '—')}</td>
          ${tampilTindakan ? `<td>${(tindakanPeta[r.id] || []).map(x => UI.esc(x)).join('; ') || '—'}</td>` : ''}
          <td>${UI.esc(r.daftar_diagnosa || '—')}</td>
        </tr>`).join('')}</tbody>
      </table></div></div></div>`;
  }

  /* ==================================================================== */
  /*  TAB 5 — KEUANGAN                                                    */
  /* ==================================================================== */

  const KOLOM_KEUANGAN_HARIAN = [
    ['tanggal', 'Tanggal'], ['nilaiLayanan', 'Nilai Layanan'], ['ditagih', 'Ditagih'], ['uangMasuk', 'Uang Masuk']
  ];

  /* Gabungan per-hari nilai_layanan (tagihan) & uang_masuk (pembayaran) —
     murni penjumlahan per kunci tanggal, bukan aturan bisnis yang mudah
     salah (beda dengan kategoriUsia atau jam_daftar), jadi cukup di sini
     tanpa perlu diuji terpisah di laporan_core.js. */
  function gabungKeuanganHarian(tagihan, pembayaran) {
    const peta = new Map();
    const ambil = (t) => {
      if (!peta.has(t)) peta.set(t, { tanggal: t, nilaiLayanan: 0, ditagih: 0, uangMasuk: 0 });
      return peta.get(t);
    };
    (tagihan || []).forEach(r => {
      const a = ambil(r.tanggal);
      a.nilaiLayanan += Number(r.nilai_layanan) || 0;
      a.ditagih += Number(r.ditagih) || 0;
    });
    (pembayaran || []).forEach(r => { ambil(r.tanggal).uangMasuk += Number(r.uang_masuk) || 0; });
    return Array.from(peta.values()).sort((a, b) => a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0);
  }

  function rekapPerKunci(rows, kunci, medan) {
    const peta = new Map();
    (rows || []).forEach(r => {
      const k = r[kunci] || '—';
      if (!peta.has(k)) peta.set(k, Object.fromEntries(medan.map(m => [m, 0])));
      const acc = peta.get(k);
      medan.forEach(m => { acc[m] += Number(r[m]) || 0; });
    });
    return Array.from(peta.entries()).map(([k, v]) => ({ kunci: k, ...v }));
  }

  async function tabKeuangan(w) {
    const akhir = UI.hariIni();
    const awal = UI.bulanIni() + '-01';
    w.innerHTML = `
      <div class="card mb-16"><div class="card-body">
        <div class="flex items-center gap-12 flex-wrap">
          <div class="flex items-center gap-8 periode-group">
            <label class="mb-0">Periode</label>
            <input type="date" id="kuDari" value="${awal}" class="control-auto">
            <span class="text-muted">s.d.</span>
            <input type="date" id="kuSampai" value="${akhir}" class="control-auto">
          </div>
          <button class="btn btn-primary btn-sm" id="kuTampil">Tampilkan</button>
          <div class="flex-1"></div>
          <button class="btn btn-secondary btn-sm" id="kuUnduh">${UI.ikon('unduh', 15)} Unduh CSV</button>
        </div>
      </div></div>
      <div id="kuIsi">${UI.memuat(4)}</div>`;

    let harian = [];
    const muat = async () => {
      const dari = w.querySelector('#kuDari').value, sampai = w.querySelector('#kuSampai').value;
      const isi = w.querySelector('#kuIsi');
      isi.innerHTML = UI.memuat(4);
      try {
        const [tagihan, pembayaran] = await Promise.all([
          DB.laporanKeuanganTagihan({ dari, sampai }),
          DB.laporanKeuanganPembayaran({ dari, sampai })
        ]);
        harian = gabungKeuanganHarian(tagihan, pembayaran);
        gambarKeuangan(isi, tagihan, pembayaran, harian);
      } catch (e) { isi.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`; }
    };

    w.querySelector('#kuTampil').addEventListener('click', muat);
    w.querySelector('#kuUnduh').addEventListener('click', () => unduhCsv(harian, KOLOM_KEUANGAN_HARIAN,
      `keuangan_${w.querySelector('#kuDari').value}_sd_${w.querySelector('#kuSampai').value}.csv`));

    await muat();
  }

  function gambarKeuangan(w, tagihan, pembayaran, harian) {
    const totalNilai = tagihan.reduce((a, r) => a + (Number(r.nilai_layanan) || 0), 0);
    const totalDitagih = tagihan.reduce((a, r) => a + (Number(r.ditagih) || 0), 0);
    const totalDibayar = tagihan.reduce((a, r) => a + (Number(r.sudah_dibayar) || 0), 0);
    const totalMasuk = pembayaran.reduce((a, r) => a + (Number(r.uang_masuk) || 0), 0);

    const perPoli = rekapPerKunci(tagihan, 'jenis_poli', ['nilai_layanan', 'ditagih']);
    const perPoliMasuk = rekapPerKunci(pembayaran, 'jenis_poli', ['uang_masuk']);
    const perMetode = rekapPerKunci(pembayaran, 'metode', ['uang_masuk', 'jumlah_transaksi']);

    w.innerHTML = `
      <div class="banner info mb-16"><div>"Nilai layanan" adalah nilai seluruh tagihan pada periode ini —
        <b>termasuk</b> yang ditanggung BPJS dan tidak pernah masuk kas. "Uang masuk" adalah kas yang
        benar-benar diterima kasir. Keduanya konsep berbeda dan sengaja tidak dijumlahkan menjadi satu angka.</div></div>

      <div class="grid grid-4 mb-16">
        <div class="stat accent"><div class="lbl">Nilai Layanan</div><div class="val tabular">${UI.rupiah(totalNilai)}</div></div>
        <div class="stat"><div class="lbl">Ditagih ke Pasien</div><div class="val tabular">${UI.rupiah(totalDitagih)}</div></div>
        <div class="stat"><div class="lbl">Sudah Dibayar (Tagihan)</div><div class="val tabular">${UI.rupiah(totalDibayar)}</div></div>
        <div class="stat"><div class="lbl">Uang Masuk (Kas)</div><div class="val tabular">${UI.rupiah(totalMasuk)}</div></div>
      </div>

      <div class="split">
        <div class="card"><div class="card-head"><h2>Per Hari</h2></div>
          <div class="card-body tight"><div class="table-wrap"><table>
            <thead><tr><th>Tanggal</th><th class="text-right">Nilai Layanan</th>
              <th class="text-right">Ditagih</th><th class="text-right">Uang Masuk</th></tr></thead>
            <tbody>${harian.length ? harian.map(h => `<tr>
              <td>${UI.tglPendek(h.tanggal)}</td>
              <td class="text-right tabular">${UI.rupiah(h.nilaiLayanan)}</td>
              <td class="text-right tabular">${UI.rupiah(h.ditagih)}</td>
              <td class="text-right tabular">${UI.rupiah(h.uangMasuk)}</td>
            </tr>`).join('') : '<tr><td colspan="4" class="text-muted text-center">Tidak ada data.</td></tr>'}</tbody>
          </table></div></div></div>
        <div>
          <div class="card mb-16"><div class="card-head"><h2>Per Poli</h2></div>
            <div class="card-body tight"><div class="table-wrap"><table>
              <thead><tr><th>Poli</th><th class="text-right">Nilai Layanan</th><th class="text-right">Uang Masuk</th></tr></thead>
              <tbody>${perPoli.length ? perPoli.map(p => {
                const masuk = perPoliMasuk.find(m => m.kunci === p.kunci);
                return `<tr><td>${UI.esc(p.kunci)}</td>
                  <td class="text-right tabular">${UI.rupiah(p.nilai_layanan)}</td>
                  <td class="text-right tabular">${UI.rupiah(masuk ? masuk.uang_masuk : 0)}</td></tr>`;
              }).join('') : '<tr><td colspan="3" class="text-muted text-center">Tidak ada data.</td></tr>'}</tbody>
            </table></div></div></div>
          <div class="card"><div class="card-head"><h2>Per Metode Pembayaran</h2></div>
            <div class="card-body tight"><div class="table-wrap"><table>
              <thead><tr><th>Metode</th><th class="text-right">Uang Masuk</th><th class="text-right">Transaksi</th></tr></thead>
              <tbody>${perMetode.length ? perMetode.map(m => `<tr><td>${UI.esc(m.kunci)}</td>
                <td class="text-right tabular">${UI.rupiah(m.uang_masuk)}</td>
                <td class="text-right tabular">${m.jumlah_transaksi}</td></tr>`).join('')
                : '<tr><td colspan="3" class="text-muted text-center">Tidak ada data.</td></tr>'}</tbody>
            </table></div></div></div>
        </div>
      </div>`;
  }

  /* ==================================================================== */
  /*  TAB 6 — PUSKESMAS                                                   */
  /* ==================================================================== */

  function kolomPuskesmas() {
    return [
      ['kode', 'Kode ICD-10'], ['nama', 'Nama Diagnosa'], ['total', 'Total'], ['L', 'L'], ['P', 'P'],
      ...LaporanCore.KATEGORI_USIA.map(k => [k, k, r => r.perKategori[k]])
    ];
  }

  async function tabPuskesmas(w) {
    const akhir = UI.hariIni();
    const awal = UI.bulanIni() + '-01';
    w.innerHTML = `
      <div class="card mb-16"><div class="card-body">
        <div class="flex items-center gap-12 flex-wrap">
          <div class="flex items-center gap-8 periode-group">
            <label class="mb-0">Periode</label>
            <input type="date" id="pkDari" value="${awal}" class="control-auto">
            <span class="text-muted">s.d.</span>
            <input type="date" id="pkSampai" value="${akhir}" class="control-auto">
          </div>
          <button class="btn btn-primary btn-sm" id="pkTampil">Tampilkan</button>
          <div class="search-box min-w-200">
            <span class="ico">${UI.ikon('cari', 16)}</span>
            <input type="search" id="pkCari" placeholder="Cari kode atau nama diagnosa…">
          </div>
          <div class="flex-1"></div>
          <button class="btn btn-secondary btn-sm" id="pkUnduh">${UI.ikon('unduh', 15)} Unduh CSV</button>
        </div>
      </div></div>
      <div id="pkIsi">${UI.memuat(4)}</div>`;

    let rekap = [];
    const muat = async () => {
      const dari = w.querySelector('#pkDari').value, sampai = w.querySelector('#pkSampai').value;
      const isi = w.querySelector('#pkIsi');
      isi.innerHTML = UI.memuat(4);
      try {
        const rows = await DB.laporanDiagnosaPuskesmas({ dari, sampai });
        rekap = LaporanCore.rekapPuskesmas(rows, sampai);
        saring();
      } catch (e) { isi.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`; }
    };

    const saring = () => {
      const q = w.querySelector('#pkCari').value.trim().toLowerCase();
      const tampil = q ? rekap.filter(r => r.kode.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q)) : rekap;
      gambarPuskesmas(w.querySelector('#pkIsi'), tampil);
    };

    w.querySelector('#pkTampil').addEventListener('click', muat);
    w.querySelector('#pkCari').addEventListener('input', UI.tunda(saring, 250));
    w.querySelector('#pkUnduh').addEventListener('click', () => unduhCsv(rekap, kolomPuskesmas(),
      `puskesmas_${w.querySelector('#pkDari').value}_sd_${w.querySelector('#pkSampai').value}.csv`));

    await muat();
  }

  function gambarPuskesmas(w, rekap) {
    if (!rekap.length) { w.innerHTML = UI.kosong('Tidak ada diagnosa', 'Tidak ada diagnosa tercatat pada periode ini.'); return; }
    w.innerHTML = `
      <div class="card"><div class="card-body tight"><div class="table-wrap"><table>
        <thead><tr><th>Kode</th><th>Diagnosa</th><th class="text-right">Total</th><th class="text-right">L</th><th class="text-right">P</th>
          ${LaporanCore.KATEGORI_USIA.map(k => `<th class="text-right">${UI.esc(k)}</th>`).join('')}</tr></thead>
        <tbody>${rekap.map(r => `<tr>
          <td class="mono text-xs">${UI.esc(r.kode)}</td><td>${UI.esc(r.nama)}</td>
          <td class="text-right tabular"><b>${r.total}</b></td>
          <td class="text-right tabular">${r.L}</td><td class="text-right tabular">${r.P}</td>
          ${LaporanCore.KATEGORI_USIA.map(k => `<td class="text-right tabular">${r.perKategori[k] || 0}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table></div></div></div>`;
  }

  return { render };
})();

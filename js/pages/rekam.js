/* ===================== REKAM MEDIS (TAMPILAN & CETAK) ===================== */
const Rekam = (() => {

  const LABEL_LANJUT = {
    SELESAI: 'Selesai — pasien pulang', KONTROL: 'Kontrol kembali',
    RUJUK_INTERNAL: 'Rujuk poli lain', RUJUK_LANJUT: 'Rujuk ke FKRTL',
    RUJUK_IGD: 'Rujuk IGD / emergensi'
  };

  /* ---------------- Satu kunjungan ---------------- */
  async function render(el, param) {
    const id = param && param[0];
    if (!id) { el.innerHTML = UI.kosong('Kunjungan tidak dipilih', 'Buka dari daftar riwayat.'); return; }

    const rm = await DB.rekamMedisLengkap(id);
    const k = rm.kunjungan;
    const alergi = await DB.alergiPasien(k.pasien_id);

    /* Penunjang sengaja diambil terpisah dari rekamMedisLengkap(): hasil lab
       sering baru masuk setelah dokter mengunci rekam medis, jadi bagian ini
       memang harus dibaca ulang setiap kali halaman dibuka. */
    const [labRM, bacaanRM, arsipRM] = await Promise.all([
      DB.labKunjungan(id).catch(() => []),
      DB.penunjangKunjungan(id).catch(() => []),
      DB.lampiranKunjungan(id).catch(() => [])
    ]);

    const poliGigi = k.poli?.jenis === 'GIGI';
    let gigiRef = [], kondisiRef = [], odoSaatItu = {}, bacaanGigi = {};
    if (poliGigi) {
      [gigiRef, kondisiRef, odoSaatItu, bacaanGigi] = await Promise.all([
        DB.refGigi(), DB.refKondisiGigi(),
        DB.odontogramPadaKunjungan(k.pasien_id, k.id,
          k.waktu_selesai || k.waktu_periksa || null),
        DB.gigiBerbacaan(k.pasien_id).catch(() => ({}))
      ]);
      /* Odontogram di sini sengaja direkonstruksi sesuai keadaan SAAT
         kunjungan. Tanda bacaan rontgen harus ikut aturan yang sama, kalau
         tidak rekam medis bulan Maret yang dicetak hari ini akan menandai
         gigi karena foto yang baru dibuat bulan Juni. */
      Object.keys(bacaanGigi).forEach(fdi => {
        const sampai = bacaanGigi[fdi].filter(b => String(b.tanggal) <= String(k.tanggal));
        if (sampai.length) bacaanGigi[fdi] = sampai; else delete bacaanGigi[fdi];
      });
    }
    DB.catatAkses(k.pasien_id, 'Melihat rekam medis kunjungan ' + k.no_kunjungan);

    const f = await DB.faskes().catch(() => ({ nama: CONFIG.NAMA_KLINIK }));

    el.innerHTML = `
      <div class="no-print">
        <a href="#/pasien/${k.pasien_id}" class="btn btn-ghost btn-sm mb-12">
          ${UI.ikon('kembali',15)} Data pasien</a>
        ${Komponen.bilahPasien(k, alergi)}
        <div class="btn-group mb-16">
          <button class="btn btn-secondary btn-sm" onclick="window.print()">
            ${UI.ikon('cetak',15)} Cetak rekam medis</button>
          ${App.boleh(['dokter']) && !rm.pemeriksaan?.final
            ? `<a href="#/periksa/${k.id}" class="btn btn-primary btn-sm">Lanjutkan pemeriksaan</a>` : ''}
        </div>
      </div>

      <!-- Kop hanya muncul saat dicetak -->
      <div class="print-only" style="text-align:center;border-bottom:2px solid #000;
           padding-bottom:8px;margin-bottom:14px">
        <div style="font-size:16pt;font-weight:700">${UI.esc(f.nama)}</div>
        <div style="font-size:9pt">${UI.esc([f.alamat, f.kecamatan, f.kabupaten].filter(Boolean).join(', '))}</div>
        <div style="font-size:11pt;font-weight:600;margin-top:6px">REKAM MEDIS RAWAT JALAN</div>
      </div>
      <div class="print-only" style="font-size:10pt;margin-bottom:12px">
        <b>${UI.esc(k.pasien.nama)}</b> · No. RM ${UI.esc(k.pasien.no_rm)} ·
        ${k.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} ·
        ${UI.umurTeks(k.pasien.tanggal_lahir)} · ${UI.tglIndo(k.tanggal)} ·
        ${UI.esc(k.poli?.nama)} · ${UI.esc(k.cara_bayar)}
      </div>

      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Kunjungan ${UI.tglIndo(k.tanggal)}</h2>
            <div class="sub mono">${UI.esc(k.no_kunjungan)} · ${UI.esc(k.poli?.nama || '')}
              ${k.dokter ? ' · ' + UI.esc(k.dokter.nama) : ''}</div></div>
          ${UI.badgeStatus(k.status)}
        </div>
        <div class="card-body">

          <h3 class="mb-8">Kajian awal</h3>
          ${Komponen.kotakVital(rm.kajian)}
          ${rm.kajian ? `
            <div class="mt-12 text-sm">
              ${baris('Keluhan utama', rm.kajian.keluhan_utama)}
              ${baris('Riwayat penyakit sekarang', rm.kajian.riwayat_penyakit_sekarang)}
              ${baris('Riwayat penyakit dahulu', rm.kajian.riwayat_penyakit_dahulu)}
              ${baris('Riwayat alergi', rm.kajian.riwayat_alergi)}
              ${baris('Obat yang sedang diminum', rm.kajian.riwayat_pengobatan)}
              ${baris('Kesadaran', rm.kajian.kesadaran)}
              ${rm.kajian.skala_nyeri !== null && rm.kajian.skala_nyeri !== undefined
                ? baris('Skala nyeri', rm.kajian.skala_nyeri + '/10'
                    + (rm.kajian.lokasi_nyeri ? ' — ' + rm.kajian.lokasi_nyeri : '')) : ''}
              ${baris('Risiko jatuh', rm.kajian.risiko_jatuh)}
              ${rm.kajian.skrining_tb ? baris('Skrining TB', 'Ada gejala mengarah TB') : ''}
              ${baris('Catatan perawat', rm.kajian.catatan_perawat)}
            </div>` : ''}

          ${poliGigi ? `
            <div class="divider"></div>
            <h3 class="mb-8">Odontogram</h3>
            <div id="odoRekam"></div>
            ${rm.gigi ? `
              <div class="mt-12 text-sm">
                <b>Ekstra oral.</b>
                ${[['Wajah', rm.gigi.wajah], ['Kelenjar limfe', rm.gigi.kelenjar_limfe],
                   ['TMJ', rm.gigi.tmj], ['Bibir', rm.gigi.bibir],
                   ['Lain-lain', rm.gigi.ekstra_oral_lain]]
                  .filter(([, v]) => v).map(([a, b]) => `${a}: ${UI.esc(b)}`).join(' · ') || '—'}
                <br><b>Intra oral.</b>
                ${[['Mukosa pipi', rm.gigi.mukosa_pipi], ['Gusi', rm.gigi.gusi],
                   ['Lidah', rm.gigi.lidah], ['Palatum', rm.gigi.palatum],
                   ['Dasar mulut', rm.gigi.dasar_mulut], ['Oklusi', rm.gigi.oklusi],
                   ['Torus palatinus', rm.gigi.torus_palatinus],
                   ['Torus mandibularis', rm.gigi.torus_mandibularis],
                   ['Diastema', rm.gigi.diastema]]
                  .filter(([, v]) => v).map(([a, b]) => `${a}: ${UI.esc(b)}`).join(' · ') || '—'}
                ${rm.gigi.supernumerary ? '<br>Terdapat gigi berlebih (supernumerary).' : ''}
                <br><b>Kebersihan mulut.</b> ${UI.esc(rm.gigi.kebersihan_mulut || '—')}
                ${rm.gigi.ohis !== null && rm.gigi.ohis !== undefined ? ` (OHI-S ${rm.gigi.ohis})` : ''}
                · DMF-T ${rm.gigi.dmft ?? 0} (D ${rm.gigi.d_decay ?? 0}, M ${rm.gigi.m_missing ?? 0},
                F ${rm.gigi.f_filled ?? 0}) · def-t ${rm.gigi.deft ?? 0}
                ${rm.gigi.catatan ? `<br><b>Catatan.</b> ${UI.esc(rm.gigi.catatan)}` : ''}
              </div>` : ''}
          ` : ''}

          <div class="divider"></div>
          <h3 class="mb-8">Pemeriksaan dokter</h3>
          ${Komponen.blokSoap(rm.pemeriksaan)}

          <div class="divider"></div>
          <h3 class="mb-8">Diagnosa</h3>
          ${rm.diagnosa.length === 0
            ? '<p class="text-muted text-sm mb-0">Tidak ada diagnosa tercatat.</p>'
            : `<table class="tbl" style="border:1px solid var(--ink-200);border-radius:6px">
                <thead><tr><th style="width:90px">Kode</th><th>Diagnosa</th>
                  <th style="width:100px">Jenis</th><th style="width:80px">Kasus</th></tr></thead>
                <tbody>${rm.diagnosa.map(d => `<tr>
                  <td class="mono"><b>${UI.esc(d.kode_icd10)}</b></td>
                  <td>${UI.esc(d.nama)}</td>
                  <td>${d.jenis === 'PRIMER'
                    ? '<span class="badge b-bpjs">Primer</span>' : '<span class="badge b-umum">Sekunder</span>'}</td>
                  <td class="muted">${UI.esc(d.kasus)}</td></tr>`).join('')}</tbody></table>`}

          ${(rm.tindakan && rm.tindakan.length) ? `
            <div class="divider"></div>
            <h3 class="mb-8">Tindakan</h3>
            <table class="tbl" style="border:1px solid var(--ink-200);border-radius:6px">
              <thead><tr><th style="width:90px">Kode</th><th>Tindakan</th>
                <th style="width:80px">Gigi</th><th style="width:80px">Jumlah</th></tr></thead>
              <tbody>${rm.tindakan.map(t => `<tr>
                <td class="mono"><b>${UI.esc(t.kode_icd9)}</b></td>
                <td>${UI.esc(t.nama)}${t.catatan ? `<div class="text-xs text-muted">${UI.esc(t.catatan)}</div>` : ''}</td>
                <td class="mono">${UI.esc(t.fdi || '—')}</td>
                <td>${t.jumlah}</td></tr>`).join('')}</tbody></table>
          ` : ''}

          ${blokPenunjang(labRM, bacaanRM, arsipRM)}

          <div class="divider"></div>
          <h3 class="mb-8">Terapi / Resep</h3>
          ${!rm.resep || !rm.resep.item?.length
            ? '<p class="text-muted text-sm mb-0">Tidak ada obat diresepkan.</p>'
            : `<table class="tbl" style="border:1px solid var(--ink-200);border-radius:6px">
                <thead><tr><th>Obat</th><th style="width:110px">Jumlah</th><th style="width:240px">Aturan pakai</th></tr></thead>
                <tbody>${rm.resep.item.map(i => `<tr>
                  <td><b>${UI.esc(i.nama_obat)}</b></td>
                  <td>${UI.esc(String(i.jumlah))} ${UI.esc(i.satuan || '')}</td>
                  <td>${UI.esc(i.signa || '-')}</td></tr>`).join('')}</tbody></table>`}

          <div class="divider"></div>
          <h3 class="mb-8">Tindak lanjut &amp; edukasi</h3>
          <div class="text-sm">
            ${baris('Rencana', LABEL_LANJUT[rm.pemeriksaan?.tindak_lanjut] || '—')}
            ${rm.pemeriksaan?.tanggal_kontrol ? baris('Tanggal kontrol', UI.tglIndo(rm.pemeriksaan.tanggal_kontrol)) : ''}
            ${baris('Dirujuk ke', rm.pemeriksaan?.rujuk_ke_faskes)}
            ${baris('Spesialis tujuan', rm.pemeriksaan?.rujuk_spesialis)}
            ${baris('Alasan rujukan', rm.pemeriksaan?.rujuk_alasan)}
            ${baris('Keadaan saat pulang', rm.pemeriksaan?.status_pulang)}
            ${baris('Prognosa', rm.pemeriksaan?.prognosa)}
            ${baris('Edukasi', rm.pemeriksaan?.edukasi)}
          </div>

          ${rm.addendum.length ? `
            <div class="divider"></div>
            <h3 class="mb-8">Addendum</h3>
            ${rm.addendum.map(a => `
              <div class="tl-card mb-8">
                <div class="text-xs text-muted">${UI.tglIndo(a.dibuat_pada)} ${UI.jam(a.dibuat_pada)}
                  · ${UI.esc(a.penulis?.nama || '')}${a.alasan ? ' · ' + UI.esc(a.alasan) : ''}</div>
                <div class="text-sm mt-8" style="white-space:pre-wrap">${UI.esc(a.isi)}</div>
              </div>`).join('')}` : ''}

          <div class="divider"></div>
          <div class="text-xs text-muted">
            Didaftarkan ${UI.tglIndo(k.waktu_daftar)} ${UI.jam(k.waktu_daftar)}
            ${k.waktu_kajian ? ` · Kajian awal ${UI.jam(k.waktu_kajian)}` : ''}
            ${k.waktu_periksa ? ` · Diperiksa ${UI.jam(k.waktu_periksa)}` : ''}
            ${k.waktu_selesai ? ` · Selesai ${UI.jam(k.waktu_selesai)}` : ''}
            ${rm.pemeriksaan?.final ? ` · <b>Dikunci ${UI.tglIndo(rm.pemeriksaan.final_pada)}
              ${UI.jam(rm.pemeriksaan.final_pada)}</b>` : ''}
          </div>

          <div class="print-only" style="margin-top:34px;text-align:right;font-size:10pt">
            Dokter pemeriksa,
            <div style="margin-top:52px;border-top:1px solid #000;display:inline-block;
                        padding-top:3px;min-width:200px">
              ${UI.esc(k.dokter?.nama || '')}${k.dokter?.no_sip ? '<br>SIP: ' + UI.esc(k.dokter.no_sip) : ''}
            </div>
          </div>
        </div>
      </div>

      ${statusBridging(k)}`;

    if (poliGigi) {
      const w = document.getElementById('odoRekam');
      if (w) {
        const umur = UI.umur(k.pasien.tanggal_lahir);
        Odontogram.buat(w, {
          kondisiRef, gigiRef, data: odoSaatItu, bacaan: bacaanGigi,
          umur: umur ? umur.tahun : null, bacaSaja: true
        });
      }
    }
  }

  const baris = (k, v) => v
    ? `<div style="display:flex;gap:12px;padding:4px 0">
        <span class="text-muted" style="width:190px;flex-shrink:0">${UI.esc(k)}</span>
        <span style="flex:1;white-space:pre-wrap">${UI.esc(v)}</span></div>` : '';

  /* ---------------- Pemeriksaan penunjang di rekam medis ----------------
     Ikut tercetak bersama rekam medis. Nilai di luar rujukan ditebalkan,
     nilai kritis diberi keterangan — pada lembar hitam putih itu satu-
     satunya cara membedakannya. */
  function blokPenunjang(lab, bacaan, arsip) {
    if (!lab.length && !bacaan.length && !arsip.length) return '';

    const blokLab = lab.filter(lp => lp.status !== 'BATAL').map(lp => {
      const isi = (lp.hasil || [])
        .filter(h => h.nilai_angka !== null || h.nilai_teks)
        .sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
      if (!isi.length) return '';
      return `
        <div class="text-xs text-muted mt-8">${UI.esc(lp.no_lab)} · ${UI.tglIndo(lp.tanggal)}
          ${lp.asal === 'EKSTERNAL'
            ? '· ' + UI.esc(lp.nama_lab_luar || 'lab luar')
              + (lp.no_lembar_luar ? ' no. ' + UI.esc(lp.no_lembar_luar) : '')
            : '· laboratorium klinik'}</div>
        <table class="tbl" style="border:1px solid var(--ink-200);border-radius:6px">
          <thead><tr><th>Pemeriksaan</th><th style="width:110px">Hasil</th>
            <th style="width:80px">Satuan</th><th style="width:150px">Nilai rujukan</th>
            <th style="width:110px">Tanda</th></tr></thead>
          <tbody>${isi.map(h => {
            const m = h.ref || {};
            const nilai = m.jenis_nilai === 'ANGKA'
              ? LabCore.formatNilai(h.nilai_angka, m.desimal) : (h.nilai_teks || '');
            const t = LabCore.TANDA[h.tanda] || {};
            return `<tr>
              <td>${UI.esc(h.nama)}</td>
              <td ${t.berat >= 2 ? 'style="font-weight:700"' : ''}>${UI.esc(nilai)}</td>
              <td class="muted">${UI.esc(h.satuan || '')}</td>
              <td class="muted mono" style="font-size:12px">${UI.esc(h.rujukan_teks || '—')}</td>
              <td ${t.berat >= 3 ? 'style="font-weight:700"' : ''}>${UI.esc(t.berat ? t.label : '')}</td>
            </tr>`;
          }).join('')}</tbody></table>`;
    }).join('');

    const blokBacaan = bacaan.map(b => `
      <div class="text-sm" style="border-left:3px solid var(--ink-200);padding-left:12px;margin:10px 0">
        <div class="text-xs text-muted">${UI.esc(LabCore.labelJenis(b.jenis))} ·
          ${UI.tglIndo(b.tanggal)}
          ${b.daftar_gigi ? ' · gigi ' + UI.esc(b.daftar_gigi) : ''}
          ${b.asal === 'EKSTERNAL' ? ' · di ' + UI.esc(b.nama_tempat || 'tempat lain') : ''}
          ${b.no_film ? ' · film ' + UI.esc(b.no_film) : ''}</div>
        ${b.temuan ? `<div class="mt-8"><b>Temuan.</b> ${UI.esc(b.temuan)}</div>` : ''}
        <div class="mt-8"><b>Kesan.</b> ${UI.esc(b.kesan)}</div>
        ${b.saran ? `<div><b>Saran.</b> ${UI.esc(b.saran)}</div>` : ''}
        <div class="text-xs text-muted mt-8">Dibaca oleh ${UI.esc(b.nama_pembaca || '-')}</div>
      </div>`).join('');

    /* Berkas fisiknya tidak ada di sistem — yang ada nomor arsipnya.
       Dicetak di sini supaya siapa pun yang membaca rekam medis ini tahu
       film dan lembar aslinya ada, dan tahu harus mencari nomor berapa. */
    const blokArsip = arsip.length ? `
      <div class="text-sm mt-12">
        <b>Berkas fisik terkait kunjungan ini:</b>
        <ul style="margin:6px 0 0;padding-left:20px">
          ${arsip.map(a => `<li><span class="mono">${UI.esc(a.no_arsip)}</span> —
            ${UI.esc(a.judul)}
            ${a.lokasi_simpan ? ` <span class="text-muted">(${UI.esc(a.lokasi_simpan)})</span>` : ''}
          </li>`).join('')}
        </ul>
      </div>` : '';

    return `
      <div class="divider"></div>
      <h3 class="mb-8">Pemeriksaan penunjang</h3>
      ${blokLab || ''}
      ${blokBacaan || ''}
      ${blokArsip}
      ${!blokLab && !blokBacaan && !blokArsip
        ? '<p class="text-muted text-sm mb-0">Tidak ada pemeriksaan penunjang.</p>' : ''}`;
  }

  function statusBridging(k) {
    if (!CONFIG.BRIDGING.PCARE_AKTIF && !CONFIG.BRIDGING.SATUSEHAT_AKTIF) return '';
    const lencana = (nama, status, pesan) => {
      const kelas = { TERKIRIM: 'b-ok', GAGAL: 'b-danger', ANTRE: 'b-warn',
                      BELUM: 'b-umum', TIDAK_PERLU: 'b-umum' }[status] || 'b-umum';
      return `<div class="flex items-center gap-8 mb-8">
        <b style="width:110px">${nama}</b>
        <span class="badge ${kelas}">${UI.esc(status)}</span>
        ${pesan ? `<span class="text-xs text-muted">${UI.esc(pesan)}</span>` : ''}</div>`;
    };
    return `<div class="card no-print">
      <div class="card-head"><h2>Status pengiriman data</h2></div>
      <div class="card-body">
        ${CONFIG.BRIDGING.PCARE_AKTIF ? lencana('PCare BPJS', k.pcare_status, k.pcare_pesan) : ''}
        ${CONFIG.BRIDGING.SATUSEHAT_AKTIF ? lencana('SatuSehat', k.satusehat_status, k.satusehat_pesan) : ''}
      </div></div>`;
  }

  /* ---------------- Daftar riwayat semua kunjungan ---------------- */
  async function renderRiwayat(el) {
    const akhir = UI.hariIni();
    const awal = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);

    el.innerHTML = `
      <div class="mb-16"><h1>Riwayat Kunjungan</h1>
        <p class="text-muted mb-0">Seluruh kunjungan yang tercatat di klinik.</p></div>

      <div class="card">
        <div class="card-head flex-wrap gap-8">
          <div class="flex items-center gap-8">
            <label style="margin:0">Dari</label>
            <input type="date" id="dari" value="${awal}" style="width:auto">
            <label style="margin:0">sampai</label>
            <input type="date" id="sampai" value="${akhir}" style="width:auto">
          </div>
          <div class="search-box flex-1" style="min-width:200px">
            <span class="ico">${UI.ikon('cari',16)}</span>
            <input type="search" id="cari" placeholder="Saring nama pasien atau diagnosa…">
          </div>
        </div>
        <div class="card-body tight" id="hasil">${UI.memuat(4)}</div>
      </div>`;

    let semua = [];
    const gambar = () => {
      const kata = (el.querySelector('#cari').value || '').toLowerCase();
      const d = !kata ? semua : semua.filter(x =>
        (x.nama_pasien || '').toLowerCase().includes(kata) ||
        (x.daftar_diagnosa || '').toLowerCase().includes(kata) ||
        (x.no_rm || '').includes(kata));
      const w = el.querySelector('#hasil');
      if (!d.length) { w.innerHTML = UI.kosong('Tidak ada kunjungan', 'Coba ubah rentang tanggal atau kata pencarian.'); return; }
      w.innerHTML = `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Tanggal</th><th>Pasien</th><th>Poli</th><th>Diagnosa</th>
          <th>Dokter</th><th>Status</th><th></th></tr></thead>
        <tbody>${d.map(k => `
          <tr class="clickable" onclick="location.hash='#/rekam/${k.id}'">
            <td class="nowrap"><b>${UI.tglPendek(k.tanggal)}</b>
              <div class="text-xs text-muted mono">${UI.esc(k.no_kunjungan)}</div></td>
            <td><b>${UI.esc(k.nama_pasien)}</b>
              <div class="text-xs text-muted mono">${UI.esc(k.no_rm)}</div></td>
            <td>${UI.esc(k.nama_poli)}</td>
            <td>${k.daftar_diagnosa ? UI.esc(k.daftar_diagnosa) : '<span class="muted">—</span>'}</td>
            <td class="muted">${UI.esc(k.nama_dokter || '—')}</td>
            <td>${UI.badgeStatus(k.status)}</td>
            <td>${UI.ikon('kembali',14)}</td>
          </tr>`).join('')}</tbody></table></div>`;
    };

    const muat = async () => {
      el.querySelector('#hasil').innerHTML = UI.memuat(4);
      semua = await DB.daftarKunjungan({
        dari: el.querySelector('#dari').value,
        sampai: el.querySelector('#sampai').value,
        batas: 500
      });
      gambar();
    };

    el.querySelector('#dari').addEventListener('change', muat);
    el.querySelector('#sampai').addEventListener('change', muat);
    el.querySelector('#cari').addEventListener('input', UI.tunda(gambar, 200));
    await muat();
  }

  return { render, renderRiwayat };
})();

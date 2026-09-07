/* =====================================================================
   PEMERIKSAAN DOKTER — terstruktur, siap PCare & SatuSehat

   Sampai September 2026 layar ini empat kotak teks bebas (S, O, A, P).
   Enak diketik, tetapi tak satu pun isinya bisa dikirim apa adanya:
   PCare meminta 30 field terpisah, SatuSehat meminta tiap tanda vital
   dan tiap temuan sebagai Observation berkode. Paragraf tidak bisa
   dipecah mesin, dan memecahnya belakangan berarti membaca ulang ribuan
   catatan — pekerjaan yang tidak akan pernah selesai.

   Yang berubah: isian menjadi field. Yang TIDAK berubah: rekam medis
   tetap punya narasi S/O/A/P, dan narasi itu disusun sendiri dari field
   yang baru diisi (js/periksa_core.js). Dokter tidak mengetik dua kali,
   dan rekam medis yang dicetak tetap berbunyi seperti tulisan dokter.

   Yang dijaga betul di sini: kecepatan mengisi. Semua yang bisa diambil
   dari kajian awal perawat sudah terisi, satu tombol menandai seluruh
   sistem pemeriksaan fisik normal, dan temuan yang sering dipakai bisa
   diklik. Formulir yang lengkap tetapi lambat akan diisi asal-asalan,
   dan data asal-asalan lebih buruk daripada kolom kosong.
   ===================================================================== */
const Periksa = (() => {

  let kj = null;              // kunjungan
  let pm = null;              // pemeriksaan tersimpan
  let ka = null;              // kajian awal
  let daftarDiagnosa = [];    // [{kode, nama, jenis, kasus}]
  let dxBanding = [];         // [{kode, nama}]
  let daftarResep = [];       // [{obat_id, nama_obat, jumlah, satuan, signa, frekuensi, dosis, ...}]
  let daftarTindakan = [];    // [{kode, nama, fdi, jumlah, catatan}]
  let signaCepat = [];
  let icdFavorit = [];
  let simpanOtomatis = null;

  // Rujukan berkode
  let refKesadaran = [], refStatusPulang = [], refPrognosa = [], refTacc = [];
  let refSistem = [], refPpk = [], refSubspes = [], refSarana = [], refAlergi = [];
  let daftarPoliLain = [];

  // Keadaan isian yang tidak berupa <input>
  let fisik = {};             // { KODE_SISTEM: {status, temuan} }
  let alergiKode = {};        // { MAKANAN: baris, UDARA: baris, OBAT: baris }
  let soapDisunting = {};     // huruf mana yang sudah diketik tangan dokter

  // Poli gigi
  let poliGigi = false;
  let odoWidget = null, gigiRef = [], kondisiGigiRef = [];
  let dataOdontogram = {}, bacaanGigi = {};

  // Penunjang
  let labKunjungan = [], bacaanKunjungan = [], paketLab = [], masterLab = [];

  // Buku kronis (Tahap 2) — penandaan kronis di halaman periksa
  let kronisBuku = null;             // baris v_kronis_pasien aktif, atau null
  let kronisStatin = null;           // baris v_kronis_statin (hanya bila statin_kunci terisi)
  let kronisUsulan = [];             // usulan dari kronis_usulan_diagnosa(), diperbarui tiap diagnosa berubah
  let refKronisDiagnosaCache = null;
  let refKronisKuotaObatCache = null;

  const KEADAAN_UMUM_CEPAT = [
    'Tampak sakit ringan', 'Tampak sakit sedang', 'Tampak sakit berat',
    'Tampak baik', 'Tampak lemas', 'Tampak sesak'
  ];

  /* =================================================================== *
   *  MEMUAT
   * =================================================================== */
  async function render(el, param) {
    const id = param && param[0];
    if (!id) { el.innerHTML = UI.kosong('Kunjungan tidak dipilih', 'Buka dari halaman antrian.'); return; }

    kj = await DB.kunjungan(id);
    poliGigi = kj.poli?.jenis === 'GIGI';

    const [alergi, kaX, pmX, dg, rs, sg, fav, td] = await Promise.all([
      DB.alergiPasien(kj.pasien_id), DB.kajian(id), DB.pemeriksaan(id),
      DB.diagnosa(id), DB.resep(id), DB.daftarSigna(), DB.cariIcd(''), DB.tindakan(id)
    ]);
    ka = kaX; pm = pmX;

    [refKesadaran, refStatusPulang, refPrognosa, refTacc, refSistem,
     refPpk, refSubspes, refSarana, refAlergi, daftarPoliLain, alergiKode] =
      await Promise.all([
        DB.refKesadaran(), DB.refStatusPulang(), DB.refPrognosa(), DB.refTacc(),
        DB.refSistemFisik(kj.poli?.jenis), DB.refPpk().catch(() => []),
        DB.refSubspesialis(), DB.refSarana(), DB.refAlergi(),
        DB.daftarPoli(), DB.alergiKode(kj.pasien_id).catch(() => ({}))
      ]);

    [labKunjungan, bacaanKunjungan] = await Promise.all([
      DB.labKunjungan(id).catch(() => []), DB.penunjangKunjungan(id).catch(() => [])
    ]);
    DB.catatAkses(kj.pasien_id, 'Membuka pemeriksaan dokter');

    let pgigi = null;
    if (poliGigi) {
      [gigiRef, kondisiGigiRef, dataOdontogram, pgigi, bacaanGigi] = await Promise.all([
        DB.refGigi(), DB.refKondisiGigi(), DB.odontogram(kj.pasien_id), DB.pemeriksaanGigi(id),
        DB.gigiBerbacaan(kj.pasien_id).catch(() => ({}))
      ]);
    }

    daftarTindakan = (td || []).map(t => ({
      kode: t.kode_icd9, nama: t.nama, kode_pcare: t.kode_pcare,
      fdi: t.fdi, jumlah: t.jumlah, catatan: t.catatan,
      perluGigi: !!(t.ref?.per_gigi ?? t.per_gigi)
    }));
    signaCepat = sg;
    icdFavorit = fav.slice(0, 14);
    daftarDiagnosa = dg.map(d => ({ kode: d.kode_icd10, nama: d.nama, jenis: d.jenis, kasus: d.kasus }));
    dxBanding = Array.isArray(pm?.diagnosis_banding) ? pm.diagnosis_banding.slice() : [];
    fisik = (pm && pm.pemeriksaan_fisik && typeof pm.pemeriksaan_fisik === 'object')
      ? JSON.parse(JSON.stringify(pm.pemeriksaan_fisik)) : {};

    daftarResep = (rs?.item || []).map(i => ({
      obat_id: i.obat_id, nama_obat: i.nama_obat, kode_kfa: i.kode_kfa,
      kode_pcare: i.kode_pcare, obat_dpho: !!i.obat_dpho,
      jumlah: i.jumlah, satuan: i.satuan, signa: i.signa,
      frekuensi: i.frekuensi, dosis: i.dosis, keterangan: i.keterangan
    }));
    daftarResep.forEach(lengkapiSigna);

    /* Dua hal berbeda yang sama-sama membuat layar ini hanya bisa dibaca:
       rekam medis sudah difinalisasi, atau peran pengguna memang bukan dokter.
       Database sudah menolak penulisannya; layar tidak boleh menawarkannya. */
    const bolehTulis = App.boleh(['dokter']);
    const terkunci = pm?.final === true || !bolehTulis;

    el.innerHTML = kerangka(alergi, pgigi, terkunci, bolehTulis);

    if (poliGigi) pasangOdontogram(terkunci);
    pasangPeristiwa(el, terkunci, bolehTulis);

    gambarDiagnosa(); gambarDxBanding(); gambarResep(); gambarTindakan();
    gambarFisik(terkunci);
    muatRiwayatSingkat();
    muatKartuSurat(kj.id, bolehTulis);
    muatKartuKronis();
    perbaruiRingkasKirim();
  }

  /* =================================================================== *
   *  KERANGKA HALAMAN
   * =================================================================== */
  /* Bilah panggilan.
     Diletakkan di paling atas halaman pemeriksaan dengan sengaja: dokter
     memanggil pasien berikutnya dari ruang periksa, bukan dari papan
     antrean di loket. Kalau tombolnya hanya ada di halaman antrean,
     yang terjadi di klinik adalah dokter membuka pintu dan berteriak —
     dan layar tunggu tidak pernah menunjukkan nomor yang benar. */
  function bilahPanggil(bolehTulis) {
    if (!kj.antrean_id || !bolehTulis) return '';
    return `
      <div class="card mb-12 no-print" id="bilahPanggil">
        <div class="card-body" style="padding:10px 14px">
          <div class="flex items-center gap-12 flex-wrap">
            <div class="queue-no" style="width:auto;padding:0 12px;height:34px">
              ${UI.esc(kj.no_antrian != null ? String(kj.no_antrian) : '—')}</div>
            <div class="flex-1" style="min-width:150px">
              <b class="text-sm">Panggilan ke ruang periksa</b>
              <div class="text-xs text-muted" id="statusPanggil">
                Nomor pasien ini akan muncul di layar ruang tunggu dan dibacakan suara.</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnPanggilPasien">
              ${UI.ikon('jam',15)} Panggil pasien</button>
            <button class="btn btn-secondary btn-sm" id="btnMulaiLayan">Mulai periksa</button>
          </div>
        </div>
      </div>`;
  }

  async function panggilPasien(ulang) {
    const info = document.getElementById('statusPanggil');
    try {
      const a = await DB.antreanPanggil(kj.antrean_id, kj.poli?.nama || null);
      UI.toast(`Nomor ${a.nomor} dipanggil ke ${kj.poli?.nama || 'ruang periksa'}.`, 'ok');
      if (info) info.innerHTML = `Dipanggil ${a.jumlah_panggil}× · terakhir pukul ${UI.jam(a.waktu_panggil)}`;
      const b = document.getElementById('btnPanggilPasien');
      if (b) b.innerHTML = `${UI.ikon('jam',15)} Panggil ulang`;
    } catch (e) {
      UI.toast(e.message || 'Gagal memanggil.', 'err');
      if (info) info.textContent = e.message || 'Gagal memanggil.';
    }
  }

  function kerangka(alergi, pgigi, terkunci, bolehTulis) {
    return `
      <a href="#/antrian" class="btn btn-ghost btn-sm mb-12 no-print">${UI.ikon('kembali',15)} Antrean</a>
      ${bilahPanggil(bolehTulis)}
      ${Komponen.bilahPasien(kj, alergi)}

      ${!bolehTulis ? `<div class="banner info">${UI.ikon('peringatan',16)}
        <div><b>Anda membuka halaman ini sebagai ${UI.esc(App.siapa().peran)}.</b>
        Isi pemeriksaan hanya dapat ditulis oleh dokter, jadi halaman ini ditampilkan
        untuk dibaca saja.</div></div>` : ''}
      ${pm?.final ? `<div class="banner ok">${UI.ikon('cek',16)}
        <div><b>Rekam medis sudah difinalisasi</b> pada ${UI.tglIndo(pm.final_pada)} ${UI.jam(pm.final_pada)}.
        Isinya tidak dapat diubah lagi. Gunakan <b>Addendum</b> bila perlu menambah catatan.</div></div>` : ''}

      <div class="split">
        <div>
          ${kartuVital(terkunci)}
          ${poliGigi ? kartuGigi(pgigi, terkunci) : ''}
          ${kartuAnamnesis(terkunci)}
          ${kartuFisik(terkunci)}
          ${kartuDiagnosa(terkunci)}
          ${kartuTindakan(terkunci)}
          ${kartuPenunjang(terkunci, bolehTulis)}
          ${kartuTerapi(terkunci)}
          ${kartuSoap(terkunci)}
        </div>

        <div>
          ${kartuTindakLanjut(terkunci)}
          ${kartuSimpan(terkunci, bolehTulis)}
          ${kartuKirim()}

          <div class="card no-print">
            <div class="card-head">
              <div class="flex-1"><h2>Buku Kronis</h2>
                <div class="sub">Diagnosis kronis, obat rutin, dan kuota statin BPJS pasien ini</div></div>
            </div>
            <div class="card-body" id="kartuKronis">${UI.memuat(1)}</div>
          </div>

          <div class="card no-print">
            <div class="card-head">
              <div class="flex-1"><h2>Surat keterangan</h2>
                <div class="sub">Surat sakit, rujukan, kontrol, keterangan sehat</div></div>
            </div>
            <div class="card-body" id="kartuSurat">${UI.memuat(1)}</div>
          </div>

          <div class="card no-print">
            <div class="card-head"><h2>Riwayat sebelumnya</h2></div>
            <div class="card-body tight" id="riwayatSingkat">${UI.memuat(2)}</div>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- Tanda vital & kajian awal ---------------- */
  function kartuVital(terkunci) {
    return `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Tanda vital &amp; kajian awal</h2>
            <div class="sub">${ka ? 'Diisi ' + UI.jam(ka.dibuat_pada) : 'Belum diisi perawat'}</div></div>
          ${!ka && App.boleh(['perawat','dokter'])
            ? `<a href="#/kajian/${kj.id}" class="btn btn-secondary btn-sm">Isi kajian awal</a>`
            : `<a href="#/kajian/${kj.id}" class="btn btn-ghost btn-sm no-print">Ubah</a>`}
        </div>
        <div class="card-body">
          ${Komponen.kotakVital(ka)}
          ${!ka ? `<p class="hint mt-12 mb-0">Tanda vital adalah bagian wajib
            data PCare dan menjadi Observation di SatuSehat. Mintalah perawat
            mengisinya sebelum rekam medis dikunci.</p>` : ''}
        </div>
      </div>`;
  }

  /* ---------------- S — Anamnesis ---------------- */
  function kartuAnamnesis(terkunci) {
    const rps = (pm && pm.riwayat_penyakit_sekarang) || {};
    const isi = (n, v, ph, kolom) => `
      <div class="field ${kolom || ''}">
        <label for="rps_${n}">${ph[0]} <span class="opt">${ph[1]}</span></label>
        <input type="text" id="rps_${n}" name="rps_${n}" value="${UI.esc(v)}"
               placeholder="${UI.esc(ph[2])}" ${terkunci ? 'disabled' : ''}>
      </div>`;

    return `
      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>S — Anamnesis</h2>
          <div class="sub">Keluhan utama wajib. Butir lain diisi seperlunya —
            yang kosong tidak ikut tercetak.</div></div></div>
        <div class="card-body" id="formAnamnesis">
          <div class="field">
            <label for="ku">Keluhan utama <span class="req">*</span></label>
            <input type="text" id="ku" name="keluhan_utama" ${terkunci ? 'disabled' : ''}
              placeholder="Satu kalimat: apa yang membawa pasien datang"
              value="${UI.esc(pm?.keluhan_utama || ka?.keluhan_utama || kj.keluhan_singkat || '')}">
            <div class="hint">Dikirim ke PCare sebagai <span class="mono">keluhan</span>.</div>
          </div>

          <fieldset class="fieldset">
            <legend>Riwayat penyakit sekarang</legend>
            <div class="form-row c4">
              ${isi('onset', rps.onset, ['Sejak', 'onset', '3 hari lalu'])}
              ${isi('lokasi', rps.lokasi, ['Lokasi', 'di mana', 'dada kanan'])}
              ${isi('kualitas', rps.kualitas, ['Sifat', 'seperti apa', 'berdahak putih'])}
              ${isi('kuantitas', rps.kuantitas, ['Derajat', 'seberapa berat', 'mengganggu tidur'])}
            </div>
            <div class="form-row c4">
              ${isi('kronologi', rps.kronologi, ['Perjalanan', 'memberat/menetap', 'makin sering malam hari'])}
              ${isi('memperberat', rps.memperberat, ['Memperberat', 'apa yang memicu', 'udara dingin'])}
              ${isi('memperingan', rps.memperingan, ['Meringankan', 'apa yang menolong', 'minum hangat'])}
              ${isi('penyerta', rps.penyerta, ['Penyerta', 'keluhan lain', 'demam hilang timbul'])}
            </div>
          </fieldset>

          <div class="form-row c2">
            <div class="field">
              <label for="rpd">Riwayat penyakit dahulu</label>
              <input type="text" id="rpd" name="riwayat_penyakit_dahulu" ${terkunci ? 'disabled' : ''}
                placeholder="Hipertensi, DM, asma, operasi…"
                value="${UI.esc(pm?.riwayat_penyakit_dahulu || ka?.riwayat_penyakit_dahulu || '')}">
            </div>
            <div class="field">
              <label for="rkl">Riwayat penyakit keluarga</label>
              <input type="text" id="rkl" name="riwayat_keluarga" ${terkunci ? 'disabled' : ''}
                placeholder="Penyakit serupa pada keluarga serumah"
                value="${UI.esc(pm?.riwayat_keluarga)}">
            </div>
          </div>
          <div class="form-row c2">
            <div class="field">
              <label for="rob">Obat yang sedang diminum</label>
              <input type="text" id="rob" name="riwayat_pengobatan" ${terkunci ? 'disabled' : ''}
                placeholder="Termasuk obat rutin dan jamu"
                value="${UI.esc(pm?.riwayat_pengobatan || ka?.riwayat_pengobatan || '')}">
            </div>
            <div class="field">
              <label for="rso">Riwayat sosial &amp; kebiasaan</label>
              <input type="text" id="rso" name="riwayat_sosial" ${terkunci ? 'disabled' : ''}
                placeholder="Merokok, pekerjaan, lingkungan"
                value="${UI.esc(pm?.riwayat_sosial)}">
            </div>
          </div>

          ${kotakAlergi(terkunci)}
        </div>
      </div>`;
  }

  /* Alergi berkode. PCare meminta SATU kode per jenis, bukan daftar —
     karena itu bentuknya tiga pilihan, bukan tabel. Daftar alergi bebas
     pada data pasien tetap ada dan tetap tampil di bilah merah di atas. */
  function kotakAlergi(terkunci) {
    const per = (jenis) => refAlergi.filter(a => a.jenis === jenis);
    const kotak = (jenis, label) => {
      const terpilih = alergiKode[jenis]?.ref_alergi_id || '';
      return `
        <div class="field">
          <label for="al_${jenis}">${label}</label>
          <select id="al_${jenis}" data-alergi="${jenis}" ${terkunci ? 'disabled' : ''}>
            <option value="">— belum ditanyakan —</option>
            ${per(jenis).map(a => `<option value="${UI.esc(a.id)}"
              ${terpilih === a.id ? 'selected' : ''}>${UI.esc(a.nama)}</option>`).join('')}
          </select>
        </div>`;
    };
    return `
      <fieldset class="fieldset mb-0">
        <legend>Alergi</legend>
        <div class="form-row c3">
          ${kotak('OBAT', 'Alergi obat')}
          ${kotak('MAKANAN', 'Alergi makanan')}
          ${kotak('UDARA', 'Alergi udara / lingkungan')}
        </div>
        <p class="hint mb-0">Tiga jenis ini diminta terpisah oleh PCare
          (<span class="mono">alergiObat</span>, <span class="mono">alergiMakan</span>,
          <span class="mono">alergiUdara</span>). Alergi yang lebih rinci tetap
          dicatat di data pasien dan tampil di bilah merah di atas layar.</p>
      </fieldset>`;
  }

  /* ---------------- O — Pemeriksaan fisik ---------------- */
  function kartuFisik(terkunci) {
    const kesadaranTerpilih = pm?.kesadaran_kode || ka?.kesadaran_kode || 'CM';
    return `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>O — Pemeriksaan fisik</h2>
            <div class="sub">${terkunci
              ? 'Temuan sebagaimana tercatat pada kunjungan ini'
              : 'Tandai tiap sistem: normal, ada temuan, atau tidak diperiksa'}</div></div>
          ${terkunci ? '' : `<button class="btn btn-secondary btn-sm no-print" id="btnSemuaNormal"
            title="Menandai seluruh sistem pemeriksaan rutin sebagai dalam batas normal">
            ${UI.ikon('cek',15)} Semua dalam batas normal</button>`}
        </div>
        <div class="card-body" id="formFisik">
          <div class="form-row c2">
            <div class="field">
              <label for="ku2">Keadaan umum</label>
              <input type="text" id="ku2" name="keadaan_umum" ${terkunci ? 'disabled' : ''}
                list="opsiKeadaanUmum" value="${UI.esc(pm?.keadaan_umum)}"
                placeholder="Tampak sakit ringan">
              <datalist id="opsiKeadaanUmum">
                ${KEADAAN_UMUM_CEPAT.map(o => `<option value="${UI.esc(o)}">`).join('')}
              </datalist>
            </div>
            <div class="field">
              <label for="ksd">Kesadaran <span class="opt">penilaian dokter</span></label>
              <select id="ksd" name="kesadaran_kode" ${terkunci ? 'disabled' : ''}>
                ${refKesadaran.map(o => `<option value="${UI.esc(o.kode)}"
                  ${kesadaranTerpilih === o.kode ? 'selected' : ''}
                  title="${UI.esc(o.keterangan || '')}">${UI.esc(o.nama)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div id="daftarSistem"></div>
        </div>
      </div>`;
  }

  /* Satu baris per sistem tubuh. Tiga keadaan, bukan dua: "tidak
     diperiksa" adalah keterangan medis tersendiri dan tidak boleh
     tercatat sebagai normal atas nama dokter. */
  function gambarFisik(terkunci) {
    const w = document.getElementById('daftarSistem');
    if (!w) return;

    w.innerHTML = refSistem.map(s => {
      const isi = fisik[s.kode] || {};
      const st = isi.status || '';
      const temuan = isi.temuan || '';
      const lazim = Array.isArray(s.temuan_lazim) ? s.temuan_lazim : [];

      const tombol = [
        ['NORMAL', 'Normal'], ['ABNORMAL', 'Ada temuan'], ['TIDAK_DIPERIKSA', 'Tidak diperiksa']
      ].map(([v, t]) => terkunci
        ? (st === v ? `<span class="badge ${v === 'NORMAL' ? 'b-ok' : v === 'ABNORMAL' ? 'b-warn' : 'b-umum'}">${t}</span>` : '')
        : `<label class="radio-chip ${st === v ? 'on' : ''}" data-sistem="${UI.esc(s.kode)}" data-status="${v}">
             <input type="radio" name="fs_${UI.esc(s.kode)}" ${st === v ? 'checked' : ''}>${t}</label>`
      ).join('');

      return `
        <div class="sistem-baris" data-baris="${UI.esc(s.kode)}">
          <div class="sistem-nama">${UI.esc(s.nama)}
            ${st === 'NORMAL'
              ? `<div class="sistem-normal">${UI.esc(s.normal_teks)}</div>` : ''}</div>
          <div class="sistem-pilih">${tombol || '<span class="text-muted">—</span>'}</div>
          <div class="sistem-temuan" ${st === 'ABNORMAL' ? '' : 'hidden'}>
            ${terkunci
              ? `<div class="text-sm">${UI.esc(temuan)}</div>`
              : `<input type="text" data-temuan="${UI.esc(s.kode)}" value="${UI.esc(temuan)}"
                        placeholder="Uraikan temuannya">
                 ${lazim.length ? `<div class="chip-list mt-8">
                   ${lazim.map(t => `<button type="button" class="chip-quick"
                     data-lazim="${UI.esc(s.kode)}" data-teks="${UI.esc(t)}">${UI.esc(t)}</button>`).join('')}
                 </div>` : ''}`}
          </div>
        </div>`;
    }).join('');

  }

  /* Pendengar peristiwa dipasang SEKALI, bukan di dalam gambarFisik().
     gambarFisik() dipanggil ulang setiap kali satu sistem ditandai, dan
     kalau pendengarnya ikut dipasang ulang, satu klik berikutnya berjalan
     dua kali: yang pertama menandai ABNORMAL, yang kedua melihat status
     sudah sama lalu membatalkannya. Hasilnya tombol yang "tidak bereaksi"
     — tanpa satu pun galat, dan makin parah tiap kali layar digambar. */
  function pasangFisik() {
    const w = document.getElementById('daftarSistem');
    if (!w) return;

    w.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-sistem]');
      if (chip) {
        const kode = chip.dataset.sistem, status = chip.dataset.status;
        const lama = fisik[kode] || {};
        /* Menekan tombol yang sudah menyala membatalkan pilihan. Tanpa ini
           satu klik salah tidak bisa dibatalkan tanpa memuat ulang halaman. */
        if (lama.status === status) delete fisik[kode];
        else fisik[kode] = { status, temuan: status === 'ABNORMAL' ? (lama.temuan || '') : null };
        gambarFisik(false);
        if (fisik[kode]?.status === 'ABNORMAL') {
          const inp = w.querySelector(`[data-temuan="${CSS.escape(kode)}"]`);
          if (inp) inp.focus();
        }
        return;
      }
      const lz = e.target.closest('[data-lazim]');
      if (lz) {
        const kode = lz.dataset.lazim;
        const inp = w.querySelector(`[data-temuan="${CSS.escape(kode)}"]`);
        if (!inp) return;
        /* Ditambahkan, bukan menimpa: satu sistem sering punya lebih dari
           satu temuan, dan mengetik ulang yang pertama itu yang membuat
           orang berhenti memakai daftar cepat. */
        inp.value = inp.value.trim()
          ? inp.value.replace(/[,;]\s*$/, '') + ', ' + lz.dataset.teks
          : lz.dataset.teks;
        fisik[kode] = { status: 'ABNORMAL', temuan: inp.value };
        inp.focus();
      }
    });

    w.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-temuan]');
      if (!inp) return;
      const kode = inp.dataset.temuan;
      fisik[kode] = { status: 'ABNORMAL', temuan: inp.value };
    });
  }

  /* ---------------- A — Diagnosa ---------------- */
  function kartuDiagnosa(terkunci) {
    return `
      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>A — Diagnosa (ICD-10)</h2>
          <div class="sub">Diagnosa pertama otomatis menjadi diagnosa primer</div></div></div>
        <div class="card-body">
          ${terkunci ? '' : `<div id="cariIcd" class="mb-12"></div>
            <div class="mb-12">
              <div class="text-xs text-muted mb-8">Sering dipakai — klik untuk menambah:</div>
              <div class="chip-list" id="icdCepat">
                ${icdFavorit.map(d => `<button class="chip-quick" data-kode="${UI.esc(d.kode)}"
                  data-nama="${UI.esc(d.nama_id || d.nama_en)}">${UI.esc(d.nama_id || d.nama_en)}</button>`).join('')}
              </div>
            </div>`}
          <div id="tabelDiagnosa"></div>

          <div class="divider"></div>
          <div class="flex justify-between items-center mb-8">
            <b class="text-sm">Diagnosis banding <span class="text-muted">opsional</span></b>
            ${terkunci ? '' : `<button class="btn btn-ghost btn-sm" id="btnDxBanding">
              ${UI.ikon('plus',14)} Tambah</button>`}
          </div>
          <div id="tabelDxBanding"></div>
          <p class="hint mb-0">Diagnosis banding tercatat di rekam medis sebagai
            pertimbangan klinis. Tidak ikut dikirim sebagai diagnosa ke PCare
            maupun SatuSehat — yang dikirim hanya diagnosa yang ditegakkan.</p>
        </div>
      </div>`;
  }

  /* ---------------- Tindakan ---------------- */
  function kartuTindakan(terkunci) {
    return `
      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>Tindakan (ICD-9-CM)</h2>
          <div class="sub">${poliGigi
            ? 'Sebutkan nomor gigi untuk tindakan pada gigi tertentu'
            : 'Tindakan medis yang dilakukan pada kunjungan ini'}</div></div></div>
        <div class="card-body">
          ${terkunci ? '' : `<div id="cariTindakan" class="mb-12"></div>`}
          <div id="tabelTindakan"></div>
        </div>
      </div>`;
  }

  /* ---------------- P — Terapi ---------------- */
  function kartuTerapi(terkunci) {
    return `
      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>P — Resep &amp; terapi</h2>
          <div class="sub">Cari obat, tentukan jumlah dan aturan pakai</div></div>
          <button class="btn btn-secondary btn-sm no-print" id="btnCetakResep">${UI.ikon('cetak',15)} Cetak</button>
        </div>
        <div class="card-body" id="formTerapi">
          ${terkunci ? '' : `<div id="cariObat" class="mb-12"></div>`}
          <div id="tabelResep"></div>

          <div class="form-row c2 mt-16">
            <div class="field mb-0">
              <label for="tno">Terapi non-obat</label>
              <textarea id="tno" name="terapi_non_obat" rows="2" ${terkunci ? 'disabled' : ''}
                placeholder="Kompres hangat, fisioterapi ringan, diet rendah garam…">${UI.esc(pm?.terapi_non_obat)}</textarea>
              <div class="hint">PCare: <span class="mono">terapiNonObat</span></div>
            </div>
            <div class="field mb-0">
              <label for="bmhp">Bahan medis habis pakai (BMHP)</label>
              <textarea id="bmhp" name="bmhp" rows="2" ${terkunci ? 'disabled' : ''}
                placeholder="Kasa steril, spuit 3 cc, plester…">${UI.esc(pm?.bmhp)}</textarea>
              <div class="hint">PCare: <span class="mono">bmhp</span></div>
            </div>
          </div>

          <div class="field mt-16 mb-0">
            <label for="edu">Edukasi kepada pasien</label>
            <textarea id="edu" name="edukasi" rows="2" ${terkunci ? 'disabled' : ''}
              placeholder="Anjuran istirahat, pola makan, tanda bahaya yang perlu diwaspadai…">${UI.esc(pm?.edukasi)}</textarea>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- Catatan SOAP tersusun ---------------- */
  function kartuSoap(terkunci) {
    const kotak = (id, huruf, judul, nilai) => `
      <div class="field ${huruf === 'P' ? 'mb-0' : ''}">
        <label for="${id}">${huruf} — ${judul}</label>
        <textarea id="${id}" name="${id}" rows="3" ${terkunci ? 'disabled' : ''}
          data-soap="${id}">${UI.esc(nilai)}</textarea>
      </div>`;

    return `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Catatan SOAP</h2>
            <div class="sub">${terkunci ? 'Catatan pemeriksaan kunjungan ini'
              : 'Tersusun sendiri dari isian di atas. Boleh disunting — yang Anda '
                + 'ketik tidak akan ditimpa.'}</div></div>
          ${terkunci ? '' : `<button class="btn btn-ghost btn-sm no-print" id="btnSusunSoap">
            Susun ulang</button>`}
        </div>
        <div class="card-body" id="formSoap">
          ${kotak('subjective', 'S', 'Subjective', pm?.subjective)}
          ${kotak('objective',  'O', 'Objective',  pm?.objective)}
          ${kotak('assessment', 'A', 'Assessment', pm?.assessment)}
          ${kotak('plan',       'P', 'Plan',       pm?.plan)}
        </div>
      </div>`;
  }

  /* ---------------- Panel kanan: tindak lanjut ---------------- */
  function kartuTindakLanjut(terkunci) {
    const tl = pm?.tindak_lanjut || 'SELESAI';
    return `
      <div class="card">
        <div class="card-head"><h2>Tindak lanjut</h2></div>
        <div class="card-body" id="formLanjut">
          <div class="field">
            <label for="tl">Rencana tindak lanjut</label>
            <select id="tl" name="tindak_lanjut" ${terkunci ? 'disabled' : ''}>
              ${Object.entries(PeriksaCore.LABEL_LANJUT).map(([v, t]) =>
                `<option value="${v}" ${tl === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>

          <div class="field" id="wadahKontrol" hidden>
            <label for="tk">Tanggal kontrol</label>
            <input type="date" id="tk" name="tanggal_kontrol" ${terkunci ? 'disabled' : ''}
                   value="${UI.esc(pm?.tanggal_kontrol)}">
          </div>

          <div id="wadahInternal" hidden>
            <div class="field">
              <label for="rpi">Poli tujuan di klinik ini</label>
              <select id="rpi" name="rujuk_poli_internal_id" ${terkunci ? 'disabled' : ''}>
                <option value="">— pilih poli —</option>
                ${daftarPoliLain.filter(p => p.id !== kj.poli_id).map(p =>
                  `<option value="${UI.esc(p.id)}"
                    ${pm?.rujuk_poli_internal_id === p.id ? 'selected' : ''}>${UI.esc(p.nama)}</option>`).join('')}
              </select>
              <div class="hint">PCare: <span class="mono">kdPoliRujukInternal</span></div>
            </div>
          </div>

          <div id="wadahRujuk" hidden>
            <div class="field">
              <label for="rppk">Faskes tujuan</label>
              <select id="rppk" name="rujuk_ppk_kode" ${terkunci ? 'disabled' : ''}>
                <option value="">— pilih dari daftar —</option>
                ${refPpk.map(p => `<option value="${UI.esc(p.kode)}"
                  ${pm?.rujuk_ppk_kode === p.kode ? 'selected' : ''}
                  >${UI.esc(p.nama)}</option>`).join('')}
              </select>
              ${refPpk.length ? '' : `<div class="hint" style="color:var(--warn-700)">
                Daftar faskes rujukan masih kosong. Isi lewat
                <b>Pengaturan → Rujukan &amp; kode PCare</b>.</div>`}
            </div>
            <div class="form-row c2">
              <div class="field">
                <label for="rsub">Sub spesialis</label>
                <select id="rsub" name="rujuk_subspesialis_kode" ${terkunci ? 'disabled' : ''}>
                  <option value="">— pilih —</option>
                  ${refSubspes.map(s => `<option value="${UI.esc(s.kode)}"
                    ${pm?.rujuk_subspesialis_kode === s.kode ? 'selected' : ''}>${UI.esc(s.nama)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="rsar">Sarana yang dibutuhkan</label>
                <select id="rsar" name="rujuk_sarana_kode" ${terkunci ? 'disabled' : ''}>
                  <option value="">— pilih —</option>
                  ${refSarana.map(s => `<option value="${UI.esc(s.kode)}"
                    ${pm?.rujuk_sarana_kode === s.kode ? 'selected' : ''}>${UI.esc(s.nama)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field">
              <label for="rtg">Perkiraan tanggal dirujuk</label>
              <input type="date" id="rtg" name="rujuk_tgl_estimasi" ${terkunci ? 'disabled' : ''}
                     value="${UI.esc(pm?.rujuk_tgl_estimasi)}">
            </div>
            <div class="field">
              <label for="rsa">Alasan rujukan</label>
              <textarea id="rsa" name="rujuk_alasan" rows="2" ${terkunci ? 'disabled' : ''}
                >${UI.esc(pm?.rujuk_alasan)}</textarea>
            </div>

            <fieldset class="fieldset">
              <legend>TACC</legend>
              <div class="field">
                <label for="tacc">Alasan rujukan menurut kriteria BPJS</label>
                <select id="tacc" name="tacc_kode" ${terkunci ? 'disabled' : ''}>
                  ${refTacc.map(t => `<option value="${UI.esc(t.kode)}"
                    ${(pm?.tacc_kode || 'TIDAK') === t.kode ? 'selected' : ''}
                    title="${UI.esc(t.keterangan || '')}">${UI.esc(t.nama)}</option>`).join('')}
                </select>
              </div>
              <div class="field mb-0" id="wadahTacc" hidden>
                <label for="taccAl">Uraian alasan <span class="req">*</span></label>
                <input type="text" id="taccAl" name="tacc_alasan" ${terkunci ? 'disabled' : ''}
                  placeholder="Contoh: komplikasi pneumonia, perlu foto toraks"
                  value="${UI.esc(pm?.tacc_alasan)}">
                <div class="hint">Rujukan ber-TACC tanpa alasan dikembalikan BPJS.</div>
              </div>
            </fieldset>
          </div>

          <div class="form-row c2">
            <div class="field">
              <label for="sp">Keadaan saat pulang</label>
              <select id="sp" name="status_pulang_kode" ${terkunci ? 'disabled' : ''}>
                ${refStatusPulang.map(o => `<option value="${UI.esc(o.kode)}"
                  ${(pm?.status_pulang_kode || 'SEMBUH') === o.kode ? 'selected' : ''}
                  >${UI.esc(o.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="pg">Prognosa</label>
              <select id="pg" name="prognosa_kode" ${terkunci ? 'disabled' : ''}>
                <option value="">— pilih —</option>
                ${refPrognosa.map(o => `<option value="${UI.esc(o.kode)}"
                  ${pm?.prognosa_kode === o.kode ? 'selected' : ''}
                  title="${UI.esc(o.keterangan || '')}">${UI.esc(o.nama)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>`;
  }

  function kartuSimpan(terkunci, bolehTulis) {
    return `
      <div class="card no-print">
        <div class="card-body">
          ${terkunci
            ? `${bolehTulis && pm?.final
                 ? `<button class="btn btn-secondary btn-block mb-8" id="btnAddendum">Tambah addendum</button>` : ''}
               <a href="#/rekam/${kj.id}" class="btn btn-primary btn-block">Lihat rekam medis</a>`
            : `<button class="btn btn-secondary btn-block mb-8" id="btnSimpanDraf">
                 Simpan sementara</button>
               <button class="btn btn-primary btn-block btn-lg" id="btnFinal">
                 ${UI.ikon('cek',17)} Selesai &amp; kunci rekam medis</button>
               <p class="hint mt-8 mb-0">Setelah dikunci, isi rekam medis tidak dapat diubah —
                 sesuai PMK 24/2022. Perubahan hanya lewat addendum.</p>`}
          <div class="text-xs text-muted mt-12" id="statusSimpan"></div>
        </div>
      </div>`;
  }

  /* Kartu kesiapan pengiriman. Ditampilkan untuk semua kunjungan BPJS,
     juga selagi bridging belum menyala: gunanya justru memperlihatkan
     kekurangan data hari ini, bukan pada hari kredensial datang. */
  function kartuKirim() {
    if (kj.cara_bayar !== 'BPJS') return '';
    return `
      <div class="card no-print">
        <div class="card-head">
          <div class="flex-1"><h2>Data untuk BPJS &amp; SatuSehat</h2>
            <div class="sub">Yang akan terkirim dari kunjungan ini</div></div>
        </div>
        <div class="card-body">
          <div id="ringkasKirim" class="text-sm"></div>
          <button class="btn btn-ghost btn-sm btn-block mt-12" id="btnLihatPayload">
            Lihat data yang akan dikirim</button>
        </div>
      </div>`;
  }

  /* =================================================================== *
   *  PERISTIWA
   * =================================================================== */
  function pasangPeristiwa(el, terkunci, bolehTulis) {
    /* Di luar blok `if (!terkunci)` dengan sengaja: memanggil pasien bukan
       menulis rekam medis. Rekam medis yang sudah dikunci pun kadang perlu
       pasiennya dipanggil kembali — misalnya untuk menyerahkan surat. */
    const bPanggil = el.querySelector('#btnPanggilPasien');
    if (bPanggil) bPanggil.addEventListener('click', async () => {
      bPanggil.disabled = true;
      try { await panggilPasien(); } finally { bPanggil.disabled = false; }
    });
    const bLayan = el.querySelector('#btnMulaiLayan');
    if (bLayan) bLayan.addEventListener('click', async () => {
      bLayan.disabled = true;
      try {
        await DB.antreanMulaiLayan(kj.antrean_id);
        UI.toast('Pasien ditandai sedang diperiksa.', 'ok');
        const info = document.getElementById('statusPanggil');
        if (info) info.textContent = 'Sedang diperiksa — nomor ini tidak lagi dihitung sebagai antrean menunggu.';
      } catch (e) { UI.toast(e.message || 'Gagal.', 'err'); }
      finally { bLayan.disabled = false; }
    });

    if (!terkunci) {
      pasangPencarianIcd();
      pasangPencarianObat();
      pasangPencarianTindakan();

      el.querySelector('#icdCepat').addEventListener('click', (e) => {
        const b = e.target.closest('[data-kode]'); if (!b) return;
        tambahDiagnosa({ kode: b.dataset.kode, nama: b.dataset.nama });
      });
      el.querySelector('#btnDxBanding').addEventListener('click', modalDxBanding);
      el.querySelector('#btnSemuaNormal').addEventListener('click', semuaNormal);
      pasangFisik();
      el.querySelector('#btnSusunSoap').addEventListener('click', () => {
        soapDisunting = {};
        terapkanSoap(susunSoapSekarang(), true);
        UI.toast('Catatan SOAP disusun ulang dari isian.', 'ok', 1800);
      });

      /* Huruf yang diketik tangan tidak akan ditimpa saat disusun ulang
         otomatis. Dokter yang menulis kalimatnya sendiri tidak boleh
         kehilangan tulisannya karena ia menambah satu diagnosa. */
      el.querySelectorAll('[data-soap]').forEach(t =>
        t.addEventListener('input', () => { soapDisunting[t.dataset.soap] = true; }));

      el.querySelectorAll('[data-alergi]').forEach(s =>
        s.addEventListener('change', () => simpanAlergi(s.dataset.alergi, s.value)));

      const bLab = el.querySelector('#btnMintaLab');
      if (bLab) bLab.addEventListener('click', modalMintaLab);
      const bBacaan = el.querySelector('#btnTulisBacaan');
      if (bBacaan) bBacaan.addEventListener('click', async () => {
        if (await Lab.modalBacaan(kj.pasien, kj.id, null)) {
          bacaanKunjungan = await DB.penunjangKunjungan(kj.id);
          App.segarkan();
        }
      });

      el.querySelector('#btnSimpanDraf').addEventListener('click', () => simpan(false));
      el.querySelector('#btnFinal').addEventListener('click', () => simpan(true));
      pasangSimpanOtomatis();
    } else {
      const ba = el.querySelector('#btnAddendum');
      if (ba) ba.addEventListener('click', () => modalAddendum());
    }

    el.querySelector('#btnCetakResep').addEventListener('click', cetakResep);

    const bp = el.querySelector('#btnLihatPayload');
    if (bp) bp.addEventListener('click', modalPayload);

    const selTl = el.querySelector('#tl');
    const selTacc = el.querySelector('#tacc');
    const perbaruiTl = () => {
      const v = selTl.value;
      el.querySelector('#wadahKontrol').hidden  = v !== 'KONTROL';
      el.querySelector('#wadahInternal').hidden = v !== 'RUJUK_INTERNAL';
      el.querySelector('#wadahRujuk').hidden    = !(v === 'RUJUK_LANJUT' || v === 'RUJUK_IGD');
      perbaruiTacc();
      perbaruiRingkasKirim();
    };
    const perbaruiTacc = () => {
      if (!selTacc) return;
      const t = refTacc.find(x => x.kode === selTacc.value);
      el.querySelector('#wadahTacc').hidden = !(t && t.perlu_alasan);
    };
    selTl.addEventListener('change', perbaruiTl);
    if (selTacc) selTacc.addEventListener('change', perbaruiTacc);
    perbaruiTl();

    /* Ringkasan kesiapan ikut berubah begitu ada yang diisi, bukan hanya
       saat menyimpan — kalau baru muncul di akhir, dokter sudah telanjur
       menutup kasus dan tidak akan kembali. */
    ['#formAnamnesis', '#formFisik', '#formLanjut', '#formTerapi'].forEach(sel => {
      const w = el.querySelector(sel);
      if (w) w.addEventListener('change', perbaruiRingkasKirim);
    });
  }

  /* Satu klik menandai seluruh sistem pemeriksaan rutin normal. Sistem
     yang bawaan_periksa = false (genitourinaria) sengaja TIDAK ikut:
     menandainya normal berarti menuliskan pemeriksaan yang tidak
     dilakukan, atas nama dokter, di dokumen hukum. */
  async function semuaNormal() {
    const rutin = refSistem.filter(s => s.bawaan_periksa);
    const sudahAda = rutin.filter(s => fisik[s.kode] && fisik[s.kode].status === 'ABNORMAL');
    if (sudahAda.length) {
      const ya = await UI.konfirmasi('Tandai semua normal?',
        `Ada ${sudahAda.length} sistem yang sudah Anda tandai punya temuan `
        + `(${sudahAda.map(s => s.nama).join(', ')}). Temuan itu akan dipertahankan; `
        + 'sisanya ditandai dalam batas normal.', 'Ya, tandai');
      if (!ya) return;
    }
    rutin.forEach(s => {
      if (fisik[s.kode] && fisik[s.kode].status === 'ABNORMAL') return;
      fisik[s.kode] = { status: 'NORMAL', temuan: null };
    });
    gambarFisik(false);
    perbaruiRingkasKirim();
    UI.toast(`${rutin.length} sistem ditandai dalam batas normal.`, 'ok', 2200);
  }

  async function simpanAlergi(jenis, refId) {
    try {
      const r = refAlergi.find(a => a.id === refId);
      await DB.setAlergiKode(kj.pasien_id, jenis, refId || null, r ? r.nama : null, null);
      alergiKode = await DB.alergiKode(kj.pasien_id);
      perbaruiRingkasKirim();
    } catch (e) { UI.toast(e.message || 'Gagal menyimpan alergi.', 'err'); }
  }

  /* =================================================================== *
   *  MENYUSUN SOAP
   * =================================================================== */
  function bahanSoap() {
    const a = UI.nilaiForm(document.getElementById('formAnamnesis'));
    const f = UI.nilaiForm(document.getElementById('formFisik'));
    const t = UI.nilaiForm(document.getElementById('formTerapi'));
    const l = UI.nilaiForm(document.getElementById('formLanjut'));

    const rps = {};
    PeriksaCore.BUTIR_RPS.forEach(([k]) => { if (a['rps_' + k]) rps[k] = a['rps_' + k]; });

    const kes = refKesadaran.find(x => x.kode === f.kesadaran_kode);
    const png = refPrognosa.find(x => x.kode === l.prognosa_kode);
    const ppk = refPpk.find(x => x.kode === l.rujuk_ppk_kode);
    const sub = refSubspes.find(x => x.kode === l.rujuk_subspesialis_kode);
    const pol = daftarPoliLain.find(x => x.id === l.rujuk_poli_internal_id);

    return {
      anamnesis: {
        keluhan_utama: a.keluhan_utama,
        riwayat_penyakit_sekarang: rps,
        riwayat_penyakit_dahulu: a.riwayat_penyakit_dahulu,
        riwayat_keluarga: a.riwayat_keluarga,
        riwayat_pengobatan: a.riwayat_pengobatan,
        riwayat_sosial: a.riwayat_sosial,
        riwayat_alergi: ringkasAlergi()
      },
      objektif: {
        keadaan_umum: f.keadaan_umum,
        kesadaran_nama: kes ? kes.nama : null,
        pemeriksaan_fisik: fisik
      },
      kajian: ka, sistemRef: refSistem,
      diagnosa: daftarDiagnosa, diagnosis_banding: dxBanding,
      tindakan: daftarTindakan, resep: daftarResep,
      rencana: {
        terapi_non_obat: t.terapi_non_obat, bmhp: t.bmhp, edukasi: t.edukasi,
        tindak_lanjut: l.tindak_lanjut, tanggal_kontrol: l.tanggal_kontrol,
        prognosa_nama: png ? png.nama : null,
        rujuk_nama_faskes: ppk ? ppk.nama : null,
        rujuk_nama_subspesialis: sub ? sub.nama : null,
        rujuk_nama_poli_internal: pol ? pol.nama : null,
        rujuk_alasan: l.rujuk_alasan,
        permintaan_penunjang: ringkasPenunjang()
      }
    };
  }

  const susunSoapSekarang = () => PeriksaCore.susunSoap(bahanSoap());

  function ringkasAlergi() {
    const isi = ['OBAT', 'MAKANAN', 'UDARA']
      .map(j => alergiKode[j])
      .filter(a => a && a.nama && !/^tidak ada/i.test(a.nama))
      .map(a => a.nama);
    return isi.length ? isi.join(', ') : null;
  }

  function ringkasPenunjang() {
    const p = [];
    labKunjungan.forEach(lp => {
      const n = (lp.hasil || []).map(h => h.nama).filter(Boolean);
      if (n.length) p.push(n.join(', '));
    });
    bacaanKunjungan.forEach(b => p.push(LabCore.labelJenis(b.jenis)));
    return p.length ? p.join('; ') : null;
  }

  /* Menaruh hasil susunan ke kotak SOAP. Huruf yang sudah diketik tangan
     dilewati, kecuali `paksa` (tombol "Susun ulang" yang ditekan sendiri
     oleh dokter). */
  function terapkanSoap(hasil, paksa = false) {
    ['subjective', 'objective', 'assessment', 'plan'].forEach(k => {
      if (!paksa && soapDisunting[k]) return;
      const t = document.getElementById(k);
      if (t) t.value = hasil[k] || '';
    });
  }

  /* =================================================================== *
   *  DIAGNOSA
   * =================================================================== */
  function pasangPencarianIcd() {
    Komponen.comboCari({
      wadah: document.getElementById('cariIcd'),
      placeholder: 'Cari diagnosa atau kode ICD-10… (contoh: ispa, J06, hipertensi)',
      cariFn: (kata) => DB.cariIcd(kata),
      formatFn: (d) => `<b>${UI.esc(d.nama_id || d.nama_en)}</b>
        <span>${UI.esc(d.kode)}${d.nama_id && d.nama_en ? ' · ' + UI.esc(d.nama_en) : ''}</span>`,
      onPilih: (d) => tambahDiagnosa({ kode: d.kode, nama: d.nama_id || d.nama_en })
    });
  }

  function tambahDiagnosa(d) {
    if (daftarDiagnosa.some(x => x.kode === d.kode)) {
      UI.toast('Diagnosa itu sudah ada dalam daftar.', 'warn'); return;
    }
    daftarDiagnosa.push({
      kode: d.kode, nama: d.nama,
      jenis: daftarDiagnosa.length === 0 ? 'PRIMER' : 'SEKUNDER',
      kasus: 'BARU'
    });
    gambarDiagnosa(); perbaruiRingkasKirim();
    perbaruiUsulanKronis();
  }

  function gambarDiagnosa() {
    const w = document.getElementById('tabelDiagnosa');
    const terkunci = !document.getElementById('btnFinal');
    if (!daftarDiagnosa.length) {
      w.innerHTML = `<div class="banner info mb-0"><div>Belum ada diagnosa.
        ${terkunci ? '' : 'Cari di kotak pencarian di atas atau klik salah satu diagnosa yang sering dipakai.'}</div></div>`;
      return;
    }
    const bpjs = kj.cara_bayar === 'BPJS';

    w.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th style="width:82px">Kode</th><th>Diagnosa</th>
        <th style="width:118px">Jenis</th><th style="width:104px">Kasus</th>
        ${terkunci ? '' : '<th style="width:1%"></th>'}</tr></thead>
      <tbody>${daftarDiagnosa.map((d, i) => `
        <tr ${bpjs && i >= 3 ? 'style="opacity:.6"' : ''}>
          <td class="mono"><b>${UI.esc(d.kode)}</b>
            ${bpjs ? `<div class="text-xs ${i < 3 ? 'text-muted' : ''}"
              style="${i >= 3 ? 'color:var(--warn-700)' : ''}">${i < 3
                ? 'kdDiag' + (i + 1) : 'tidak terkirim'}</div>` : ''}</td>
          <td>${UI.esc(d.nama)}</td>
          <td>${terkunci
            ? `<span class="badge ${d.jenis === 'PRIMER' ? 'b-bpjs' : 'b-umum'}">${d.jenis}</span>`
            : `<select data-jenis="${i}" style="padding:5px 8px;font-size:12.5px">
                 <option value="PRIMER" ${d.jenis === 'PRIMER' ? 'selected' : ''}>Primer</option>
                 <option value="SEKUNDER" ${d.jenis === 'SEKUNDER' ? 'selected' : ''}>Sekunder</option>
               </select>`}</td>
          <td>${terkunci
            ? UI.esc(d.kasus)
            : `<select data-kasus="${i}" style="padding:5px 8px;font-size:12.5px">
                 <option value="BARU" ${d.kasus === 'BARU' ? 'selected' : ''}>Baru</option>
                 <option value="LAMA" ${d.kasus === 'LAMA' ? 'selected' : ''}>Lama</option>
               </select>`}</td>
          ${terkunci ? '' : `<td><button class="btn-icon" data-hapus-dx="${i}"
            title="Hapus">${UI.ikon('x',14)}</button></td>`}
        </tr>`).join('')}</tbody></table></div>
      ${bpjs && daftarDiagnosa.length > 3 ? `<div class="banner warn mt-8 mb-0">
        <div>PCare hanya menerima tiga diagnosa. Yang terkirim adalah tiga teratas
        menurut urutan di tabel ini — ubah jenis atau hapus baris untuk mengatur
        mana yang ikut. Seluruh diagnosa tetap tersimpan di rekam medis.</div></div>` : ''}`;

    if (terkunci) return;
    w.querySelectorAll('[data-hapus-dx]').forEach(b => b.addEventListener('click', () => {
      daftarDiagnosa.splice(+b.dataset.hapusDx, 1);
      if (daftarDiagnosa.length && !daftarDiagnosa.some(x => x.jenis === 'PRIMER'))
        daftarDiagnosa[0].jenis = 'PRIMER';
      gambarDiagnosa(); perbaruiRingkasKirim();
      perbaruiUsulanKronis();
    }));
    w.querySelectorAll('[data-jenis]').forEach(s => s.addEventListener('change', () => {
      const i = +s.dataset.jenis;
      if (s.value === 'PRIMER') {
        daftarDiagnosa.forEach((d, j) => d.jenis = j === i ? 'PRIMER' : 'SEKUNDER');
        /* Diagnosa primer harus jadi kdDiag1. Kalau hanya jenisnya yang
           berubah tapi urutannya tidak, layar berkata "primer" sementara
           yang terkirim ke BPJS tetap baris pertama yang lama. */
        daftarDiagnosa.unshift(daftarDiagnosa.splice(i, 1)[0]);
      } else daftarDiagnosa[i].jenis = 'SEKUNDER';
      gambarDiagnosa();
    }));
    w.querySelectorAll('[data-kasus]').forEach(s => s.addEventListener('change', () => {
      daftarDiagnosa[+s.dataset.kasus].kasus = s.value;
    }));
  }

  function gambarDxBanding() {
    const w = document.getElementById('tabelDxBanding');
    if (!w) return;
    const terkunci = !document.getElementById('btnFinal');
    if (!dxBanding.length) {
      w.innerHTML = `<p class="text-muted text-sm">Tidak ada diagnosis banding dicatat.</p>`;
      return;
    }
    w.innerHTML = `<div class="chip-list mb-8">${dxBanding.map((d, i) => `
      <span class="chip">${UI.esc(d.nama)}${d.kode ? ` <span class="mono">${UI.esc(d.kode)}</span>` : ''}
        ${terkunci ? '' : `<button data-hapus-db="${i}" title="Hapus">×</button>`}</span>`).join('')}</div>`;
    if (terkunci) return;
    w.querySelectorAll('[data-hapus-db]').forEach(b => b.addEventListener('click', () => {
      dxBanding.splice(+b.dataset.hapusDb, 1); gambarDxBanding();
    }));
  }

  async function modalDxBanding() {
    let terpilih = null;
    const hasil = await UI.modal({
      judul: 'Tambah diagnosis banding',
      isi: `<p class="text-sm text-muted">Diagnosis yang dipertimbangkan tetapi belum
              ditegakkan. Tercatat di rekam medis, tidak dikirim sebagai diagnosa.</p>
            <div id="cariDb" class="mb-12"></div>
            <div class="field mb-0"><label>Atau tulis bebas</label>
              <input type="text" name="bebas" placeholder="Nama diagnosis banding"></div>`,
      siap: (b) => {
        Komponen.comboCari({
          wadah: b.querySelector('#cariDb'),
          placeholder: 'Cari ICD-10…',
          cariFn: (kata) => DB.cariIcd(kata),
          formatFn: (d) => `<b>${UI.esc(d.nama_id || d.nama_en)}</b><span>${UI.esc(d.kode)}</span>`,
          onPilih: (d) => {
            terpilih = { kode: d.kode, nama: d.nama_id || d.nama_en };
            b.querySelector('[name=bebas]').value = terpilih.nama;
          }
        });
      },
      tombol: [{ teks: 'Batal', nilai: null },
               { teks: 'Tambah', kelas: 'btn-primary', aksi: (b) => {
                  const bebas = b.querySelector('[name=bebas]').value.trim();
                  if (!bebas) { UI.toast('Pilih atau tulis diagnosis bandingnya.', 'err'); return false; }
                  return (terpilih && terpilih.nama === bebas) ? terpilih : { kode: null, nama: bebas };
               }}]
    });
    if (!hasil) return;
    dxBanding.push(hasil); gambarDxBanding();
  }

  /* =================================================================== *
   *  RESEP
   * =================================================================== */
  function pasangPencarianObat() {
    Komponen.comboCari({
      wadah: document.getElementById('cariObat'),
      placeholder: 'Cari obat… (contoh: paracetamol, amox)',
      cariFn: (kata) => DB.cariObat(kata),
      formatFn: (o) => `<b>${UI.esc(o.nama)}</b>
        <span>${UI.esc([o.bentuk_sediaan, o.golongan].filter(Boolean).join(' · '))}</span>`,
      onPilih: (o) => tambahObat(o)
    });
  }

  function tambahObat(o) {
    if (daftarResep.some(x => x.obat_id === o.id)) {
      UI.toast('Obat itu sudah ada dalam resep.', 'warn'); return;
    }
    const r = {
      obat_id: o.id, nama_obat: o.nama, kode_kfa: o.kode_kfa || null,
      kode_pcare: o.kode_pcare || null, obat_dpho: !!o.dpho,
      jumlah: 10, satuan: o.satuan, signa: '3 x sehari 1 tablet', keterangan: null
    };
    lengkapiSigna(r);
    daftarResep.push(r);
    gambarResep(); perbaruiRingkasKirim();
  }

  /* Dua angka yang diminta PCare diambil dari kalimat aturan pakai yang
     memang sudah diketik dokter. Yang tidak bisa diurai dibiarkan kosong
     dan ditandai di layar — bukan ditebak. Menebak signa1 = 1 berarti
     mengirim aturan pakai yang salah ke BPJS sementara kertas resep yang
     dipegang pasien tetap benar; tidak ada yang akan pernah tahu. */
  function lengkapiSigna(r) {
    if (r.frekuensi && r.dosis) return r;
    const s = PeriksaCore.uraiSigna(r.signa);
    r.frekuensi = s.frekuensi; r.dosis = s.dosis;
    return r;
  }

  function gambarResep() {
    const w = document.getElementById('tabelResep');
    const terkunci = !document.getElementById('btnFinal');
    if (!daftarResep.length) {
      w.innerHTML = `<div class="banner info mb-0"><div>Belum ada obat diresepkan.
        ${terkunci ? '' : 'Ketik nama obat di kotak pencarian di atas.'}</div></div>`;
      return;
    }
    const opsiSigna = signaCepat.map(s =>
      `<option value="${UI.esc(s.teks)}">${UI.esc(s.teks)}</option>`).join('');
    const bpjs = kj.cara_bayar === 'BPJS';

    w.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Obat</th><th style="width:96px">Jumlah</th>
        <th style="width:230px">Aturan pakai</th>
        ${terkunci ? '' : '<th style="width:1%"></th>'}</tr></thead>
      <tbody>${daftarResep.map((r, i) => `
        <tr>
          <td><b>${UI.esc(r.nama_obat)}</b>
            ${r.keterangan ? `<div class="text-xs text-muted">${UI.esc(r.keterangan)}</div>` : ''}</td>
          <td>${terkunci ? `${r.jumlah} ${UI.esc(r.satuan || '')}`
            : `<div class="flex gap-6 items-center">
                 <input type="number" data-jml="${i}" value="${r.jumlah}" min="1" max="999"
                        style="width:62px;padding:5px 7px;text-align:center">
                 <span class="text-xs text-muted">${UI.esc(r.satuan || '')}</span></div>`}</td>
          <td>${terkunci ? UI.esc(r.signa)
            : `<input list="signaOpsi" data-signa="${i}" value="${UI.esc(r.signa)}"
                      style="padding:5px 8px;font-size:12.5px" placeholder="3 x sehari 1 tablet">`}
            ${bpjs ? (r.frekuensi && r.dosis
              ? `<div class="text-xs text-muted mono">signa ${r.frekuensi} × ${r.dosis}</div>`
              : `<div class="text-xs" style="color:var(--warn-700)">belum terbaca sebagai angka</div>`) : ''}</td>
          ${terkunci ? '' : `<td><button class="btn-icon" data-hapus-obat="${i}"
            title="Hapus">${UI.ikon('x',14)}</button></td>`}
        </tr>`).join('')}</tbody></table></div>
      <datalist id="signaOpsi">${opsiSigna}</datalist>`;

    if (terkunci) return;
    w.querySelectorAll('[data-hapus-obat]').forEach(b => b.addEventListener('click', () => {
      daftarResep.splice(+b.dataset.hapusObat, 1); gambarResep(); perbaruiRingkasKirim();
    }));
    w.querySelectorAll('[data-jml]').forEach(inp => inp.addEventListener('change', () => {
      daftarResep[+inp.dataset.jml].jumlah = Math.max(1, Number(inp.value) || 1);
    }));
    w.querySelectorAll('[data-signa]').forEach(inp => inp.addEventListener('change', () => {
      const r = daftarResep[+inp.dataset.signa];
      r.signa = inp.value;
      r.frekuensi = null; r.dosis = null;   // dihitung ulang dari kalimat baru
      lengkapiSigna(r);
      gambarResep(); perbaruiRingkasKirim();
    }));
  }

  /* =================================================================== *
   *  POLI GIGI
   * =================================================================== */
  const PILIHAN_GIGI = {
    wajah:            ['Simetris', 'Asimetris'],
    kelenjar_limfe:   ['Tidak teraba', 'Teraba kiri', 'Teraba kanan', 'Teraba kedua sisi'],
    tmj:              ['Normal', 'Kliking', 'Nyeri saat membuka', 'Deviasi'],
    bibir:            ['Normal', 'Kering / pecah', 'Sianosis', 'Lesi'],
    mukosa_pipi:      ['Normal', 'Stomatitis', 'Ulkus', 'Bercak putih'],
    gusi:             ['Normal', 'Hiperemis', 'Bengkak', 'Mudah berdarah', 'Resesi'],
    lidah:            ['Normal', 'Berselaput', 'Ulkus', 'Fissured', 'Geografik'],
    palatum:          ['Normal', 'Hiperemis', 'Lesi'],
    dasar_mulut:      ['Normal', 'Bengkak', 'Lesi'],
    oklusi:           ['Normal bite', 'Cross bite', 'Deep bite', 'Open bite', 'Steep bite'],
    torus_palatinus:  ['Tidak ada', 'Kecil', 'Sedang', 'Besar', 'Multipel'],
    torus_mandibularis:['Tidak ada', 'Sisi kiri', 'Sisi kanan', 'Kedua sisi'],
    kebersihan_mulut: ['Baik', 'Sedang', 'Buruk']
  };

  function pilihan(nama, terpilih, wajib = false) {
    const opsi = PILIHAN_GIGI[nama] || [];
    return `<select name="${nama}" ${wajib ? 'required' : ''}>
      <option value="">— pilih —</option>
      ${opsi.map(o => `<option ${terpilih === o ? 'selected' : ''}>${UI.esc(o)}</option>`).join('')}
    </select>`;
  }

  function kartuGigi(pg, terkunci) {
    const umur = UI.umur(kj.pasien.tanggal_lahir);
    return `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Odontogram</h2>
            <div class="sub">${terkunci
              ? 'Keadaan gigi sebagaimana tercatat pada kunjungan ini'
              : 'Pilih kondisi di papan warna, lalu klik bidang gigi yang dimaksud. Klik nomor gigi untuk menandai seluruh gigi.'}</div></div>
          ${!terkunci ? `<button class="btn btn-secondary btn-sm" id="btnResetOdo"
            title="Kembalikan ke keadaan sebelum kunjungan ini">Batalkan perubahan</button>` : ''}
        </div>
        <div class="card-body">
          <div id="wadahOdontogram"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>Pemeriksaan gigi &amp; mulut</h2>
          <div class="sub">Ekstra oral dan intra oral</div></div></div>
        <div class="card-body" id="formGigi">
          <fieldset class="fieldset">
            <legend>Ekstra oral</legend>
            <div class="form-row c4">
              <div class="field"><label>Wajah</label>${pilihan('wajah', pg?.wajah)}</div>
              <div class="field"><label>Kelenjar limfe</label>${pilihan('kelenjar_limfe', pg?.kelenjar_limfe)}</div>
              <div class="field"><label>Sendi rahang (TMJ)</label>${pilihan('tmj', pg?.tmj)}</div>
              <div class="field"><label>Bibir</label>${pilihan('bibir', pg?.bibir)}</div>
            </div>
            <div class="field mb-0"><label>Temuan ekstra oral lain</label>
              <input type="text" name="ekstra_oral_lain" value="${UI.esc(pg?.ekstra_oral_lain)}"></div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>Intra oral</legend>
            <div class="form-row c3">
              <div class="field"><label>Mukosa pipi</label>${pilihan('mukosa_pipi', pg?.mukosa_pipi)}</div>
              <div class="field"><label>Gusi</label>${pilihan('gusi', pg?.gusi)}</div>
              <div class="field"><label>Lidah</label>${pilihan('lidah', pg?.lidah)}</div>
            </div>
            <div class="form-row c3">
              <div class="field"><label>Palatum</label>${pilihan('palatum', pg?.palatum)}</div>
              <div class="field"><label>Dasar mulut</label>${pilihan('dasar_mulut', pg?.dasar_mulut)}</div>
              <div class="field"><label>Oklusi</label>${pilihan('oklusi', pg?.oklusi)}</div>
            </div>
            <div class="form-row c3">
              <div class="field"><label>Torus palatinus</label>${pilihan('torus_palatinus', pg?.torus_palatinus)}</div>
              <div class="field"><label>Torus mandibularis</label>${pilihan('torus_mandibularis', pg?.torus_mandibularis)}</div>
              <div class="field"><label>Diastema</label>
                <input type="text" name="diastema" value="${UI.esc(pg?.diastema)}"
                  placeholder="Contoh: antara 11 dan 21"></div>
            </div>
            <div class="field mb-0">
              <label class="check"><input type="checkbox" name="supernumerary" ${pg?.supernumerary ? 'checked' : ''}>
                <span>Terdapat gigi berlebih (supernumerary)</span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset mb-0">
            <legend>Kebersihan mulut</legend>
            <div class="form-row c3">
              <div class="field"><label>Penilaian</label>${pilihan('kebersihan_mulut', pg?.kebersihan_mulut)}</div>
              <div class="field"><label>Skor OHI-S <span class="opt">bila diukur</span></label>
                <input type="number" name="ohis" step="0.1" min="0" max="6" value="${pg?.ohis ?? ''}"></div>
              <div class="field"><label>Catatan</label>
                <input type="text" name="catatan" value="${UI.esc(pg?.catatan)}"></div>
            </div>
          </fieldset>
          <p class="hint mt-8 mb-0">Indeks DMF-T dan def-t dihitung otomatis dari odontogram
            dan ikut tersimpan bersama pemeriksaan ini${umur ? ` (umur pasien ${umur.tahun} tahun)` : ''}.</p>
        </div>
      </div>`;
  }

  function pasangOdontogram(terkunci) {
    const wadah = document.getElementById('wadahOdontogram');
    if (!wadah) return;
    const umur = UI.umur(kj.pasien.tanggal_lahir);
    odoWidget = Odontogram.buat(wadah, {
      kondisiRef: kondisiGigiRef,
      gigiRef,
      data: dataOdontogram,
      umur: umur ? umur.tahun : null,
      bacaan: bacaanGigi,
      bacaSaja: terkunci,
      onUbah: (baru) => { dataOdontogram = baru; }
    });

    const btnReset = document.getElementById('btnResetOdo');
    if (btnReset) btnReset.addEventListener('click', async () => {
      const ya = await UI.konfirmasi('Batalkan perubahan odontogram?',
        'Odontogram akan dikembalikan ke keadaan terakhir yang tersimpan di database. '
        + 'Perubahan yang belum disimpan pada kunjungan ini akan hilang.', 'Ya, kembalikan');
      if (!ya) return;
      dataOdontogram = await DB.odontogram(kj.pasien_id);
      odoWidget.pasangData(dataOdontogram);
      UI.toast('Odontogram dikembalikan ke keadaan tersimpan.', 'ok');
    });
  }

  /* =================================================================== *
   *  TINDAKAN
   * =================================================================== */
  function pasangPencarianTindakan() {
    const wadah = document.getElementById('cariTindakan');
    if (!wadah) return;
    Komponen.comboCari({
      wadah,
      placeholder: poliGigi
        ? 'Cari tindakan… (contoh: cabut, tambal, skeling)'
        : 'Cari tindakan… (contoh: jahit, nebulisasi, injeksi)',
      cariFn: (kata) => DB.cariIcd9(kata, poliGigi ? ['GIGI','PENUNJANG'] : null),
      formatFn: (t) => `<b>${UI.esc(t.nama_id)}</b>
        <span>${UI.esc(t.kode)} · ${UI.esc(t.kategori || '')}${t.per_gigi ? ' · perlu nomor gigi' : ''}</span>`,
      onPilih: (t) => tambahTindakan(t)
    });
  }

  function tambahTindakan(t) {
    daftarTindakan.push({
      kode: t.kode, nama: t.nama_id, kode_pcare: t.kode_pcare || null,
      fdi: null, jumlah: 1, perluGigi: !!t.per_gigi, catatan: null
    });
    gambarTindakan();
  }

  function gambarTindakan() {
    const w = document.getElementById('tabelTindakan');
    if (!w) return;
    const terkunci = !document.getElementById('btnFinal');
    if (!daftarTindakan.length) {
      w.innerHTML = `<div class="banner info mb-0"><div>Belum ada tindakan dicatat.
        ${terkunci ? '' : 'Ketik nama tindakan di kotak pencarian di atas.'}</div></div>`;
      return;
    }
    const opsiGigi = gigiRef.length
      ? gigiRef.map(g => `<option value="${g.fdi}">${g.fdi}</option>`).join('')
      : '';

    w.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th style="width:76px">Kode</th><th>Tindakan</th>
        ${poliGigi ? '<th style="width:96px">Gigi</th>' : ''}
        <th style="width:78px">Jumlah</th>
        ${terkunci ? '' : '<th style="width:1%"></th>'}</tr></thead>
      <tbody>${daftarTindakan.map((t, i) => `
        <tr>
          <td class="mono"><b>${UI.esc(t.kode)}</b></td>
          <td>${UI.esc(t.nama)}
            ${t.perluGigi && !t.fdi && !terkunci
              ? '<div class="text-xs" style="color:var(--warn-700)">Sebutkan nomor giginya</div>' : ''}</td>
          ${poliGigi ? `<td>${(terkunci || !t.perluGigi)
            ? (t.fdi || '<span class="muted" title="Tindakan ini tidak terkait satu gigi tertentu">—</span>')
            : `<select data-fdi="${i}" style="padding:5px 7px;font-size:12.5px">
                 <option value="">—</option>
                 ${opsiGigi.replace(`value="${t.fdi}"`, `value="${t.fdi}" selected`)}
               </select>`}</td>` : ''}
          <td>${terkunci ? t.jumlah
            : `<input type="number" data-jml-tindakan="${i}" value="${t.jumlah}" min="1" max="99"
                      style="width:58px;padding:5px 7px;text-align:center">`}</td>
          ${terkunci ? '' : `<td><button class="btn-icon" data-hapus-tindakan="${i}"
            title="Hapus">${UI.ikon('x',14)}</button></td>`}
        </tr>`).join('')}</tbody></table></div>`;

    if (terkunci) return;
    w.querySelectorAll('[data-hapus-tindakan]').forEach(b => b.addEventListener('click', () => {
      daftarTindakan.splice(+b.dataset.hapusTindakan, 1); gambarTindakan();
    }));
    w.querySelectorAll('[data-fdi]').forEach(sel => sel.addEventListener('change', () => {
      daftarTindakan[+sel.dataset.fdi].fdi = sel.value || null;
    }));
    w.querySelectorAll('[data-jml-tindakan]').forEach(inp => inp.addEventListener('change', () => {
      daftarTindakan[+inp.dataset.jmlTindakan].jumlah = Math.max(1, Number(inp.value) || 1);
    }));
  }

  /* =================================================================== *
   *  PEMERIKSAAN PENUNJANG
   * =================================================================== */
  function kartuPenunjang(terkunci, bolehTulis) {
    const adaLab = labKunjungan.length, adaBacaan = bacaanKunjungan.length;

    const barisLab = labKunjungan.map(lp => {
      const isi = (lp.hasil || []).slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
      const r = LabCore.ringkasLembar(isi);
      return `
        <div class="fieldset" style="margin-bottom:12px">
          <legend>${UI.esc(lp.no_lab)} · ${UI.tglPendek(lp.tanggal)}
            ${lp.asal === 'EKSTERNAL' ? '· ' + UI.esc(lp.nama_lab_luar || 'lab luar') : ''}</legend>
          <div class="flex mb-8" style="gap:8px;align-items:center;flex-wrap:wrap">
            ${Lab.lencanaStatus(lp.status)}
            <span class="text-muted" style="font-size:12.5px">${r.terisi} dari ${r.total} terisi</span>
            ${r.kritis ? `<span class="badge b-danger">${r.kritis} nilai kritis</span>` : ''}
            <a href="#/lab/hasil/${lp.id}" class="btn btn-ghost btn-sm no-print">Buka lembar</a>
          </div>
          ${r.terisi ? `<div class="table-wrap"><table class="tbl">
            <thead><tr><th>Pemeriksaan</th><th class="num">Hasil</th>
              <th>Rujukan</th><th>Tanda</th></tr></thead>
            <tbody>${isi.filter(h => h.nilai_angka !== null || h.nilai_teks).map(h => {
              const m = h.ref || {};
              const nilai = m.jenis_nilai === 'ANGKA'
                ? LabCore.formatNilai(h.nilai_angka, m.desimal) : (h.nilai_teks || '');
              const berat = (LabCore.TANDA[h.tanda] || {}).berat || 0;
              return `<tr>
                <td>${UI.esc(h.nama)}</td>
                <td class="num" ${berat >= 3 ? 'style="color:var(--danger);font-weight:700"'
                                : berat >= 2 ? 'style="font-weight:700"' : ''}>
                  ${UI.esc(nilai)} <span class="text-muted">${UI.esc(h.satuan || '')}</span></td>
                <td class="muted mono" style="font-size:12px">${UI.esc(h.rujukan_teks || '—')}</td>
                <td>${Lab.lencanaTanda(h.tanda)}</td>
              </tr>`;
            }).join('')}</tbody></table></div>`
            : `<p class="text-muted" style="margin:0;font-size:13px">Belum ada hasil yang masuk.</p>`}
        </div>`;
    }).join('');

    const barisBacaan = bacaanKunjungan.map(b => `
      <div class="fieldset" style="margin-bottom:12px">
        <legend>${UI.esc(LabCore.labelJenis(b.jenis))} · ${UI.tglPendek(b.tanggal)}
          ${b.daftar_gigi ? '· gigi ' + UI.esc(b.daftar_gigi) : ''}</legend>
        ${b.temuan ? `<p style="margin:0 0 6px;font-size:13.5px">
          <b>Temuan:</b> ${UI.esc(b.temuan)}</p>` : ''}
        <p style="margin:0 0 6px;font-size:13.5px"><b>Kesan:</b> ${UI.esc(b.kesan)}</p>
        ${b.saran ? `<p style="margin:0;font-size:13.5px"><b>Saran:</b> ${UI.esc(b.saran)}</p>` : ''}
      </div>`).join('');

    return `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Pemeriksaan penunjang</h2>
            <div class="sub">Laboratorium dan bacaan rontgen / EKG / USG pada kunjungan ini</div></div>
          ${!terkunci && bolehTulis ? `<div class="btn-group no-print">
            <button class="btn btn-secondary btn-sm" id="btnMintaLab">${UI.ikon('plus',15)} Minta lab</button>
            <button class="btn btn-secondary btn-sm" id="btnTulisBacaan">${UI.ikon('plus',15)} Tulis bacaan</button>
          </div>` : ''}
        </div>
        <div class="card-body">
          ${!adaLab && !adaBacaan
            ? `<p class="text-muted" style="margin:0;font-size:13.5px">
                 Belum ada pemeriksaan penunjang pada kunjungan ini.</p>`
            : barisLab + barisBacaan}
        </div>
      </div>`;
  }

  async function modalMintaLab() {
    if (!masterLab.length) masterLab = await DB.refLab(true);
    if (!paketLab.length)  paketLab  = await DB.refLabPaket();

    const dipilih = new Set();
    const grup = {};
    masterLab.forEach(m => { (grup[m.kelompok] = grup[m.kelompok] || []).push(m); });

    const hasil = await UI.modal({
      judul: 'Minta pemeriksaan laboratorium',
      lebar: true,
      isi: `
        <div class="field"><label>Paket yang sering diminta</label>
          <div class="chip-list" id="pkLab">
            ${paketLab.map(pk => `<button type="button" class="chip-quick" data-paket="${pk.id}">
              ${UI.esc(pk.nama)}</button>`).join('')}
          </div></div>
        <div class="field"><label>Pemeriksaan</label>
          <div style="max-height:260px;overflow-y:auto;border:1px solid var(--ink-200);
                      border-radius:8px;padding:10px" id="dfLab">
            ${Object.entries(grup).map(([k, isi]) => `
              <div style="margin-bottom:10px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                      letter-spacing:.04em;color:var(--ink-500);margin-bottom:5px">${UI.esc(k)}</div>
                <div class="form-row c3">
                  ${isi.map(m => `<label class="check">
                    <input type="checkbox" value="${m.id}">
                    <span>${UI.esc(m.nama)}${m.satuan
                      ? ` <span class="text-muted">(${UI.esc(m.satuan)})</span>` : ''}</span>
                  </label>`).join('')}
                </div>
              </div>`).join('')}
          </div>
          <div class="hint" id="hitungLab">Belum ada yang dipilih.</div></div>
        <div class="field mb-0"><label for="catLab">Keterangan klinis untuk petugas lab
          <span class="opt">opsional</span></label>
          <input type="text" id="catLab" placeholder="mis. curiga demam berdarah hari ke-3"></div>`,
      siap: (b) => {
        const perbarui = () => {
          b.querySelector('#hitungLab').textContent = dipilih.size
            ? dipilih.size + ' pemeriksaan dipilih.' : 'Belum ada yang dipilih.';
        };
        b.querySelector('#dfLab').addEventListener('change', (e) => {
          const c = e.target.closest('input[type=checkbox]'); if (!c) return;
          c.checked ? dipilih.add(c.value) : dipilih.delete(c.value);
          perbarui();
        });
        b.querySelector('#pkLab').addEventListener('click', (e) => {
          const t = e.target.closest('[data-paket]'); if (!t) return;
          const pk = paketLab.find(x => x.id === t.dataset.paket);
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
        { teks: 'Kirim ke lab', kelas: 'btn-primary', aksi: async (b) => {
            if (!dipilih.size) { UI.toast('Pilih minimal satu pemeriksaan.', 'err'); return false; }
            try {
              await DB.labMinta(kj.id, Array.from(dipilih),
                                b.querySelector('#catLab').value.trim() || null);
              UI.toast('Permintaan dikirim ke laboratorium.');
              return true;
            } catch (e) { UI.toast(e.message || 'Gagal mengirim permintaan.', 'err'); return false; }
          } }
      ]
    });
    if (hasil === true) { labKunjungan = await DB.labKunjungan(kj.id); App.segarkan(); }
  }

  /* =================================================================== *
   *  KESIAPAN & PRATINJAU PENGIRIMAN
   * =================================================================== */
  function keadaanSekarang() {
    const a = UI.nilaiForm(document.getElementById('formAnamnesis'));
    const f = UI.nilaiForm(document.getElementById('formFisik'));
    const t = UI.nilaiForm(document.getElementById('formTerapi'));
    const l = UI.nilaiForm(document.getElementById('formLanjut'));
    return {
      kunjungan: kj, kajian: ka, diagnosa: daftarDiagnosa, resep: daftarResep,
      pemeriksaan: {
        keluhan_utama: a.keluhan_utama,
        kesadaran_kode: f.kesadaran_kode,
        pemeriksaan_fisik: fisik,
        objective: document.getElementById('objective')?.value,
        status_pulang_kode: l.status_pulang_kode,
        prognosa_kode: l.prognosa_kode,
        tindak_lanjut: l.tindak_lanjut,
        tanggal_kontrol: l.tanggal_kontrol,
        rujuk_ppk_kode: l.rujuk_ppk_kode,
        rujuk_poli_internal_id: l.rujuk_poli_internal_id,
        tacc_kode: l.tacc_kode, tacc_alasan: l.tacc_alasan,
        terapi_non_obat: t.terapi_non_obat, bmhp: t.bmhp
      }
    };
  }

  function perbaruiRingkasKirim() {
    const w = document.getElementById('ringkasKirim');
    if (!w || !document.getElementById('formAnamnesis')) return;
    const p = PeriksaCore.periksaKelengkapan(keadaanSekarang());

    if (!p.galat.length && !p.peringatan.length) {
      w.innerHTML = `<div class="banner ok mb-0">${UI.ikon('cek',16)}
        <div>Seluruh data yang diminta PCare sudah lengkap.</div></div>`;
      return;
    }
    w.innerHTML = `
      ${p.galat.length ? `<div class="banner err mb-8"><div>
        <b>Belum bisa dikunci:</b> ${UI.esc(p.galat.join(', '))}.</div></div>` : ''}
      ${p.peringatan.length ? `<div class="banner warn mb-0"><div>
        <ul style="margin:0;padding-left:18px">
          ${p.peringatan.map(x => `<li>${UI.esc(x)}</li>`).join('')}
        </ul></div></div>` : ''}`;
  }

  /* Pratinjau dibaca dari view database, bukan disusun ulang di peramban.
     Yang ditampilkan harus benar-benar yang akan dikirim; kalau layar
     menyusun sendiri, ia bisa terlihat lengkap sementara yang terkirim
     berbeda — persis kesalahan yang paling sulit ditemukan nanti. */
  async function modalPayload() {
    let isi = `<p class="text-muted text-sm">Memuat…</p>`;
    try {
      const pv = await DB.pcarePratinjau(kj.id);
      const kn = pv.kunjungan;
      if (!kn) {
        isi = `<div class="banner info mb-0"><div>Data kunjungan ini belum tersimpan.
          Simpan dulu, lalu buka kembali pratinjau.</div></div>`;
      } else {
        const baris = (k, v) => {
          const kosong = v === null || v === undefined || v === '';
          return `<tr>
            <td class="mono" style="width:170px">${UI.esc(k)}</td>
            <td ${kosong ? 'style="color:var(--warn-700)"' : ''}>${kosong
              ? 'belum terisi'
              : UI.esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</td></tr>`;
        };
        const urut = ['noKartu','tglDaftar','kdPoli','keluhan','kdSadar','sistole','diastole',
          'beratBadan','tinggiBadan','respRate','heartRate','lingkarPerut','suhu',
          'kdStatusPulang','tglPulang','kdDokter','kdDiag1','kdDiag2','kdDiag3',
          'kdPoliRujukInternal','rujukLanjut','kdTacc','alasanTacc','anamnesa',
          'alergiMakan','alergiUdara','alergiObat','kdPrognosa','terapiObat',
          'terapiNonObat','bmhp'];
        isi = `
          <p class="text-sm text-muted">Isi persis seperti yang akan dikirim ke
            <b>PCare /kunjungan</b>. Baris berwarna belum terisi — sebagian karena
            datanya kurang, sebagian karena pemetaan kode PCare belum diisi di
            Pengaturan.</p>
          <div class="table-wrap" style="max-height:340px;overflow-y:auto">
            <table class="tbl">${urut.map(k => baris(k, kn[k])).join('')}</table></div>
          ${pv.obat.length ? `<h3 class="mt-16 mb-8">Obat (${pv.obat.length})</h3>
            <div class="table-wrap"><table class="tbl">
              <thead><tr><th>kdObat / nama</th><th>signa1</th><th>signa2</th><th>jmlObat</th></tr></thead>
              <tbody>${pv.obat.map(o => `<tr>
                <td>${UI.esc(o.kdObat || o.nmObatNonDPHO)}</td>
                <td>${UI.esc(o.signa1)}</td><td>${UI.esc(o.signa2)}</td>
                <td>${UI.esc(o.jmlObat)}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${pv.tindakan.length ? `<h3 class="mt-16 mb-8">Tindakan (${pv.tindakan.length})</h3>
            <div class="table-wrap"><table class="tbl">
              <tbody>${pv.tindakan.map(t => `<tr>
                <td class="mono">${UI.esc(t.kdTindakan || 'kode PCare belum diisi')}</td>
                <td>${UI.esc(t.keterangan || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
      }
    } catch (e) {
      isi = `<div class="banner err mb-0"><div>Pratinjau tidak bisa dimuat:
        ${UI.esc(e.message || '')}</div></div>`;
    }
    await UI.modal({
      judul: 'Data yang akan dikirim ke PCare', lebar: true, isi,
      tombol: [{ teks: 'Tutup', nilai: null }]
    });
  }

  /* =================================================================== *
   *  SIMPAN
   * =================================================================== */
  function kumpulkan() {
    const a = UI.nilaiForm(document.getElementById('formAnamnesis'));
    const f = UI.nilaiForm(document.getElementById('formFisik'));
    const t = UI.nilaiForm(document.getElementById('formTerapi'));
    const l = UI.nilaiForm(document.getElementById('formLanjut'));
    const s = UI.nilaiForm(document.getElementById('formSoap'));

    const rps = {};
    PeriksaCore.BUTIR_RPS.forEach(([k]) => { if (a['rps_' + k]) rps[k] = a['rps_' + k]; });

    const rujuk = l.tindak_lanjut === 'RUJUK_LANJUT' || l.tindak_lanjut === 'RUJUK_IGD';
    const ppk = refPpk.find(x => x.kode === l.rujuk_ppk_kode);
    const sub = refSubspes.find(x => x.kode === l.rujuk_subspesialis_kode);
    const tacc = refTacc.find(x => x.kode === l.tacc_kode);

    return {
      // Anamnesis
      keluhan_utama: a.keluhan_utama,
      riwayat_penyakit_sekarang: rps,
      riwayat_penyakit_dahulu: a.riwayat_penyakit_dahulu,
      riwayat_keluarga: a.riwayat_keluarga,
      riwayat_pengobatan: a.riwayat_pengobatan,
      riwayat_sosial: a.riwayat_sosial,
      // Objektif
      keadaan_umum: f.keadaan_umum,
      kesadaran_kode: f.kesadaran_kode || null,
      pemeriksaan_fisik: fisik,
      // Penilaian
      diagnosis_banding: dxBanding,
      // Rencana
      terapi_non_obat: t.terapi_non_obat,
      bmhp: t.bmhp,
      edukasi: t.edukasi,
      prognosa_kode: l.prognosa_kode || null,
      status_pulang_kode: l.status_pulang_kode || null,
      tindak_lanjut: l.tindak_lanjut || 'SELESAI',
      tanggal_kontrol: l.tindak_lanjut === 'KONTROL' ? l.tanggal_kontrol : null,
      /* Isian rujukan yang tidak dipakai sengaja dikosongkan, bukan
         dibiarkan menempel dari pilihan sebelumnya. Kolom kdppk yang
         tertinggal dari percobaan "rujuk" yang batal akan ikut terkirim
         ke BPJS sebagai rujukan yang tidak pernah terjadi. */
      rujuk_poli_internal_id: l.tindak_lanjut === 'RUJUK_INTERNAL' ? (l.rujuk_poli_internal_id || null) : null,
      rujuk_ppk_kode:          rujuk ? (l.rujuk_ppk_kode || null) : null,
      rujuk_subspesialis_kode: rujuk ? (l.rujuk_subspesialis_kode || null) : null,
      rujuk_sarana_kode:       rujuk ? (l.rujuk_sarana_kode || null) : null,
      rujuk_tgl_estimasi:      rujuk ? (l.rujuk_tgl_estimasi || null) : null,
      rujuk_alasan:            rujuk ? l.rujuk_alasan : null,
      rujuk_ke_faskes:         rujuk && ppk ? ppk.nama : null,
      rujuk_spesialis:         rujuk && sub ? sub.nama : null,
      /* TACC yang perlu alasan tetapi alasannya belum diketik sengaja
         BELUM dikirim ke database: triggernya menolak, dan penolakan itu
         akan menggagalkan seluruh penyimpanan sementara — termasuk
         catatan yang sudah panjang diketik. Yang menahan penguncian
         adalah periksaKelengkapan(), yang menyebutnya sebagai galat dan
         menolak tombol "Selesai & kunci". */
      tacc_kode: (rujuk && tacc && (!tacc.perlu_alasan || (l.tacc_alasan || '').trim()))
        ? tacc.kode : (rujuk ? 'TIDAK' : null),
      tacc_alasan: rujuk && tacc && tacc.perlu_alasan ? l.tacc_alasan : null,
      // Narasi
      subjective: s.subjective, objective: s.objective,
      assessment: s.assessment, plan: s.plan
    };
  }

  async function simpan(final) {
    /* Narasi disusun ulang sebelum dikumpulkan, supaya yang tersimpan
       selalu mencerminkan isian terstruktur — kecuali huruf yang memang
       diketik tangan dokter. */
    const susunan = susunSoapSekarang();
    terapkanSoap(susunan);

    const d = kumpulkan();
    d.anamnesis = susunan.anamnesis;
    d.terapi_obat = susunan.terapi_obat;

    if (final) {
      const p = PeriksaCore.periksaKelengkapan(keadaanSekarang());
      if (!p.boleh) {
        UI.toast('Belum lengkap: ' + p.galat.join(', ') + '.', 'err', 6000);
        return;
      }
      const tanpaGigi = daftarTindakan.filter(t => t.perluGigi && !t.fdi);
      if (poliGigi && tanpaGigi.length) {
        UI.toast('Tindakan berikut belum disebutkan nomor giginya: '
          + tanpaGigi.map(t => t.nama).join(', ') + '.', 'err', 6000);
        return;
      }
      const ya = await UI.konfirmasi('Kunci rekam medis kunjungan ini?',
        (p.peringatan.length
          ? 'Catatan: ' + p.peringatan.join(' ') + '\n\n'
          : '')
        + 'Setelah dikunci, catatan tidak dapat diubah lagi. Perubahan hanya bisa '
        + 'ditambahkan sebagai addendum. Pastikan semua isian sudah benar.',
        'Ya, kunci sekarang');
      if (!ya) return;
    }

    const tombol = document.getElementById(final ? 'btnFinal' : 'btnSimpanDraf');
    if (tombol) { tombol.disabled = true; tombol.textContent = 'Menyimpan…'; }

    try {
      await DB.simpanPemeriksaan(kj.id, d);
      await DB.simpanDiagnosa(kj.id, daftarDiagnosa);
      await DB.simpanResep(kj.id, daftarResep);
      await DB.simpanTindakan(kj.id, daftarTindakan);

      if (poliGigi) {
        await DB.simpanOdontogram(kj.pasien_id, kj.id, dataOdontogram);
        const indeks = odoWidget ? odoWidget.hitungIndeks()
                                 : { dmft: {d:0,m:0,f:0}, deft: {d:0,e:0,f:0} };
        const g = UI.nilaiForm(document.getElementById('formGigi'));
        await DB.simpanPemeriksaanGigi(kj.id, {
          wajah: g.wajah, kelenjar_limfe: g.kelenjar_limfe, tmj: g.tmj, bibir: g.bibir,
          ekstra_oral_lain: g.ekstra_oral_lain,
          mukosa_pipi: g.mukosa_pipi, gusi: g.gusi, lidah: g.lidah, palatum: g.palatum,
          dasar_mulut: g.dasar_mulut, oklusi: g.oklusi,
          torus_palatinus: g.torus_palatinus, torus_mandibularis: g.torus_mandibularis,
          supernumerary: !!g.supernumerary, diastema: g.diastema,
          kebersihan_mulut: g.kebersihan_mulut, ohis: g.ohis, catatan: g.catatan,
          d_decay: indeks.dmft.d, m_missing: indeks.dmft.m, f_filled: indeks.dmft.f,
          d_sulung: indeks.deft.d, e_sulung: indeks.deft.e, f_sulung: indeks.deft.f
        });
      }

      if (final) {
        await DB.finalisasi(kj.id);
        UI.toast('Rekam medis dikunci. Pelayanan selesai.', 'ok');
        App.perbaruiHitungAntrian();
        App.pergi('#/rekam/' + kj.id);
      } else {
        UI.toast('Tersimpan sementara.', 'ok', 1800);
        const st = document.getElementById('statusSimpan');
        if (st) st.textContent = 'Terakhir disimpan ' + UI.jam(new Date());
        perbaruiRingkasKirim();
      }
    } catch (e) {
      UI.toast(e.message || 'Gagal menyimpan.', 'err', 6000);
    } finally {
      if (tombol && !final) { tombol.disabled = false; tombol.textContent = 'Simpan sementara'; }
      if (tombol && final)  { tombol.disabled = false; tombol.innerHTML = `${UI.ikon('cek',17)} Selesai &amp; kunci rekam medis`; }
    }
  }

  /* Simpan otomatis tiap 90 detik supaya catatan tidak hilang */
  function pasangSimpanOtomatis() {
    clearInterval(simpanOtomatis);
    simpanOtomatis = setInterval(async () => {
      if (!document.getElementById('btnSimpanDraf')) { clearInterval(simpanOtomatis); return; }
      const a = UI.nilaiForm(document.getElementById('formAnamnesis'));
      if (!a.keluhan_utama && !Object.keys(fisik).length && !daftarDiagnosa.length) return;
      try {
        const susunan = susunSoapSekarang();
        terapkanSoap(susunan);
        const d = kumpulkan();
        d.anamnesis = susunan.anamnesis;
        d.terapi_obat = susunan.terapi_obat;
        await DB.simpanPemeriksaan(kj.id, d);
        const st = document.getElementById('statusSimpan');
        if (st) st.textContent = 'Tersimpan otomatis ' + UI.jam(new Date());
      } catch (e) { /* diam saja, dokter tetap bisa simpan manual */ }
    }, 90000);
  }

  /* =================================================================== *
   *  ADDENDUM, RIWAYAT, CETAK
   * =================================================================== */
  async function modalAddendum() {
    const hasil = await UI.modal({
      judul: 'Tambah addendum',
      isi: `<p class="text-sm text-muted">Addendum adalah catatan tambahan yang melekat pada rekam
              medis yang sudah dikunci. Catatan asli tidak berubah.</p>
            <div class="field"><label>Isi catatan tambahan <span class="req">*</span></label>
              <textarea name="isi" rows="4" placeholder="Tuliskan koreksi atau tambahan informasi…"></textarea></div>
            <div class="field mb-0"><label>Alasan</label>
              <input type="text" name="alasan" placeholder="Contoh: hasil laboratorium baru diterima"></div>`,
      tombol: [{ teks: 'Batal', nilai: null },
               { teks: 'Simpan addendum', kelas: 'btn-primary', aksi: (b) => {
                  const d = UI.nilaiForm(b);
                  if (!d.isi) { UI.toast('Isi catatan wajib diisi.', 'err'); return false; }
                  return d;
               }}]
    });
    if (!hasil) return;
    try {
      await DB.tambahAddendum(kj.id, hasil.isi, hasil.alasan);
      UI.toast('Addendum tersimpan.', 'ok');
      App.pergi('#/rekam/' + kj.id);
    } catch (e) { UI.toast(e.message || 'Gagal menyimpan addendum.', 'err'); }
  }

  async function muatKartuSurat(kunjunganId, bolehBuat) {
    const w = document.getElementById('kartuSurat');
    if (!w) return;
    try {
      w.innerHTML = await Surat.kartuSuratKunjungan(kunjunganId, bolehBuat);
      Surat.pasangKartuSurat(w);
    } catch (e) {
      w.innerHTML = `<p class="text-muted text-sm mb-0">Daftar surat tidak bisa dimuat.</p>`;
    }
  }

  /* =================================================================== *
   *  BUKU KRONIS (Tahap 2)
   *  ---------------------------------------------------------------
   *  Mendaftarkan/mengubah buku kronis dilakukan DI SINI (halaman
   *  Periksa), bukan di halaman Pemantauan Kronis — itu halaman baca
   *  saja. Dibatasi dokter & belum terkunci (bolehKelolaKronis), lebih
   *  sempit daripada boleh_kronis_kelola() di database (yang juga
   *  mengizinkan perawat/admin) — pengurangan cakupan yang disengaja
   *  supaya sesi ini tidak menyentuh halaman kajian perawat.
   * =================================================================== */
  function bolehKelolaKronis() {
    // Trik yang sama dipakai gambarDiagnosa()/gambarResep(): keberadaan
    // tombol Selesai menandai rekam medis belum dikunci, tanpa perlu
    // menyimpan ulang `terkunci` sebagai state modul.
    return App.boleh(['dokter']) && !!document.getElementById('btnFinal');
  }

  async function muatKartuKronis() {
    const w = document.getElementById('kartuKronis');
    if (!w) return;
    try {
      if (!refKronisDiagnosaCache) refKronisDiagnosaCache = await DB.refKronisDiagnosa();
      kronisBuku = await DB.kronisPasien(kj.pasien_id);
      kronisStatin = kronisBuku?.statin_kunci
        ? await DB.kronisStatinPasien(kj.pasien_id).catch(() => null) : null;
      await perbaruiUsulanKronis(false);
      gambarKronis();
    } catch (e) {
      w.innerHTML = `<p class="text-muted text-sm mb-0">Buku kronis tidak bisa dimuat.</p>`;
    }
  }

  /* Dipanggil ulang setiap kali daftar diagnosa kunjungan berubah
     (tambahDiagnosa / hapus di gambarDiagnosa), supaya usulan pendaftaran
     kronis selalu mengikuti diagnosa TERBARU, bukan diagnosa saat
     halaman dibuka. */
  async function perbaruiUsulanKronis(gambar = true) {
    if (!kj?.pasien_id || !bolehKelolaKronis()) {
      kronisUsulan = [];
    } else {
      try {
        kronisUsulan = await DB.kronisUsulanDiagnosa(kj.pasien_id, daftarDiagnosa.map(d => d.kode));
      } catch (e) { kronisUsulan = []; }
    }
    if (gambar) gambarKronis();
  }

  function gambarKronis() {
    const w = document.getElementById('kartuKronis');
    if (!w) return;
    const bolehKelola = bolehKelolaKronis();
    const namaDiagnosa = (kode) => {
      const d = (refKronisDiagnosaCache || []).find(x => x.kode === kode);
      return d ? d.nama : kode;
    };

    if (!kronisBuku) {
      w.innerHTML = `
        <div class="banner info mb-0"><div>Pasien ini belum terdaftar di buku kronis.</div></div>
        ${kronisUsulan.length ? `
          <p class="text-sm mt-12 mb-8">Diagnosa kunjungan ini cocok untuk dipantau kronis:
            ${kronisUsulan.map(u => `<span class="chip">${UI.esc(u.nama)}</span>`).join(' ')}</p>
          <button class="btn btn-secondary btn-sm btn-block" id="btnDaftarKronis">
            ${UI.ikon('plus', 14)} Daftarkan ke buku kronis</button>`
          : (bolehKelola ? `<button class="btn btn-ghost btn-sm btn-block mt-12" id="btnDaftarKronis">
              Daftarkan ke buku kronis</button>` : '')}`;
      const bd = w.querySelector('#btnDaftarKronis');
      if (bd) bd.addEventListener('click', () => modalBukuKronis());
      return;
    }

    w.innerHTML = `
      <div class="mb-8">${kronisBuku.diagnosa.map(k =>
        `<span class="chip">${UI.esc(namaDiagnosa(k))}</span>`).join(' ')}</div>
      ${kronisBuku.obat.length
        ? `<ul class="text-sm" style="margin:0 0 10px;padding-left:18px">
            ${kronisBuku.obat.map(o => `<li>${UI.esc(o.nama_obat)}${o.jumlah
              ? ` — ${UI.esc(String(o.jumlah))} ${UI.esc(o.satuan || '')}` : ''}${o.signa
              ? ` <span class="text-muted">(${UI.esc(o.signa)})</span>` : ''}</li>`).join('')}
           </ul>`
        : `<p class="text-muted text-sm">Belum ada obat rutin kronis dicatat.</p>`}
      ${kronisBuku.statin_kunci ? `
        <div class="flex items-center gap-8 mb-8 flex-wrap">
          <span class="text-sm">${UI.esc(kronisBuku.statin_nama || kronisBuku.statin_kunci)}</span>
          ${kronisStatin ? `<span class="badge b-${KronisPantauCore.warnaStatin(kronisStatin)}">
            ${UI.esc(KronisPantauCore.labelStatin(kronisStatin))}</span>` : ''}
        </div>` : ''}
      <div class="text-xs text-muted mb-12">Terdaftar sejak ${UI.tglPendek(kronisBuku.tanggal_mulai)}</div>
      ${bolehKelola ? `
        <div class="flex gap-8">
          <button class="btn btn-secondary btn-sm flex-1" id="btnUbahKronis">Ubah</button>
          <button class="btn btn-ghost btn-sm" id="btnHentikanKronis"
            style="color:var(--danger-700)">Hentikan</button>
        </div>` : ''}`;

    const bu = w.querySelector('#btnUbahKronis');
    if (bu) bu.addEventListener('click', () => modalBukuKronis());
    const bh = w.querySelector('#btnHentikanKronis');
    if (bh) bh.addEventListener('click', hentikanKronis);
  }

  async function hentikanKronis() {
    if (!kronisBuku) return;
    const ok = await UI.konfirmasi('Hentikan pendaftaran buku kronis?',
      `Riwayat pendaftaran tetap tersimpan dan bisa didaftarkan kembali kapan saja. ` +
      `Pasien ini akan berhenti muncul di halaman Pemantauan Kronis.`,
      'Hentikan', true);
    if (!ok) return;
    try {
      await DB.kronisTerapiSelesai(kronisBuku.terapi_id, null);
      UI.toast('Pendaftaran buku kronis dihentikan.', 'ok');
      await muatKartuKronis();
    } catch (e) { UI.toast(e.message || 'Gagal menghentikan pendaftaran.', 'err'); }
  }

  async function modalBukuKronis() {
    if (!refKronisKuotaObatCache) refKronisKuotaObatCache = await DB.refKronisKuotaObat();

    const sedang = kronisBuku;
    const terpilihAwal = new Set(sedang ? sedang.diagnosa : kronisUsulan.map(u => u.kode));
    let obatModal = sedang ? sedang.obat.map(o => ({ ...o })) : [];
    let statinObatId = sedang?.statin_obat_id || null;
    let statinNama = sedang?.statin_nama || null;

    function gambarObatModal(b) {
      const w = b.querySelector('#tabelObatKronis');
      if (!obatModal.length) {
        w.innerHTML = `<p class="text-muted text-sm mb-0">Belum ada obat rutin dicatat.</p>`;
        return;
      }
      w.innerHTML = `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Obat</th><th style="width:84px">Jumlah</th><th style="width:78px">Satuan</th>
          <th style="width:180px">Aturan pakai</th><th style="width:1%"></th></tr></thead>
        <tbody>${obatModal.map((o, i) => `
          <tr>
            <td>${UI.esc(o.nama_obat)}</td>
            <td><input type="number" data-kjml="${i}" value="${o.jumlah || ''}" min="1"
                  style="width:64px;padding:5px 7px;text-align:center"></td>
            <td><input type="text" data-ksat="${i}" value="${UI.esc(o.satuan || '')}"
                  style="width:64px;padding:5px 7px"></td>
            <td><input type="text" data-ksigna="${i}" value="${UI.esc(o.signa || '')}"
                  style="padding:5px 8px;font-size:12.5px"></td>
            <td><button type="button" class="btn-icon" data-khapus="${i}"
                  title="Hapus">${UI.ikon('x', 14)}</button></td>
          </tr>`).join('')}</tbody></table></div>`;
      w.querySelectorAll('[data-khapus]').forEach(bt => bt.addEventListener('click', () => {
        obatModal.splice(+bt.dataset.khapus, 1); gambarObatModal(b);
      }));
      w.querySelectorAll('[data-kjml]').forEach(inp => inp.addEventListener('change', () => {
        obatModal[+inp.dataset.kjml].jumlah = Number(inp.value) || null;
      }));
      w.querySelectorAll('[data-ksat]').forEach(inp => inp.addEventListener('change', () => {
        obatModal[+inp.dataset.ksat].satuan = inp.value.trim() || null;
      }));
      w.querySelectorAll('[data-ksigna]').forEach(inp => inp.addEventListener('change', () => {
        obatModal[+inp.dataset.ksigna].signa = inp.value.trim() || null;
      }));
    }

    const hasil = await UI.modal({
      judul: sedang ? 'Ubah buku kronis' : 'Daftarkan ke buku kronis',
      lebar: true,
      isi: `
        <p class="text-sm text-muted">Terdaftar di sini berarti pasien masuk pemantauan
          "belum ambil obat", jadwal &amp; kepatuhan lab, dan (bila relevan) kuota statin
          BPJS — semuanya terlihat di halaman Pemantauan Kronis.</p>
        <div class="field">
          <label>Diagnosis kronis <span class="req">*</span></label>
          <div class="form-row c2" id="dfKronisDx">
            ${refKronisDiagnosaCache.map(d => `<label class="check">
              <input type="checkbox" value="${UI.esc(d.kode)}" ${terpilihAwal.has(d.kode) ? 'checked' : ''}>
              <span>${UI.esc(d.nama)}</span></label>`).join('')}
          </div>
        </div>
        <div class="divider"></div>
        <div class="field">
          <label>Obat rutin bulanan <span class="opt">dipantau di tab "Belum Ambil Obat"</span></label>
          <div id="cariObatKronis" class="mb-8"></div>
          <div id="tabelObatKronis"></div>
        </div>
        <div class="divider"></div>
        <fieldset class="fieldset">
          <legend>Obat berkuota BPJS (statin) <span class="opt">isi bila ada</span></legend>
          <div class="form-row c2">
            <div class="field">
              <label for="stKunci">Jenis statin</label>
              <select id="stKunci">
                <option value="">— tidak ada —</option>
                ${refKronisKuotaObatCache.map(k => `<option value="${UI.esc(k.kunci)}"
                  ${sedang?.statin_kunci === k.kunci ? 'selected' : ''}
                  >${UI.esc(k.nama)} (maks ${k.maks}×)</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="stTglLab">Tanggal hasil LDL terakhir <span class="opt">bila belum ada di RME</span></label>
              <input type="date" id="stTglLab" value="${UI.esc(sedang?.statin_tgl_lab || '')}">
            </div>
          </div>
          <div id="cariObatStatin" class="mb-8"></div>
          <div class="text-xs text-muted" id="statinTerpilih">${statinNama
            ? 'Obat: ' + UI.esc(statinNama) : 'Obat spesifik belum dipilih — kuota tetap dihitung dari jenisnya.'}</div>
        </fieldset>
        <div class="field mb-0">
          <label for="ctKronis">Catatan</label>
          <textarea id="ctKronis" rows="2">${UI.esc(sedang?.catatan)}</textarea>
        </div>`,
      siap: (b) => {
        gambarObatModal(b);
        Komponen.comboCari({
          wadah: b.querySelector('#cariObatKronis'),
          placeholder: 'Cari obat untuk ditambah ke daftar rutin…',
          cariFn: (kata) => DB.cariObat(kata),
          formatFn: (o) => `<b>${UI.esc(o.nama)}</b><span>${UI.esc(o.satuan || '')}</span>`,
          onPilih: (o) => {
            if (obatModal.some(x => x.obat_id === o.id)) {
              UI.toast('Obat itu sudah ada dalam daftar.', 'warn'); return;
            }
            obatModal.push({
              obat_id: o.id, nama_obat: o.nama, jumlah: 30,
              satuan: o.satuan, signa: '1 x sehari 1 tablet'
            });
            gambarObatModal(b);
          }
        });
        Komponen.comboCari({
          wadah: b.querySelector('#cariObatStatin'),
          placeholder: 'Cari nama obat statin spesifik (opsional)…',
          cariFn: (kata) => DB.cariObat(kata),
          formatFn: (o) => `<b>${UI.esc(o.nama)}</b><span>${UI.esc(o.satuan || '')}</span>`,
          onPilih: (o) => {
            statinObatId = o.id; statinNama = o.nama;
            b.querySelector('#statinTerpilih').textContent = 'Obat: ' + o.nama;
          }
        });
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (b) => {
            const dx = Array.from(b.querySelectorAll('#dfKronisDx input:checked')).map(c => c.value);
            if (!dx.length) { UI.toast('Pilih minimal satu diagnosis kronis.', 'err'); return false; }
            const stKunci = b.querySelector('#stKunci').value || null;
            const stTglLab = b.querySelector('#stTglLab').value || null;
            try {
              await DB.kronisDaftarSimpan({
                pasienId: kj.pasien_id, diagnosa: dx, obat: obatModal,
                statinKunci: stKunci,
                statinObatId: stKunci ? statinObatId : null,
                statinNama: stKunci ? statinNama : null,
                statinTglLab: stKunci ? stTglLab : null,
                catatan: b.querySelector('#ctKronis').value.trim() || null
              });
              UI.toast('Buku kronis pasien disimpan.', 'ok');
              return true;
            } catch (e) { UI.toast(e.message || 'Gagal menyimpan.', 'err'); return false; }
          } }
      ]
    });

    if (hasil) await muatKartuKronis();
  }

  async function muatRiwayatSingkat() {
    const w = document.getElementById('riwayatSingkat');
    if (!w) return;
    try {
      const r = (await DB.daftarKunjungan({ pasien_id: kj.pasien_id, batas: 6 }))
        .filter(x => x.id !== kj.id);
      w.innerHTML = r.length === 0
        ? `<div style="padding:16px" class="text-sm text-muted">Belum ada kunjungan sebelumnya.</div>`
        : r.map(x => `
            <a href="#/rekam/${x.id}" style="display:block;padding:10px 16px;
               border-bottom:1px solid var(--ink-100);color:inherit;text-decoration:none">
              <div class="flex justify-between items-center gap-8">
                <b class="text-sm">${UI.tglPendek(x.tanggal)}</b>
                <span class="text-xs text-muted">${UI.esc(x.nama_poli)}</span>
              </div>
              <div class="text-xs text-muted">${UI.esc(x.daftar_diagnosa || 'Tanpa diagnosa')}</div>
            </a>`).join('');
    } catch (e) { w.innerHTML = ''; }
  }

  async function cetakResep() {
    if (!daftarResep.length) { UI.toast('Belum ada obat untuk dicetak.', 'warn'); return; }
    const f = await DB.faskes().catch(() => ({ nama: CONFIG.NAMA_KLINIK }));
    const p = kj.pasien;
    const dokter = kj.dokter?.nama || App.siapa().nama;
    const sip = kj.dokter?.no_sip || App.siapa().no_sip || '';

    const w = window.open('', '_blank', 'width=760,height=900');
    w.document.write(`<html><head><title>Resep — ${UI.esc(p.nama)}</title><style>
      body{font-family:'Times New Roman',Georgia,serif;padding:28px 34px;font-size:13pt;color:#000}
      .kop{text-align:center;border-bottom:2.5px solid #000;padding-bottom:9px;margin-bottom:16px}
      .kop h1{margin:0;font-size:17pt;letter-spacing:.5px}
      .kop p{margin:2px 0;font-size:10pt}
      .baris{display:flex;gap:26px;font-size:11pt;margin-bottom:3px}
      .rx{font-size:34pt;font-weight:bold;font-family:Georgia,serif;margin:14px 0 4px}
      .obat{margin:0 0 13px 30px}
      .obat .nm{font-size:13.5pt}
      .obat .sg{margin-left:26px;font-style:italic;font-size:12pt}
      .ttd{margin-top:44px;text-align:right;font-size:11pt}
      .ttd .garis{margin-top:56px;border-top:1px solid #000;display:inline-block;padding-top:3px;min-width:210px}
      @media print{@page{margin:1.3cm}}
    </style></head><body>
      <div class="kop">
        <h1>${UI.esc(f.nama)}</h1>
        <p>${UI.esc([f.alamat, f.kelurahan, f.kecamatan, f.kabupaten].filter(Boolean).join(', ') || '')}</p>
        <p>${f.telepon ? 'Telp. ' + UI.esc(f.telepon) : ''}</p>
      </div>
      <div class="baris"><span><b>Nama</b>&nbsp;: ${UI.esc(p.nama)}</span>
        <span><b>Umur</b>&nbsp;: ${UI.umurTeks(p.tanggal_lahir)}</span>
        <span><b>No. RM</b>&nbsp;: ${UI.esc(p.no_rm)}</span></div>
      <div class="baris"><span><b>Alamat</b>&nbsp;: ${UI.esc(p.alamat || '-')}</span></div>
      <div class="baris"><span><b>Tanggal</b>&nbsp;: ${UI.tglIndo(kj.tanggal)}</span>
        <span><b>Cara bayar</b>&nbsp;: ${UI.esc(kj.cara_bayar)}</span></div>

      <div class="rx">R/</div>
      ${daftarResep.map(r => `
        <div class="obat">
          <div class="nm">${UI.esc(r.nama_obat)} &nbsp; No. ${UI.esc(String(r.jumlah))}</div>
          <div class="sg">S. ${UI.esc(r.signa || '')}</div>
        </div>`).join('')}

      <div class="ttd">
        ${UI.esc(f.kabupaten || '')}${f.kabupaten ? ', ' : ''}${UI.tglIndo(kj.tanggal)}<br>
        Dokter,
        <div class="garis">${UI.esc(dokter)}${sip ? '<br>SIP: ' + UI.esc(sip) : ''}</div>
      </div>
    </body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { w.print(); }, 400);
  }

  return { render };
})();

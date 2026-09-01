/* ===================== PEMERIKSAAN DOKTER (SOAP) ===================== */
const Periksa = (() => {

  let kj = null;              // kunjungan
  let daftarDiagnosa = [];    // [{kode, nama, jenis, kasus}]
  let daftarResep = [];       // [{obat_id, nama_obat, jumlah, satuan, signa, ...}]
  let daftarTindakan = [];    // [{kode, nama, fdi, jumlah, catatan}]
  let signaCepat = [];
  let refStatusPulang = [];
  let icdFavorit = [];
  let simpanOtomatis = null;
  // Poli gigi
  let poliGigi = false;
  let odoWidget = null;
  let gigiRef = [], kondisiGigiRef = [];
  let dataOdontogram = {};

  async function render(el, param) {
    const id = param && param[0];
    if (!id) { el.innerHTML = UI.kosong('Kunjungan tidak dipilih', 'Buka dari halaman antrian.'); return; }

    kj = await DB.kunjungan(id);
    poliGigi = kj.poli?.jenis === 'GIGI';

    const [alergi, ka, pm, dg, rs, sg, fav, td] = await Promise.all([
      DB.alergiPasien(kj.pasien_id), DB.kajian(id), DB.pemeriksaan(id),
      DB.diagnosa(id), DB.resep(id), DB.daftarSigna(), DB.cariIcd(''), DB.tindakan(id)
    ]);
    refStatusPulang = await DB.refStatusPulang();
    DB.catatAkses(kj.pasien_id, 'Membuka pemeriksaan dokter');

    let pgigi = null;
    if (poliGigi) {
      [gigiRef, kondisiGigiRef, dataOdontogram, pgigi] = await Promise.all([
        DB.refGigi(), DB.refKondisiGigi(), DB.odontogram(kj.pasien_id), DB.pemeriksaanGigi(id)
      ]);
    }

    daftarTindakan = (td || []).map(t => ({
      kode: t.kode_icd9, nama: t.nama, fdi: t.fdi, jumlah: t.jumlah, catatan: t.catatan,
      perluGigi: !!(t.ref?.per_gigi ?? t.per_gigi)
    }));

    signaCepat = sg;
    icdFavorit = fav.slice(0, 14);
    daftarDiagnosa = dg.map(d => ({ kode: d.kode_icd10, nama: d.nama, jenis: d.jenis, kasus: d.kasus }));
    daftarResep = (rs?.item || []).map(i => ({
      obat_id: i.obat_id, nama_obat: i.nama_obat, kode_kfa: i.kode_kfa,
      jumlah: i.jumlah, satuan: i.satuan, signa: i.signa, keterangan: i.keterangan
    }));

    /* Dua hal berbeda yang sama-sama membuat layar ini hanya bisa dibaca:
       rekam medis sudah difinalisasi, atau peran pengguna memang bukan dokter.
       Database sudah menolak penulisannya; layar tidak boleh menawarkannya. */
    const bolehTulis = App.boleh(['dokter']);
    const terkunci = pm?.final === true || !bolehTulis;

    el.innerHTML = `
      <a href="#/antrian" class="btn btn-ghost btn-sm mb-12 no-print">${UI.ikon('kembali',15)} Antrian</a>
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
          <!-- ============ TANDA VITAL ============ -->
          <div class="card">
            <div class="card-head">
              <div class="flex-1"><h2>Tanda vital &amp; kajian awal</h2>
                <div class="sub">${ka ? 'Diisi ' + UI.jam(ka.dibuat_pada) : 'Belum diisi perawat'}</div></div>
              ${!ka && App.boleh(['perawat','dokter'])
                ? `<a href="#/kajian/${kj.id}" class="btn btn-secondary btn-sm">Isi kajian awal</a>` : ''}
            </div>
            <div class="card-body">
              ${Komponen.kotakVital(ka)}
              ${ka?.keluhan_utama ? `<div class="mt-16 text-sm">
                <b>Keluhan utama:</b> ${UI.esc(ka.keluhan_utama)}
                ${ka.riwayat_penyakit_dahulu ? `<br><b>Riwayat dahulu:</b> ${UI.esc(ka.riwayat_penyakit_dahulu)}` : ''}
                ${ka.riwayat_alergi ? `<br><b>Alergi:</b> ${UI.esc(ka.riwayat_alergi)}` : ''}
                ${ka.riwayat_pengobatan ? `<br><b>Obat rutin:</b> ${UI.esc(ka.riwayat_pengobatan)}` : ''}
              </div>` : ''}
            </div>
          </div>

          ${poliGigi ? kartuGigi(pgigi, terkunci) : ''}

          <!-- ============ SOAP ============ -->
          <div class="card">
            <div class="card-head"><div class="flex-1"><h2>Catatan pemeriksaan (SOAP)</h2>
              <div class="sub">Isi minimal Subjective, Objective, dan Plan</div></div></div>
            <div class="card-body" id="formSoap">
              <div class="field">
                <label for="s">S — Subjective <span class="opt">apa yang dikeluhkan pasien</span></label>
                <textarea id="s" name="subjective" rows="3" ${terkunci ? 'disabled' : ''}
                  placeholder="Keluhan, sejak kapan, sifat, faktor memperberat/meringankan…">${UI.esc(pm?.subjective || ka?.keluhan_utama || '')}</textarea>
              </div>
              <div class="field">
                <label for="o">O — Objective <span class="opt">temuan pemeriksaan fisik</span></label>
                <textarea id="o" name="objective" rows="3" ${terkunci ? 'disabled' : ''}
                  placeholder="Keadaan umum, kepala-leher, toraks, abdomen, ekstremitas…">${UI.esc(pm?.objective)}</textarea>
              </div>
              <div class="field">
                <label for="a">A — Assessment <span class="opt">kesimpulan/penilaian klinis</span></label>
                <textarea id="a" name="assessment" rows="2" ${terkunci ? 'disabled' : ''}
                  placeholder="Ringkasan penilaian; kode ICD-10 diisi di bagian Diagnosa">${UI.esc(pm?.assessment)}</textarea>
              </div>
              <div class="field mb-0">
                <label for="p">P — Plan <span class="opt">rencana tata laksana</span></label>
                <textarea id="p" name="plan" rows="3" ${terkunci ? 'disabled' : ''}
                  placeholder="Terapi, pemeriksaan penunjang, edukasi, rencana kontrol…">${UI.esc(pm?.plan)}</textarea>
              </div>
            </div>
          </div>

          <!-- ============ DIAGNOSA ============ -->
          <div class="card">
            <div class="card-head"><div class="flex-1"><h2>Diagnosa (ICD-10)</h2>
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
            </div>
          </div>

          <!-- ============ TINDAKAN ============ -->
          <div class="card">
            <div class="card-head"><div class="flex-1"><h2>Tindakan (ICD-9-CM)</h2>
              <div class="sub">${poliGigi
                ? 'Sebutkan nomor gigi untuk tindakan pada gigi tertentu'
                : 'Tindakan medis yang dilakukan pada kunjungan ini'}</div></div></div>
            <div class="card-body">
              ${terkunci ? '' : `<div id="cariTindakan" class="mb-12"></div>`}
              <div id="tabelTindakan"></div>
            </div>
          </div>

          <!-- ============ RESEP ============ -->
          <div class="card">
            <div class="card-head"><div class="flex-1"><h2>Resep</h2>
              <div class="sub">Cari obat, tentukan jumlah dan aturan pakai</div></div>
              <button class="btn btn-secondary btn-sm no-print" id="btnCetakResep">${UI.ikon('cetak',15)} Cetak</button>
            </div>
            <div class="card-body">
              ${terkunci ? '' : `<div id="cariObat" class="mb-12"></div>`}
              <div id="tabelResep"></div>
            </div>
          </div>
        </div>

        <!-- ============ PANEL KANAN ============ -->
        <div>
          <div class="card">
            <div class="card-head"><h2>Tindak lanjut</h2></div>
            <div class="card-body" id="formLanjut">
              <div class="field">
                <label for="tl">Rencana tindak lanjut</label>
                <select id="tl" name="tindak_lanjut" ${terkunci ? 'disabled' : ''}>
                  ${[['SELESAI','Selesai — pulang'],['KONTROL','Kontrol kembali'],
                     ['RUJUK_INTERNAL','Rujuk poli lain'],['RUJUK_LANJUT','Rujuk ke FKRTL'],
                     ['RUJUK_IGD','Rujuk IGD / emergensi']]
                    .map(([v,t]) => `<option value="${v}" ${(pm?.tindak_lanjut || 'SELESAI') === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
              <div class="field" id="wadahKontrol" style="display:none">
                <label for="tk">Tanggal kontrol</label>
                <input type="date" id="tk" name="tanggal_kontrol" value="${UI.esc(pm?.tanggal_kontrol)}" ${terkunci ? 'disabled' : ''}>
              </div>
              <div class="field" id="wadahRujuk" style="display:none">
                <label for="rs">Dirujuk ke</label>
                <input type="text" id="rs" name="rujuk_ke_faskes" value="${UI.esc(pm?.rujuk_ke_faskes)}"
                  placeholder="Nama rumah sakit / poli tujuan" ${terkunci ? 'disabled' : ''}>
                <div class="field mt-8 mb-0">
                  <label for="rsp">Spesialis tujuan</label>
                  <input type="text" id="rsp" name="rujuk_spesialis" value="${UI.esc(pm?.rujuk_spesialis)}"
                    placeholder="Contoh: Penyakit Dalam" ${terkunci ? 'disabled' : ''}>
                </div>
                <div class="field mt-8 mb-0">
                  <label for="rsa">Alasan rujukan</label>
                  <textarea id="rsa" name="rujuk_alasan" rows="2" ${terkunci ? 'disabled' : ''}>${UI.esc(pm?.rujuk_alasan)}</textarea>
                </div>
              </div>
              <div class="field">
                <label for="sp">Keadaan pasien saat pulang</label>
                <select id="sp" name="status_pulang_kode" ${terkunci ? 'disabled' : ''}>
                  ${refStatusPulang.map(o => `<option value="${UI.esc(o.kode)}"
                    ${(pm?.status_pulang_kode || 'SEMBUH') === o.kode ? 'selected' : ''}
                    >${UI.esc(o.nama)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="pg">Prognosa</label>
                <select id="pg" name="prognosa" ${terkunci ? 'disabled' : ''}>
                  <option value="">— pilih —</option>
                  ${['Bonam','Dubia ad bonam','Dubia','Dubia ad malam','Malam']
                    .map(o => `<option ${pm?.prognosa === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
              </div>
              <div class="field mb-0">
                <label for="ed">Edukasi kepada pasien</label>
                <textarea id="ed" name="edukasi" rows="3" ${terkunci ? 'disabled' : ''}
                  placeholder="Anjuran istirahat, pola makan, tanda bahaya yang perlu diwaspadai…">${UI.esc(pm?.edukasi)}</textarea>
              </div>
            </div>
          </div>

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
          </div>

          <div class="card no-print">
            <div class="card-head"><h2>Riwayat sebelumnya</h2></div>
            <div class="card-body tight" id="riwayatSingkat">${UI.memuat(2)}</div>
          </div>
        </div>
      </div>`;

    if (poliGigi) pasangOdontogram(terkunci);
    if (!terkunci) {
      pasangPencarianIcd();
      pasangPencarianObat();
      pasangPencarianTindakan();
      el.querySelector('#icdCepat').addEventListener('click', (e) => {
        const b = e.target.closest('[data-kode]'); if (!b) return;
        tambahDiagnosa({ kode: b.dataset.kode, nama: b.dataset.nama });
      });
      el.querySelector('#btnSimpanDraf').addEventListener('click', () => simpan(false));
      el.querySelector('#btnFinal').addEventListener('click', () => simpan(true));
      pasangSimpanOtomatis();
    } else {
      const ba = el.querySelector('#btnAddendum');
      if (ba) ba.addEventListener('click', () => modalAddendum());
    }

    el.querySelector('#btnCetakResep').addEventListener('click', cetakResep);

    const selTl = el.querySelector('#tl');
    const perbaruiTl = () => {
      const v = selTl.value;
      el.querySelector('#wadahKontrol').style.display = v === 'KONTROL' ? '' : 'none';
      el.querySelector('#wadahRujuk').style.display = v.startsWith('RUJUK') ? '' : 'none';
    };
    selTl.addEventListener('change', perbaruiTl); perbaruiTl();

    gambarDiagnosa(); gambarResep(); gambarTindakan(); muatRiwayatSingkat();
  }

  /* ---------------- Diagnosa ---------------- */
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
    gambarDiagnosa();
  }

  function gambarDiagnosa() {
    const w = document.getElementById('tabelDiagnosa');
    const terkunci = !document.getElementById('btnFinal');
    if (!daftarDiagnosa.length) {
      w.innerHTML = `<div class="banner info mb-0"><div>Belum ada diagnosa.
        ${terkunci ? '' : 'Cari di kotak pencarian di atas atau klik salah satu diagnosa yang sering dipakai.'}</div></div>`;
      return;
    }
    w.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th style="width:82px">Kode</th><th>Diagnosa</th>
        <th style="width:118px">Jenis</th><th style="width:104px">Kasus</th>
        ${terkunci ? '' : '<th style="width:1%"></th>'}</tr></thead>
      <tbody>${daftarDiagnosa.map((d, i) => `
        <tr>
          <td class="mono"><b>${UI.esc(d.kode)}</b></td>
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
        </tr>`).join('')}</tbody></table></div>`;

    if (terkunci) return;
    w.querySelectorAll('[data-hapus-dx]').forEach(b => b.addEventListener('click', () => {
      daftarDiagnosa.splice(+b.dataset.hapusDx, 1);
      if (daftarDiagnosa.length && !daftarDiagnosa.some(x => x.jenis === 'PRIMER'))
        daftarDiagnosa[0].jenis = 'PRIMER';
      gambarDiagnosa();
    }));
    w.querySelectorAll('[data-jenis]').forEach(s => s.addEventListener('change', () => {
      const i = +s.dataset.jenis;
      if (s.value === 'PRIMER') daftarDiagnosa.forEach((d, j) => d.jenis = j === i ? 'PRIMER' : 'SEKUNDER');
      else daftarDiagnosa[i].jenis = 'SEKUNDER';
      gambarDiagnosa();
    }));
    w.querySelectorAll('[data-kasus]').forEach(s => s.addEventListener('change', () => {
      daftarDiagnosa[+s.dataset.kasus].kasus = s.value;
    }));
  }

  /* ---------------- Resep ---------------- */
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
    daftarResep.push({
      obat_id: o.id, nama_obat: o.nama, kode_kfa: o.kode_kfa || null,
      jumlah: 10, satuan: o.satuan, signa: '3 x sehari 1 tablet', keterangan: null
    });
    gambarResep();
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
                      style="padding:5px 8px;font-size:12.5px" placeholder="3 x sehari 1 tablet">`}</td>
          ${terkunci ? '' : `<td><button class="btn-icon" data-hapus-obat="${i}"
            title="Hapus">${UI.ikon('x',14)}</button></td>`}
        </tr>`).join('')}</tbody></table></div>
      <datalist id="signaOpsi">${opsiSigna}</datalist>`;

    if (terkunci) return;
    w.querySelectorAll('[data-hapus-obat]').forEach(b => b.addEventListener('click', () => {
      daftarResep.splice(+b.dataset.hapusObat, 1); gambarResep();
    }));
    w.querySelectorAll('[data-jml]').forEach(inp => inp.addEventListener('change', () => {
      daftarResep[+inp.dataset.jml].jumlah = Math.max(1, Number(inp.value) || 1);
    }));
    w.querySelectorAll('[data-signa]').forEach(inp => inp.addEventListener('change', () => {
      daftarResep[+inp.dataset.signa].signa = inp.value;
    }));
  }


  /* ================================================================== *
   *  POLI GIGI — odontogram, pemeriksaan gigi, dan tindakan
   * ================================================================== */

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

  /* ---------------- Tindakan ---------------- */
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
      kode: t.kode, nama: t.nama_id, fdi: null, jumlah: 1,
      perluGigi: !!t.per_gigi, catatan: null
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

  /* ---------------- Simpan ---------------- */
  function kumpulkanSoap() {
    const soap = UI.nilaiForm(document.getElementById('formSoap'));
    const lanjut = UI.nilaiForm(document.getElementById('formLanjut'));
    return { ...soap, ...lanjut };
  }

  async function simpan(final) {
    const d = kumpulkanSoap();

    if (final) {
      const kurang = [];
      if (!d.subjective) kurang.push('Subjective');
      if (!d.objective) kurang.push('Objective');
      if (!d.plan) kurang.push('Plan');
      if (!daftarDiagnosa.length) kurang.push('minimal satu diagnosa ICD-10');
      if (kurang.length) {
        UI.toast('Belum lengkap: ' + kurang.join(', ') + '.', 'err', 5000);
        return;
      }
      const tanpaGigi = daftarTindakan.filter(t => t.perluGigi && !t.fdi);
      if (poliGigi && tanpaGigi.length) {
        UI.toast('Tindakan berikut belum disebutkan nomor giginya: '
          + tanpaGigi.map(t => t.nama).join(', ') + '.', 'err', 6000);
        return;
      }
      const ya = await UI.konfirmasi('Kunci rekam medis kunjungan ini?',
        'Setelah dikunci, catatan tidak dapat diubah lagi. Perubahan hanya bisa ditambahkan '
        + 'sebagai addendum. Pastikan semua isian sudah benar.', 'Ya, kunci sekarang');
      if (!ya) return;
    }

    const tombol = document.getElementById(final ? 'btnFinal' : 'btnSimpanDraf');
    if (tombol) { tombol.disabled = true; tombol.textContent = 'Menyimpan…'; }

    try {
      const sp = refStatusPulang.find(x => x.kode === d.status_pulang_kode);
      await DB.simpanPemeriksaan(kj.id, {
        subjective: d.subjective, objective: d.objective,
        assessment: d.assessment, plan: d.plan,
        prognosa: d.prognosa, edukasi: d.edukasi,
        status_pulang_kode: d.status_pulang_kode || null,
        status_pulang: sp ? sp.nama : null,
        tindak_lanjut: d.tindak_lanjut || 'SELESAI',
        tanggal_kontrol: d.tindak_lanjut === 'KONTROL' ? d.tanggal_kontrol : null,
        rujuk_ke_faskes: d.rujuk_ke_faskes, rujuk_spesialis: d.rujuk_spesialis,
        rujuk_alasan: d.rujuk_alasan
      });
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
      }
    } catch (e) {
      UI.toast(e.message || 'Gagal menyimpan.', 'err', 5000);
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
      const d = kumpulkanSoap();
      if (!d.subjective && !d.objective && !d.plan && !daftarDiagnosa.length) return;
      try {
        await DB.simpanPemeriksaan(kj.id, {
          subjective: d.subjective, objective: d.objective,
          assessment: d.assessment, plan: d.plan,
          tindak_lanjut: d.tindak_lanjut || 'SELESAI'
        });
        const st = document.getElementById('statusSimpan');
        if (st) st.textContent = 'Tersimpan otomatis ' + UI.jam(new Date());
      } catch (e) { /* diam saja, dokter tetap bisa simpan manual */ }
    }, 90000);
  }

  /* ---------------- Addendum ---------------- */
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

  /* ---------------- Riwayat singkat pasien ---------------- */
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

  /* ---------------- Cetak resep ---------------- */
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

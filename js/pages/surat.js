/* ===================== SURAT-SURAT KETERANGAN =====================
   Dua hal dalam satu halaman:

     Buat surat     — formulir + pratinjau berdampingan, lalu cetak/unduh
     Riwayat surat  — semua surat yang pernah terbit, bisa dicetak ulang

   TIGA HAL YANG SENGAJA DIBUAT BEGINI

   1. Formulirnya digambar dari daftar `isian` di js/surat_core.js, bukan
      ditulis satu per satu di sini. Menambah satu pertanyaan pada surat
      rujukan cukup satu baris di berkas itu; halaman ini, pratinjaunya,
      dan PDF-nya ikut berubah sendiri. Tidak ada formulir yang bisa
      ketinggalan dari lembar cetaknya.

   2. Pratinjaunya BUKAN tiruan. Yang tampil di kanan layar adalah berkas
      HTML yang sama persis dengan yang dikirim ke printer, ditampilkan
      dalam iframe berskala. Apa yang dilihat dokter memang itu yang
      keluar dari mesin.

   3. Nomor surat disarankan, bukan dipaksakan. Sistem menyodorkan nomor
      terbesar + 1 untuk jenis dan tahun itu; klinik yang sudah punya buku
      agenda berjalan tetap bisa mengetik nomor lain. Yang dijaga keras
      adalah keunikannya — dan peringatannya muncul saat mengetik, bukan
      setelah tombol Simpan ditekan dan isian keburu hilang.
   =========================================================== */
const Surat = (() => {

  let jenisMaster = [];
  let pengaturan = null;
  let tabAktif = 'riwayat';

  /* Keadaan formulir yang sedang dibuka */
  let F = null;

  const bolehTerbit = () => App.boleh(['dokter']);

  const TAB = { baru: 'Buat surat', riwayat: 'Riwayat surat' };

  /* ================================================================== */
  /*  Kerangka                                                          */
  /* ================================================================== */
  async function render(el, param) {
    if (!jenisMaster.length) jenisMaster = await DB.refJenisSurat();
    if (!pengaturan) pengaturan = await DB.suratPengaturan();
    KopKlinik.pasang(pengaturan.kop_data_uri, pengaturan.kop_rasio);

    const aksi = param && param[0];
    if (aksi === 'baru' && param[1])  return await layarForm(el, { kunjunganId: param[1] });
    if (aksi === 'pasien' && param[1]) return await layarForm(el, { pasienId: param[1] });
    if (aksi === 'ubah' && param[1])  return await layarForm(el, { suratId: param[1] });
    if (aksi === 'lihat' && param[1]) { tabAktif = 'riwayat'; }
    if (aksi && TAB[aksi]) tabAktif = aksi;

    el.innerHTML = `
      <div class="tabs no-print" id="tabsSurat">
        ${Object.entries(TAB).map(([k, t]) =>
          `<button class="tab ${tabAktif === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}
      </div>
      <div id="isiSurat">${UI.memuat()}</div>`;

    el.querySelector('#tabsSurat').addEventListener('click', (e) => {
      const b = e.target.closest('.tab'); if (!b) return;
      tabAktif = b.dataset.t;
      el.querySelectorAll('#tabsSurat .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      gambarTab(el.querySelector('#isiSurat'));
    });

    await gambarTab(el.querySelector('#isiSurat'));
    if (aksi === 'lihat' && param[1]) await bukaSurat(param[1]);
  }

  async function gambarTab(w) {
    w.innerHTML = UI.memuat();
    try {
      if (tabAktif === 'baru') return await tabPilihPasien(w);
      return await tabRiwayat(w);
    } catch (e) {
      console.error(e);
      w.innerHTML = `<div class="banner err"><div>${UI.esc(e.message || e)}</div></div>`;
    }
  }

  /* ================================================================== */
  /*  TAB 1 — Buat surat: pilih pasien dulu                             */
  /* ================================================================== */
  async function tabPilihPasien(w) {
    if (!bolehTerbit()) {
      w.innerHTML = UI.kosong('Hanya dokter yang menerbitkan surat',
        'Surat keterangan adalah pernyataan medis atas nama dokter. Anda tetap bisa ' +
        'membuka tab Riwayat surat untuk mencetak ulang surat yang sudah terbit.');
      return;
    }

    w.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="flex-1">
            <h2>Pilih pasien</h2>
            <div class="sub">Surat diambilkan datanya dari kunjungan terakhir pasien,
              supaya tidak perlu diketik ulang</div>
          </div>
        </div>
        <div class="card-body">
          <div id="cariPasienSurat"></div>
        </div>
        <div class="card-body tight" id="hasilPasienSurat"></div>
      </div>`;

    Komponen.comboCari({
      wadah: w.querySelector('#cariPasienSurat'),
      placeholder: 'Ketik nama, No. RM, atau NIK pasien…',
      cariFn: (k) => DB.cariPasien(k),
      formatFn: (p) => `<b>${UI.esc(p.nama)}</b>
        <span>No. RM ${UI.esc(p.no_rm)} · ${UI.umurTeks(p.tanggal_lahir)} ·
        ${p.jenis_kelamin === 'L' ? 'L' : 'P'}</span>`,
      onPilih: (p) => pilihKunjungan(w.querySelector('#hasilPasienSurat'), p)
    });
  }

  async function pilihKunjungan(wadah, p) {
    wadah.innerHTML = UI.memuat(2);
    const daftar = await DB.daftarKunjungan({ pasien_id: p.id, batas: 10 });
    wadah.innerHTML = `
      <div class="banner info mb-12"><div>
        <b>${UI.esc(p.nama)}</b> — No. RM ${UI.esc(p.no_rm)}. Pilih kunjungan yang
        menjadi dasar surat. Untuk surat keterangan yang tidak melekat pada satu
        kunjungan, pilih <i>Tanpa kunjungan</i>.
      </div></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Tanggal</th><th>No. kunjungan</th><th>Poli</th>
          <th>Diagnosa</th><th></th></tr></thead>
        <tbody>
          ${daftar.map(k => `<tr>
            <td>${UI.tglPendek(k.tanggal)}</td>
            <td class="muted">${UI.esc(k.no_kunjungan)}</td>
            <td>${UI.esc(k.nama_poli || '-')}</td>
            <td class="muted">${UI.esc(k.diagnosa_utama || '—')}</td>
            <td class="text-right"><a class="btn btn-secondary btn-sm"
                 href="#/surat/baru/${k.id}">Buat surat</a></td>
          </tr>`).join('')}
          <tr><td colspan="4" class="muted">Tanpa kunjungan — surat keterangan bebas isi</td>
            <td class="text-right"><a class="btn btn-ghost btn-sm"
                 href="#/surat/pasien/${p.id}">Lanjut</a></td></tr>
        </tbody></table></div>`;
  }

  /* ================================================================== */
  /*  LAYAR FORMULIR                                                    */
  /* ================================================================== */
  async function layarForm(el, arg) {
    el.innerHTML = UI.memuat(6);

    let suratLama = null;
    let kunjunganId = arg.kunjunganId || null;
    let pasienId = arg.pasienId || null;

    if (arg.suratId) {
      suratLama = await DB.surat(arg.suratId);
      if (!suratLama) throw new Error('Surat tidak ditemukan.');
      if (suratLama.status === 'BATAL')
        throw new Error('Surat yang sudah dibatalkan tidak dapat diubah. ' +
                        'Terbitkan surat baru dengan nomor baru.');
      kunjunganId = suratLama.kunjungan_id;
      pasienId = suratLama.pasien_id;
    }

    const ctx = await bangunKonteks(pasienId, kunjunganId);

    F = {
      suratId: suratLama ? suratLama.id : null,
      ctx,
      kode: suratLama ? suratLama.jenis_kode : 'SKS',
      tanggal: suratLama ? suratLama.tanggal_surat : UI.hariIni(),
      nomor: suratLama ? suratLama.nomor_urut : null,
      data: suratLama ? Object.assign({}, suratLama.data) : null,
      dokterId: suratLama ? suratLama.dokter_id : (ctx.dokter && ctx.dokter.id) || null
    };
    if (!F.data) F.data = SuratCore.nilaiAwal(F.kode, konteksTanggal());

    gambarForm(el);
    if (!suratLama) await sarankanNomor();
    perbaruiPratinjau();
  }

  /* Konteks + tanggal surat yang sedang dipilih. surat_core butuh
     tanggalSurat untuk menghitung umur pasien dan bagian nomor. */
  function konteksTanggal() {
    return Object.assign({}, F.ctx, {
      tanggalSurat: F.tanggal,
      nomorUrut: F.nomor,
      pengaturan
    });
  }

  async function bangunKonteks(pasienId, kunjunganId) {
    const faskes = await DB.faskes().catch(() => null);
    const saya = App.siapa();

    let rm = null, pasien = null;
    if (kunjunganId) {
      rm = await DB.rekamMedisLengkap(kunjunganId);
      pasien = rm.kunjungan.pasien;
    } else {
      pasien = await DB.pasien(pasienId);
    }

    const dokter = rm && rm.kunjungan.dokter
      ? rm.kunjungan.dokter
      : (saya && saya.peran === 'dokter' ? saya : null);

    return {
      faskes, pasien,
      kunjungan: rm ? rm.kunjungan : null,
      kajian: rm ? rm.kajian : null,
      pemeriksaan: rm ? rm.pemeriksaan : null,
      diagnosa: rm ? rm.diagnosa : [],
      tindakan: rm ? rm.tindakan : [],
      resep: rm ? rm.resep : null,
      dokter
    };
  }

  /* ---------------------------------------------------------------- */
  function gambarForm(el) {
    const j = SuratCore.jenis(F.kode);
    const ctx = F.ctx;

    el.innerHTML = `
      <a href="#/surat/riwayat" class="btn btn-ghost btn-sm mb-12 no-print">
        ${UI.ikon('kembali', 15)} Semua surat</a>

      ${ctx.kunjungan ? Komponen.bilahPasien(ctx.kunjungan) : kartuPasienSaja(ctx.pasien)}

      <div class="surat-layar">
        <div>
          <div class="card">
            <div class="card-head"><h2>Jenis surat</h2></div>
            <div class="card-body">
              <div class="radio-row" id="pilihJenis">
                ${SuratCore.daftarJenis().map(x => `
                  <label class="radio-chip ${x.kode === F.kode ? 'on' : ''}" data-k="${x.kode}">
                    <input type="radio" name="jenisSurat" value="${x.kode}"
                      ${x.kode === F.kode ? 'checked' : ''}>${UI.esc(x.nama)}</label>`).join('')}
              </div>
              <p class="hint mt-8 mb-0" id="ketJenis">${UI.esc(j.keterangan)}</p>
            </div>
          </div>

          ${j.catatanLayar ? `<div class="banner warn no-print"><div>
            ${UI.ikon('peringatan', 16)} ${UI.esc(j.catatanLayar)}</div></div>` : ''}

          ${!ctx.kunjungan && j.perluKunjungan ? `<div class="banner warn no-print"><div>
            <b>Surat ini biasanya dibuat dari sebuah kunjungan.</b> Karena tidak ada
            kunjungan yang dipilih, kolom-kolomnya tidak terisi otomatis dan harus
            diketik sendiri.</div></div>` : ''}

          <div class="card">
            <div class="card-head"><h2>Nomor &amp; tanggal</h2></div>
            <div class="card-body">
              <div class="form-row c2">
                <div class="field mb-0">
                  <label for="fTanggal">Tanggal surat</label>
                  <input type="date" id="fTanggal" value="${UI.esc(F.tanggal)}">
                  <div class="hint">Bulan &amp; tahun pada nomor mengikuti tanggal ini.</div>
                </div>
                <div class="field mb-0">
                  <label for="fNomor">Nomor urut <span class="req">*</span></label>
                  <input type="number" id="fNomor" min="1" max="9999" step="1"
                         value="${F.nomor || ''}" placeholder="mis. 7">
                  <div class="hint" id="hintNomor">Menghitung saran…</div>
                </div>
              </div>
              <!-- Nomor jadi diberi barisnya sendiri, bukan diselipkan
                   sebagai kolom ketiga: pada layar sempit kolom sepertiga
                   memotong nomornya di tengah ("13/SKS/YAKIM/IX/202"),
                   dan justru inilah satu-satunya bagian yang harus
                   terbaca utuh sebelum surat dicetak. -->
              <div class="field mb-0 mt-12">
                <label>Nomor surat yang akan tercetak</label>
                <div class="nomor-jadi" id="nomorJadi">—</div>
              </div>
              <div id="peringatanNomor"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div class="flex-1"><h2>Isi surat</h2>
                <div class="sub">Kolom yang terisi otomatis diambil dari rekam medis
                  kunjungan — boleh diubah</div></div>
            </div>
            <div class="card-body">
              <div class="surat-isian" id="isianSurat"></div>
              <div id="waspadaSurat"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Penanda tangan</h2></div>
            <div class="card-body">
              <div class="form-row c2">
                <div class="field mb-0">
                  <label for="fDokter">Ditandatangani oleh</label>
                  <select id="fDokter"><option value="">Memuat…</option></select>
                </div>
                <div class="field mb-0">
                  <label for="fJabatan">Jabatan yang tercetak</label>
                  <input type="text" id="fJabatan" value="Dokter Pemeriksa">
                </div>
              </div>
              <div class="banner info mt-12 mb-0"><div>
                Surat tercetak dengan <b>ruang tanda tangan kosong</b>. Dokter
                menandatangani dengan pulpen dan klinik membubuhkan stempel — itu yang
                membuat surat ini sah. Spesimen tanda tangan digital sengaja tidak
                disimpan di sistem.
              </div></div>
            </div>
          </div>

          <div class="card no-print">
            <div class="card-body">
              <div id="galatSurat"></div>
              <div class="btn-group">
                <button class="btn btn-primary" id="btnSimpanCetak">
                  ${UI.ikon('cetak', 16)} Simpan &amp; cetak</button>
                <button class="btn btn-secondary" id="btnSimpanPdf">
                  ${UI.ikon('unduh', 16)} Simpan &amp; unduh PDF</button>
                <button class="btn btn-ghost" id="btnSimpanSaja">Simpan saja</button>
              </div>
              <p class="hint mt-8 mb-0">Setelah tersimpan, surat muncul di tab
                Riwayat surat dan bisa dicetak ulang kapan saja.</p>
            </div>
          </div>
        </div>

        <div>
          <div class="card sticky-atas no-print">
            <div class="card-head">
              <div class="flex-1"><h2>Pratinjau</h2>
                <div class="sub">Persis seperti yang akan tercetak</div></div>
            </div>
            <div class="card-body">
              <div class="surat-pratinjau-wrap" id="wadahPratinjau">
                <iframe class="surat-pratinjau" id="framePratinjau" title="Pratinjau surat"></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    pasangKejadianForm(el);
    gambarIsian();
    isiPilihanDokter();
  }

  function kartuPasienSaja(p) {
    if (!p) return '';
    return `<div class="patient-bar">
      <div class="pb-avatar">${UI.inisial(p.nama)}</div>
      <div class="pb-main">
        <b>${UI.esc(p.nama)}</b>
        <span>No. RM ${UI.esc(p.no_rm)} · ${p.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} ·
          ${UI.umurTeks(p.tanggal_lahir)}</span>
      </div>
      <div class="pb-meta">
        <div><span class="k">Kunjungan</span><span class="v">Tanpa kunjungan</span></div>
      </div>
    </div>`;
  }

  /* ---------------------------------------------------------------- */
  /*  Isian yang digambar dari daftar `isian` di surat_core            */
  /* ---------------------------------------------------------------- */
  function gambarIsian() {
    const j = SuratCore.jenis(F.kode);
    const w = document.getElementById('isianSurat');
    if (!w) return;

    w.innerHTML = j.isian.map(f => medanHtml(f, F.data[f.nama])).join('');

    w.querySelectorAll('[data-medan]').forEach(el => {
      const nama = el.dataset.medan;
      const ubah = () => {
        F.data[nama] = el.type === 'checkbox' ? el.checked : el.value;
        terapkanTampilJika();
        gambarWaspada();
        pratinjauTertunda();
      };
      el.addEventListener('input', ubah);
      el.addEventListener('change', ubah);
    });
    terapkanTampilJika();
    gambarWaspada();
  }

  /* Peringatan yang TIDAK menghalangi penyimpanan — lihat penjelasan di
     SuratCore.peringatan(). Ditaruh tepat di bawah isian, bukan di dekat
     tombol Simpan: yang perlu diperbaiki adalah isiannya. */
  function gambarWaspada() {
    const w = document.getElementById('waspadaSurat');
    if (!w) return;
    const pesan = SuratCore.peringatan(F.kode, F.data, konteksTanggal());
    w.innerHTML = pesan.length
      ? `<div class="banner warn mt-12 mb-0"><div>${UI.ikon('peringatan', 16)}
           ${pesan.map(p => `<div>${UI.esc(p)}</div>`).join('')}</div></div>`
      : '';
  }

  const KELAS_SPAN = { 3: 'field-compact', 4: 'field-span-4', 6: 'field-half',
                        8: 'field-span-8', 12: 'field-full' };

  function medanHtml(f, nilai) {
    const id = 'm_' + f.nama;
    const kelasSpan = KELAS_SPAN[f.kolom] || 'field-full';
    const bantuan = f.bantuan ? `<div class="hint">${UI.esc(f.bantuan)}</div>` : '';
    const wajib = f.wajib ? ' <span class="req">*</span>' : '';
    const daftarId = f.saran ? id + '_saran' : null;
    const datalist = f.saran
      ? `<datalist id="${daftarId}">${f.saran.map(s =>
          `<option value="${UI.esc(s)}"></option>`).join('')}</datalist>` : '';

    let kendali;
    switch (f.tipe) {
      case 'panjang':
        kendali = `<textarea id="${id}" data-medan="${f.nama}" rows="${f.baris || 3}"
                     placeholder="${UI.esc(f.contoh || '')}">${UI.esc(nilai ?? '')}</textarea>`;
        break;
      case 'tanggal':
        kendali = `<input type="date" id="${id}" data-medan="${f.nama}"
                     value="${UI.esc(nilai ?? '')}">`;
        break;
      case 'angka':
        kendali = `<input type="number" id="${id}" data-medan="${f.nama}"
                     value="${UI.esc(nilai ?? '')}"
                     ${f.min !== undefined ? `min="${f.min}"` : ''}
                     ${f.max !== undefined ? `max="${f.max}"` : ''}
                     step="${f.langkah || '1'}">`;
        break;
      case 'pilih':
        kendali = `<select id="${id}" data-medan="${f.nama}">
                     ${f.opsi.map(o => `<option value="${UI.esc(o)}"
                       ${String(nilai ?? '') === o ? 'selected' : ''}>${UI.esc(o || '—')}</option>`).join('')}
                   </select>`;
        break;
      case 'centang':
        return `<div class="field ${kelasSpan}" data-bungkus="${f.nama}">
                  <label class="check"><input type="checkbox" id="${id}" data-medan="${f.nama}"
                    ${nilai ? 'checked' : ''}><span>${UI.esc(f.label)}</span></label>
                  ${bantuan}</div>`;
      default:
        kendali = `<input type="text" id="${id}" data-medan="${f.nama}"
                     value="${UI.esc(nilai ?? '')}" ${daftarId ? `list="${daftarId}"` : ''}
                     placeholder="${UI.esc(f.contoh || '')}">`;
    }

    return `<div class="field ${kelasSpan}" data-bungkus="${f.nama}">
      <label for="${id}">${UI.esc(f.label)}${wajib}</label>
      ${kendali}${datalist}${bantuan}</div>`;
  }

  /* Kolom yang hanya muncul kalau centang tertentu menyala (mis. teks
     diagnosa pada surat sakit). Disembunyikan, bukan dihapus, supaya
     yang sudah diketik tidak hilang saat centangnya dimatikan lalu
     dinyalakan lagi. */
  function terapkanTampilJika() {
    const j = SuratCore.jenis(F.kode);
    j.isian.forEach(f => {
      if (!f.tampilJika) return;
      const bungkus = document.querySelector(`[data-bungkus="${f.nama}"]`);
      if (bungkus) bungkus.hidden = !F.data[f.tampilJika];
    });
  }

  /* ---------------------------------------------------------------- */
  function pasangKejadianForm(el) {
    el.querySelector('#pilihJenis').addEventListener('click', async (e) => {
      const lab = e.target.closest('[data-k]'); if (!lab) return;
      const kode = lab.dataset.k;
      if (kode === F.kode) return;
      F.kode = kode;
      F.data = SuratCore.nilaiAwal(kode, konteksTanggal());
      /* Digambar ulang seluruhnya, bukan hanya bagian isiannya: catatan
         khusus jenis (mis. peringatan PCare pada surat rujukan) berada di
         luar kartu isian, dan kalau hanya isiannya yang diganti,
         peringatan jenis sebelumnya tetap tertinggal di layar. */
      gambarForm(el);
      await sarankanNomor(true);
      perbaruiPratinjau();
    });

    el.querySelector('#fTanggal').addEventListener('change', async (e) => {
      F.tanggal = e.target.value || UI.hariIni();
      await sarankanNomor(true);
      perbaruiPratinjau();
    });

    const inNomor = el.querySelector('#fNomor');
    inNomor.addEventListener('input', () => {
      F.nomor = inNomor.value ? parseInt(inNomor.value, 10) : null;
      perbaruiNomorJadi();
      pratinjauTertunda();
      periksaNomorTertunda();
    });

    el.querySelector('#fJabatan').addEventListener('input', pratinjauTertunda);

    el.querySelector('#btnSimpanCetak').addEventListener('click', () => simpan('cetak'));
    el.querySelector('#btnSimpanPdf').addEventListener('click', () => simpan('pdf'));
    el.querySelector('#btnSimpanSaja').addEventListener('click', () => simpan('diam'));

    window.addEventListener('resize', skalaPratinjau);
  }

  async function isiPilihanDokter() {
    const sel = document.getElementById('fDokter');
    if (!sel) return;
    let daftar = [];
    try { daftar = await DB.daftarDokter(); } catch (e) { daftar = []; }
    const saya = App.siapa();
    if (saya && saya.peran === 'dokter' && !daftar.some(d => d.id === saya.id))
      daftar.unshift({ id: saya.id, nama: saya.nama, no_sip: saya.no_sip });
    if (!F.dokterId && saya && saya.peran === 'dokter') F.dokterId = saya.id;

    sel.innerHTML = daftar.map(d =>
      `<option value="${d.id}" ${d.id === F.dokterId ? 'selected' : ''}
        data-sip="${UI.esc(d.no_sip || '')}">${UI.esc(d.nama)}${d.no_sip
          ? ' — SIP ' + UI.esc(d.no_sip) : ' — SIP belum diisi'}</option>`).join('')
      || '<option value="">Tidak ada dokter aktif</option>';
    if (!F.dokterId && daftar.length) F.dokterId = daftar[0].id;
    sel.value = F.dokterId || '';
    F.dokterDaftar = daftar;

    sel.addEventListener('change', () => { F.dokterId = sel.value; perbaruiPratinjau(); });
    perbaruiPratinjau();
  }

  function dokterTerpilih() {
    const d = (F.dokterDaftar || []).find(x => x.id === F.dokterId);
    return d || F.ctx.dokter || null;
  }

  /* ---------------------------------------------------------------- */
  /*  Nomor surat                                                      */
  /* ---------------------------------------------------------------- */
  function perbaruiNomorJadi() {
    const el = document.getElementById('nomorJadi');
    if (!el) return;
    const bag = SuratCore.bagianNomor(F.tanggal);
    el.textContent = F.nomor
      ? SuratCore.formatNomor(F.nomor, F.kode, bag.bulan, bag.tahun)
      : '—';
  }

  async function sarankanNomor(paksa = false) {
    const inNomor = document.getElementById('fNomor');
    const hint = document.getElementById('hintNomor');
    if (!inNomor) return;
    const bag = SuratCore.bagianNomor(F.tanggal);
    try {
      const n = await DB.suratNomorBerikutnya(F.kode, bag.tahun);
      if (!F.suratId && (paksa || !F.nomor)) {
        F.nomor = n;
        inNomor.value = n;
      }
      if (hint) hint.textContent = `Saran: ${n} — nomor terbesar ${F.kode} tahun ${bag.tahun} + 1.`;
    } catch (e) {
      if (hint) hint.textContent = 'Saran nomor tidak bisa diambil; ketik nomornya sendiri.';
    }
    perbaruiNomorJadi();
    await periksaNomor();
  }

  async function periksaNomor() {
    const w = document.getElementById('peringatanNomor');
    if (!w) return;
    w.innerHTML = '';
    if (!F.nomor) return;
    const bag = SuratCore.bagianNomor(F.tanggal);
    let terpakai = null;
    try { terpakai = await DB.suratNomorTerpakai(F.kode, bag.tahun, F.nomor); }
    catch (e) { return; }
    if (!terpakai) return;
    /* Saat menyunting surat sendiri, nomornya memang sudah terpakai —
       oleh surat itu sendiri. */
    if (F.suratId && terpakai.startsWith(
        SuratCore.formatNomor(F.nomor, F.kode, bag.bulan, bag.tahun))) {
      const lama = await DB.surat(F.suratId).catch(() => null);
      if (lama && lama.nomor_urut === F.nomor && lama.tahun === bag.tahun) return;
    }
    w.innerHTML = `<div class="banner err mt-12 mb-0"><div>
      <b>Nomor ${UI.esc(terpakai)} sudah dipakai.</b> Nomor surat tidak pernah dipakai
      dua kali — termasuk oleh surat yang dibatalkan — supaya satu nomor di buku agenda
      tidak menunjuk dua lembar berbeda. Pilih nomor lain.</div></div>`;
  }

  const periksaNomorTertunda = UI.tunda(periksaNomor, 500);

  /* ---------------------------------------------------------------- */
  /*  Pratinjau                                                        */
  /* ---------------------------------------------------------------- */
  function modelSekarang() {
    const d = dokterTerpilih();
    const jabatan = (document.getElementById('fJabatan') || {}).value || 'Dokter Pemeriksa';
    const ctx = Object.assign(konteksTanggal(), {
      dokter: d,
      ttdNama: d ? d.nama : '',
      ttdSip: d ? d.no_sip : '',
      ttdJabatan: jabatan
    });
    return SuratCore.dokumen(F.kode, F.data, ctx);
  }

  const opsiCetak = () => ({
    kop: KopKlinik.gambar(),
    rasioKop: KopKlinik.rasio(),
    tanpaKop: pengaturan.tampilkan_kop === false,
    garisKop: pengaturan.garis_bawah_kop === true,
    namaKlinik: (F.ctx.faskes && F.ctx.faskes.nama) || CONFIG.NAMA_KLINIK
  });

  function perbaruiPratinjau() {
    const bingkai = document.getElementById('framePratinjau');
    if (!bingkai) return;
    let html;
    try { html = SuratCetak.halamanHtml(modelSekarang(), opsiCetak()); }
    catch (e) { console.error(e); return; }
    bingkai.srcdoc = html;
    bingkai.onload = skalaPratinjau;
  }

  const pratinjauTertunda = UI.tunda(perbaruiPratinjau, 350);

  /* Pratinjau ditampilkan sebagai halaman A4 sungguhan (794 px pada 96
     dpi) yang dikecilkan dengan transform, bukan halaman yang dialirkan
     ulang agar muat. Kalau dialirkan ulang, pemenggalan barisnya berbeda
     dari hasil cetak — dan yang paling sering ditanyakan pengguna justru
     "kenapa di layar muat satu halaman, di kertas jadi dua". */
  function skalaPratinjau() {
    const wadah = document.getElementById('wadahPratinjau');
    const bingkai = document.getElementById('framePratinjau');
    if (!wadah || !bingkai) return;
    const skala = wadah.clientWidth / 794;
    bingkai.style.transform = `scale(${skala})`;
    let tinggi = 1123;
    try {
      const dok = bingkai.contentDocument;
      if (dok && dok.body) tinggi = Math.max(1123, dok.body.scrollHeight);
    } catch (e) { /* pratinjau baru dimuat */ }
    bingkai.style.height = tinggi + 'px';
    wadah.style.height = Math.round(tinggi * skala) + 'px';
  }

  /* ---------------------------------------------------------------- */
  /*  Menyimpan                                                        */
  /* ---------------------------------------------------------------- */
  async function simpan(lanjut) {
    const wGalat = document.getElementById('galatSurat');
    wGalat.innerHTML = '';

    const pesan = SuratCore.periksa(F.kode, F.data);
    if (!F.nomor) pesan.unshift('Nomor urut surat belum diisi.');
    if (!F.dokterId) pesan.unshift('Penanda tangan belum dipilih.');
    if (pesan.length) {
      wGalat.innerHTML = `<div class="banner err mb-12"><div>
        <b>Surat belum bisa diterbitkan:</b>
        <ul class="list-tight-mt6">${pesan.map(p =>
          `<li>${UI.esc(p)}</li>`).join('')}</ul></div></div>`;
      wGalat.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const d = dokterTerpilih();
    const bag = SuratCore.bagianNomor(F.tanggal);
    const rec = {
      jenis_kode: F.kode,
      nomor_urut: F.nomor,
      bulan: bag.bulan,
      tahun: bag.tahun,
      tanggal_surat: F.tanggal,
      pasien_id: F.ctx.pasien.id,
      kunjungan_id: F.ctx.kunjungan ? F.ctx.kunjungan.id : null,
      perihal: SuratCore.perihal(F.kode, F.data),
      data: F.data,
      dokter_id: F.dokterId,
      ttd_nama: d ? d.nama : '',
      ttd_jabatan: (document.getElementById('fJabatan') || {}).value || 'Dokter Pemeriksa',
      ttd_sip: d ? (d.no_sip || null) : null
    };

    const tombol = document.querySelectorAll('#btnSimpanCetak,#btnSimpanPdf,#btnSimpanSaja');
    tombol.forEach(b => { b.disabled = true; });

    let baris;
    try {
      baris = F.suratId ? await DB.ubahSurat(F.suratId, rec) : await DB.buatSurat(rec);
    } catch (e) {
      tombol.forEach(b => { b.disabled = false; });
      const teks = /uq_surat_nomor|duplicate key/i.test(e.message || '')
        ? `Nomor ${SuratCore.formatNomor(F.nomor, F.kode, bag.bulan, bag.tahun)} baru saja ` +
          'dipakai surat lain. Ganti nomornya lalu simpan ulang.'
        : (e.message || 'Gagal menyimpan surat.');
      wGalat.innerHTML = `<div class="banner err mb-12"><div>${UI.esc(teks)}</div></div>`;
      return;
    }

    F.suratId = baris.id;
    UI.toast('Surat tersimpan: ' + baris.nomor_surat, 'ok');
    tombol.forEach(b => { b.disabled = false; });

    const model = modelSekarang();
    model.nomor = baris.nomor_surat;

    try {
      if (lanjut === 'cetak') { await SuratCetak.cetak(model, opsiCetak()); await DB.suratCatatCetak(baris.id); }
      if (lanjut === 'pdf')   { await SuratCetak.unduhPdf(model, opsiCetak()); await DB.suratCatatCetak(baris.id); }
    } catch (e) {
      UI.toast(e.message || 'Gagal mencetak.', 'err');
    }

    if (lanjut === 'diam') App.pergi('#/surat/riwayat');
  }

  /* ================================================================== */
  /*  TAB 2 — Riwayat surat                                             */
  /* ================================================================== */
  let filter = null;

  async function tabRiwayat(w) {
    if (!filter) {
      const akhir = UI.hariIni();
      filter = { dari: UI.geserBulan(akhir.slice(0, 7), -1) + '-01', sampai: akhir,
                 jenis: '', status: '', kata: '' };
    }

    w.innerHTML = `
      <div class="page-header">
        <div class="page-heading">
          <h2>Riwayat surat</h2>
          <div class="page-sub">Semua surat yang pernah terbit — bisa dicetak ulang
            atau diunduh kapan saja</div>
        </div>
        ${bolehTerbit() ? `<div class="page-actions">
          <button class="btn btn-primary btn-sm" id="btnSuratBaru">
            ${UI.ikon('plus', 15)} Buat surat</button></div>` : ''}
      </div>
      <div class="filter-bar">
        <div class="field"><label>Dari tanggal</label>
          <input type="date" id="rDari" value="${filter.dari}" class="control-auto"></div>
        <div class="field"><label>Sampai</label>
          <input type="date" id="rSampai" value="${filter.sampai}" class="control-auto"></div>
        <div class="field"><label>Jenis surat</label>
          <select id="rJenis" class="control-auto"><option value="">Semua jenis</option>
            ${jenisMaster.map(j => `<option value="${j.kode}"
              ${filter.jenis === j.kode ? 'selected' : ''}>${UI.esc(j.nama)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Status</label>
          <select id="rStatus" class="control-auto">
            <option value="">Semua</option>
            <option value="AKTIF" ${filter.status === 'AKTIF' ? 'selected' : ''}>Berlaku</option>
            <option value="BATAL" ${filter.status === 'BATAL' ? 'selected' : ''}>Dibatalkan</option>
          </select></div>
        <div class="field flex-1"><label>Cari</label>
          <div class="search-box"><span class="ico">${UI.ikon('cari', 16)}</span>
            <input type="search" id="rKata" value="${UI.esc(filter.kata)}"
              placeholder="Nomor surat, nama pasien, atau perihal…"></div></div>
        <button class="btn btn-secondary" id="btnMuatSurat">Tampilkan</button>
      </div>
      <div class="card">
        <div class="card-body tight" id="tabelSurat">${UI.memuat(4)}</div>
      </div>`;

    const bBaru = w.querySelector('#btnSuratBaru');
    if (bBaru) bBaru.addEventListener('click', () => {
      tabAktif = 'baru';
      App.pergi('#/surat/baru');
      gambarTab(document.getElementById('isiSurat'));
    });

    const muat = async () => {
      filter.dari = w.querySelector('#rDari').value || null;
      filter.sampai = w.querySelector('#rSampai').value || null;
      filter.jenis = w.querySelector('#rJenis').value;
      filter.status = w.querySelector('#rStatus').value;
      filter.kata = w.querySelector('#rKata').value.trim();
      const data = await DB.daftarSurat(filter);
      gambarTabel(w.querySelector('#tabelSurat'), data);
    };
    w.querySelector('#btnMuatSurat').addEventListener('click', muat);
    w.querySelector('#rKata').addEventListener('input', UI.tunda(muat, 400));
    ['rJenis', 'rStatus'].forEach(id =>
      w.querySelector('#' + id).addEventListener('change', muat));

    /* Dipasang sekali di sini, bukan di gambarTabel(): isi tabelnya
       digambar ulang setiap kali saringan berubah, dan pemasang di sana
       akan menumpuk satu pendengar tiap penggambaran — satu klik akhirnya
       membuka modal yang sama beberapa kali. */
    w.querySelector('#tabelSurat').addEventListener('click', (e) => {
      const b = e.target.closest('[data-buka]'); if (!b) return;
      bukaSurat(b.dataset.buka);
    });

    await muat();
  }

  function gambarTabel(t, data) {
    if (!data.length) {
      t.innerHTML = UI.kosong('Belum ada surat',
        'Tidak ada surat pada rentang tanggal dan saringan ini.');
      return;
    }
    t.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th>Nomor surat</th><th>Tanggal</th><th>Jenis</th><th>Pasien</th>
        <th>Perihal</th><th>Dibuat oleh</th><th class="no-print"></th>
      </tr></thead>
      <tbody>${data.map(s => `<tr>
        <td class="tabular"><b>${UI.esc(s.nomor_surat)}</b>
          ${s.status === 'BATAL' ? '<br><span class="badge b-danger">Dibatalkan</span>' : ''}</td>
        <td>${UI.tglPendek(s.tanggal_surat)}</td>
        <td>${UI.esc(s.jenis_nama)}</td>
        <td><b>${UI.esc(s.nama_pasien)}</b><br>
          <span class="muted text-xs">No. RM ${UI.esc(s.no_rm)}</span></td>
        <td class="muted">${UI.esc(s.perihal || '—')}</td>
        <td class="muted">${UI.esc(s.nama_pembuat || '—')}
          ${s.jml_cetak ? `<br><span class="text-xs">${s.jml_cetak}× dicetak</span>` : ''}</td>
        <td class="no-print text-right">
          <button class="btn btn-ghost btn-sm" data-buka="${s.id}">Buka</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  /* ================================================================== */
  /*  Membuka satu surat: lihat, cetak ulang, unduh, batalkan           */
  /* ================================================================== */
  async function bukaSurat(id) {
    let s;
    try { s = await DB.surat(id); }
    catch (e) { UI.toast('Gagal memuat surat: ' + e.message, 'err'); return; }
    if (!s) { UI.toast('Surat tidak ditemukan.', 'err'); return; }

    const model = await modelDariBaris(s);
    const opsi = {
      kop: KopKlinik.gambar(), rasioKop: KopKlinik.rasio(),
      tanpaKop: pengaturan.tampilkan_kop === false,
      garisKop: pengaturan.garis_bawah_kop === true,
      namaKlinik: CONFIG.NAMA_KLINIK
    };

    const saya = App.siapa();
    const bolehBatal = saya && (saya.peran === 'admin' || s.dibuat_oleh === saya.id);
    const bolehUbah = s.status === 'AKTIF' && bolehBatal && bolehTerbit();

    await UI.modal({
      judul: `${s.jenis_nama} — ${s.nomor_surat}`,
      lebar: true,
      isi: `
        ${s.status === 'BATAL' ? `<div class="banner err mb-12"><div>
          <b>Surat ini dibatalkan.</b> ${UI.esc(s.alasan_batal || '')}</div></div>` : ''}
        <div class="surat-pratinjau-wrap full-width" id="wadahLihat">
          <iframe class="surat-pratinjau" id="frameLihat" title="Surat"></iframe>
        </div>`,
      siap: (badan) => {
        const bingkai = badan.querySelector('#frameLihat');
        bingkai.srcdoc = SuratCetak.halamanHtml(model, opsi);
        bingkai.onload = () => {
          const wadah = badan.querySelector('#wadahLihat');
          const skala = wadah.clientWidth / 794;
          bingkai.style.transform = `scale(${skala})`;
          let tinggi = 1123;
          try { tinggi = Math.max(1123, bingkai.contentDocument.body.scrollHeight); }
          catch (e) { /* abaikan */ }
          bingkai.style.height = tinggi + 'px';
          wadah.style.height = Math.round(tinggi * skala) + 'px';
        };
      },
      tombol: [
        { teks: 'Tutup', nilai: null },
        ...(bolehUbah ? [{ teks: 'Ubah', kelas: 'btn-ghost', aksi: () => {
          App.pergi('#/surat/ubah/' + s.id); return true;
        } }] : []),
        ...(s.status === 'AKTIF' && bolehBatal ? [{ teks: 'Batalkan', kelas: 'btn-danger',
          aksi: async () => { await dialogBatal(s); return true; } }] : []),
        { teks: 'Unduh PDF', kelas: 'btn-secondary', aksi: async () => {
          UI.toast('Menyiapkan PDF…');
          try {
            await SuratCetak.unduhPdf(model, opsi);
            await DB.suratCatatCetak(s.id);
          } catch (e) {
            UI.toast('Pustaka PDF gagal dimuat. Periksa koneksi internet, ' +
                     'atau pakai tombol Cetak.', 'err');
          }
          return false;
        } },
        { teks: 'Cetak', kelas: 'btn-primary', aksi: async () => {
          await SuratCetak.cetak(model, opsi);
          await DB.suratCatatCetak(s.id);
          return false;
        } }
      ]
    });
  }

  /* Menyusun ulang model dokumen dari baris database. Isi surat tidak
     dibaca ulang dari rekam medis: yang tersimpan di kolom `data` itulah
     yang dulu tercetak, dan cetak ulang harus memulangkan lembar yang
     sama persis sekalipun rekam medisnya kemudian diperbaiki lewat
     addendum. Yang dibaca ulang hanya identitas pasien. */
  async function modelDariBaris(s) {
    const [faskes, pasien] = await Promise.all([
      DB.faskes().catch(() => null),
      DB.pasien(s.pasien_id).catch(() => null)
    ]);
    let kunjungan = null;
    if (s.kunjungan_id) kunjungan = await DB.kunjungan(s.kunjungan_id).catch(() => null);

    return SuratCore.dokumen(s.jenis_kode, s.data || {}, {
      faskes, pasien, kunjungan,
      diagnosa: [], tindakan: [], resep: null, kajian: null, pemeriksaan: null,
      tanggalSurat: s.tanggal_surat,
      nomorSurat: s.nomor_surat,
      pengaturan,
      ttdNama: s.ttd_nama, ttdSip: s.ttd_sip, ttdJabatan: s.ttd_jabatan,
      batal: s.status === 'BATAL',
      alasanBatal: s.alasan_batal
    });
  }

  async function dialogBatal(s) {
    const hasil = await UI.modal({
      judul: 'Batalkan surat ' + s.nomor_surat,
      isi: `<div class="banner warn mb-12"><div>
          Nomor <b>${UI.esc(s.nomor_surat)}</b> tetap terpakai dan tidak akan
          diberikan ke surat lain. Kalau pasien sudah memegang lembarnya, mintalah
          lembar itu kembali; surat penggantinya terbit dengan nomor baru.
        </div></div>
        <div class="field mb-0"><label for="alasanBatal">Alasan pembatalan
          <span class="req">*</span></label>
          <textarea id="alasanBatal" rows="3"
            placeholder="Contoh: salah tanggal istirahat, sudah diganti surat nomor 12/SKS/YAKIM/IX/2026"></textarea>
        </div>`,
      tombol: [
        { teks: 'Tidak jadi', nilai: false },
        { teks: 'Batalkan surat', kelas: 'btn-danger', aksi: async (badan) => {
          const alasan = badan.querySelector('#alasanBatal').value.trim();
          if (!alasan) { UI.toast('Alasan pembatalan wajib diisi.', 'err'); return false; }
          await DB.suratBatalkan(s.id, alasan);
          return true;
        } }
      ]
    });
    if (hasil === true) {
      UI.toast('Surat dibatalkan.', 'ok');
      await gambarTab(document.getElementById('isiSurat'));
    }
  }

  /* ================================================================== */
  /*  Dipakai halaman lain (periksa.js & rekam.js)                      */
  /* ================================================================== */
  /* Daftar ringkas surat satu kunjungan, untuk ditempel di rekam medis
     dan layar pemeriksaan. */
  async function kartuSuratKunjungan(kunjunganId, bolehBuat) {
    let daftar = [];
    try { daftar = await DB.suratKunjungan(kunjunganId); }
    catch (e) { return `<p class="text-muted mb-0">Daftar surat tidak bisa dimuat.</p>`; }

    const isi = daftar.length
      ? daftar.map(s => `<div class="surat-baris">
          <div class="flex-1">
            <b>${UI.esc(s.jenis_nama)}</b>
            <div class="text-xs text-muted tabular">${UI.esc(s.nomor_surat)} ·
              ${UI.tglPendek(s.tanggal_surat)}${s.status === 'BATAL' ? ' · dibatalkan' : ''}</div>
          </div>
          <button class="btn btn-ghost btn-sm no-print" data-surat="${s.id}">Buka</button>
        </div>`).join('')
      : `<p class="text-muted text-sm mb-0">Belum ada surat untuk kunjungan ini.</p>`;

    return isi + (bolehBuat
      ? `<a href="#/surat/baru/${kunjunganId}" class="btn btn-secondary btn-sm btn-block mt-12 no-print">
           ${UI.ikon('plus', 15)} Buat surat</a>` : '');
  }

  /* Memasang tombol "Buka" pada daftar di atas. */
  function pasangKartuSurat(wadah) {
    if (!wadah) return;
    wadah.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-surat]'); if (!b) return;
      if (!jenisMaster.length) jenisMaster = await DB.refJenisSurat();
      if (!pengaturan) pengaturan = await DB.suratPengaturan();
      KopKlinik.pasang(pengaturan.kop_data_uri, pengaturan.kop_rasio);
      await bukaSurat(b.dataset.surat);
    });
  }

  return { render, bukaSurat, kartuSuratKunjungan, pasangKartuSurat };
})();

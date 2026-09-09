/* =====================================================================
   PAPAN ANTREAN HARI INI
   ---------------------------------------------------------------------
   Satu halaman untuk dua tahap:

     LOKET  pasien yang sudah datang tetapi belum didaftarkan.
            Isinya sebagian besar pemesanan Mobile JKN. Admin memanggil,
            memverifikasi kartu, lalu check-in — dan barulah kunjungan
            (rekam medis) lahir.

     POLI   pasien yang sudah punya kunjungan dan menunggu diperiksa.
            Dokter memanggil dari sini, atau dari halaman pemeriksaan.

   Halaman ini menyegarkan dirinya sendiri tiap 12 detik. Bukan realtime:
   loket dan poli sering dibuka di perangkat berbeda dengan jaringan yang
   tidak selalu stabil, dan tabel yang berhenti diperbarui karena satu
   soket putus jauh lebih membingungkan daripada tabel yang tertinggal
   sepuluh detik. Layar tunggu (display.html) menyegarkan lebih cepat,
   karena di sanalah kecepatan benar-benar terasa oleh pasien.
   ===================================================================== */
const Antrian = (() => {

  let semua = [], kuota = [], konf = {};
  let tab = 'LOKET';
  let jamPerbarui = null;
  let sedangMuat = false;

  const A = () => AntreanCore;

  /* ================= Tabel ringkas (dipakai Beranda juga) ============= */
  /* Beranda memanggil Antrian.gambarTabel() dengan data v_antrian_hari_ini
     (kunjungan), bukan v_antrean_hari_ini. Bentuk barisnya berbeda, jadi
     fungsi lama dipertahankan apa adanya. */
  function gambarTabel(wadah, data, ringkas = false) {
    if (!data.length) {
      wadah.innerHTML = `<div class="empty compact">
        ${UI.ikon('antrian', 40)}
        <h3>Belum ada pasien dalam antrian</h3>
        <p>Pasien yang didaftarkan hari ini akan muncul di sini.</p>
        ${App.boleh(['pendaftaran','perawat','dokter'])
          ? '<a href="#/pendaftaran" class="btn btn-primary btn-sm">Daftarkan pasien</a>' : ''}
      </div>`;
      return;
    }

    wadah.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th class="col-narrow">No.</th>
        <th>Pasien</th>
        ${ringkas ? '' : '<th>No. RM</th>'}
        <th>Poli</th>
        ${ringkas ? '' : '<th>Dokter</th>'}
        <th>Bayar</th>
        <th>Status</th>
        <th class="col-shrink"></th>
      </tr></thead>
      <tbody>${data.map(a => barisKunjungan(a, ringkas)).join('')}</tbody>
    </table></div>`;
  }

  function barisKunjungan(a, ringkas) {
    const umur = UI.umurTeks(a.tanggal_lahir);
    const jk = a.jenis_kelamin === 'L' ? 'L' : 'P';
    return `<tr>
      <td><div class="queue-no">${a.no_antrian ?? '-'}</div></td>
      <td>
        <b>${UI.esc(a.nama_pasien)}</b>
        <div class="text-xs text-muted">${jk} · ${umur}${ringkas ? ' · ' + UI.esc(a.no_rm) : ''}</div>
      </td>
      ${ringkas ? '' : `<td class="mono">${UI.esc(a.no_rm)}</td>`}
      <td>${UI.esc(a.nama_poli)}</td>
      ${ringkas ? '' : `<td class="muted">${UI.esc(a.nama_dokter || '—')}</td>`}
      <td>${UI.badgeBayar(a.cara_bayar)}</td>
      <td>${UI.badgeStatus(a.status)}</td>
      <td class="nowrap">${tombolKunjungan(a)}</td>
    </tr>`;
  }

  function tombolKunjungan(a) {
    const t = [];
    if (a.status === 'SELESAI') return `<a href="#/rekam/${a.id}" class="btn btn-secondary btn-sm">Lihat</a>`;
    if (App.boleh(['perawat','dokter']) && !a.sudah_kajian)
      t.push(`<a href="#/kajian/${a.id}" class="btn btn-primary btn-sm">Kajian awal</a>`);
    if (App.boleh(['dokter']))
      t.push(`<a href="#/periksa/${a.id}" class="btn ${a.sudah_kajian ? 'btn-primary' : 'btn-secondary'} btn-sm">Periksa</a>`);
    if (!t.length) t.push(`<a href="#/rekam/${a.id}" class="btn btn-secondary btn-sm">Lihat</a>`);
    return t.join(' ');
  }

  /* ========================== Halaman penuh ========================== */

  async function render(el) {
    await muatData();

    el.innerHTML = `
      <div class="page-header">
        <div class="page-heading">
          <h1>Antrean</h1>
          <div class="page-sub">${UI.tglIndo(new Date(), true)} · <span id="ringkas"></span></div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" id="btnSegar">${UI.ikon('jam',15)} Segarkan</button>
          ${App.boleh(['admin','pendaftaran','perawat','dokter'])
            ? `<button class="btn btn-secondary btn-sm" id="btnNomorBaru">${UI.ikon('plus',15)} Ambil nomor</button>` : ''}
          ${App.boleh(['admin','pendaftaran','perawat','dokter'])
            ? `<a href="#/pendaftaran" class="btn btn-primary btn-sm">${UI.ikon('daftar',15)} Daftarkan pasien</a>` : ''}
        </div>
      </div>

      <div id="kartuKuota" class="quota-row"></div>

      <div class="tabs" id="tabAntrean">
        <button class="tab on" data-t="LOKET">Menunggu loket</button>
        <button class="tab" data-t="POLI">Menunggu poli</button>
        <button class="tab" data-t="SELESAI">Selesai &amp; batal</button>
        <button class="tab" data-t="SEMUA">Semua</button>
      </div>

      <div class="work-panel"><div id="isiAntrean"></div></div>

      <div class="work-panel mt-16">
        <div class="work-panel-head"><h2>Panggilan terakhir</h2>
          <div class="text-xs text-muted">Yang sedang terdengar di ruang tunggu</div></div>
        <div id="isiPanggilan"></div>
      </div>`;

    el.querySelector('#tabAntrean').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      el.querySelectorAll('#tabAntrean .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); tab = b.dataset.t; gambar();
    });
    el.querySelector('#btnSegar').addEventListener('click', segarkan);
    const bNomor = el.querySelector('#btnNomorBaru');
    if (bNomor) bNomor.addEventListener('click', dialogNomorBaru);

    pasangAksi(el);
    gambar();
    mulaiPenyegaran();
  }

  async function muatData() {
    const [a, k, p] = await Promise.all([
      DB.antreanHariIni(),
      DB.antreanKuota().catch(() => []),
      DB.antreanPengaturan().catch(() => ({ konfigurasi: {} }))
    ]);
    semua = a; kuota = k; konf = p.konfigurasi || {};
  }

  /* Penyegaran berkala. Dihentikan begitu pengguna pindah halaman —
     kalau tidak, setiap kunjungan ke halaman ini meninggalkan satu timer
     hidup, dan setelah sepuluh kali aplikasi memanggil database sepuluh
     kali lebih sering tanpa ada yang tahu sebabnya. */
  function mulaiPenyegaran() {
    hentikanPenyegaran();
    jamPerbarui = setInterval(() => {
      if (!document.getElementById('isiAntrean')) { hentikanPenyegaran(); return; }
      if (document.hidden) return;             // tab di latar belakang: diam
      segarkan(true);
    }, 12000);
  }
  function hentikanPenyegaran() {
    if (jamPerbarui) { clearInterval(jamPerbarui); jamPerbarui = null; }
  }

  async function segarkan(diam = false) {
    if (sedangMuat) return;
    sedangMuat = true;
    try {
      await muatData();
      gambar();
      if (!diam) UI.toast('Antrean diperbarui.', 'ok', 1500);
    } catch (e) {
      if (!diam) UI.toast(e.message || 'Gagal memuat antrean.', 'err');
    } finally { sedangMuat = false; }
  }

  /* ----------------------------- Gambar ------------------------------ */
  function gambar() {
    gambarKuota();
    gambarDaftar();
    gambarPanggilan();

    const r = document.getElementById('ringkas');
    if (r) {
      const aktif   = semua.filter(A().masihAktif).length;
      const selesai = semua.filter(x => x.status === 'SELESAI').length;
      const online  = semua.filter(x => x.sumber === 'ONLINE').length;
      r.textContent = `${semua.length} nomor · ${aktif} menunggu · ${selesai} selesai` +
                      (online ? ` · ${online} dari Mobile JKN` : '');
    }
  }

  function gambarKuota() {
    const w = document.getElementById('kartuKuota');
    if (!w) return;
    if (!kuota.length) { w.innerHTML = ''; return; }

    w.innerHTML = kuota.map(k => {
      const dipanggil = semua.filter(a => a.poli_id === k.poli_id && a.status === 'DIPANGGIL')
                             .map(a => a.nomor).slice(-1)[0];
      const menunggu = semua.filter(a => a.poli_id === k.poli_id && A().masihAktif(a)).length;
      const penuh = k.buka && k.sisa_kuota <= 0;
      return `<div class="quota-card">
        <div class="quota-card-head">
          <b>${UI.esc(k.nama_poli)}</b>
          ${k.buka
            ? `<span class="badge ${penuh ? 'b-batal' : 'b-selesai'}">
                 ${penuh ? 'Kuota penuh' : `sisa ${k.sisa_kuota}`}</span>`
            : '<span class="badge b-batal">Tutup hari ini</span>'}
        </div>
        <div class="quota-figures">
          <div class="quota-figure">
            <div class="qf-lbl">Sedang dipanggil</div>
            <div class="qf-val mono">${UI.esc(dipanggil || '—')}</div>
          </div>
          <div class="quota-sep"></div>
          <div class="quota-figure">
            <div class="qf-lbl">Menunggu</div>
            <div class="qf-val">${menunggu}</div>
          </div>
        </div>
        <div class="quota-foot">
          ${k.buka ? `Buka ${A().jamPendek(k.jam_buka)}–${A().jamPendek(k.jam_tutup)} ·
                      online ${k.terpakai_online}/${k.kuota_online}`
                   : 'Tidak ada jadwal atau sedang libur'}
        </div>
      </div>`;
    }).join('');
  }

  function saring() {
    if (tab === 'LOKET')   return semua.filter(a => a.tahap === 'LOKET' && A().masihAktif(a));
    if (tab === 'POLI')    return semua.filter(a => a.tahap === 'POLI'  && A().masihAktif(a));
    if (tab === 'SELESAI') return semua.filter(a => !A().masihAktif(a));
    return semua;
  }

  function gambarDaftar() {
    const wadah = document.getElementById('isiAntrean');
    if (!wadah) return;
    const data = saring();

    if (!data.length) {
      wadah.innerHTML = `<div class="empty compact">
        ${UI.ikon('antrian', 40)}
        <h3>${tab === 'LOKET' ? 'Tidak ada yang menunggu di loket'
             : tab === 'POLI' ? 'Tidak ada yang menunggu poli'
             : 'Belum ada data'}</h3>
        <p>${tab === 'LOKET'
             ? 'Pemesanan lewat Mobile JKN dan nomor loket yang belum didaftarkan akan muncul di sini.'
             : 'Pasien yang sudah check-in akan muncul di sini.'}</p>
      </div>`;
      return;
    }

    wadah.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th class="col-narrow">Nomor</th>
        <th>Pasien</th>
        <th>Poli</th>
        <th>Asal</th>
        <th>Menunggu</th>
        <th>Status</th>
        <th class="col-shrink"></th>
      </tr></thead>
      <tbody>${data.map(baris).join('')}</tbody>
    </table></div>`;
  }

  function baris(a) {
    const [teks, kelas] = A().labelStatus(a.status);
    const belumKenal = !a.pasien_id;
    const lama = a.menit_menunggu;

    return `<tr data-id="${a.id}">
      <td>
        <div class="queue-no sm">${UI.esc(a.nomor)}</div>
        ${a.jumlah_panggil > 0
          ? `<div class="text-xs text-muted mt-4">dipanggil ${a.jumlah_panggil}×</div>` : ''}
      </td>
      <td>
        ${a.nama_pasien
          ? `<b>${UI.esc(a.nama_pasien)}</b>
             <div class="text-xs text-muted">
               ${a.no_rm ? 'RM ' + UI.esc(a.no_rm) : ''}
               ${a.tanggal_lahir ? ' · ' + UI.umurTeks(a.tanggal_lahir) : ''}</div>`
          : `<b class="text-muted">Belum dikenali</b>`}
        ${belumKenal
          ? `<div class="text-xs text-warn">
               Kartu ${UI.esc(a.no_kartu || '—')} — belum jadi pasien klinik</div>` : ''}
      </td>
      <td>${UI.esc(a.nama_poli)}</td>
      <td><span class="badge ${a.sumber === 'ONLINE' ? 'b-info' : 'b-umum'}">
            ${UI.esc(A().labelSumber(a.sumber))}</span></td>
      <td class="nowrap ${lama >= 45 ? 'err-text' : 'text-muted'}">
        ${A().masihAktif(a) ? `${lama} mnt` : '—'}</td>
      <td><span class="badge ${kelas}"><span class="dot"></span>${UI.esc(teks)}</span></td>
      <td class="nowrap">${tombol(a)}</td>
    </tr>`;
  }

  function tombol(a) {
    if (!A().masihAktif(a)) {
      return a.kunjungan_id
        ? `<a href="#/rekam/${a.kunjungan_id}" class="btn btn-secondary btn-sm">Lihat</a>` : '';
    }

    const t = [];
    const bolehPanggil = App.boleh(['admin','pendaftaran','perawat','dokter','apoteker','kasir']);

    if (bolehPanggil)
      t.push(`<button class="btn btn-secondary btn-sm" data-aksi="panggil" data-id="${a.id}">
                ${a.jumlah_panggil ? 'Panggil ulang' : 'Panggil'}</button>`);

    if (a.tahap === 'LOKET' && App.boleh(['admin','pendaftaran','perawat','dokter']))
      t.push(`<button class="btn btn-primary btn-sm" data-aksi="checkin" data-id="${a.id}">
                Check-in</button>`);

    if (a.tahap === 'POLI' && a.kunjungan_id) {
      if (App.boleh(['perawat','dokter']) && !a.sudah_kajian)
        t.push(`<a href="#/kajian/${a.kunjungan_id}" class="btn btn-secondary btn-sm">Kajian</a>`);
      if (App.boleh(['dokter']))
        t.push(`<a href="#/periksa/${a.kunjungan_id}" class="btn btn-primary btn-sm">Periksa</a>`);
    }

    t.push(`<button class="btn-icon" data-aksi="lain" data-id="${a.id}" title="Tindakan lain">⋯</button>`);
    return t.join(' ');
  }

  function gambarPanggilan() {
    const w = document.getElementById('isiPanggilan');
    if (!w) return;
    const dipanggil = semua
      .filter(a => a.waktu_panggil)
      .sort((x, y) => new Date(y.waktu_panggil) - new Date(x.waktu_panggil))
      .slice(0, 6);

    if (!dipanggil.length) {
      w.innerHTML = `<div class="empty sm">
        <p class="mb-0">Belum ada nomor yang dipanggil hari ini.</p></div>`;
      return;
    }
    w.innerHTML = `<div class="chip-list pad">${
      dipanggil.map(a => `<span class="chip">
        <b class="mono">${UI.esc(a.nomor)}</b>
        <span class="text-muted">→ ${UI.esc(a.tujuan_terakhir || a.nama_poli)}</span>
        <span class="text-xs text-muted">${UI.jam(a.waktu_panggil)}</span>
      </span>`).join('')}</div>`;
  }

  /* ----------------------------- Aksi -------------------------------- */
  function pasangAksi(el) {
    /* Satu pendengar untuk seluruh tabel, dipasang SEKALI di sini —
       bukan di dalam gambarDaftar() yang dipanggil ulang tiap 12 detik.
       Pendengar yang dipasang ulang menumpuk: setelah dua kali gambar,
       satu klik "Panggil" berjalan dua kali, dan nomor terpanggil dua
       kali berturut-turut tanpa ada yang menekan apa pun. Kelas bug yang
       sama pernah membuat tombol pemeriksaan fisik "tidak bereaksi". */
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-aksi]');
      if (!b || b.disabled) return;
      const a = semua.find(x => x.id === b.dataset.id);
      if (!a) return;

      b.disabled = true;
      try {
        if (b.dataset.aksi === 'panggil')  await panggil(a);
        if (b.dataset.aksi === 'checkin')  await checkin(a);
        if (b.dataset.aksi === 'lain')     await menuLain(a);
      } catch (err) {
        UI.toast(err.message || 'Tindakan gagal.', 'err');
      } finally { b.disabled = false; }
    });
  }

  async function panggil(a) {
    const tujuan = a.tahap === 'LOKET' ? null : a.nama_poli;
    await DB.antreanPanggil(a.id, tujuan);
    UI.toast(`Nomor ${a.nomor} dipanggil.`, 'ok');
    await segarkan(true);
  }

  /* Check-in: menautkan nomor antrean ke pasien, lalu membuat kunjungan.
     Untuk pemesanan Mobile JKN dari orang yang belum pernah berobat di
     sini, petugas harus memilih atau membuat pasiennya lebih dulu —
     rekam medis tidak pernah lahir tanpa mata manusia di atasnya. */
  async function checkin(a) {
    const [poli, dokter] = await Promise.all([DB.daftarPoli(), DB.daftarDokter()]);
    const poliIni = poli.find(p => p.id === a.poli_id);
    let pasienId = a.pasien_id;

    const hasil = await UI.modal({
      judul: `Check-in nomor ${a.nomor}`,
      lebar: true,
      /* PENTING — bug lama pernah terjadi di sini: banner-nya dulu memakai
         dua elemen pembungkus bersarang (kotak banner, lalu satu kotak
         lagi di dalamnya untuk teks) tapi kode HTML-nya cuma menutup SATU
         daripadanya. Akibatnya seluruh form di bawah ikut jadi anak
         elemen banner dan tampil sempit di dalam kotak kuning/biru.
         Sekarang kedua elemen (kotak banner, kotak teks kelas banner-txt)
         ditutup dengan benar dan berdiri sendiri sebagai .modal-section,
         terpisah total dari .modal-section berikutnya yang berisi form.
         Kalau mengubah banner ini lagi: hitung ulang pasangan buka/tutup
         elemennya sebelum menyimpan. */
      isi: `
        <div class="modal-section">
          <div class="banner ${pasienId ? 'info' : 'warn'} mb-0">
            <div class="banner-txt">
              ${pasienId
                ? `Nomor ini milik <b>${UI.esc(a.nama_pasien)}</b>${a.no_rm ? ` (RM ${UI.esc(a.no_rm)})` : ''}.`
                : `Peserta ini <b>belum terdaftar sebagai pasien klinik</b>.
                   ${a.no_kartu ? `Kartu BPJS <b class="mono">${UI.esc(a.no_kartu)}</b>.` : ''}
                   ${a.nik ? `NIK <b class="mono">${UI.esc(a.nik)}</b>.` : ''}
                   Cari dulu namanya di bawah; kalau memang belum pernah berobat,
                   daftarkan sebagai pasien baru lebih dulu.`}
              ${a.catatan ? `<div class="text-xs mt-4">${UI.esc(a.catatan)}</div>` : ''}
            </div>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">Pasien</div>
          <div id="pilihPasien"></div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">Kunjungan</div>
          <div class="form-grid">
            <div class="field field-compact">
              <label>Poli</label>
              <input class="w-full" value="${UI.esc(poliIni?.nama || '')}" disabled>
            </div>
            <div class="field field-wide">
              <label>Dokter</label>
              <select name="dokter_id" class="w-full">
                <option value="">— belum ditentukan —</option>
                ${dokter.map(d => `<option value="${d.id}">${UI.esc(d.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="field field-compact">
              <label>Cara bayar</label>
              <select name="cara_bayar" class="w-full">
                <option value="BPJS" ${a.no_kartu ? 'selected' : ''}>BPJS</option>
                <option value="UMUM" ${a.no_kartu ? '' : 'selected'}>Umum</option>
                <option value="ASURANSI_LAIN">Asuransi lain</option>
                <option value="GRATIS">Gratis</option>
              </select>
            </div>
            <div class="field field-wide">
              <label>Keluhan singkat</label>
              <input name="keluhan" class="w-full" placeholder="mis. batuk 3 hari">
            </div>
          </div>
        </div>
        <div id="galatCheckin"></div>`,
      siap: (badan) => {
        const kotak = badan.querySelector('#pilihPasien');
        if (pasienId) {
          kotak.innerHTML = `<div class="field mb-0"><input class="w-full" value="${UI.esc(a.nama_pasien)}" disabled></div>`;
          return;
        }
        kotak.innerHTML = `<div class="field mb-0">
          <div id="comboPasien"></div>
          <div class="hint" id="pasienTerpilih">Belum ada pasien dipilih.</div></div>`;
        Komponen.comboCari({
          wadah: kotak.querySelector('#comboPasien'),
          placeholder: 'Ketik nama, NIK, atau nomor rekam medis',
          /* Nomor BPJS peserta dipakai sebagai kata kunci awal supaya
             petugas tidak perlu mengetiknya ulang dari layar sebelah. */
          nilaiAwal: a.nama_snapshot || '',
          cariFn: (kata) => DB.cariPasien(kata, 12),
          formatFn: (p) => `<b>${UI.esc(p.nama)}</b>
            <div class="text-xs text-muted">RM ${UI.esc(p.no_rm)} ·
              ${UI.umurTeks(p.tanggal_lahir)} ·
              ${UI.esc(p.no_bpjs || 'tanpa BPJS')}</div>`,
          onPilih: (p) => {
            pasienId = p ? p.id : null;
            const info = kotak.querySelector('#pasienTerpilih');
            info.innerHTML = p
              ? `Dipilih: <b>${UI.esc(p.nama)}</b> (RM ${UI.esc(p.no_rm)})`
              : 'Belum ada pasien dipilih.';
          }
        });
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Check-in', kelas: 'btn-primary', aksi: async (badan) => {
            const g = badan.querySelector('#galatCheckin');
            if (!pasienId) {
              g.innerHTML = `<div class="banner err"><div>Pilih dulu pasiennya.
                Kalau belum pernah berobat di sini,
                <a href="#/pendaftaran">daftarkan sebagai pasien baru</a> lebih dulu.</div></div>`;
              return false;
            }
            const d = UI.nilaiForm(badan);
            try {
              return await DB.antreanCheckin(a.id, {
                pasien_id: pasienId,
                dokter_id: d.dokter_id || null,
                cara_bayar: d.cara_bayar || 'BPJS',
                keluhan: d.keluhan || null
              });
            } catch (e) {
              g.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`;
              return false;
            }
          } }
      ]
    });

    if (hasil && hasil.id) {
      UI.toast(`${a.nomor} sudah check-in. Kunjungan ${hasil.no_kunjungan} dibuat.`, 'ok');
      App.perbaruiHitungAntrian();
      await segarkan(true);
    }
  }

  async function menuLain(a) {
    const pilih = await UI.modal({
      judul: `Nomor ${a.nomor}`,
      isi: `<div class="chip-list">
        <button class="btn btn-secondary btn-block mb-6" data-idx="0">Tandai sedang dilayani</button>
        <button class="btn btn-secondary btn-block mb-6" data-idx="1">Tandai tidak hadir (lewati)</button>
        ${a.kunjungan_id ? '' :
          '<button class="btn btn-danger btn-block" data-idx="2">Batalkan nomor ini</button>'}
        ${a.kunjungan_id
          ? `<p class="hint mb-0">Nomor ini sudah menjadi kunjungan
             ${a.status_kunjungan ? `(${UI.esc(a.status_kunjungan)})` : ''}, jadi tidak bisa
             dibatalkan dari sini — batalkan kunjungannya lebih dulu.</p>` : ''}
      </div>`,
      tombol: [
        { teks: 'Tutup', nilai: null },
        { teks: 'Sedang dilayani', nilai: 'layan', kelas: 'btn-secondary' },
        { teks: 'Tidak hadir',     nilai: 'lewat', kelas: 'btn-secondary' },
        ...(a.kunjungan_id ? [] : [{ teks: 'Batalkan', nilai: 'batal', kelas: 'btn-danger' }])
      ]
    });

    if (pilih === 'layan') {
      await DB.antreanMulaiLayan(a.id);
      UI.toast(`${a.nomor} ditandai sedang dilayani.`, 'ok');
    }
    if (pilih === 'lewat') {
      /* Diperingatkan, tidak dihalangi. Kadang petugas tahu pasiennya
         sudah pulang tanpa perlu memanggil tiga kali. */
      const pesan = a.jumlah_panggil >= 2
        ? `Nomor ${a.nomor} akan ditandai tidak hadir. Kuotanya kembali dan pasien boleh mengambil nomor baru.`
        : `Nomor ${a.nomor} baru dipanggil ${a.jumlah_panggil}×. Yakin sudah tidak hadir?`;
      if (!await UI.konfirmasi('Tandai tidak hadir', pesan, 'Ya, lewati')) return;
      await DB.antreanLewat(a.id);
      UI.toast(`${a.nomor} dilewati.`, 'ok');
    }
    if (pilih === 'batal') {
      const alasan = await UI.modal({
        judul: `Batalkan nomor ${a.nomor}`,
        isi: `<div class="field"><label>Alasan pembatalan</label>
                <input name="alasan" class="w-full" placeholder="mis. salah poli"></div>
              <p class="hint mb-0">Nomor yang sudah dibatalkan tidak dipakai ulang —
                pasien mungkin sudah memotret nomornya.</p>`,
        tombol: [
          { teks: 'Batal', nilai: null },
          { teks: 'Batalkan nomor', kelas: 'btn-danger',
            aksi: (b) => UI.nilaiForm(b).alasan || '—' }
        ]
      });
      if (alasan === null) return;
      await DB.antreanBatal(a.id, alasan);
      UI.toast(`${a.nomor} dibatalkan.`, 'ok');
    }
    if (pilih) await segarkan(true);
  }

  /* Nomor loket tanpa kunjungan — untuk pasien yang datang tetapi
     berkasnya belum siap, atau saat loket ramai dan pendaftaran menyusul. */
  async function dialogNomorBaru() {
    const poli = await DB.daftarPoli();
    const hasil = await UI.modal({
      judul: 'Ambil nomor antrean',
      isi: `
        <p class="hint">Nomor ini terbit sekarang tanpa membuat rekam medis.
          Pendaftarannya menyusul saat pasien dipanggil ke loket.</p>
        <div class="field">
          <label>Poli</label>
          <select name="poli_id" class="w-full">
            ${poli.map(p => `<option value="${p.id}">${UI.esc(p.nama)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Nomor kartu BPJS <span class="text-muted">(boleh kosong)</span></label>
          <input name="no_kartu" class="w-full mono" maxlength="13" inputmode="numeric">
        </div>
        <div class="field">
          <label>Nama <span class="text-muted">(catatan untuk petugas)</span></label>
          <input name="nama_snapshot" class="w-full">
        </div>
        <div id="galatNomor"></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Terbitkan nomor', kelas: 'btn-primary', aksi: async (badan) => {
            const d = UI.nilaiForm(badan);
            const g = badan.querySelector('#galatNomor');
            /* Nomor kartu boleh kosong, tetapi kalau diisi harus benar:
               kartu setengah jadi membuat pemesanan Mobile JKN peserta
               yang sama tidak terdeteksi sebagai duplikat. */
            if (d.no_kartu) {
              const salah = AntreanCore.periksaKartu(d.no_kartu);
              if (salah) {
                g.innerHTML = `<div class="banner err"><div>${UI.esc(salah)}</div></div>`;
                return false;
              }
            }
            try {
              return await DB.antreanAmbilLoket({
                poli_id: d.poli_id,
                no_kartu: d.no_kartu || null,
                nama_snapshot: d.nama_snapshot || null,
                tahap: 'LOKET', status: 'MENUNGGU'
              });
            } catch (e) {
              g.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`;
              return false;
            }
          } }
      ]
    });
    if (hasil && hasil.nomor) {
      UI.toast(`Nomor ${hasil.nomor} diterbitkan.`, 'ok');
      await segarkan(true);
    }
  }

  return { render, gambarTabel, hentikanPenyegaran };
})();

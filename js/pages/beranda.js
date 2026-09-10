/* ===================== BERANDA ===================== */
const Beranda = (() => {

  async function render(el) {
    const profil = App.siapa();
    const [stat, antrian] = await Promise.all([DB.statistikHariIni(), DB.antrianHariIni()]);

    const menunggu = antrian.filter(a => a.status === 'MENUNGGU');
    const perluKajian = antrian.filter(a => !a.sudah_kajian && a.status !== 'SELESAI' && a.status !== 'BATAL');
    const perluDokter = antrian.filter(a => a.sudah_kajian && !a.sudah_periksa && a.status !== 'BATAL');

    const salam = (() => {
      const j = new Date().getHours();
      if (j < 11) return 'Selamat pagi';
      if (j < 15) return 'Selamat siang';
      if (j < 19) return 'Selamat sore';
      return 'Selamat malam';
    })();

    /* Baris kerja pendek untuk panel "Menunggu Anda" / "Perlu kajian awal" —
       satu fungsi dipakai dua tempat supaya strukturnya konsisten
       (.work-row, bukan tautan dengan style inline seperti sebelumnya). */
    const barisKerja = (a, tujuan, sub) => `
      <a href="#/${tujuan}/${a.id}" class="work-row clickable">
        <div class="wr-lead"><div class="queue-no sm">${a.no_antrian}</div></div>
        <div class="wr-main">
          <div class="wr-title">${UI.esc(a.nama_pasien)}</div>
          <div class="wr-sub">${sub}</div>
        </div>
        <div class="wr-actions text-muted">${UI.ikon('kembali', 15)}</div>
      </a>`;

    el.innerHTML = `
      <div class="page-header">
        <div class="page-heading">
          <h1>${salam}, ${UI.esc(profil.nama)}</h1>
          <div class="page-sub">${UI.tglIndo(new Date(), true)}</div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <div class="sc-ico">${UI.ikon('pasien', 18)}</div>
          <div>
            <div class="sc-val tabular">${stat.kunjungan_hari_ini}</div>
            <div class="sc-lbl">Kunjungan hari ini · ${stat.selesai_hari_ini} selesai</div>
          </div>
        </div>
        <div class="stat-card ${menunggu.length ? 'warn' : 'ok'}">
          <div class="sc-ico">${UI.ikon('jam', 18)}</div>
          <div>
            <div class="sc-val tabular">${stat.dalam_antrian}</div>
            <div class="sc-lbl">Dalam antrian · ${menunggu.length} belum dipanggil</div>
          </div>
        </div>
        <div class="stat-card ${perluKajian.length ? 'warn' : 'ok'}">
          <div class="sc-ico">${UI.ikon('jantung', 18)}</div>
          <div>
            <div class="sc-val tabular">${perluKajian.length}</div>
            <div class="sc-lbl">Menunggu kajian awal</div>
          </div>
        </div>
      </div>

      <div class="split">
        <div class="work-panel">
          <div class="work-panel-head">
            <h2>Antrian hari ini</h2>
            <div class="text-xs text-muted flex-1">Pasien yang belum selesai dilayani</div>
            <a href="#/antrian" class="btn btn-secondary btn-sm">Lihat semua</a>
          </div>
          <div id="tabelAntrian"></div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><h2>Aksi cepat</h2></div>
            <div class="card-body">
              <div class="stack">
                ${App.boleh('kunjungan_daftar')
                  ? `<a href="#/pendaftaran" class="btn btn-primary btn-block">
                       ${UI.ikon('plus',16)} Daftarkan pasien</a>` : ''}
                <a href="#/pasien" class="btn btn-secondary btn-block">
                  ${UI.ikon('cari',16)} Cari data pasien</a>
                <a href="#/antrian" class="btn btn-secondary btn-block">
                  ${UI.ikon('antrian',16)} Buka antrian</a>
              </div>
            </div>
          </div>

          ${profil.peran === 'dokter' || profil.peran === 'master' ? `
          <div class="work-panel mt-16">
            <div class="work-panel-head"><h2>Menunggu Anda</h2>
              <span class="count">${perluDokter.length}</span></div>
            <div class="work-list">
              ${perluDokter.length === 0
                ? `<div class="empty sm"><p class="mb-0">Tidak ada pasien yang menunggu diperiksa.</p></div>`
                : perluDokter.slice(0, 6).map(a => barisKerja(a, 'periksa',
                    `${UI.esc(a.nama_poli)} · ${UI.esc(a.no_rm)}`)).join('')}
            </div>
          </div>` : ''}

          ${profil.peran === 'perawat' ? `
          <div class="work-panel mt-16">
            <div class="work-panel-head"><h2>Perlu kajian awal</h2>
              <span class="count">${perluKajian.length}</span></div>
            <div class="work-list">
              ${perluKajian.length === 0
                ? `<div class="empty sm"><p class="mb-0">Semua pasien sudah dikaji.</p></div>`
                : perluKajian.slice(0, 6).map(a => barisKerja(a, 'kajian',
                    UI.esc(a.nama_poli))).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>`;

    Antrian.gambarTabel(document.getElementById('tabelAntrian'),
      antrian.filter(a => a.status !== 'SELESAI' && a.status !== 'BATAL').slice(0, 8), true);
  }

  return { render };
})();

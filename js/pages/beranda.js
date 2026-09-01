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

    el.innerHTML = `
      <div class="mb-16">
        <h1>${salam}, ${UI.esc(profil.nama)}</h1>
        <p class="text-muted mb-0">${UI.tglIndo(new Date(), true)}</p>
      </div>

      <div class="grid grid-4 mb-16">
        <div class="stat accent">
          <div class="lbl">${UI.ikon('pasien', 15)} Kunjungan hari ini</div>
          <div class="val tabular">${stat.kunjungan_hari_ini}</div>
          <div class="hint">${stat.selesai_hari_ini} sudah selesai</div>
        </div>
        <div class="stat">
          <div class="lbl">${UI.ikon('jam', 15)} Masih dalam antrian</div>
          <div class="val tabular">${stat.dalam_antrian}</div>
          <div class="hint">${menunggu.length} belum dipanggil</div>
        </div>
        <div class="stat">
          <div class="lbl">${UI.ikon('jantung', 15)} Menunggu kajian awal</div>
          <div class="val tabular">${perluKajian.length}</div>
          <div class="hint">pemeriksaan tanda vital</div>
        </div>
        <div class="stat">
          <div class="lbl">${UI.ikon('rekam', 15)} Total pasien terdaftar</div>
          <div class="val tabular">${stat.total_pasien.toLocaleString('id-ID')}</div>
          <div class="hint">sejak klinik berdiri</div>
        </div>
      </div>

      <div class="split">
        <div class="card">
          <div class="card-head">
            <div class="flex-1">
              <h2>Antrian hari ini</h2>
              <div class="sub">Pasien yang belum selesai dilayani</div>
            </div>
            <a href="#/antrian" class="btn btn-secondary btn-sm">Lihat semua</a>
          </div>
          <div class="card-body tight" id="tabelAntrian"></div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><h2>Aksi cepat</h2></div>
            <div class="card-body">
              <div style="display:grid;gap:9px">
                ${App.boleh(['pendaftaran','perawat','dokter'])
                  ? `<a href="#/pendaftaran" class="btn btn-primary btn-block">
                       ${UI.ikon('plus',16)} Daftarkan pasien</a>` : ''}
                <a href="#/pasien" class="btn btn-secondary btn-block">
                  ${UI.ikon('cari',16)} Cari data pasien</a>
                <a href="#/antrian" class="btn btn-secondary btn-block">
                  ${UI.ikon('antrian',16)} Buka antrian</a>
              </div>
            </div>
          </div>

          ${profil.peran === 'dokter' || profil.peran === 'admin' ? `
          <div class="card">
            <div class="card-head"><h2>Menunggu Anda</h2></div>
            <div class="card-body tight">
              ${perluDokter.length === 0
                ? `<div class="empty" style="padding:26px 16px">
                     <p class="mb-0">Tidak ada pasien yang menunggu diperiksa.</p></div>`
                : perluDokter.slice(0, 6).map(a => `
                  <a href="#/periksa/${a.id}" style="display:flex;gap:11px;align-items:center;
                     padding:11px 16px;border-bottom:1px solid var(--ink-100);color:inherit;text-decoration:none">
                    <div class="queue-no" style="width:30px;height:30px;font-size:13px">${a.no_antrian}</div>
                    <div class="flex-1" style="min-width:0">
                      <b style="display:block;font-size:13.5px">${UI.esc(a.nama_pasien)}</b>
                      <span class="text-xs text-muted">${UI.esc(a.nama_poli)} · ${UI.esc(a.no_rm)}</span>
                    </div>
                    ${UI.ikon('kembali',15)}
                  </a>`).join('')}
            </div>
          </div>` : ''}

          ${profil.peran === 'perawat' ? `
          <div class="card">
            <div class="card-head"><h2>Perlu kajian awal</h2></div>
            <div class="card-body tight">
              ${perluKajian.length === 0
                ? `<div class="empty" style="padding:26px 16px">
                     <p class="mb-0">Semua pasien sudah dikaji.</p></div>`
                : perluKajian.slice(0, 6).map(a => `
                  <a href="#/kajian/${a.id}" style="display:flex;gap:11px;align-items:center;
                     padding:11px 16px;border-bottom:1px solid var(--ink-100);color:inherit;text-decoration:none">
                    <div class="queue-no" style="width:30px;height:30px;font-size:13px">${a.no_antrian}</div>
                    <div class="flex-1" style="min-width:0">
                      <b style="display:block;font-size:13.5px">${UI.esc(a.nama_pasien)}</b>
                      <span class="text-xs text-muted">${UI.esc(a.nama_poli)}</span>
                    </div>
                    ${UI.ikon('kembali',15)}
                  </a>`).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>`;

    Antrian.gambarTabel(document.getElementById('tabelAntrian'),
      antrian.filter(a => a.status !== 'SELESAI' && a.status !== 'BATAL').slice(0, 8), true);
  }

  return { render };
})();

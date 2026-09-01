/* ===================== ANTRIAN HARI INI ===================== */
const Antrian = (() => {

  let semua = [];
  let saring = 'AKTIF';

  /* Tabel antrian dipakai juga oleh halaman Beranda */
  function gambarTabel(wadah, data, ringkas = false) {
    if (!data.length) {
      wadah.innerHTML = `<div class="empty" style="padding:34px 16px">
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
        <th style="width:56px">No.</th>
        <th>Pasien</th>
        ${ringkas ? '' : '<th>No. RM</th>'}
        <th>Poli</th>
        ${ringkas ? '' : '<th>Dokter</th>'}
        <th>Bayar</th>
        <th>Status</th>
        <th style="width:1%"></th>
      </tr></thead>
      <tbody>${data.map(a => barisAntrian(a, ringkas)).join('')}</tbody>
    </table></div>`;
  }

  function barisAntrian(a, ringkas) {
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
      <td class="nowrap">${tombolAksi(a)}</td>
    </tr>`;
  }

  function tombolAksi(a) {
    const t = [];
    if (a.status === 'SELESAI') {
      t.push(`<a href="#/rekam/${a.id}" class="btn btn-secondary btn-sm">Lihat</a>`);
      return t.join(' ');
    }
    if (App.boleh(['perawat','dokter']) && !a.sudah_kajian)
      t.push(`<a href="#/kajian/${a.id}" class="btn btn-primary btn-sm">Kajian awal</a>`);
    if (App.boleh(['dokter']))
      t.push(`<a href="#/periksa/${a.id}" class="btn ${a.sudah_kajian ? 'btn-primary' : 'btn-secondary'} btn-sm">Periksa</a>`);
    if (!t.length) t.push(`<a href="#/rekam/${a.id}" class="btn btn-secondary btn-sm">Lihat</a>`);
    return t.join(' ');
  }

  async function render(el) {
    semua = await DB.antrianHariIni();

    el.innerHTML = `
      <div class="flex items-center justify-between mb-16 flex-wrap gap-12">
        <div>
          <h1>Antrian ${UI.tglIndo(new Date(), true)}</h1>
          <p class="text-muted mb-0" id="ringkas"></p>
        </div>
        ${App.boleh(['pendaftaran','perawat','dokter'])
          ? `<a href="#/pendaftaran" class="btn btn-primary">${UI.ikon('plus',16)} Daftarkan pasien</a>` : ''}
      </div>

      <div class="tabs" id="tabSaring">
        <button class="tab on" data-f="AKTIF">Sedang dilayani</button>
        <button class="tab" data-f="SEMUA">Semua</button>
        <button class="tab" data-f="MENUNGGU">Menunggu</button>
        <button class="tab" data-f="SELESAI">Selesai</button>
      </div>

      <div class="card"><div class="card-body tight" id="isiAntrian"></div></div>`;

    el.querySelector('#tabSaring').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      el.querySelectorAll('#tabSaring .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); saring = b.dataset.f; gambar();
    });

    gambar();
  }

  function gambar() {
    const isi = document.getElementById('isiAntrian');
    let d = semua;
    if (saring === 'AKTIF')    d = semua.filter(a => !['SELESAI','BATAL'].includes(a.status));
    if (saring === 'MENUNGGU') d = semua.filter(a => a.status === 'MENUNGGU');
    if (saring === 'SELESAI')  d = semua.filter(a => a.status === 'SELESAI');
    gambarTabel(isi, d);

    const r = document.getElementById('ringkas');
    if (r) {
      const selesai = semua.filter(a => a.status === 'SELESAI').length;
      r.textContent = `${semua.length} kunjungan · ${selesai} selesai · ${semua.length - selesai} dalam proses`;
    }
  }

  return { render, gambarTabel };
})();

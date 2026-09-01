/* ===================== LAPORAN ===================== */
const Laporan = (() => {

  async function render(el) {
    const akhir = UI.hariIni();
    const awal = akhir.slice(0, 8) + '01';   // awal bulan berjalan

    el.innerHTML = `
      <div class="mb-16"><h1>Laporan</h1>
        <p class="text-muted mb-0">Rekap kunjungan dan sepuluh besar penyakit.</p></div>

      <div class="card mb-16">
        <div class="card-body">
          <div class="flex items-center gap-12 flex-wrap">
            <div class="flex items-center gap-8">
              <label style="margin:0">Periode</label>
              <input type="date" id="dari" value="${awal}" style="width:auto">
              <span class="text-muted">s.d.</span>
              <input type="date" id="sampai" value="${akhir}" style="width:auto">
            </div>
            <button class="btn btn-primary btn-sm" id="btnTampil">Tampilkan</button>
            <div class="flex-1"></div>
            <button class="btn btn-secondary btn-sm" id="btnUnduh">${UI.ikon('unduh',15)} Unduh CSV</button>
          </div>
        </div>
      </div>

      <div id="isiLaporan">${UI.memuat(4)}</div>`;

    const muat = async () => {
      const dari = el.querySelector('#dari').value;
      const sampai = el.querySelector('#sampai').value;
      const w = el.querySelector('#isiLaporan');
      w.innerHTML = UI.memuat(4);
      try {
        const [kunjungan, top, tindakan] = await Promise.all([
          DB.daftarKunjungan({ dari, sampai, batas: 2000 }),
          DB.diagnosaTeratas(dari, sampai, 10),
          DB.tindakanTeratas(dari, sampai, 12)
        ]);
        gambar(w, kunjungan, top, tindakan, dari, sampai);
      } catch (e) {
        w.innerHTML = `<div class="banner err">${UI.esc(e.message)}</div>`;
      }
    };

    el.querySelector('#btnTampil').addEventListener('click', muat);
    el.querySelector('#btnUnduh').addEventListener('click', async () => {
      const dari = el.querySelector('#dari').value, sampai = el.querySelector('#sampai').value;
      const d = await DB.daftarKunjungan({ dari, sampai, batas: 5000 });
      unduhCsv(d, `kunjungan_${dari}_sd_${sampai}.csv`);
    });

    await muat();
  }

  function gambar(w, kunjungan, top, tindakan, dari, sampai) {
    const total = kunjungan.length;
    const bpjs = kunjungan.filter(k => k.cara_bayar === 'BPJS').length;
    const selesai = kunjungan.filter(k => k.status === 'SELESAI').length;
    const perPoli = {};
    kunjungan.forEach(k => { perPoli[k.nama_poli] = (perPoli[k.nama_poli] || 0) + 1; });
    const maks = Math.max(1, ...top.map(t => t.jml));

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
          <div class="card-body">
            ${top.length === 0 ? '<p class="text-muted mb-0">Belum ada diagnosa pada periode ini.</p>'
              : top.map((t, i) => `
                <div class="mb-12">
                  <div class="flex justify-between items-center gap-8 mb-8">
                    <div style="min-width:0"><b>${i + 1}. ${UI.esc(t.nama)}</b>
                      <span class="text-xs text-muted mono">${UI.esc(t.kode)}</span></div>
                    <b class="tabular">${t.jml}</b>
                  </div>
                  <div style="height:7px;background:var(--ink-100);border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${t.jml / maks * 100}%;background:var(--brand-600)"></div>
                  </div>
                </div>`).join('')}
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><h2>Kunjungan per poli</h2></div>
            <div class="card-body">
              ${Object.keys(perPoli).length === 0 ? '<p class="text-muted mb-0">Tidak ada data.</p>'
                : Object.entries(perPoli).sort((a, b) => b[1] - a[1]).map(([nama, jml]) => `
                  <div class="flex justify-between items-center" style="padding:7px 0;
                       border-bottom:1px solid var(--ink-100)">
                    <span>${UI.esc(nama)}</span><b class="tabular">${jml}</b></div>`).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div class="flex-1"><h2>Tindakan terbanyak</h2>
              <div class="sub">Berdasarkan kode ICD-9-CM</div></div></div>
            <div class="card-body">
              ${!tindakan.length ? '<p class="text-muted mb-0">Belum ada tindakan tercatat pada periode ini.</p>'
                : tindakan.map(t => `
                  <div class="flex justify-between items-center gap-8" style="padding:7px 0;
                       border-bottom:1px solid var(--ink-100)">
                    <div style="min-width:0"><span>${UI.esc(t.nama)}</span>
                      <span class="text-xs text-muted mono"> ${UI.esc(t.kode)}</span></div>
                    <b class="tabular">${t.jml}</b></div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  }

  function unduhCsv(data, namaFile) {
    if (!data.length) { UI.toast('Tidak ada data untuk diunduh.', 'warn'); return; }
    const kolom = ['tanggal','no_kunjungan','no_rm','nama_pasien','nama_poli',
                   'nama_dokter','cara_bayar','icd_primer','daftar_diagnosa','status'];
    const judul = ['Tanggal','No Kunjungan','No RM','Nama Pasien','Poli',
                   'Dokter','Cara Bayar','ICD Primer','Diagnosa','Status'];
    const bersih = (v) => {
      const s = (v ?? '').toString().replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const isi = [judul.join(';'), ...data.map(r => kolom.map(k => bersih(r[k])).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = namaFile;
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast('Berkas CSV diunduh.', 'ok');
  }

  return { render };
})();

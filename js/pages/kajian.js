/* ===================== KAJIAN AWAL (PERAWAT) ===================== */
const Kajian = (() => {

  const RISIKO = ['RENDAH','SEDANG','TINGGI'];
  let refKesadaran = [];

  async function render(el, param) {
    const id = param && param[0];
    if (!id) { el.innerHTML = UI.kosong('Kunjungan tidak dipilih', 'Buka dari halaman antrian.'); return; }

    const k = await DB.kunjungan(id);
    const [alergi, lama, rk] = await Promise.all([
      DB.alergiPasien(k.pasien_id), DB.kajian(id), DB.refKesadaran()
    ]);
    refKesadaran = rk;
    DB.catatAkses(k.pasien_id, 'Mengisi kajian awal');

    const sudahFinal = k.status === 'SELESAI';
    const bolehTulis = App.boleh('kajian');

    el.innerHTML = `
      <a href="#/antrian" class="btn btn-ghost btn-sm mb-12 no-print">${UI.ikon('kembali',15)} Antrian</a>
      ${Komponen.bilahPasien(k, alergi)}

      ${!bolehTulis ? `<div class="banner info">${UI.ikon('peringatan',16)}
        <div><b>Anda membuka halaman ini sebagai ${UI.esc(App.siapa().peran)}.</b>
        Kajian awal hanya dapat diisi perawat atau dokter, jadi halaman ini
        ditampilkan untuk dibaca saja.</div></div>` : ''}
      ${sudahFinal ? `<div class="banner warn">
        <div>Kunjungan ini sudah selesai. Perubahan kajian awal tidak dianjurkan.</div></div>` : ''}

      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Kajian Awal Keperawatan</h2>
            <div class="sub">Anamnesis singkat, tanda vital, dan skrining</div></div>
          ${lama ? `<span class="badge b-ok">${UI.ikon('cek',13)} Sudah diisi</span>` : ''}
        </div>
        <div class="card-body" id="formKajian">

          <fieldset class="fieldset">
            <legend>Anamnesis</legend>
            <div class="field">
              <label for="ku">Keluhan utama <span class="req">*</span></label>
              <textarea id="ku" name="keluhan_utama" rows="2"
                placeholder="Apa yang dirasakan pasien, sejak kapan?">${UI.esc(lama?.keluhan_utama || k.keluhan_singkat || '')}</textarea>
            </div>
            <div class="form-row c2">
              <div class="field">
                <label for="rps">Riwayat penyakit sekarang</label>
                <textarea id="rps" name="riwayat_penyakit_sekarang" rows="2">${UI.esc(lama?.riwayat_penyakit_sekarang)}</textarea>
              </div>
              <div class="field">
                <label for="rpd">Riwayat penyakit dahulu</label>
                <textarea id="rpd" name="riwayat_penyakit_dahulu" rows="2"
                  placeholder="Hipertensi, DM, asma, operasi…">${UI.esc(lama?.riwayat_penyakit_dahulu)}</textarea>
              </div>
            </div>
            <div class="form-row c2">
              <div class="field">
                <label for="ral">Riwayat alergi</label>
                <input type="text" id="ral" name="riwayat_alergi" value="${UI.esc(lama?.riwayat_alergi)}"
                  placeholder="Obat / makanan yang pernah menimbulkan reaksi">
              </div>
              <div class="field">
                <label for="rob">Obat yang sedang diminum</label>
                <input type="text" id="rob" name="riwayat_pengobatan" value="${UI.esc(lama?.riwayat_pengobatan)}"
                  placeholder="Termasuk obat rutin dan jamu">
              </div>
            </div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>Tanda vital</legend>
            <div class="form-row c4">
              <div class="field">
                <label for="sis">Tekanan darah <span class="opt">mmHg</span></label>
                <div class="flex gap-6 items-center">
                  <input type="number" id="sis" name="sistolik" value="${lama?.sistolik ?? ''}"
                         placeholder="120" min="50" max="300" style="text-align:center">
                  <span class="text-muted">/</span>
                  <input type="number" name="diastolik" value="${lama?.diastolik ?? ''}"
                         placeholder="80" min="30" max="200" style="text-align:center">
                </div>
              </div>
              <div class="field"><label for="nd">Nadi <span class="opt">x/menit</span></label>
                <input type="number" id="nd" name="nadi" value="${lama?.nadi ?? ''}" placeholder="80" min="20" max="250"></div>
              <div class="field"><label for="nf">Napas <span class="opt">x/menit</span></label>
                <input type="number" id="nf" name="nafas" value="${lama?.nafas ?? ''}" placeholder="20" min="5" max="80"></div>
              <div class="field"><label for="sh">Suhu <span class="opt">°C</span></label>
                <input type="number" id="sh" name="suhu" value="${lama?.suhu ?? ''}" step="0.1" placeholder="36.5" min="30" max="45"></div>
            </div>
            <div class="form-row c4">
              <div class="field"><label for="sp">SpO₂ <span class="opt">%</span></label>
                <input type="number" id="sp" name="spo2" value="${lama?.spo2 ?? ''}" placeholder="98" min="50" max="100"></div>
              <div class="field"><label for="bb">Berat badan <span class="opt">kg</span></label>
                <input type="number" id="bb" name="berat_badan" value="${lama?.berat_badan ?? ''}" step="0.1" min="0.5" max="400"></div>
              <div class="field"><label for="tb">Tinggi badan <span class="opt">cm</span></label>
                <input type="number" id="tb" name="tinggi_badan" value="${lama?.tinggi_badan ?? ''}" step="0.1" min="20" max="250"></div>
              <div class="field"><label>IMT <span class="opt">otomatis</span></label>
                <input type="text" id="imtHitung" value="${lama?.imt ?? ''}" disabled></div>
            </div>
            <div class="field mb-0">
              <label for="lp">Lingkar perut <span class="opt">cm — untuk skrining PTM/Prolanis</span></label>
              <input type="number" id="lp" name="lingkar_perut" value="${lama?.lingkar_perut ?? ''}" step="0.1" style="max-width:200px">
            </div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>Skrining</legend>
            <div class="form-row c2">
              <div class="field">
                <label for="ks">Kesadaran</label>
                <select id="ks" name="kesadaran_kode">
                  ${refKesadaran.map(o => `<option value="${UI.esc(o.kode)}"
                    ${(lama?.kesadaran_kode || 'CM') === o.kode ? 'selected' : ''}
                    title="${UI.esc(o.keterangan || '')}">${UI.esc(o.nama)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="rj">Risiko jatuh</label>
                <select id="rj" name="risiko_jatuh"><option value="">— belum dinilai —</option>
                  ${RISIKO.map(o => `<option ${lama?.risiko_jatuh === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field">
              <label>Skala nyeri <span class="opt">0 = tidak nyeri, 10 = nyeri paling hebat</span></label>
              <div class="radio-row" id="nyeriRow">
                ${Array.from({length: 11}, (_, i) => `
                  <label class="radio-chip ${String(lama?.skala_nyeri) === String(i) ? 'on' : ''}">
                    <input type="radio" name="skala_nyeri" value="${i}"
                      ${String(lama?.skala_nyeri) === String(i) ? 'checked' : ''}>${i}</label>`).join('')}
              </div>
            </div>
            <div class="form-row c2">
              <div class="field">
                <label for="ln">Lokasi nyeri</label>
                <input type="text" id="ln" name="lokasi_nyeri" value="${UI.esc(lama?.lokasi_nyeri)}">
              </div>
              <div class="field">
                <label for="psi">Status psikologis</label>
                <select id="psi" name="status_psikologis"><option value="">— pilih —</option>
                  ${['Tenang','Cemas','Takut','Marah','Sedih','Lainnya']
                    .map(o => `<option ${lama?.status_psikologis === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field mb-0">
              <label class="check"><input type="checkbox" name="skrining_tb" ${lama?.skrining_tb ? 'checked' : ''}>
                <span>Ada gejala TB (batuk ≥ 2 minggu, keringat malam, berat badan turun) — perlu ditindaklanjuti</span></label>
            </div>
          </fieldset>

          <div class="field mb-0">
            <label for="cat">Catatan perawat</label>
            <textarea id="cat" name="catatan_perawat" rows="2">${UI.esc(lama?.catatan_perawat)}</textarea>
          </div>
        </div>
        <div class="card-foot no-print">
          ${bolehTulis
            ? `<button class="btn btn-primary" id="btnSimpan">${UI.ikon('cek',16)} Simpan kajian awal</button>`
            : ''}
          ${App.boleh('periksa')
            ? `<a href="#/periksa/${k.id}" class="btn btn-secondary">Lanjut ke pemeriksaan dokter</a>` : ''}
          <span class="text-sm text-muted" id="statusSimpan"></span>
        </div>
      </div>`;

    // Chip nyeri
    const nyeri = el.querySelector('#nyeriRow');
    nyeri.addEventListener('click', e => {
      const lab = e.target.closest('.radio-chip'); if (!lab) return;
      nyeri.querySelectorAll('.radio-chip').forEach(x => x.classList.remove('on'));
      lab.classList.add('on');
    });

    // IMT langsung terhitung
    const hitungImt = () => {
      const bb = parseFloat(el.querySelector('[name=berat_badan]').value);
      const tb = parseFloat(el.querySelector('[name=tinggi_badan]').value);
      const out = el.querySelector('#imtHitung');
      if (bb > 0 && tb > 0) {
        const imt = bb / Math.pow(tb / 100, 2);
        const ket = imt < 18.5 ? 'kurang' : imt < 25 ? 'normal' : imt < 30 ? 'berlebih' : 'obesitas';
        out.value = `${imt.toFixed(1)} — ${ket}`;
      } else out.value = '';
    };
    el.querySelector('[name=berat_badan]').addEventListener('input', hitungImt);
    el.querySelector('[name=tinggi_badan]').addEventListener('input', hitungImt);
    hitungImt();

    if (!bolehTulis) {
      el.querySelectorAll('#formKajian input, #formKajian select, #formKajian textarea')
        .forEach(x => { x.disabled = true; });
      return;
    }

    el.querySelector('#btnSimpan').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const d = UI.nilaiForm(el.querySelector('#formKajian'));
      if (!d.keluhan_utama || !d.keluhan_utama.trim()) {
        UI.toast('Keluhan utama wajib diisi.', 'err');
        el.querySelector('#ku').focus(); return;
      }
      if (d.skala_nyeri !== undefined && d.skala_nyeri !== null) d.skala_nyeri = Number(d.skala_nyeri);
      /* Simpan kode sekaligus namanya. Kode dipakai bridging, nama dipakai
         menampilkan dan mencetak tanpa perlu menjoin tabel rujukan. */
      const kes = refKesadaran.find(x => x.kode === d.kesadaran_kode);
      d.kesadaran = kes ? kes.nama : null;

      btn.disabled = true; btn.textContent = 'Menyimpan…';
      try {
        await DB.simpanKajian(k.id, d);
        UI.toast('Kajian awal tersimpan. Pasien masuk daftar tunggu dokter.', 'ok');
        App.perbaruiHitungAntrian();
        el.querySelector('#statusSimpan').textContent = 'Tersimpan ' + UI.jam(new Date());
      } catch (e) {
        UI.toast(e.message || 'Gagal menyimpan.', 'err');
      } finally {
        btn.disabled = false; btn.innerHTML = `${UI.ikon('cek',16)} Simpan kajian awal`;
      }
    });
  }

  return { render };
})();

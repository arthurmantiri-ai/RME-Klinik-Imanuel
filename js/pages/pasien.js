/* ===================== DATA PASIEN ===================== */
const Pasien = (() => {

  const AGAMA = ['Islam','Kristen','Katolik','Hindu','Buddha','Konghucu','Lainnya'];
  const KAWIN = ['Belum Kawin','Kawin','Cerai Hidup','Cerai Mati'];
  const DIDIK = ['Tidak Sekolah','SD','SMP','SMA/SMK','D1-D3','S1','S2','S3'];
  const DARAH = ['A','B','AB','O','A+','A-','B+','B-','AB+','AB-','O+','O-'];

  /* ------------------------------------------------------------------ *
   *  Formulir identitas pasien — dipakai halaman ini dan Pendaftaran
   * ------------------------------------------------------------------ */
  function formIdentitas(p = {}) {
    const opsi = (arr, terpilih) => arr.map(o =>
      `<option value="${UI.esc(o)}" ${terpilih === o ? 'selected' : ''}>${UI.esc(o)}</option>`).join('');
    return `
    <fieldset class="fieldset">
      <legend>Identitas</legend>
      <div class="form-row c2">
        <div class="field">
          <label for="f-nama">Nama lengkap <span class="req">*</span></label>
          <input type="text" id="f-nama" name="nama" value="${UI.esc(p.nama)}" required
                 placeholder="Sesuai KTP / Kartu Keluarga">
        </div>
        <div class="field">
          <label for="f-nik">NIK <span class="opt">(16 digit)</span></label>
          <input type="text" id="f-nik" name="nik" value="${UI.esc(p.nik)}" inputmode="numeric"
                 maxlength="16" placeholder="3374xxxxxxxxxxxx">
          <div class="hint">NIK dipakai untuk mencocokkan pasien di SatuSehat.</div>
        </div>
      </div>
      <div class="form-grid">
        <div class="field field-half">
          <label for="f-tempat">Tempat lahir</label>
          <input type="text" id="f-tempat" name="tempat_lahir" value="${UI.esc(p.tempat_lahir)}">
        </div>
        <div class="field field-compact">
          <label for="f-lahir">Tanggal lahir <span class="req">*</span></label>
          <input type="date" id="f-lahir" name="tanggal_lahir" value="${UI.esc(p.tanggal_lahir)}" required>
        </div>
        <div class="field field-compact">
          <label for="f-jk">Jenis kelamin <span class="req">*</span></label>
          <select id="f-jk" name="jenis_kelamin" required>
            <option value="">— pilih —</option>
            <option value="L" ${p.jenis_kelamin === 'L' ? 'selected' : ''}>Laki-laki</option>
            <option value="P" ${p.jenis_kelamin === 'P' ? 'selected' : ''}>Perempuan</option>
          </select>
        </div>
      </div>
      <div class="form-row c4">
        <div class="field">
          <label for="f-darah">Gol. darah</label>
          <select id="f-darah" name="gol_darah"><option value="">—</option>${opsi(DARAH, p.gol_darah)}</select>
        </div>
        <div class="field">
          <label for="f-agama">Agama</label>
          <select id="f-agama" name="agama"><option value="">—</option>${opsi(AGAMA, p.agama)}</select>
        </div>
        <div class="field">
          <label for="f-kawin">Status kawin</label>
          <select id="f-kawin" name="status_kawin"><option value="">—</option>${opsi(KAWIN, p.status_kawin)}</select>
        </div>
        <div class="field">
          <label for="f-didik">Pendidikan</label>
          <select id="f-didik" name="pendidikan"><option value="">—</option>${opsi(DIDIK, p.pendidikan)}</select>
        </div>
      </div>
      <div class="field">
        <label for="f-kerja">Pekerjaan</label>
        <input type="text" id="f-kerja" name="pekerjaan" value="${UI.esc(p.pekerjaan)}">
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend>Kepesertaan</legend>
      <div class="form-row c2">
        <div class="field">
          <label for="f-bpjs">No. Kartu BPJS <span class="opt">(13 digit)</span></label>
          <input type="text" id="f-bpjs" name="no_bpjs" value="${UI.esc(p.no_bpjs)}"
                 inputmode="numeric" maxlength="13" placeholder="000xxxxxxxxxx">
        </div>
        <div class="field">
          <label for="f-kk">No. Kartu Keluarga</label>
          <input type="text" id="f-kk" name="no_kk" value="${UI.esc(p.no_kk)}" inputmode="numeric" maxlength="16">
        </div>
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend>Alamat &amp; kontak</legend>
      <div class="field">
        <label for="f-alamat">Alamat</label>
        <input type="text" id="f-alamat" name="alamat" value="${UI.esc(p.alamat)}"
               placeholder="Nama jalan, nomor rumah">
      </div>
      <div class="form-grid">
        <div class="field field-compact xs"><label for="f-rt">RT</label>
          <input type="text" id="f-rt" name="rt" value="${UI.esc(p.rt)}" maxlength="3"></div>
        <div class="field field-compact xs"><label for="f-rw">RW</label>
          <input type="text" id="f-rw" name="rw" value="${UI.esc(p.rw)}" maxlength="3"></div>
        <div class="field"><label for="f-kel">Kelurahan/Desa</label>
          <input type="text" id="f-kel" name="kelurahan" value="${UI.esc(p.kelurahan)}"></div>
        <div class="field"><label for="f-kec">Kecamatan</label>
          <input type="text" id="f-kec" name="kecamatan" value="${UI.esc(p.kecamatan)}"></div>
      </div>
      <div class="form-row c3">
        <div class="field"><label for="f-kab">Kabupaten/Kota</label>
          <input type="text" id="f-kab" name="kabupaten" value="${UI.esc(p.kabupaten)}"></div>
        <div class="field"><label for="f-prov">Provinsi</label>
          <input type="text" id="f-prov" name="provinsi" value="${UI.esc(p.provinsi)}"></div>
        <div class="field"><label for="f-hp">No. HP / WhatsApp</label>
          <input type="tel" id="f-hp" name="no_hp" value="${UI.esc(p.no_hp)}" placeholder="08xxxxxxxxxx"></div>
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend>Penanggung jawab <span class="opt-note">(opsional)</span></legend>
      <div class="form-row c3">
        <div class="field"><label for="f-pjn">Nama</label>
          <input type="text" id="f-pjn" name="pj_nama" value="${UI.esc(p.pj_nama)}"></div>
        <div class="field"><label for="f-pjh">Hubungan</label>
          <input type="text" id="f-pjh" name="pj_hubungan" value="${UI.esc(p.pj_hubungan)}"
                 placeholder="Suami / Istri / Anak"></div>
        <div class="field"><label for="f-pjp">No. HP</label>
          <input type="tel" id="f-pjp" name="pj_no_hp" value="${UI.esc(p.pj_no_hp)}"></div>
      </div>
      <div class="field mb-0">
        <label for="f-catatan">Catatan penting <span class="opt">(muncul menyolok di layar dokter)</span></label>
        <input type="text" id="f-catatan" name="catatan_penting" value="${UI.esc(p.catatan_penting)}"
               placeholder="Contoh: Alergi berat penisilin">
      </div>
    </fieldset>`;
  }

  function validasi(d) {
    const salah = [];
    if (!d.nama || d.nama.trim().length < 2) salah.push('Nama lengkap wajib diisi.');
    if (!d.tanggal_lahir) salah.push('Tanggal lahir wajib diisi.');
    else if (new Date(d.tanggal_lahir) > new Date()) salah.push('Tanggal lahir tidak boleh di masa depan.');
    if (!d.jenis_kelamin) salah.push('Jenis kelamin wajib dipilih.');
    if (d.nik && !/^\d{16}$/.test(d.nik)) salah.push('NIK harus tepat 16 angka.');
    if (d.no_bpjs && !/^\d{13}$/.test(d.no_bpjs)) salah.push('No. BPJS harus tepat 13 angka.');
    if (d.no_hp && !/^[0-9+\-\s]{8,18}$/.test(d.no_hp)) salah.push('No. HP tidak valid.');
    return salah;
  }

  /* Modal tambah/ubah pasien. Mengembalikan objek pasien atau null. */
  async function modalPasien(pasienLama = null) {
    const baru = !pasienLama;
    return await UI.modal({
      judul: baru ? 'Daftarkan pasien baru' : 'Ubah data pasien',
      lebar: true,
      isi: `<div id="galat"></div>${formIdentitas(pasienLama || {})}`,
      tombol: [
        { teks: 'Batal', nilai: null },
        {
          teks: baru ? 'Simpan pasien' : 'Simpan perubahan', kelas: 'btn-primary',
          aksi: async (body) => {
            const d = UI.nilaiForm(body);
            const salah = validasi(d);
            const g = body.querySelector('#galat');
            if (salah.length) {
              g.innerHTML = `<div class="banner err"><div><b>Periksa kembali:</b><br>
                ${salah.map(s => UI.esc(s)).join('<br>')}</div></div>`;
              body.scrollTop = 0;
              return false;
            }
            try {
              const hasil = await DB.simpanPasien(d, pasienLama?.id || null);
              UI.toast(baru ? `Pasien tersimpan. No. RM ${hasil.no_rm}` : 'Data pasien diperbarui.', 'ok');
              return hasil;
            } catch (e) {
              const pesan = (e.message || '').includes('duplicate') && (e.message || '').includes('nik')
                ? 'NIK ini sudah terdaftar atas nama pasien lain.'
                : (e.message || 'Gagal menyimpan.');
              g.innerHTML = `<div class="banner err">${UI.esc(pesan)}</div>`;
              body.scrollTop = 0;
              return false;
            }
          }
        }
      ]
    });
  }

  /* ------------------------------------------------------------------ *
   *  Halaman: daftar pasien / detail pasien
   * ------------------------------------------------------------------ */
  async function render(el, param) {
    if (param && param[0]) return await detail(el, param[0]);
    return await daftar(el);
  }

  async function daftar(el) {
    el.innerHTML = `
      <div class="page-header">
        <div class="page-heading"><h1>Data Pasien</h1>
          <div class="page-sub">Cari berdasarkan nama, nomor rekam medis, NIK, atau nomor BPJS.</div></div>
        ${App.boleh(['pendaftaran','perawat','dokter'])
          ? `<div class="page-actions"><button class="btn btn-primary btn-sm" id="btnBaru">
              ${UI.ikon('plus',16)} Pasien baru</button></div>` : ''}
      </div>

      <div class="filter-bar">
        <div class="search-box filter-search">
          <span class="ico">${UI.ikon('cari',16)}</span>
          <input type="search" id="cari" placeholder="Ketik nama, no. RM, NIK, atau no. BPJS…" autofocus>
        </div>
        <label class="check"><input type="checkbox" id="hanyaKurang">
          <span class="nowrap">Hanya yang datanya belum lengkap</span></label>
      </div>
      <div class="card">
        <div class="card-body tight" id="hasil">${UI.memuat(3)}</div>
      </div>`;

    const hasil = el.querySelector('#hasil');
    const muat = async () => {
      const kata = el.querySelector('#cari').value;
      const kurang = el.querySelector('#hanyaKurang').checked;
      hasil.innerHTML = UI.memuat(3);
      try {
        if (kurang) {
          let d = await DB.kesiapanPasien({ hanyaKurang: true });
          if (kata && kata.trim().length >= 2) {
            const k = kata.trim().toLowerCase();
            d = d.filter(p => (p.nama || '').toLowerCase().includes(k)
              || (p.no_rm || '').includes(k) || (p.nik || '').includes(k));
          }
          gambarDaftarKurang(hasil, d);
        } else {
          gambarDaftar(hasil, await DB.cariPasien(kata), kata);
        }
      } catch (e) { hasil.innerHTML = `<div class="banner err">${UI.esc(e.message)}</div>`; }
    };

    el.querySelector('#cari').addEventListener('input', UI.tunda(muat, 280));
    el.querySelector('#hanyaKurang').addEventListener('change', muat);
    const btn = el.querySelector('#btnBaru');
    if (btn) btn.addEventListener('click', async () => {
      const p = await modalPasien();
      if (p) App.pergi('#/pasien/' + p.id);
    });

    await muat();
  }

  function gambarDaftar(wadah, data, kata) {
    if (!data.length) {
      wadah.innerHTML = UI.kosong(
        kata ? 'Pasien tidak ditemukan' : 'Belum ada pasien',
        kata ? `Tidak ada pasien yang cocok dengan "${kata}".`
             : 'Data pasien akan muncul di sini setelah pendaftaran pertama.');
      return;
    }
    wadah.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>No. RM</th><th>Nama</th><th>L/P</th><th>Umur</th>
        <th>Tanggal lahir</th><th>No. BPJS</th><th>Kontak</th></tr></thead>
      <tbody>${data.map(p => `
        <tr class="clickable" onclick="location.hash='#/pasien/${p.id}'">
          <td class="mono">${UI.esc(p.no_rm)}</td>
          <td><b>${UI.esc(p.nama)}</b>
            ${p.catatan_penting ? `<div class="text-xs text-danger">
              ${UI.ikon('peringatan',12)} ${UI.esc(p.catatan_penting)}</div>` : ''}</td>
          <td>${p.jenis_kelamin}</td>
          <td class="nowrap">${UI.umurTeks(p.tanggal_lahir)}</td>
          <td class="muted nowrap">${UI.tglPendek(p.tanggal_lahir)}</td>
          <td class="mono muted">${UI.esc(p.no_bpjs || '—')}</td>
          <td class="muted">${UI.esc(p.no_hp || '—')}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function gambarDaftarKurang(wadah, data) {
    if (!data.length) {
      wadah.innerHTML = `<div class="empty compact">
        ${UI.ikon('cek', 40)}
        <h3>Semua data pasien sudah lengkap</h3>
        <p>Tidak ada pasien yang kekurangan data untuk bridging nanti.</p></div>`;
      return;
    }
    wadah.innerHTML = `
      <div class="banner warn mt-14 mx-16 mb-0">
        <div>${data.length} pasien punya data yang nanti dibutuhkan bridging tapi belum terisi.
        Melengkapinya sekarang jauh lebih ringan daripada menumpuk sampai hari go-live.</div>
      </div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>No. RM</th><th>Nama</th><th>Kunjungan</th>
          <th>Yang belum lengkap</th></tr></thead>
        <tbody>${data.map(p => `
          <tr class="clickable" onclick="location.hash='#/pasien/${p.id}'">
            <td class="mono">${UI.esc(p.no_rm)}</td>
            <td><b>${UI.esc(p.nama)}</b></td>
            <td class="muted nowrap">${p.jml_kunjungan}x
              ${p.kunjungan_terakhir ? `<div class="text-xs">terakhir ${UI.tglPendek(p.kunjungan_terakhir)}</div>` : ''}</td>
            <td>${p.kekurangan.map(k =>
              `<div class="text-sm text-warn">${UI.ikon('peringatan',12)} ${UI.esc(k)}</div>`).join('')}</td>
          </tr>`).join('')}</tbody></table></div>`;
  }

  async function detail(el, id) {
    const [p, alergi, riwayat, kesiapan] = await Promise.all([
      DB.pasien(id), DB.alergiPasien(id), DB.daftarKunjungan({ pasien_id: id, batas: 50 }),
      DB.kesiapanPasien({ hanyaKurang: false, pasienId: id }).catch(() => [])
    ]);
    const kurang = kesiapan[0]?.kekurangan || [];
    DB.catatAkses(id, 'Membuka halaman data pasien');

    el.innerHTML = `
      <a href="#/pasien" class="btn btn-ghost btn-sm mb-12">${UI.ikon('kembali',15)} Semua pasien</a>

      <div class="patient-bar">
        <div class="pb-avatar">${UI.inisial(p.nama)}</div>
        <div class="pb-main">
          <b>${UI.esc(p.nama)}</b>
          <span>No. RM ${UI.esc(p.no_rm)} · ${p.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} ·
                ${UI.umurTeks(p.tanggal_lahir)}</span>
        </div>
        <div class="pb-meta">
          <div><span class="k">Tanggal lahir</span><span class="v">${UI.tglPendek(p.tanggal_lahir)}</span></div>
          <div><span class="k">NIK</span><span class="v">${UI.esc(p.nik || '—')}</span></div>
          <div><span class="k">No. BPJS</span><span class="v">${UI.esc(p.no_bpjs || '—')}</span></div>
          <div><span class="k">Kunjungan</span><span class="v">${riwayat.length}x</span></div>
        </div>
        ${p.catatan_penting ? `<div class="alert-allergy">
          ${UI.ikon('peringatan',15)} ${UI.esc(p.catatan_penting)}</div>` : ''}
      </div>

      ${kurang.length ? `<div class="banner warn no-print">
        ${UI.ikon('peringatan',16)}
        <div><b>Data pasien belum lengkap untuk bridging nanti.</b>
        ${kurang.map(k => UI.esc(k)).join(' · ')}.
        Belum menghambat pelayanan hari ini, tapi sebaiknya dilengkapi saat pasien datang
        berikutnya.</div></div>` : ''}

      <div class="btn-group mb-16 no-print">
        ${App.boleh(['pendaftaran','perawat','dokter'])
          ? `<button class="btn btn-primary btn-sm" id="btnDaftarkan">${UI.ikon('plus',15)} Daftarkan kunjungan</button>
             <button class="btn btn-secondary btn-sm" id="btnUbah">Ubah data</button>` : ''}
        ${App.boleh(['perawat','dokter','apoteker'])
          ? `<button class="btn btn-secondary btn-sm" id="btnAlergi">Tambah alergi</button>` : ''}
      </div>

      <div class="split">
        <div class="card">
          <div class="card-head"><h2>Riwayat kunjungan</h2>
            <span class="text-sm text-muted">${riwayat.length} kunjungan</span></div>
          <div class="card-body tight">
            ${riwayat.length === 0
              ? UI.kosong('Belum ada kunjungan', 'Riwayat pemeriksaan akan tampil setelah kunjungan pertama.')
              : `<div class="table-wrap"><table class="tbl">
                  <thead><tr><th>Tanggal</th><th>Poli</th><th>Diagnosa</th><th>Dokter</th><th>Status</th><th></th></tr></thead>
                  <tbody>${riwayat.map(k => `
                    <tr class="clickable" onclick="location.hash='#/rekam/${k.id}'">
                      <td class="nowrap"><b>${UI.tglPendek(k.tanggal)}</b>
                        <div class="text-xs text-muted mono">${UI.esc(k.no_kunjungan)}</div></td>
                      <td>${UI.esc(k.nama_poli)}</td>
                      <td>${k.daftar_diagnosa
                        ? UI.esc(k.daftar_diagnosa) : '<span class="muted">—</span>'}</td>
                      <td class="muted">${UI.esc(k.nama_dokter || '—')}</td>
                      <td>${UI.badgeStatus(k.status)}</td>
                      <td>${UI.ikon('kembali',14)}</td>
                    </tr>`).join('')}</tbody></table></div>`}
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><h2>Alergi</h2></div>
            <div class="card-body">
              ${alergi.length === 0
                ? '<p class="text-muted text-sm mb-0">Belum ada alergi tercatat.</p>'
                : alergi.map(a => `
                  <div class="list-row">
                    <div class="flex items-center gap-8">
                      <b class="flex-1">${UI.esc(a.nama)}</b>
                      <span class="badge ${a.tingkat === 'BERAT' ? 'b-danger' : 'b-warn'}">${UI.esc(a.tingkat || a.jenis)}</span>
                    </div>
                    ${a.reaksi ? `<div class="text-xs text-muted">Reaksi: ${UI.esc(a.reaksi)}</div>` : ''}
                  </div>`).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Identitas lengkap</h2></div>
            <div class="card-body text-sm">
              ${[['Tempat lahir', p.tempat_lahir], ['Agama', p.agama], ['Pekerjaan', p.pekerjaan],
                 ['Pendidikan', p.pendidikan], ['Status kawin', p.status_kawin],
                 ['Gol. darah', p.gol_darah],
                 ['Alamat', [p.alamat, p.rt && 'RT ' + p.rt, p.rw && 'RW ' + p.rw,
                             p.kelurahan, p.kecamatan, p.kabupaten].filter(Boolean).join(', ')],
                 ['No. HP', p.no_hp],
                 ['Penanggung jawab', p.pj_nama ? `${p.pj_nama}${p.pj_hubungan ? ' (' + p.pj_hubungan + ')' : ''}` : null]
                ].map(([k, v]) => `<div class="kv-row">
                    <span class="k text-muted">${UI.esc(k)}</span>
                    <span class="v">${UI.esc(v || '—')}</span></div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;

    const btnUbah = el.querySelector('#btnUbah');
    if (btnUbah) btnUbah.addEventListener('click', async () => {
      if (await modalPasien(p)) App.segarkan();
    });

    const btnDaftar = el.querySelector('#btnDaftarkan');
    if (btnDaftar) btnDaftar.addEventListener('click', () => App.pergi('#/pendaftaran/' + p.id));

    const btnAlergi = el.querySelector('#btnAlergi');
    if (btnAlergi) btnAlergi.addEventListener('click', async () => {
      const hasil = await UI.modal({
        judul: 'Tambah catatan alergi',
        isi: `<div class="field"><label>Jenis</label>
                <select name="jenis"><option value="OBAT">Obat</option>
                <option value="MAKANAN">Makanan</option><option value="LAINNYA">Lainnya</option></select></div>
              <div class="field"><label>Nama alergen <span class="req">*</span></label>
                <input type="text" name="nama" placeholder="Contoh: Amoxicillin"></div>
              <div class="field"><label>Reaksi yang timbul</label>
                <input type="text" name="reaksi" placeholder="Contoh: Gatal, bengkak, sesak"></div>
              <div class="field mb-0"><label>Tingkat</label>
                <select name="tingkat"><option value="RINGAN">Ringan</option>
                <option value="SEDANG">Sedang</option><option value="BERAT">Berat</option></select></div>`,
        tombol: [{ teks: 'Batal', nilai: null },
                 { teks: 'Simpan', kelas: 'btn-primary', aksi: (b) => {
                    const d = UI.nilaiForm(b);
                    if (!d.nama) { UI.toast('Nama alergen wajib diisi.', 'err'); return false; }
                    return d;
                 }}]
      });
      if (hasil) {
        await DB.tambahAlergi({ ...hasil, pasien_id: p.id, dicatat_oleh: App.siapa().id });
        UI.toast('Alergi tercatat.', 'ok'); App.segarkan();
      }
    });
  }

  return { render, formIdentitas, modalPasien, validasi };
})();

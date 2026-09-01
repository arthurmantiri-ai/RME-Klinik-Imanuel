/* ===================== PENGATURAN (ADMIN) ===================== */
const Pengaturan = (() => {

  let tabAktif = 'klinik';

  async function render(el, param) {
    if (!App.boleh([])) {  // hanya admin
      el.innerHTML = UI.kosong('Akses ditolak', 'Halaman ini hanya untuk admin klinik.');
      return;
    }
    if (param && param[0]) tabAktif = param[0];

    el.innerHTML = `
      <div class="mb-16"><h1>Pengaturan</h1>
        <p class="text-muted mb-0">Profil klinik, poli, pengguna, dan status bridging.</p></div>
      <div class="tabs" id="tabs">
        ${[['klinik','Profil Klinik'],['poli','Poli'],['pengguna','Pengguna'],['bridging','Bridging']]
          .map(([k, t]) => `<button class="tab ${tabAktif === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}
      </div>
      <div id="isiTab">${UI.memuat(3)}</div>`;

    el.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tabAktif = b.dataset.t;
      el.querySelectorAll('#tabs .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      gambarTab(el.querySelector('#isiTab'));
    });

    await gambarTab(el.querySelector('#isiTab'));
  }

  async function gambarTab(w) {
    w.innerHTML = UI.memuat(3);
    try {
      if (tabAktif === 'klinik')   return await tabKlinik(w);
      if (tabAktif === 'poli')     return await tabPoli(w);
      if (tabAktif === 'pengguna') return await tabPengguna(w);
      if (tabAktif === 'bridging') return await tabBridging(w);
    } catch (e) {
      w.innerHTML = `<div class="banner err">${UI.esc(e.message)}</div>`;
    }
  }

  /* ---------------- Profil klinik ---------------- */
  async function tabKlinik(w) {
    const f = await DB.faskes(true);
    w.innerHTML = `
      <div class="card"><div class="card-head"><div class="flex-1"><h2>Profil klinik</h2>
        <div class="sub">Dipakai untuk kop surat, resep, dan identitas bridging</div></div></div>
        <div class="card-body" id="formKlinik">
          <div class="form-row c2">
            <div class="field"><label>Nama klinik</label>
              <input type="text" name="nama" value="${UI.esc(f.nama)}"></div>
            <div class="field"><label>Jenis faskes</label>
              <input type="text" name="jenis_faskes" value="${UI.esc(f.jenis_faskes)}"></div>
          </div>
          <div class="field"><label>Alamat</label>
            <input type="text" name="alamat" value="${UI.esc(f.alamat)}"></div>
          <div class="form-row c4">
            <div class="field"><label>Kelurahan</label>
              <input type="text" name="kelurahan" value="${UI.esc(f.kelurahan)}"></div>
            <div class="field"><label>Kecamatan</label>
              <input type="text" name="kecamatan" value="${UI.esc(f.kecamatan)}"></div>
            <div class="field"><label>Kabupaten/Kota</label>
              <input type="text" name="kabupaten" value="${UI.esc(f.kabupaten)}"></div>
            <div class="field"><label>Provinsi</label>
              <input type="text" name="provinsi" value="${UI.esc(f.provinsi)}"></div>
          </div>
          <div class="form-row c3">
            <div class="field"><label>Telepon</label>
              <input type="text" name="telepon" value="${UI.esc(f.telepon)}"></div>
            <div class="field"><label>Email</label>
              <input type="email" name="email" value="${UI.esc(f.email)}"></div>
            <div class="field"><label>Penanggung jawab</label>
              <input type="text" name="penanggung_jawab" value="${UI.esc(f.penanggung_jawab)}"></div>
          </div>

          <fieldset class="fieldset mt-16">
            <legend>Identitas untuk bridging</legend>
            <div class="form-row c3">
              <div class="field"><label>Kode Faskes BPJS <span class="opt">(PPK)</span></label>
                <input type="text" name="kode_faskes_bpjs" value="${UI.esc(f.kode_faskes_bpjs)}"
                  placeholder="Contoh: 0123R001"></div>
              <div class="field"><label>Kode Registrasi Kemenkes</label>
                <input type="text" name="kode_registrasi_kemenkes" value="${UI.esc(f.kode_registrasi_kemenkes)}"></div>
              <div class="field"><label>Nomor izin klinik</label>
                <input type="text" name="no_izin" value="${UI.esc(f.no_izin)}"></div>
            </div>
            <div class="field">
              <label>Tanggal mulai bridging</label>
              <input type="date" name="bridging_mulai_tanggal"
                value="${UI.esc(f.bridging_mulai_tanggal)}" style="max-width:220px">
              <div class="hint">Kosongkan selama bridging belum aktif. Diisi saat go-live,
                supaya kunjungan sebelum tanggal itu tidak ikut terkirim.</div>
            </div>
            <div class="form-row c2 mb-0">
              <div class="field mb-0"><label>SatuSehat Organization ID</label>
                <input type="text" name="satusehat_org_id" value="${UI.esc(f.satusehat_org_id)}"
                  placeholder="Didapat setelah registrasi di platform SatuSehat"></div>
              <div class="field mb-0"><label>SatuSehat Location ID</label>
                <input type="text" name="satusehat_location_id" value="${UI.esc(f.satusehat_location_id)}"></div>
            </div>
          </fieldset>
        </div>
        <div class="card-foot">
          <button class="btn btn-primary" id="btnSimpanKlinik">Simpan perubahan</button>
        </div>
      </div>`;

    w.querySelector('#btnSimpanKlinik').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Menyimpan…';
      try {
        await DB.simpanFaskes(UI.nilaiForm(w.querySelector('#formKlinik')));
        UI.toast('Profil klinik tersimpan.', 'ok');
      } catch (e) { UI.toast(e.message, 'err'); }
      finally { b.disabled = false; b.textContent = 'Simpan perubahan'; }
    });
  }

  /* ---------------- Poli ---------------- */
  async function tabPoli(w) {
    const d = await DB.daftarPoli(false);
    w.innerHTML = `
      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>Daftar poli</h2>
          <div class="sub">Jenis poli menentukan tampilan layar dokter — poli berjenis
            <b>GIGI</b> memunculkan odontogram dan pemeriksaan gigi</div></div>
          <button class="btn btn-primary btn-sm" id="btnPoliBaru">${UI.ikon('plus',15)} Tambah poli</button></div>
        <div class="card-body tight">
          <table class="tbl"><thead><tr><th>Kode</th><th>Nama poli</th><th>Jenis</th>
            <th>Kode PCare</th><th>Location ID SatuSehat</th><th>Status</th></tr></thead>
            <tbody>${d.map(p => `<tr>
              <td class="mono"><b>${UI.esc(p.kode)}</b></td>
              <td>${UI.esc(p.nama)}</td>
              <td><select data-jenis-poli="${p.id}" style="padding:5px 8px;font-size:12.5px">
                ${['UMUM','GIGI','KIA','LAINNYA'].map(j =>
                  `<option ${p.jenis === j ? 'selected' : ''}>${j}</option>`).join('')}
              </select></td>
              <td class="mono muted">${UI.esc(p.kode_pcare || '—')}</td>
              <td class="mono muted">${UI.esc(p.satusehat_location_id || '—')}</td>
              <td>${p.aktif ? '<span class="badge b-ok">Aktif</span>'
                            : '<span class="badge b-batal">Nonaktif</span>'}</td>
            </tr>`).join('')}</tbody></table>
        </div>
      </div>`;

    w.querySelectorAll('[data-jenis-poli]').forEach(sel => sel.addEventListener('change', async () => {
      const { error } = await DB.sb.from('poli').update({ jenis: sel.value })
        .eq('id', sel.dataset.jenisPoli);
      UI.toast(error ? error.message : 'Jenis poli diperbarui.', error ? 'err' : 'ok');
    }));

    w.querySelector('#btnPoliBaru').addEventListener('click', async () => {
      const h = await UI.modal({
        judul: 'Tambah poli',
        isi: `<div class="form-row c2">
                <div class="field"><label>Kode <span class="req">*</span></label>
                  <input type="text" name="kode" placeholder="UMUM" maxlength="12"></div>
                <div class="field"><label>Nama poli <span class="req">*</span></label>
                  <input type="text" name="nama" placeholder="Poli Umum"></div>
              </div>
              <div class="form-row c2 mb-0">
                <div class="field mb-0"><label>Jenis</label>
                  <select name="jenis">
                    <option value="UMUM">Umum</option>
                    <option value="GIGI">Gigi</option>
                    <option value="KIA">KIA / KB</option>
                    <option value="LAINNYA">Lainnya</option>
                  </select>
                  <div class="hint">Pilih Gigi agar layar dokter menampilkan odontogram.</div></div>
                <div class="field mb-0"><label>Kode PCare</label>
                  <input type="text" name="kode_pcare" placeholder="001"></div>
              </div>`,
        tombol: [{ teks: 'Batal', nilai: null },
                 { teks: 'Simpan', kelas: 'btn-primary', aksi: (b) => {
                    const v = UI.nilaiForm(b);
                    if (!v.kode || !v.nama) { UI.toast('Kode dan nama wajib diisi.', 'err'); return false; }
                    return v;
                 }}]
      });
      if (!h) return;
      const { error } = await DB.sb.from('poli').insert({ ...h, kode: h.kode.toUpperCase() });
      if (error) UI.toast(error.message, 'err');
      else { UI.toast('Poli ditambahkan.', 'ok'); gambarTab(w); }
    });
  }

  /* ---------------- Pengguna ---------------- */
  async function tabPengguna(w) {
    const d = await DB.daftarPegawai();
    const PERAN = ['admin','pendaftaran','perawat','dokter','apoteker'];
    w.innerHTML = `
      <div class="banner info">
        <div><b>Cara menambah pengguna:</b> buka dasbor Supabase → <i>Authentication</i> → <i>Users</i> →
        <i>Add user</i>. Isi email dan kata sandi. Baris pegawai akan dibuat otomatis, lalu ubah
        perannya di tabel ini. Untuk dokter, isi juga <b>jenis dokter</b> agar pilihan dokter
        saat pendaftaran menyesuaikan poli.</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Pengguna sistem</h2>
          <span class="text-sm text-muted">${d.length} akun</span></div>
        <div class="card-body tight">
          <table class="tbl"><thead><tr><th>Nama</th><th>Peran</th><th>Jenis dokter</th><th>No. SIP</th>
            <th>Kode dokter PCare</th><th>IHS Practitioner</th><th>Status</th></tr></thead>
            <tbody>${d.map(p => `<tr>
              <td><b>${UI.esc(p.nama)}</b></td>
              <td><select data-peran="${p.id}" style="padding:5px 8px;font-size:12.5px">
                ${PERAN.map(r => `<option ${p.peran === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select></td>
              <td>${p.peran !== 'dokter' ? '<span class="muted">—</span>'
                : `<select data-jenis-dokter="${p.id}" style="padding:5px 8px;font-size:12.5px">
                     <option value="">— belum diisi —</option>
                     <option value="UMUM" ${p.jenis_dokter === 'UMUM' ? 'selected' : ''}>Dokter umum</option>
                     <option value="GIGI" ${p.jenis_dokter === 'GIGI' ? 'selected' : ''}>Dokter gigi</option>
                   </select>`}</td>
              <td class="mono muted">${UI.esc(p.no_sip || '—')}</td>
              <td class="mono muted">${UI.esc(p.kode_dokter_pcare || '—')}</td>
              <td class="mono muted">${UI.esc(p.satusehat_practitioner_id || '—')}</td>
              <td><label class="check"><input type="checkbox" data-aktif="${p.id}"
                ${p.aktif ? 'checked' : ''}><span>Aktif</span></label></td>
            </tr>`).join('')}</tbody></table>
        </div>
      </div>`;

    w.querySelectorAll('[data-peran]').forEach(s => s.addEventListener('change', async () => {
      const { error } = await DB.sb.from('pegawai').update({ peran: s.value }).eq('id', s.dataset.peran);
      UI.toast(error ? error.message : 'Peran diperbarui.', error ? 'err' : 'ok');
    }));
    w.querySelectorAll('[data-jenis-dokter]').forEach(sel => sel.addEventListener('change', async () => {
      const { error } = await DB.sb.from('pegawai')
        .update({ jenis_dokter: sel.value || null }).eq('id', sel.dataset.jenisDokter);
      UI.toast(error ? error.message : 'Jenis dokter diperbarui.', error ? 'err' : 'ok');
    }));
    w.querySelectorAll('[data-aktif]').forEach(c => c.addEventListener('change', async () => {
      const { error } = await DB.sb.from('pegawai').update({ aktif: c.checked }).eq('id', c.dataset.aktif);
      UI.toast(error ? error.message : 'Status diperbarui.', error ? 'err' : 'ok');
    }));
  }

  /* ---------------- Bridging ---------------- */
  async function tabBridging(w) {
    w.innerHTML = `
      <div class="banner info">
        <div><b>Kredensial tidak pernah disimpan di browser.</b> Kunci PCare dan SatuSehat
        disimpan sebagai <i>Secret</i> di Edge Function Supabase, sehingga tidak bisa dibaca
        siapa pun dari halaman ini.</div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="flex-1"><h2>PCare BPJS</h2>
            <div class="sub">Pendaftaran &amp; kunjungan peserta JKN</div></div>
            <span class="badge ${CONFIG.BRIDGING.PCARE_AKTIF ? 'b-ok' : 'b-batal'}">
              ${CONFIG.BRIDGING.PCARE_AKTIF ? 'Aktif' : 'Belum aktif'}</span></div>
          <div class="card-body text-sm">
            <p><b>Yang perlu disiapkan:</b></p>
            <ol style="padding-left:18px;margin:0 0 12px">
              <li>Surat permohonan bridging ke Kantor Cabang BPJS Kesehatan setempat</li>
              <li>Kredensial: <code>cons_id</code>, <code>secret_key</code>, <code>user_key</code>,
                  username &amp; password PCare, kode aplikasi</li>
              <li>Uji coba di lingkungan <i>development</i> BPJS sebelum produksi</li>
            </ol>
            <p class="mb-0">Setelah kredensial diterima, isi Secret di Edge Function
              <code>pcare-proxy</code> lalu ubah <code>PCARE_AKTIF</code> menjadi <code>true</code>
              di <code>js/config.js</code>.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="flex-1"><h2>SatuSehat</h2>
            <div class="sub">Kirim data kunjungan ke platform Kemenkes</div></div>
            <span class="badge ${CONFIG.BRIDGING.SATUSEHAT_AKTIF ? 'b-ok' : 'b-batal'}">
              ${CONFIG.BRIDGING.SATUSEHAT_AKTIF ? 'Aktif' : 'Belum aktif'}</span></div>
          <div class="card-body text-sm">
            <p><b>Yang perlu disiapkan:</b></p>
            <ol style="padding-left:18px;margin:0 0 12px">
              <li>Registrasi klinik di platform SatuSehat (butuh kode registrasi faskes Kemenkes)</li>
              <li>Dapatkan <code>client_id</code>, <code>client_secret</code>, dan
                  <code>Organization ID</code></li>
              <li>Daftarkan <i>Location</i> untuk tiap poli, dan <i>Practitioner</i> (nomor IHS)
                  untuk tiap tenaga medis</li>
              <li>Uji di lingkungan <i>staging</i>, ajukan <i>go-live</i></li>
            </ol>
            <p class="mb-0">Isi Organization ID dan Location ID di tab <b>Profil Klinik</b>,
              nomor IHS tenaga medis di tab <b>Pengguna</b>.</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>Kesiapan identitas klinik</h2>
          <div class="sub">Nomor dan kode yang perlu diisi sekali saja</div></div></div>
        <div class="card-body" id="kesiapan">${UI.memuat(2)}</div>
      </div>

      <div class="card">
        <div class="card-head"><div class="flex-1"><h2>Kesiapan data pasien &amp; kunjungan</h2>
          <div class="sub">Diperbarui terus selama klinik berjalan</div></div></div>
        <div class="card-body" id="kesiapanData">${UI.memuat(2)}</div>
      </div>`;

    // Periksa kelengkapan data yang dibutuhkan bridging
    const f = await DB.faskes(true);
    const pegawai = await DB.daftarPegawai();
    const poli = await DB.daftarPoli(false);
    const dokter = pegawai.filter(p => p.peran === 'dokter');

    const cek = [
      ['Kode Faskes BPJS terisi', !!f.kode_faskes_bpjs],
      ['Kode Registrasi Kemenkes terisi', !!f.kode_registrasi_kemenkes],
      ['SatuSehat Organization ID terisi', !!f.satusehat_org_id],
      ['SatuSehat Location ID klinik terisi', !!f.satusehat_location_id],
      ['Semua poli punya kode PCare', poli.length > 0 && poli.every(p => !!p.kode_pcare)],
      ['Semua dokter punya kode dokter PCare', dokter.length > 0 && dokter.every(p => !!p.kode_dokter_pcare)],
      ['Semua dokter punya nomor IHS Practitioner', dokter.length > 0 && dokter.every(p => !!p.satusehat_practitioner_id)],
      ['Setiap dokter sudah ditandai umum atau gigi', dokter.length > 0 && dokter.every(p => !!p.jenis_dokter)],
      ['Kode SNOMED gigi terisi (untuk odontogram SatuSehat)', await cekKodeGigi()]
    ];
    w.querySelector('#kesiapan').innerHTML = cek.map(([t, ok]) => `
      <div class="flex items-center gap-8" style="padding:6px 0">
        <span class="badge ${ok ? 'b-ok' : 'b-warn'}">${ok ? 'Siap' : 'Belum'}</span>
        <span>${UI.esc(t)}</span></div>`).join('');

    await gambarKesiapanData(w.querySelector('#kesiapanData'));
  }

  /* Ringkasan data yang menumpuk selama klinik berjalan. Ini yang paling
     mahal kalau ditunda: kekurangan satu-dua pasien mudah dibereskan hari ini,
     ribuan catatan pada hari go-live tidak. */
  async function gambarKesiapanData(w) {
    if (!w) return;
    try {
      const [ringkas, pasienKurang, kunjunganKurang] = await Promise.all([
        DB.ringkasanKesiapan(),
        DB.kesiapanPasien({ hanyaKurang: true, batas: 200 }),
        DB.kesiapanKunjungan({ hanyaKurang: true, batas: 200 })
      ]);

      const persen = (a, b) => b ? Math.round((b - a) / b * 100) : 100;
      const pPasien = persen(ringkas.pasien_kurang, ringkas.pasien_total);
      const pKunjungan = persen(ringkas.kunjungan_kurang, ringkas.kunjungan_total);

      /* Kumpulkan alasan yang sama supaya kelihatan mana yang paling sering */
      const alasan = {};
      [...pasienKurang, ...kunjunganKurang].forEach(r =>
        (r.kekurangan || []).forEach(k => { alasan[k] = (alasan[k] || 0) + 1; }));
      const urut = Object.entries(alasan).sort((a, b) => b[1] - a[1]);

      w.innerHTML = `
        <div class="grid grid-2 mb-16">
          <div class="stat ${ringkas.pasien_kurang ? '' : 'accent'}">
            <div class="lbl">Data pasien lengkap</div>
            <div class="val tabular">${pPasien}%</div>
            <div class="hint">${ringkas.pasien_kurang} dari ${ringkas.pasien_total} pasien masih kurang</div>
          </div>
          <div class="stat ${ringkas.kunjungan_kurang ? '' : 'accent'}">
            <div class="lbl">Kunjungan selesai yang siap dikirim</div>
            <div class="val tabular">${pKunjungan}%</div>
            <div class="hint">${ringkas.kunjungan_kurang} dari ${ringkas.kunjungan_total} kunjungan masih kurang</div>
          </div>
        </div>

        ${!urut.length
          ? `<div class="banner ok mb-0">${UI.ikon('cek',16)}
              <div>Semua data pasien dan kunjungan sudah lengkap. Saat kredensial bridging
              tiba, tidak ada yang perlu dibereskan lebih dulu.</div></div>`
          : `<h3 style="font-size:14px;margin-bottom:10px">Yang paling sering kurang</h3>
             ${urut.map(([k, n]) => `
               <div class="flex justify-between items-center gap-8" style="padding:7px 0;
                    border-bottom:1px solid var(--ink-100)">
                 <span class="text-sm">${UI.esc(k)}</span>
                 <b class="tabular">${n}</b></div>`).join('')}
             <div class="mt-16">
               <a href="#/pasien" class="btn btn-secondary btn-sm">Buka daftar pasien</a>
               <span class="text-sm text-muted" style="margin-left:8px">Centang
                 "Hanya yang datanya belum lengkap" untuk membereskannya satu per satu.</span>
             </div>`}`;
    } catch (e) {
      w.innerHTML = `<div class="banner err mb-0">${UI.esc(e.message)}</div>`;
    }
  }

  /* Odontogram SatuSehat memerlukan kode SNOMED tiap gigi. Kode itu diisi dari
     Lampiran Terminologi Gigi setelah klinik terdaftar; selama kosong, nomor FDI
     tetap terkirim sebagai teks. */
  async function cekKodeGigi() {
    try {
      const gigi = await DB.refGigi();
      return gigi.length > 0 && gigi.every(g => !!g.kode_snomed);
    } catch (e) { return false; }
  }

  return { render };
})();

/* =====================================================================
   ANTREAN ONLINE, JADWAL & LAYAR TUNGGU  (admin)
   ---------------------------------------------------------------------
   Empat hal yang harus diisi sebelum antrean online bisa dinyalakan,
   dan halaman ini menampilkan keempatnya sebagai daftar yang kelihatan
   belum lengkap — bukan sebagai formulir kosong yang tampak beres.

   Urutan tabnya sengaja mengikuti urutan pekerjaannya:
     Jadwal   → kapan poli buka dan berapa kuotanya
     Libur    → hari yang harus ditutup
     Layar    → TV ruang tunggu (bisa dipakai hari ini juga)
     Antrol   → yang baru berguna setelah BPJS memberi kredensial
   ===================================================================== */
const Jadwal = (() => {

  let tabAktif = 'jadwal';
  let poli = [], jadwal = [], konf = {}, tokenLayar = null;

  async function render(el, param) {
    if (!App.boleh('antrean_pengaturan')) {
      el.innerHTML = UI.kosong('Akses ditolak', 'Anda tidak punya izin membuka Antrean & Layar.');
      return;
    }
    if (param && param[0]) tabAktif = param[0];

    el.innerHTML = `
      <div class="mb-16"><h1>Antrean &amp; Layar Tunggu</h1>
        <p class="text-muted mb-0">Jadwal poli, kuota, layar ruang tunggu,
          dan web service antrean online Mobile JKN.</p></div>

      <div id="kesiapan" class="mb-16"></div>

      <div class="tabs" id="tabs">
        ${[['jadwal','Jadwal &amp; Kuota'],['libur','Hari Libur'],
           ['layar','Layar Tunggu'],['antrol','Antrean Online (Antrol)']]
          .map(([k,t]) => `<button class="tab ${tabAktif===k?'on':''}" data-t="${k}">${t}</button>`).join('')}
      </div>
      <div id="isiTab">${UI.memuat(3)}</div>`;

    el.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tabAktif = b.dataset.t;
      el.querySelectorAll('#tabs .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      gambarTab(el.querySelector('#isiTab'));
    });

    await muatDasar();
    gambarKesiapan(el.querySelector('#kesiapan'));
    await gambarTab(el.querySelector('#isiTab'));
  }

  async function muatDasar() {
    const [p, j, s] = await Promise.all([
      DB.daftarPoli(false), DB.poliJadwal(), DB.antreanPengaturan()
    ]);
    poli = p; jadwal = j;
    konf = s.konfigurasi || {};
    tokenLayar = s.token_layar || null;
  }

  async function gambarTab(w) {
    w.innerHTML = UI.memuat(3);
    try {
      if (tabAktif === 'jadwal') return await tabJadwal(w);
      if (tabAktif === 'libur')  return await tabLibur(w);
      if (tabAktif === 'layar')  return await tabLayar(w);
      if (tabAktif === 'antrol') return await tabAntrol(w);
    } catch (e) {
      w.innerHTML = `<div class="banner err"><div>${UI.esc(e.message || e)}</div></div>`;
    }
  }

  /* ======================= Daftar kesiapan ============================ */
  /* Ditampilkan di atas semua tab. Yang belum beres harus KELIHATAN
     belum beres — bukan tersembunyi di dalam tab yang belum dibuka. */
  function gambarKesiapan(w) {
    const tanpaKode = poli.filter(p => p.aktif && !p.kode_pcare);
    const tanpaJadwal = poli.filter(p => p.aktif && !jadwal.some(j => j.poli_id === p.id && j.aktif));

    const butir = [
      { ok: !tanpaJadwal.length,
        judul: 'Jadwal buka tiap poli',
        kurang: `Belum ada jadwal: ${tanpaJadwal.map(p => p.nama).join(', ')}`,
        beres: 'Semua poli aktif punya jadwal.' },
      { ok: !!tokenLayar,
        judul: 'Layar ruang tunggu',
        kurang: 'Token layar belum dibuat — TV belum bisa menampilkan antrean.',
        beres: 'Tautan layar sudah ada dan siap dibuka di TV.' },
      { ok: !tanpaKode.length,
        judul: 'Kode poli PCare',
        kurang: `Belum berkode PCare: ${tanpaKode.map(p => p.nama).join(', ')}. ` +
                'Mobile JKN mengirim kode milik BPJS, bukan kode klinik — selama kosong, ' +
                'pemesanan ke poli itu selalu ditolak "Poli tidak ditemukan".',
        beres: 'Semua poli aktif sudah punya kode PCare.' },
      { ok: false, netral: true,
        judul: 'Kredensial & pendaftaran ke BPJS',
        kurang: 'Menunggu proses dengan Kantor Cabang BPJS. Fitur di halaman ini ' +
                'sudah bisa dipakai untuk layar tunggu dan antrean loket lebih dulu.' }
    ];

    w.innerHTML = `<div class="card"><div class="card-body">
      <b>Kesiapan antrean online</b>
      <div class="mt-8">${butir.map(b => `
        <div class="flex gap-6 mb-6" style="align-items:flex-start">
          <span style="flex:none;margin-top:2px;color:${
            b.netral ? 'var(--ink-400)' : b.ok ? 'var(--ok-700)' : 'var(--warn-700)'}">
            ${b.netral ? UI.ikon('jam',15) : b.ok ? UI.ikon('cek',15) : UI.ikon('peringatan',15)}</span>
          <div>
            <b class="text-sm">${UI.esc(b.judul)}</b>
            <div class="text-xs text-muted">${UI.esc(b.ok ? b.beres : b.kurang)}</div>
          </div>
        </div>`).join('')}</div>
    </div></div>`;
  }

  /* ========================= Tab: jadwal ============================== */
  async function tabJadwal(w) {
    const aktif = poli.filter(p => p.aktif);

    w.innerHTML = `
      <div class="banner info mb-12"><div>
        Kuota <b>total</b> membatasi seluruh pasien hari itu; kuota <b>online</b>
        membatasi berapa di antaranya boleh dipesan lewat Mobile JKN.
        Sisanya tetap tersedia untuk pasien yang datang langsung — itulah gunanya
        dua angka, bukan satu.
      </div></div>

      ${aktif.map(p => kartuPoli(p)).join('')}`;

    w.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-aksi]');
      if (!b || b.disabled) return;
      b.disabled = true;
      try {
        if (b.dataset.aksi === 'tambah-sesi') await dialogSesi(b.dataset.poli, b.dataset.hari, null);
        if (b.dataset.aksi === 'ubah-sesi')   await dialogSesi(null, null, b.dataset.id);
        if (b.dataset.aksi === 'hapus-sesi')  await hapusSesi(b.dataset.id);
        if (b.dataset.aksi === 'salin-hari')  await salinKeSemuaHari(b.dataset.poli, b.dataset.hari);
      } catch (err) { UI.toast(err.message || 'Gagal.', 'err'); }
      finally { b.disabled = false; }
    });
  }

  function kartuPoli(p) {
    const punya = jadwal.filter(j => j.poli_id === p.id);
    return `<div class="card mb-16">
      <div class="card-head">
        <div class="flex-1">
          <h2>${UI.esc(p.nama)}</h2>
          <div class="sub">Awalan nomor <b class="mono">${UI.esc(p.prefix_antrean || 'A')}</b> ·
            kode PCare ${p.kode_pcare
              ? `<b class="mono">${UI.esc(p.kode_pcare)}</b>`
              : '<span style="color:var(--warn-700)">belum diisi</span>'}</div>
        </div>
      </div>
      <div class="card-body tight"><div class="table-wrap"><table class="tbl">
        <thead><tr>
          <th style="width:110px">Hari</th><th>Sesi</th><th>Jam buka</th>
          <th>Tutup online</th><th>Kuota</th><th>Kuota online</th><th style="width:1%"></th>
        </tr></thead>
        <tbody>${AntreanCore.HARI.map((nama, hari) => {
          const sesi = punya.filter(j => j.hari === hari).sort((a,b) => a.sesi - b.sesi);
          if (!sesi.length) {
            return `<tr>
              <td><b>${nama}</b></td>
              <td colspan="5" class="text-muted">Tutup — tidak menerima antrean</td>
              <td class="nowrap">
                <button class="btn btn-secondary btn-sm" data-aksi="tambah-sesi"
                        data-poli="${p.id}" data-hari="${hari}">Buka</button></td>
            </tr>`;
          }
          return sesi.map((j, i) => `<tr>
            <td>${i === 0 ? `<b>${nama}</b>` : ''}</td>
            <td>Sesi ${j.sesi}</td>
            <td class="mono">${AntreanCore.jamPendek(j.jam_buka)}–${AntreanCore.jamPendek(j.jam_tutup)}</td>
            <td class="mono">${AntreanCore.jamPendek(j.jam_tutup_online || j.jam_tutup)}</td>
            <td>${j.kuota}</td>
            <td>${j.kuota_online}</td>
            <td class="nowrap">
              <button class="btn btn-secondary btn-sm" data-aksi="ubah-sesi" data-id="${j.id}">Ubah</button>
              ${i === 0 ? `<button class="btn btn-secondary btn-sm" data-aksi="salin-hari"
                             data-poli="${p.id}" data-hari="${hari}" title="Salin jam & kuota hari ini ke Senin–Sabtu">
                             Salin</button>` : ''}
              <button class="btn-icon" data-aksi="hapus-sesi" data-id="${j.id}" title="Hapus sesi">
                ${UI.ikon('x',15)}</button>
            </td>
          </tr>`).join('');
        }).join('')}</tbody>
      </table></div></div>
      <div class="card-foot">
        <span class="hint mb-0">Sesi kedua dipakai untuk praktek sore.
          Kuota dijumlahkan dari seluruh sesi pada hari itu.</span>
      </div>
    </div>`;
  }

  async function dialogSesi(poliId, hari, id) {
    const ada = id ? jadwal.find(j => j.id === id) : null;
    const pId = ada ? ada.poli_id : poliId;
    const h   = ada ? ada.hari : Number(hari);
    const sesiTerpakai = jadwal.filter(j => j.poli_id === pId && j.hari === h && j.id !== id)
                               .map(j => j.sesi);
    const sesiBaru = [1,2,3].find(s => !sesiTerpakai.includes(s)) || 1;

    const hasil = await UI.modal({
      judul: `${ada ? 'Ubah' : 'Buka'} jadwal — ${AntreanCore.HARI[h]}`,
      isi: `
        <div class="form-row">
          <div class="field"><label>Sesi</label>
            <select name="sesi" class="w-full">
              ${[1,2,3].map(s => `<option value="${s}"
                 ${(ada ? ada.sesi : sesiBaru) === s ? 'selected' : ''}
                 ${!ada && sesiTerpakai.includes(s) ? 'disabled' : ''}>Sesi ${s}</option>`).join('')}
            </select></div>
          <div class="field"><label>Aktif</label>
            <select name="aktif" class="w-full">
              <option value="true" ${!ada || ada.aktif ? 'selected' : ''}>Ya, menerima antrean</option>
              <option value="false" ${ada && !ada.aktif ? 'selected' : ''}>Tidak</option>
            </select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Jam buka</label>
            <input type="time" name="jam_buka" class="w-full"
                   value="${AntreanCore.jamPendek(ada?.jam_buka) || '08:00'}"></div>
          <div class="field"><label>Jam tutup</label>
            <input type="time" name="jam_tutup" class="w-full"
                   value="${AntreanCore.jamPendek(ada?.jam_tutup) || '12:00'}"></div>
        </div>
        <div class="field">
          <label>Pendaftaran online ditutup pukul</label>
          <input type="time" name="jam_tutup_online" class="w-full"
                 value="${AntreanCore.jamPendek(ada?.jam_tutup_online) || '11:00'}">
          <div class="hint">Dibuat lebih awal daripada jam tutup poli dengan sengaja.
            Nomor yang terbit pukul 11.55 untuk poli yang tutup 12.00 hampir pasti
            tidak terlayani, dan nomor hangus lebih merepotkan daripada nomor yang ditolak.</div>
        </div>
        <div class="form-row">
          <div class="field"><label>Kuota total</label>
            <input type="number" name="kuota" min="0" class="w-full" value="${ada?.kuota ?? 40}"></div>
          <div class="field"><label>Kuota online (Mobile JKN)</label>
            <input type="number" name="kuota_online" min="0" class="w-full"
                   value="${ada?.kuota_online ?? 20}"></div>
        </div>
        <div id="galatSesi"></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (badan) => {
            const d = UI.nilaiForm(badan);
            const g = badan.querySelector('#galatSesi');
            if (AntreanCore.jamPendek(d.jam_buka) >= AntreanCore.jamPendek(d.jam_tutup)) {
              g.innerHTML = `<div class="banner err"><div>Jam tutup harus lebih akhir daripada jam buka.</div></div>`;
              return false;
            }
            if (Number(d.kuota_online) > Number(d.kuota)) {
              /* Kuota online yang melebihi kuota total berarti pasien
                 loket bisa tidak kebagian kursi sama sekali di hari sibuk. */
              g.innerHTML = `<div class="banner err"><div>Kuota online tidak boleh melebihi kuota total —
                pasien yang datang langsung tidak akan kebagian nomor.</div></div>`;
              return false;
            }
            try {
              return await DB.simpanJadwal({
                poli_id: pId, hari: h, sesi: Number(d.sesi),
                jam_buka: d.jam_buka, jam_tutup: d.jam_tutup,
                jam_tutup_online: d.jam_tutup_online || null,
                kuota: Number(d.kuota), kuota_online: Number(d.kuota_online),
                aktif: d.aktif === 'true'
              }, id);
            } catch (e) {
              g.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`;
              return false;
            }
          } }
      ]
    });
    if (hasil) { UI.toast('Jadwal disimpan.', 'ok'); await muatUlang(); }
  }

  async function hapusSesi(id) {
    const j = jadwal.find(x => x.id === id);
    if (!await UI.konfirmasi('Hapus jadwal',
      `Poli tidak akan menerima antrean pada ${AntreanCore.HARI[j.hari]} sesi ${j.sesi}.`,
      'Hapus', true)) return;
    await DB.hapusJadwal(id);
    UI.toast('Jadwal dihapus.', 'ok');
    await muatUlang();
  }

  /* Menyalin jam & kuota satu hari ke Senin–Sabtu. Mengisi 6 hari × 2 sesi
     satu per satu berarti 12 dialog; hampir tidak ada yang menyelesaikannya,
     dan jadwal yang setengah terisi menolak pasien pada hari yang sebenarnya
     klinik buka. */
  async function salinKeSemuaHari(poliId, hari) {
    const h = Number(hari);
    const sumber = jadwal.filter(j => j.poli_id === poliId && j.hari === h);
    if (!sumber.length) return;

    if (!await UI.konfirmasi('Salin jadwal',
      `Jam dan kuota hari ${AntreanCore.HARI[h]} akan disalin ke Senin sampai Sabtu. ` +
      `Jadwal yang sudah ada pada hari-hari itu akan ditimpa. Hari Minggu tidak diubah.`,
      'Salin')) return;

    for (const hariTujuan of [1,2,3,4,5,6]) {
      if (hariTujuan === h) continue;
      for (const s of sumber) {
        const ada = jadwal.find(j => j.poli_id === poliId && j.hari === hariTujuan && j.sesi === s.sesi);
        const rec = {
          poli_id: poliId, hari: hariTujuan, sesi: s.sesi,
          jam_buka: s.jam_buka, jam_tutup: s.jam_tutup,
          jam_tutup_online: s.jam_tutup_online,
          kuota: s.kuota, kuota_online: s.kuota_online, aktif: s.aktif
        };
        await DB.simpanJadwal(rec, ada ? ada.id : null);
      }
    }
    UI.toast('Jadwal disalin ke Senin–Sabtu.', 'ok');
    await muatUlang();
  }

  /* ========================== Tab: libur ============================== */
  async function tabLibur(w) {
    const daftar = await DB.poliLibur(UI.hariIni());

    w.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Hari libur &amp; tanggal tutup</h2>
            <div class="sub">Mobile JKN menolak pemesanan pada tanggal ini</div></div>
          <button class="btn btn-primary btn-sm" id="btnLibur">${UI.ikon('plus',15)} Tambah</button>
        </div>
        <div class="card-body tight">
          ${daftar.length ? `<div class="table-wrap"><table class="tbl">
            <thead><tr><th>Tanggal</th><th>Berlaku untuk</th><th>Keterangan</th><th style="width:1%"></th></tr></thead>
            <tbody>${daftar.map(l => `<tr>
              <td><b>${UI.tglIndo(l.tanggal, true)}</b></td>
              <td>${l.poli_id ? UI.esc(l.poli?.nama || '—') : '<b>Semua poli</b>'}</td>
              <td class="text-muted">${UI.esc(l.keterangan || '—')}</td>
              <td><button class="btn-icon" data-hapus="${l.id}">${UI.ikon('x',15)}</button></td>
            </tr>`).join('')}</tbody></table></div>`
          : `<div class="empty" style="padding:28px 16px">
               <p class="mb-0">Belum ada tanggal libur yang dicatat.</p></div>`}
        </div>
      </div>`;

    w.querySelector('#btnLibur').addEventListener('click', dialogLibur);
    w.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-hapus]'); if (!b) return;
      await DB.hapusLibur(b.dataset.hapus);
      UI.toast('Tanggal libur dihapus.', 'ok');
      gambarTab(w);
    });
  }

  async function dialogLibur() {
    const hasil = await UI.modal({
      judul: 'Tambah hari libur',
      isi: `
        <div class="field"><label>Tanggal</label>
          <input type="date" name="tanggal" class="w-full" value="${UI.hariIni()}"></div>
        <div class="field"><label>Berlaku untuk</label>
          <select name="poli_id" class="w-full">
            <option value="">Semua poli</option>
            ${poli.filter(p => p.aktif).map(p =>
              `<option value="${p.id}">${UI.esc(p.nama)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Keterangan</label>
          <input name="keterangan" class="w-full" placeholder="mis. Libur Idul Fitri"></div>
        <div id="galatLibur"></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (badan) => {
            const d = UI.nilaiForm(badan);
            const g = badan.querySelector('#galatLibur');
            if (!d.tanggal) {
              g.innerHTML = `<div class="banner err"><div>Tanggal wajib diisi.</div></div>`;
              return false;
            }
            try {
              return await DB.simpanLibur({
                tanggal: d.tanggal, poli_id: d.poli_id || null,
                keterangan: d.keterangan || null
              });
            } catch (e) {
              g.innerHTML = `<div class="banner err"><div>${
                /duplicate|unique/i.test(e.message)
                  ? 'Tanggal itu sudah tercatat sebagai libur.' : UI.esc(e.message)}</div></div>`;
              return false;
            }
          } }
      ]
    });
    if (hasil) { UI.toast('Hari libur ditambahkan.', 'ok'); gambarTab(document.getElementById('isiTab')); }
  }

  /* ========================== Tab: layar ============================== */
  async function tabLayar(w) {
    const tautan = tokenLayar ? AntreanCore.urlLayar(location.origin + location.pathname, tokenLayar) : '';

    w.innerHTML = `
      <div class="card mb-16">
        <div class="card-head"><h2>Tautan layar ruang tunggu</h2>
          <div class="sub">Buka sekali di TV atau tablet, lalu biarkan</div></div>
        <div class="card-body">
          <div class="banner info mb-12"><div>
            Layar ini <b>tidak perlu login</b>. Ia hanya bisa menampilkan
            <b>nomor antrean</b> — tidak ada nama pasien, nomor rekam medis,
            maupun data medis apa pun di dalamnya. Itulah yang membuat tautan ini
            aman dibiarkan terbuka seharian di ruang tunggu: seandainya tersebar,
            yang terbaca hanya kalimat yang memang diteriakkan petugas.
          </div></div>

          ${tokenLayar ? `
            <div class="field">
              <label>Tautan layar</label>
              <input class="w-full mono" id="tautanLayar" readonly value="${UI.esc(tautan)}">
            </div>
            <div class="flex gap-6 flex-wrap">
              <button class="btn btn-primary btn-sm" id="btnSalin">Salin tautan</button>
              <a class="btn btn-secondary btn-sm" href="${UI.esc(tautan)}" target="_blank" rel="noopener">
                Buka layar sekarang</a>
              <button class="btn btn-secondary btn-sm" id="btnTokenBaru">Ganti token</button>
            </div>
            <p class="hint">Mengganti token akan <b>mematikan tautan lama seketika</b>.
              Lakukan kalau tautannya pernah dikirim ke luar klinik — lalu buka ulang
              tautan baru di TV.</p>
          ` : `
            <div class="banner warn mb-12"><div>
              Token layar belum dibuat, jadi <code>display.html</code> belum bisa dipakai.
            </div></div>
            <button class="btn btn-primary" id="btnTokenBaru">Buat tautan layar</button>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Tampilan &amp; suara</h2></div>
        <div class="card-body">
          <div class="form-row">
            <div class="field"><label>Judul di layar</label>
              <input name="judul_layar" class="w-full"
                     value="${UI.esc(konf.judul_layar || 'Antrean Pasien')}"></div>
            <div class="field"><label>Perkiraan menit per pasien</label>
              <input type="number" name="menit_per_pasien" min="1" max="60" class="w-full"
                     value="${konf.menit_per_pasien ?? 10}">
              <div class="hint">Dipakai menghitung estimasi "± sekian menit lagi".</div></div>
          </div>
          <div class="field"><label>Teks berjalan di bawah layar</label>
            <textarea name="teks_berjalan" class="w-full" rows="2"
              placeholder="mis. Mohon menunggu nomor antrean Anda dipanggil.">${UI.esc(konf.teks_berjalan || '')}</textarea></div>
          <div class="field"><label>Kalimat untuk pasien di Mobile JKN</label>
            <textarea name="keterangan_antrol" class="w-full" rows="2"
              placeholder="Harap datang 30 menit sebelum jam praktek…">${UI.esc(konf.keterangan_antrol || '')}</textarea>
            <div class="hint">Kalimat ini ikut terkirim pada setiap jawaban ke Mobile JKN
              dan dibaca pasien di ponselnya.</div></div>
          <button class="btn btn-primary" id="btnSimpanLayar">Simpan</button>
        </div>
      </div>`;

    const bSalin = w.querySelector('#btnSalin');
    if (bSalin) bSalin.addEventListener('click', async () => {
      const inp = w.querySelector('#tautanLayar');
      try { await navigator.clipboard.writeText(inp.value); UI.toast('Tautan disalin.', 'ok'); }
      catch (e) { inp.select(); UI.toast('Tekan Ctrl+C untuk menyalin.', 'warn'); }
    });

    w.querySelector('#btnTokenBaru').addEventListener('click', async () => {
      if (tokenLayar && !await UI.konfirmasi('Ganti token layar',
        'Tautan layar yang lama akan langsung berhenti bekerja. TV di ruang tunggu ' +
        'harus dibuka ulang dengan tautan baru.', 'Ganti token', true)) return;
      const baru = AntreanCore.acakToken(40);
      await DB.antreanTokenBaru(baru);
      tokenLayar = baru;
      UI.toast('Tautan layar dibuat.', 'ok');
      gambarKesiapan(document.getElementById('kesiapan'));
      gambarTab(w);
    });

    w.querySelector('#btnSimpanLayar').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const d = UI.nilaiForm(w);
        konf = { ...konf,
          judul_layar: d.judul_layar || 'Antrean Pasien',
          teks_berjalan: d.teks_berjalan || '',
          keterangan_antrol: d.keterangan_antrol || '',
          menit_per_pasien: Number(d.menit_per_pasien) || 10
        };
        await DB.simpanAntreanPengaturan(konf);
        UI.toast('Pengaturan layar disimpan.', 'ok');
      } catch (err) { UI.toast(err.message || 'Gagal menyimpan.', 'err'); }
      finally { e.target.disabled = false; }
    });
  }

  /* ========================== Tab: Antrol ============================= */
  async function tabAntrol(w) {
    const [akun, log] = await Promise.all([
      DB.antrolAkun().catch(() => []),
      DB.antrolLog(20).catch(() => [])
    ]);
    const dasar = `${CONFIG.SUPABASE_URL}/functions/v1/antrol`;

    w.innerHTML = `
      <div class="banner warn mb-16"><div>
        <b>Arah panggilannya terbalik dari PCare.</b> Pada antrean online, BPJS-lah
        yang memanggil server klinik — bukan sebaliknya. Karena itu yang perlu
        diserahkan ke BPJS bukan permintaan kredensial, melainkan
        <b>alamat web service klinik beserta username dan password</b> yang Anda buat
        sendiri di bawah ini.
      </div></div>

      <div class="card mb-16">
        <div class="card-head"><h2>Alamat web service klinik</h2>
          <div class="sub">Yang diisikan pada formulir pendaftaran Antrean FKTP</div></div>
        <div class="card-body">
          <div class="field"><label>Base URL</label>
            <input class="w-full mono" id="baseUrl" readonly value="${UI.esc(dasar)}"></div>
          <button class="btn btn-secondary btn-sm mb-12" id="btnSalinUrl">Salin base URL</button>

          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Fitur</th><th>Metode</th><th>Jalur</th></tr></thead>
            <tbody>
              <tr><td>Generate token</td><td class="mono">GET</td><td class="mono">/auth</td></tr>
              <tr><td>Status antrean</td><td class="mono">GET</td>
                  <td class="mono">/antrean/status/{kodepoli}/{tanggal}</td></tr>
              <tr><td>Ambil antrean</td><td class="mono">POST</td><td class="mono">/antrean</td></tr>
              <tr><td>Sisa antrean peserta</td><td class="mono">GET</td>
                  <td class="mono">/antrean/sisapeserta/{nokartu}/{kodepoli}/{tanggal}</td></tr>
              <tr><td>Post peserta baru</td><td class="mono">POST</td><td class="mono">/peserta</td></tr>
              <tr><td>Batal antrean</td><td class="mono">PUT</td><td class="mono">/antrean/batal</td></tr>
            </tbody>
          </table></div>
          <p class="hint">Edge Function <code>antrol</code> harus dipasang dengan
            <code>--no-verify-jwt</code>. Tanpa itu, setiap permintaan BPJS dijawab 401
            oleh Supabase sebelum kode kita sempat berjalan.</p>
        </div>
      </div>

      <div class="card mb-16">
        <div class="card-head">
          <div class="flex-1"><h2>Akun web service</h2>
            <div class="sub">Dipakai BPJS untuk masuk ke alamat di atas</div></div>
          <button class="btn btn-primary btn-sm" id="btnAkun">${UI.ikon('plus',15)} Buat akun</button>
        </div>
        <div class="card-body tight">
          ${akun.length ? `<div class="table-wrap"><table class="tbl">
            <thead><tr><th>Username</th><th>Keterangan</th><th>Terakhir dipakai</th>
              <th>Jumlah</th><th style="width:1%"></th></tr></thead>
            <tbody>${akun.map(a => `<tr>
              <td class="mono"><b>${UI.esc(a.username)}</b></td>
              <td class="text-muted">${UI.esc(a.keterangan || '—')}</td>
              <td class="text-muted">${a.terakhir_dipakai
                ? UI.tglPendek(a.terakhir_dipakai) + ' ' + UI.jam(a.terakhir_dipakai)
                : 'belum pernah'}</td>
              <td>${a.jumlah_dipakai}</td>
              <td><button class="btn-icon" data-hapus-akun="${UI.esc(a.username)}">
                ${UI.ikon('x',15)}</button></td>
            </tr>`).join('')}</tbody></table></div>`
          : `<div class="empty" style="padding:28px 16px">
               <p class="mb-0">Belum ada akun. Buat satu, lalu serahkan username dan
               password-nya ke petugas BPJS bersama base URL di atas.</p></div>`}
        </div>
        <div class="card-foot"><span class="hint mb-0">
          Password disimpan sebagai hash bersalt dan <b>tidak pernah bisa dibaca kembali</b>,
          bahkan oleh admin. Kalau lupa, buat password baru untuk username yang sama.</span></div>
      </div>

      <div class="card mb-16">
        <div class="card-head"><h2>Uji coba</h2>
          <div class="sub">Menjalankan permintaan yang sama persis dengan yang akan dikirim BPJS</div></div>
        <div class="card-body">
          <div class="form-row">
            <div class="field"><label>Username</label>
              <input name="uji_user" class="w-full mono" autocomplete="off"></div>
            <div class="field"><label>Password</label>
              <input name="uji_sandi" type="password" class="w-full mono" autocomplete="new-password"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Kode poli PCare</label>
              <select name="uji_poli" class="w-full">
                ${poli.filter(p => p.aktif && p.kode_pcare).map(p =>
                  `<option value="${UI.esc(p.kode_pcare)}">${UI.esc(p.nama)} (${UI.esc(p.kode_pcare)})</option>`).join('')
                  || '<option value="">— belum ada poli berkode PCare —</option>'}
              </select></div>
            <div class="field"><label>Tanggal periksa</label>
              <input type="date" name="uji_tanggal" class="w-full" value="${UI.hariIni()}"></div>
          </div>
          <button class="btn btn-primary" id="btnUji">Jalankan uji coba</button>
          <div id="hasilUji" class="mt-12"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Log permintaan masuk</h2>
          <div class="sub">Bukti apa yang dikirim BPJS dan apa yang kita jawab</div></div>
        <div class="card-body tight">
          ${log.length ? `<div class="table-wrap"><table class="tbl">
            <thead><tr><th>Waktu</th><th>Jalur</th><th>Metode</th><th>Kode</th><th>Pesan</th></tr></thead>
            <tbody>${log.map(l => `<tr>
              <td class="nowrap text-muted">${UI.tglPendek(l.waktu)} ${UI.jam(l.waktu)}</td>
              <td class="mono text-xs">${UI.esc(l.jalur)}</td>
              <td class="mono">${UI.esc(l.metode)}</td>
              <td><span class="badge ${l.sukses ? 'b-selesai' : 'b-batal'}">${l.http_status}</span></td>
              <td class="text-xs text-muted">${UI.esc(
                (l.response && l.response.metadata && l.response.metadata.message) || '')}</td>
            </tr>`).join('')}</tbody></table></div>`
          : `<div class="empty" style="padding:28px 16px">
               <p class="mb-0">Belum ada permintaan masuk. Baris pertama di sini akan
               muncul saat BPJS menguji sambungan (UAT).</p></div>`}
        </div>
      </div>`;

    w.querySelector('#btnSalinUrl').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(dasar); UI.toast('Base URL disalin.', 'ok'); }
      catch (e) { w.querySelector('#baseUrl').select(); }
    });
    w.querySelector('#btnAkun').addEventListener('click', dialogAkun);
    w.querySelector('#btnUji').addEventListener('click', () => jalankanUji(w));
    w.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-hapus-akun]'); if (!b) return;
      if (!await UI.konfirmasi('Hapus akun',
        `Akun "${b.dataset.hapusAkun}" akan dihapus. BPJS tidak akan bisa masuk lagi ` +
        `memakai akun itu, dan antrean online berhenti bekerja sampai akun baru diberikan.`,
        'Hapus', true)) return;
      await DB.antrolAkunHapus(b.dataset.hapusAkun);
      UI.toast('Akun dihapus.', 'ok');
      gambarTab(w);
    });
  }

  async function dialogAkun() {
    /* Password dibuat sistem, bukan diketik admin. Ia disalin sekali ke
       formulir BPJS dan tidak pernah diketik ulang manusia, jadi tidak ada
       alasan membuatnya bisa dihafal — sementara pintunya menghadap
       internet terbuka. */
    const sandiOtomatis = AntreanCore.acakToken(28);

    const hasil = await UI.modal({
      judul: 'Buat akun web service',
      lebar: true,
      isi: `
        <div class="field"><label>Username</label>
          <input name="username" class="w-full mono" value="bpjs-antrol" autocomplete="off"></div>
        <div class="field"><label>Password</label>
          <input name="sandi" class="w-full mono" value="${UI.esc(sandiOtomatis)}"
                 autocomplete="new-password">
          <div class="hint">Dibuat acak oleh sistem. <b>Salin sekarang</b> —
            setelah disimpan, password ini tidak bisa dilihat lagi dari mana pun.</div></div>
        <div class="field"><label>Keterangan</label>
          <input name="keterangan" class="w-full" placeholder="mis. Akun UAT BPJS Manado"></div>
        <div id="galatAkun"></div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan akun', kelas: 'btn-primary', aksi: async (badan) => {
            const d = UI.nilaiForm(badan);
            const g = badan.querySelector('#galatAkun');
            try {
              await DB.antrolAkunSimpan(d.username, d.sandi, d.keterangan || null);
              return { username: d.username, sandi: d.sandi };
            } catch (e) {
              g.innerHTML = `<div class="banner err"><div>${UI.esc(e.message)}</div></div>`;
              return false;
            }
          } }
      ]
    });

    if (!hasil) return;
    /* Ditampilkan sekali, besar-besar, dengan peringatan. Password yang
       hanya muncul di toast selama tiga detik akan hilang sebelum sempat
       disalin — dan tidak bisa dimunculkan lagi. */
    await UI.modal({
      judul: 'Salin sekarang',
      isi: `<div class="banner warn mb-12"><div>
              Password di bawah <b>tidak akan pernah ditampilkan lagi.</b>
              Salin dan simpan bersama berkas pendaftaran Antrol ke BPJS.</div></div>
            <div class="field"><label>Username</label>
              <input class="w-full mono" readonly value="${UI.esc(hasil.username)}"></div>
            <div class="field"><label>Password</label>
              <input class="w-full mono" readonly value="${UI.esc(hasil.sandi)}"
                     onclick="this.select()"></div>`,
      tombol: [{ teks: 'Sudah saya salin', nilai: true, kelas: 'btn-primary' }]
    });
    gambarTab(document.getElementById('isiTab'));
  }

  /* Uji coba menembak Edge Function lewat HTTP sungguhan — bukan memanggil
     fungsi SQL-nya langsung. Yang ingin dibuktikan justru bagian yang tidak
     bisa diuji dari database: fungsinya sudah terpasang, boleh diakses tanpa
     JWT, dan header x-username/x-password sampai dengan utuh. */
  async function jalankanUji(w) {
    const d = UI.nilaiForm(w);
    const kotak = w.querySelector('#hasilUji');
    const dasar = `${CONFIG.SUPABASE_URL}/functions/v1/antrol`;
    const langkah = [];

    if (!d.uji_user || !d.uji_sandi) {
      kotak.innerHTML = `<div class="banner err"><div>Isi username dan password akun web service.</div></div>`;
      return;
    }

    kotak.innerHTML = UI.memuat(2);
    const catat = (nama, ok, pesan) => langkah.push({ nama, ok, pesan });

    try {
      const rAuth = await fetch(`${dasar}/auth`, {
        headers: { 'x-username': d.uji_user, 'x-password': d.uji_sandi }
      });
      const jAuth = await rAuth.json().catch(() => ({}));
      const token = jAuth?.response?.token;
      catat('GET /auth', !!token,
        token ? 'Token diterima' : (jAuth?.metadata?.message || `HTTP ${rAuth.status}`));

      if (token) {
        const jalur = `${dasar}/antrean/status/${encodeURIComponent(d.uji_poli || '')}/${d.uji_tanggal}`;
        const rSt = await fetch(jalur, {
          headers: { 'x-token': token, 'x-username': d.uji_user }
        });
        const jSt = await rSt.json().catch(() => ({}));
        const b = AntreanCore.bacaJawaban(jSt);
        catat('GET /antrean/status', b.ok, b.ringkas);

        // Token yang salah harus ditolak. Kalau langkah ini "berhasil",
        // pintunya terbuka untuk siapa saja yang tahu alamatnya.
        const rSalah = await fetch(jalur, {
          headers: { 'x-token': 'token-palsu', 'x-username': d.uji_user }
        });
        catat('Penolakan token palsu', rSalah.status === 401 || rSalah.status === 201,
          rSalah.status === 401 || rSalah.status === 201
            ? 'Ditolak dengan benar'
            : `BAHAYA: token palsu diterima (HTTP ${rSalah.status})`);
      }
    } catch (e) {
      catat('Sambungan', false,
        `Tidak bisa menghubungi Edge Function. Pastikan sudah dipasang: ` +
        `supabase functions deploy antrol --no-verify-jwt (${e.message})`);
    }

    kotak.innerHTML = `<div class="table-wrap"><table class="tbl">
      <tbody>${langkah.map(l => `<tr>
        <td style="width:1%" class="nowrap">
          <span class="badge ${l.ok ? 'b-selesai' : 'b-batal'}">${l.ok ? 'OK' : 'GAGAL'}</span></td>
        <td class="mono text-xs">${UI.esc(l.nama)}</td>
        <td class="text-sm">${UI.esc(l.pesan)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  async function muatUlang() {
    await muatDasar();
    gambarKesiapan(document.getElementById('kesiapan'));
    await gambarTab(document.getElementById('isiTab'));
  }

  return { render };
})();

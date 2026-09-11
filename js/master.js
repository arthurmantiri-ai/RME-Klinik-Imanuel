/* ===================== MASTER DATA (ADMIN) =====================
   Pengelolaan daftar obat, diagnosa ICD-10, dan tindakan ICD-9-CM.
   Dipisahkan dari Pengaturan karena isinya daftar klinis yang berubah
   terus, bukan konfigurasi yang sekali diatur lalu ditinggal.
   ============================================================== */
const Master = (() => {

  let tabAktif = 'obat';
  let cache = { obat: [], icd10: [], icd9: [], lab: [] };

  const GOLONGAN = ['Bebas', 'Bebas Terbatas', 'Keras', 'Narkotika', 'Psikotropika'];
  const BENTUK = ['Tablet', 'Kaplet', 'Kapsul', 'Sirup', 'Sirup kering', 'Suspensi',
                  'Serbuk', 'Krim', 'Salep', 'Gel', 'Tetes mata', 'Tetes telinga',
                  'Tetes hidung', 'Injeksi', 'Supositoria', 'Inhaler', 'Larutan'];
  const SATUAN = ['Tablet', 'Kapsul', 'Botol', 'Tube', 'Sachet', 'Ampul', 'Vial',
                  'Pot', 'Strip', 'Bungkus', 'mL'];

  /* ================================================================ *
   *  HAPUS DATA (dipakai oleh semua tab)
   *
   *  Baris master ditaut ke banyak tempat (resep, stok apotek, tindakan,
   *  hasil lab, dst). Bukan aplikasi ini yang memutuskan mana yang aman
   *  dihapus — constraint foreign key di database yang menolaknya kalau
   *  baris itu sudah pernah dipakai. Di sini kita cuma menerjemahkan
   *  penolakan itu jadi pesan yang dimengerti petugas, dan untuk "Hapus
   *  Semua" kita coba satu per satu supaya baris yang aman tetap
   *  terhapus walau ada baris lain yang ditolak.
   * ================================================================ */
  function pesanGagalHapus(e) {
    const p = ((e && e.message) || '').toLowerCase();
    if (p.includes('foreign key') || p.includes('violates'))
      return 'Sudah pernah dipakai di data lain (resep, tindakan, stok, atau hasil pasien), jadi tidak bisa dihapus. Nonaktifkan saja lewat kotak centang Aktif.';
    return (e && e.message) || 'Gagal menghapus.';
  }

  async function hapusMassal(daftar, ambilId, fnHapus) {
    let berhasil = 0; const gagal = [];
    for (const item of daftar) {
      try { await fnHapus(ambilId(item)); berhasil++; }
      catch (e) { gagal.push(item); }
    }
    return { berhasil, gagal };
  }

  function ringkasanHapus(berhasil, jmlGagal) {
    if (!jmlGagal) return `${berhasil} baris berhasil dihapus.`;
    if (!berhasil) return `Tidak ada yang terhapus — seluruh ${jmlGagal} baris masih dipakai di data lain.`;
    return `${berhasil} baris berhasil dihapus, ${jmlGagal} baris dilewati karena masih dipakai di data lain.`;
  }

  /* Konfirmasi "Hapus Semua" minta diketik ulang supaya tidak terpicu
     klik tidak sengaja — ini menghapus permanen, bukan menonaktifkan. */
  async function modalHapusSemua(label, jumlah) {
    return await UI.modal({
      judul: `Hapus semua ${label}?`,
      isi: `
        <div class="banner err mb-16">${UI.ikon('peringatan', 16)}
          <div><b>${jumlah} baris akan dicoba dihapus permanen.</b> Baris yang
          sudah pernah dipakai di data lain otomatis ditolak database dan
          tidak ikut terhapus — hanya yang belum pernah dipakai yang benar-benar
          hilang. Baris yang berhasil dihapus tidak bisa dikembalikan.</div></div>
        <div class="field mb-0"><label>Ketik <b>HAPUS</b> untuk melanjutkan</label>
          <input type="text" id="ketikHapusSemua" autocomplete="off"></div>`,
      tombol: [
        { teks: 'Batal', nilai: false },
        { teks: 'Hapus semua', kelas: 'btn-danger', aksi: (b) => {
            const v = b.querySelector('#ketikHapusSemua').value.trim().toUpperCase();
            if (v !== 'HAPUS') { UI.toast('Ketik HAPUS untuk mengonfirmasi.', 'err'); return false; }
            return true;
          } }
      ]
    }) === true;
  }

  /* 11 Sep 2026 — akses sebagian: apoteker boleh masuk Master Data untuk
     tab Obat SAJA, lewat kode `master_data_obat` (lebih sempit dari
     `master_data` yang mencakup ICD-10/ICD-9/Lab juga). `hanyaObat` dipakai
     dua kali di bawah: menyembunyikan tab lain dari tampilan, DAN memaksa
     `tabAktif` ke 'obat' walau param URL minta tab lain — supaya navigasi
     lewat tautan langsung (#/master/icd10) tidak jadi jalan pintas
     melewati pembatasan tab yang terlihat di layar. Penjaga yang sesungguhnya
     tetap di database (lihat boleh_master_data_obat() di sql/26): ini hanya
     supaya tampilannya konsisten dengan apa yang sungguh diizinkan. */
  async function render(el, param) {
    const penuh = App.boleh('master_data');
    const hanyaObat = !penuh && App.boleh('master_data_obat');
    if (!penuh && !hanyaObat) {
      el.innerHTML = UI.kosong('Akses ditolak', 'Anda tidak punya izin membuka Master Data.');
      return;
    }
    tabAktif = hanyaObat ? 'obat' : ((param && param[0]) || tabAktif);

    const daftarTab = penuh
      ? [['obat','Obat'],['icd10','Diagnosa (ICD-10)'],['icd9','Tindakan (ICD-9-CM)'],['lab','Pemeriksaan Lab']]
      : [['obat','Obat']];

    el.innerHTML = `
      <div class="mb-16">
        <h1>Master Data</h1>
        <p class="text-muted mb-0">${hanyaObat
          ? 'Daftar obat yang dipakai dokter meresepkan dan apotek mencatat stok.'
          : 'Daftar obat, diagnosa, dan tindakan yang muncul saat dokter memeriksa pasien.'}</p>
      </div>
      <div class="tabs" id="tabsMaster">
        ${daftarTab
          .map(([k,t]) => `<button class="tab ${tabAktif === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}
      </div>
      <div id="isiMaster">${UI.memuat(3)}</div>`;

    el.querySelector('#tabsMaster').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tabAktif = b.dataset.t;
      el.querySelectorAll('#tabsMaster .tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      gambarTab(el.querySelector('#isiMaster'));
    });

    await gambarTab(el.querySelector('#isiMaster'));
  }

  async function gambarTab(w) {
    w.innerHTML = UI.memuat(3);
    try {
      if (tabAktif === 'obat')  return await tabObat(w);
      if (tabAktif === 'icd10') return await tabIcd10(w);
      if (tabAktif === 'icd9')  return await tabIcd9(w);
      if (tabAktif === 'lab')   return await tabLab(w);
    } catch (e) {
      w.innerHTML = `<div class="banner err">${UI.esc(e.message)}</div>`;
    }
  }

  /* ================================================================ *
   *  OBAT
   * ================================================================ */
  async function tabObat(w) {
    w.innerHTML = `
      <div class="card">
        <div class="card-head flex-wrap gap-8">
          <div class="search-box flex-1" style="min-width:220px">
            <span class="ico">${UI.ikon('cari',16)}</span>
            <input type="search" id="cariObat" placeholder="Cari nama obat, generik, atau kode…">
          </div>
          <label class="check"><input type="checkbox" id="ikutNonaktif">
            <span class="nowrap">Tampilkan yang nonaktif</span></label>
          <button class="btn btn-secondary btn-sm" id="btnImpor">${UI.ikon('unduh',15)} Impor CSV</button>
          <button class="btn btn-secondary btn-sm" id="btnEkspor">Ekspor CSV</button>
          <button class="btn btn-secondary btn-sm" id="btnHapusSemuaObat">${UI.ikon('hapus',15)} Hapus semua</button>
          <button class="btn btn-primary btn-sm" id="btnObatBaru">${UI.ikon('plus',15)} Tambah obat</button>
        </div>
        <div class="card-body tight" id="tabelObat">${UI.memuat(4)}</div>
      </div>`;

    const muat = async () => {
      const kata = w.querySelector('#cariObat').value;
      const ikut = w.querySelector('#ikutNonaktif').checked;
      const t = w.querySelector('#tabelObat');
      t.innerHTML = UI.memuat(3);
      cache.obat = await DB.daftarObat(kata, ikut);
      gambarTabelObat(t, cache.obat);
    };

    w.querySelector('#cariObat').addEventListener('input', UI.tunda(muat, 250));
    w.querySelector('#ikutNonaktif').addEventListener('change', muat);
    w.querySelector('#btnObatBaru').addEventListener('click', async () => {
      if (await modalObat()) muat();
    });
    w.querySelector('#btnEkspor').addEventListener('click', () => eksporObat(cache.obat));
    w.querySelector('#btnImpor').addEventListener('click', async () => {
      if (await modalImporObat()) muat();
    });
    w.querySelector('#btnHapusSemuaObat').addEventListener('click', async () => {
      if (!cache.obat.length) { UI.toast('Tidak ada obat untuk dihapus.', 'warn'); return; }
      if (!await modalHapusSemua('obat yang sedang tampil', cache.obat.length)) return;
      const { berhasil, gagal } = await hapusMassal(cache.obat, (o) => o.id, DB.hapusObat);
      UI.toast(ringkasanHapus(berhasil, gagal.length), gagal.length ? 'warn' : 'ok', 6000);
      muat();
    });

    await muat();
  }

  function gambarTabelObat(t, data) {
    if (!data.length) {
      t.innerHTML = UI.kosong('Tidak ada obat', 'Ubah kata pencarian, atau tambahkan obat baru.');
      return;
    }
    t.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th style="width:90px">Kode</th><th>Nama</th><th>Bentuk</th>
        <th>Golongan</th><th style="width:110px">Kode KFA</th>
        <th style="width:100px">Formularium</th><th style="width:82px">Aktif</th>
        <th style="width:1%"></th></tr></thead>
      <tbody>${data.map((o, i) => `
        <tr>
          <td class="mono muted">${UI.esc(o.kode_internal || '—')}</td>
          <td><b>${UI.esc(o.nama)}</b>
            ${o.nama_generik && o.nama_generik !== o.nama
              ? `<div class="text-xs text-muted">${UI.esc(o.nama_generik)}</div>` : ''}</td>
          <td class="muted">${UI.esc([o.bentuk_sediaan, o.kekuatan].filter(Boolean).join(' · ') || '—')}</td>
          <td class="muted">${UI.esc(o.golongan || '—')}</td>
          <td class="mono ${o.kode_kfa ? '' : 'muted'}">${UI.esc(o.kode_kfa || '—')}</td>
          <td class="check-cell"><label class="check"><input type="checkbox" data-form="${i}"
            ${o.formularium ? 'checked' : ''}><span class="text-xs">Fornas</span></label></td>
          <td class="check-cell"><label class="check"><input type="checkbox" data-aktif-obat="${i}"
            ${o.aktif ? 'checked' : ''}><span class="text-xs">Aktif</span></label></td>
          <td class="text-right"><button class="btn btn-secondary btn-sm" data-ubah-obat="${i}">Ubah</button>
            <button class="btn btn-ghost btn-sm" data-hapus-obat="${i}">Hapus</button></td>
        </tr>`).join('')}</tbody></table></div>`;

    t.querySelectorAll('[data-ubah-obat]').forEach(b => b.addEventListener('click', async () => {
      if (await modalObat(data[+b.dataset.ubahObat])) gambarTab(document.getElementById('isiMaster'));
    }));
    t.querySelectorAll('[data-hapus-obat]').forEach(b => b.addEventListener('click', async () => {
      const o = data[+b.dataset.hapusObat];
      if (!await UI.konfirmasi(`Hapus obat "${o.nama}"?`,
          'Baris ini dihapus permanen. Kalau masih pernah dipakai di resep atau stok apotek, penghapusan akan ditolak — nonaktifkan saja lewat kotak centang Aktif.',
          'Hapus', true)) return;
      try {
        await DB.hapusObat(o.id);
        UI.toast('Obat dihapus.', 'ok');
        gambarTab(document.getElementById('isiMaster'));
      } catch (e) { UI.toast(pesanGagalHapus(e), 'err', 6000); }
    }));
    t.querySelectorAll('[data-aktif-obat]').forEach(c => c.addEventListener('change', async () => {
      const o = data[+c.dataset.aktifObat];
      try { await DB.simpanObat({ aktif: c.checked }, o.id); o.aktif = c.checked;
            UI.toast(c.checked ? 'Obat diaktifkan.' : 'Obat dinonaktifkan.', 'ok', 1600); }
      catch (e) { c.checked = !c.checked; UI.toast(e.message, 'err'); }
    }));
    t.querySelectorAll('[data-form]').forEach(c => c.addEventListener('change', async () => {
      const o = data[+c.dataset.form];
      try { await DB.simpanObat({ formularium: c.checked }, o.id); o.formularium = c.checked; }
      catch (e) { c.checked = !c.checked; UI.toast(e.message, 'err'); }
    }));
  }

  async function modalObat(obat = null) {
    const baru = !(obat && obat.id);
    const opsi = (arr, nilai) => arr.map(o =>
      `<option ${nilai === o ? 'selected' : ''}>${UI.esc(o)}</option>`).join('');

    return await UI.modal({
      judul: baru ? 'Tambah obat' : 'Ubah obat',
      lebar: true,
      isi: `<div id="galatObat"></div>
        <div class="form-row c2">
          <div class="field"><label>Nama obat <span class="req">*</span></label>
            <input type="text" name="nama" value="${UI.esc(obat?.nama)}"
              placeholder="Paracetamol 500 mg"></div>
          <div class="field"><label>Nama generik</label>
            <input type="text" name="nama_generik" value="${UI.esc(obat?.nama_generik)}"
              placeholder="Paracetamol"></div>
        </div>
        <div class="form-row c4">
          <div class="field"><label>Bentuk sediaan</label>
            <select name="bentuk_sediaan"><option value="">—</option>${opsi(BENTUK, obat?.bentuk_sediaan)}</select></div>
          <div class="field"><label>Kekuatan</label>
            <input type="text" name="kekuatan" value="${UI.esc(obat?.kekuatan)}" placeholder="500 mg"></div>
          <div class="field"><label>Satuan <span class="req">*</span></label>
            <select name="satuan">${opsi(SATUAN, obat?.satuan || 'Tablet')}</select></div>
          <div class="field"><label>Golongan</label>
            <select name="golongan"><option value="">—</option>${opsi(GOLONGAN, obat?.golongan)}</select></div>
        </div>
        <div class="form-row c3">
          <div class="field"><label>Kode internal</label>
            <input type="text" name="kode_internal" value="${UI.esc(obat?.kode_internal)}"
              placeholder="OB071">
            <div class="hint">Dipakai untuk mencocokkan baris saat impor CSV.</div></div>
          <div class="field"><label>Kode KFA</label>
            <input type="text" name="kode_kfa" value="${UI.esc(obat?.kode_kfa)}">
            <div class="hint">Kamus Farmasi &amp; Alkes — untuk SatuSehat.</div></div>
          <div class="field"><label>Kode obat PCare</label>
            <input type="text" name="kode_pcare" value="${UI.esc(obat?.kode_pcare)}">
            <div class="hint">Untuk obat program / DPHO.</div></div>
        </div>
        <div class="form-row c2 mb-0">
          <div class="field mb-0"><label>Harga <span class="opt">bila dipakai</span></label>
            <input type="number" name="harga" value="${obat?.harga ?? 0}" min="0" step="100"></div>
          <div class="field mb-0" style="align-self:end">
            <label class="check mb-8"><input type="checkbox" name="formularium"
              ${obat?.formularium ? 'checked' : ''}><span>Masuk formularium nasional</span></label>
            <label class="check mb-8"><input type="checkbox" name="dpho"
              ${obat?.dpho ? 'checked' : ''}><span>Ada di DPHO BPJS</span></label>
            <label class="check"><input type="checkbox" name="aktif"
              ${obat === null || obat.aktif ? 'checked' : ''}><span>Aktif — muncul saat dokter meresepkan</span></label>
          </div>
        </div>
        <p class="hint mt-8 mb-0">Obat bertanda DPHO dikirim ke PCare memakai
          <span class="mono">kdObat</span> di atas; yang tidak bertanda dikirim
          sebagai <span class="mono">nmObatNonDPHO</span> dengan namanya. Salah
          tanda tidak menimbulkan galat — klaim obat programnya saja yang tidak
          terbayar.</p>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: baru ? 'Simpan obat' : 'Simpan perubahan', kelas: 'btn-primary', aksi: async (b) => {
            const d = UI.nilaiForm(b);
            const g = b.querySelector('#galatObat');
            if (!d.nama || d.nama.trim().length < 2) {
              g.innerHTML = '<div class="banner err">Nama obat wajib diisi.</div>'; return false;
            }
            if (!d.satuan) {
              g.innerHTML = '<div class="banner err">Satuan wajib dipilih.</div>'; return false;
            }
            d.harga = Number(d.harga) || 0;
            if (!d.kode_internal) delete d.kode_internal;   // biarkan kosong, bukan string kosong
            try {
              return await DB.simpanObat(d, obat?.id || null);
            } catch (e) {
              g.innerHTML = `<div class="banner err">${UI.esc(
                (e.message || '').includes('duplicate')
                  ? 'Kode internal itu sudah dipakai obat lain.' : e.message)}</div>`;
              return false;
            }
        }}
      ]
    });
  }

  /* --------------------------- CSV --------------------------- */
  const KOLOM_OBAT = ['kode_internal','nama','nama_generik','bentuk_sediaan','kekuatan',
                      'satuan','golongan','kode_kfa','kode_pcare','dpho','formularium','harga'];

  function eksporObat(data) {
    if (!data.length) { UI.toast('Tidak ada data untuk diekspor.', 'warn'); return; }
    const bersih = (v) => {
      const s = (v ?? '').toString().replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const isi = [KOLOM_OBAT.join(';'),
      ...data.map(o => KOLOM_OBAT.map(k => bersih(o[k])).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `master-obat-${UI.hariIni()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast(`${data.length} obat diekspor.`, 'ok');
  }

  /* Pembaca CSV sederhana yang tetap benar bila ada tanda kutip dan
     pemisah di dalam isi sel. Menerima pemisah titik koma maupun koma. */
  function bacaCsv(teks) {
    teks = teks.replace(/^﻿/, '');
    const pemisah = (teks.split('\n')[0].match(/;/g) || []).length >=
                    (teks.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const baris = []; let sel = ''; let barisIni = []; let dalamKutip = false;

    for (let i = 0; i < teks.length; i++) {
      const c = teks[i];
      if (dalamKutip) {
        if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; }
        else if (c === '"') dalamKutip = false;
        else sel += c;
      } else if (c === '"') dalamKutip = true;
      else if (c === pemisah) { barisIni.push(sel); sel = ''; }
      else if (c === '\n') { barisIni.push(sel); baris.push(barisIni); barisIni = []; sel = ''; }
      else if (c !== '\r') sel += c;
    }
    if (sel !== '' || barisIni.length) { barisIni.push(sel); baris.push(barisIni); }
    return baris.filter(b => b.some(x => x.trim() !== ''));
  }

  function petakanBarisObat(baris) {
    if (!baris.length) return { data: [], galat: ['Berkas kosong.'] };
    const judul = baris[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const iNama = judul.indexOf('nama');
    if (iNama === -1) return { data: [], galat: ['Kolom "nama" tidak ditemukan pada baris judul.'] };

    const data = []; const galat = [];
    baris.slice(1).forEach((b, n) => {
      const rec = {};
      judul.forEach((h, i) => {
        if (!KOLOM_OBAT.includes(h)) return;
        const v = (b[i] ?? '').trim();
        if (v === '') return;
        if (h === 'formularium') rec[h] = ['1','ya','true','y','v'].includes(v.toLowerCase());
        else if (h === 'harga') rec[h] = Number(v.replace(/[^\d.]/g, '')) || 0;
        else rec[h] = v;
      });
      if (!rec.nama) { galat.push(`Baris ${n + 2}: nama obat kosong, dilewati.`); return; }
      if (!rec.satuan) rec.satuan = 'Tablet';
      if (!rec.kode_internal) {
        galat.push(`Baris ${n + 2}: kode internal kosong — baris ini akan ditambah sebagai obat baru.`);
      }
      rec.aktif = true;
      data.push(rec);
    });
    return { data, galat };
  }

  async function modalImporObat() {
    return await UI.modal({
      judul: 'Impor daftar obat dari CSV',
      lebar: true,
      isi: `
        <p class="text-sm text-muted">Berkas CSV dengan baris judul. Kolom yang dikenali:</p>
        <pre style="background:var(--ink-50);border:1px solid var(--ink-200);border-radius:6px;
                    padding:9px 12px;font-size:11.5px;overflow-x:auto;margin:0 0 14px"
        >${KOLOM_OBAT.join(';')}</pre>
        <p class="text-sm text-muted">Hanya kolom <b>nama</b> yang wajib. Baris dicocokkan
          dengan <b>kode_internal</b>, jadi impor bisa diulang untuk memperbarui data tanpa
          menggandakannya. Pemisah titik koma maupun koma sama-sama diterima.</p>
        <div class="field mt-12">
          <label>Pilih berkas CSV</label>
          <input type="file" id="berkasCsv" accept=".csv,text/csv">
        </div>
        <div id="pratinjauCsv"></div>`,
      siap: (badan) => {
        badan._dataSiap = null;
        const berkas = badan.querySelector('#berkasCsv');
        const pratinjau = badan.querySelector('#pratinjauCsv');
        berkas.addEventListener('change', () => {
          const f = berkas.files && berkas.files[0];
          if (!f) return;
          if (f.size > 3 * 1024 * 1024) {
            pratinjau.innerHTML = '<div class="banner err mt-12">Berkas terlalu besar. '
              + 'Batasnya 3 MB — pecah menjadi beberapa berkas.</div>';
            return;
          }
          const pembaca = new FileReader();
          pembaca.onload = () => {
            try {
              const { data, galat } = petakanBarisObat(bacaCsv(String(pembaca.result)));
              badan._dataSiap = data;
              pratinjau.innerHTML = `
                <div class="banner ${data.length ? 'ok' : 'err'} mt-12">
                  <div><b>${data.length} baris siap diimpor.</b>
                  ${galat.length ? `<br>${galat.length} catatan:<br>`
                    + galat.slice(0, 5).map(g => UI.esc(g)).join('<br>')
                    + (galat.length > 5 ? `<br>… dan ${galat.length - 5} lainnya` : '') : ''}</div>
                </div>
                ${data.length ? `<div class="table-wrap mt-12" style="max-height:230px;overflow-y:auto">
                  <table class="tbl"><thead><tr><th>Kode</th><th>Nama</th><th>Bentuk</th>
                    <th>Satuan</th><th>KFA</th></tr></thead>
                  <tbody>${data.slice(0, 10).map(o => `<tr>
                    <td class="mono muted">${UI.esc(o.kode_internal || '—')}</td>
                    <td>${UI.esc(o.nama)}</td>
                    <td class="muted">${UI.esc(o.bentuk_sediaan || '—')}</td>
                    <td class="muted">${UI.esc(o.satuan)}</td>
                    <td class="mono muted">${UI.esc(o.kode_kfa || '—')}</td></tr>`).join('')}
                  </tbody></table>
                  ${data.length > 10 ? `<div class="text-xs text-muted" style="padding:8px 14px">
                    Menampilkan 10 dari ${data.length} baris.</div>` : ''}
                </div>` : ''}`;
            } catch (e) {
              badan._dataSiap = null;
              pratinjau.innerHTML = `<div class="banner err mt-12">Berkas tidak bisa dibaca: ${UI.esc(e.message)}</div>`;
            }
          };
          pembaca.readAsText(f, 'utf-8');
        });
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Impor', kelas: 'btn-primary', aksi: async (b) => {
            const simpan = b._dataSiap;
            if (!simpan || !simpan.length) {
              UI.toast('Pilih berkas CSV yang valid terlebih dahulu.', 'err'); return false;
            }
            try {
              const hasil = await DB.imporObat(simpan);
              UI.toast(`${hasil.jumlah} obat berhasil diimpor.`, 'ok', 4000);
              return hasil;
            } catch (e) {
              b.querySelector('#pratinjauCsv').innerHTML =
                `<div class="banner err mt-12">${UI.esc(e.message)}</div>`;
              return false;
            }
        }}
      ]
    });
  }

  /* ================================================================ *
   *  ICD-10
   * ================================================================ */
  async function tabIcd10(w) {
    w.innerHTML = `
      <div class="banner info">
        <div>Diagnosa yang ditandai <b>sering dipakai</b> muncul sebagai tombol cepat
          di layar dokter, jadi tidak perlu diketik berulang.</div>
      </div>
      <div class="card">
        <div class="card-head flex-wrap gap-8">
          <div class="search-box flex-1" style="min-width:220px">
            <span class="ico">${UI.ikon('cari',16)}</span>
            <input type="search" id="cariIcd" placeholder="Cari kode atau nama diagnosa…">
          </div>
          <label class="check"><input type="checkbox" id="hanyaFav">
            <span class="nowrap">Hanya yang sering dipakai</span></label>
          <button class="btn btn-secondary btn-sm" id="btnHapusSemuaIcd">${UI.ikon('hapus',15)} Hapus semua</button>
          <button class="btn btn-primary btn-sm" id="btnIcdBaru">${UI.ikon('plus',15)} Tambah diagnosa</button>
        </div>
        <div class="card-body tight" id="tabelIcd">${UI.memuat(4)}</div>
      </div>`;

    const muat = async () => {
      const t = w.querySelector('#tabelIcd');
      t.innerHTML = UI.memuat(3);
      cache.icd10 = await DB.daftarIcd10(w.querySelector('#cariIcd').value,
                                         w.querySelector('#hanyaFav').checked);
      gambarTabelIcd10(t, cache.icd10);
    };
    w.querySelector('#cariIcd').addEventListener('input', UI.tunda(muat, 250));
    w.querySelector('#hanyaFav').addEventListener('change', muat);
    w.querySelector('#btnIcdBaru').addEventListener('click', async () => {
      if (await modalIcd10()) muat();
    });
    w.querySelector('#btnHapusSemuaIcd').addEventListener('click', async () => {
      if (!cache.icd10.length) { UI.toast('Tidak ada diagnosa untuk dihapus.', 'warn'); return; }
      if (!await modalHapusSemua('diagnosa ICD-10 yang sedang tampil', cache.icd10.length)) return;
      const { berhasil, gagal } = await hapusMassal(cache.icd10, (d) => d.kode, DB.hapusIcd10);
      UI.toast(ringkasanHapus(berhasil, gagal.length), gagal.length ? 'warn' : 'ok', 6000);
      muat();
    });
    await muat();
  }

  function gambarTabelIcd10(t, data) {
    if (!data.length) { t.innerHTML = UI.kosong('Tidak ada diagnosa', 'Ubah kata pencarian.'); return; }
    t.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th style="width:86px">Kode</th><th>Nama Indonesia</th><th>Nama Inggris</th>
        <th style="width:140px">Kategori</th><th style="width:132px">Sering dipakai</th>
        <th style="width:76px">Aktif</th><th style="width:1%"></th></tr></thead>
      <tbody>${data.map((d, i) => `
        <tr>
          <td class="mono"><b>${UI.esc(d.kode)}</b></td>
          <td>${UI.esc(d.nama_id || '—')}</td>
          <td class="muted">${UI.esc(d.nama_en || '—')}</td>
          <td class="muted">${UI.esc(d.kategori || '—')}</td>
          <td class="check-cell"><label class="check"><input type="checkbox" data-fav="${i}"
            ${d.sering_dipakai ? 'checked' : ''}><span class="text-xs">Tombol cepat</span></label></td>
          <td class="check-cell"><label class="check"><input type="checkbox" data-aktif-icd="${i}"
            ${d.aktif ? 'checked' : ''}><span class="text-xs">Aktif</span></label></td>
          <td class="text-right"><button class="btn btn-secondary btn-sm" data-ubah-icd="${i}">Ubah</button>
            <button class="btn btn-ghost btn-sm" data-hapus-icd="${i}">Hapus</button></td>
        </tr>`).join('')}</tbody></table></div>`;

    t.querySelectorAll('[data-fav]').forEach(c => c.addEventListener('change', async () => {
      const d = data[+c.dataset.fav];
      try { await DB.simpanIcd10({ sering_dipakai: c.checked }, d.kode); d.sering_dipakai = c.checked; }
      catch (e) { c.checked = !c.checked; UI.toast(e.message, 'err'); }
    }));
    t.querySelectorAll('[data-aktif-icd]').forEach(c => c.addEventListener('change', async () => {
      const d = data[+c.dataset.aktifIcd];
      try { await DB.simpanIcd10({ aktif: c.checked }, d.kode); d.aktif = c.checked; }
      catch (e) { c.checked = !c.checked; UI.toast(e.message, 'err'); }
    }));
    t.querySelectorAll('[data-ubah-icd]').forEach(b => b.addEventListener('click', async () => {
      if (await modalIcd10(data[+b.dataset.ubahIcd])) gambarTab(document.getElementById('isiMaster'));
    }));
    t.querySelectorAll('[data-hapus-icd]').forEach(b => b.addEventListener('click', async () => {
      const d = data[+b.dataset.hapusIcd];
      if (!await UI.konfirmasi(`Hapus diagnosa ${d.kode}?`,
          'Baris ini dihapus permanen. Kalau masih dipakai sebagai diagnosa pada suatu kunjungan, penghapusan akan ditolak — nonaktifkan saja lewat kotak centang Aktif.',
          'Hapus', true)) return;
      try {
        await DB.hapusIcd10(d.kode);
        UI.toast('Diagnosa dihapus.', 'ok');
        gambarTab(document.getElementById('isiMaster'));
      } catch (e) { UI.toast(pesanGagalHapus(e), 'err', 6000); }
    }));
  }

  async function modalIcd10(d = null) {
    const baru = !d;
    return await UI.modal({
      judul: baru ? 'Tambah diagnosa ICD-10' : `Ubah diagnosa ${d.kode}`,
      isi: `<div id="galatIcd"></div>
        <div class="form-row c2">
          <div class="field"><label>Kode ICD-10 <span class="req">*</span></label>
            <input type="text" name="kode" value="${UI.esc(d?.kode)}" ${baru ? '' : 'disabled'}
              placeholder="J06.9" maxlength="10"></div>
          <div class="field"><label>Kategori</label>
            <input type="text" name="kategori" value="${UI.esc(d?.kategori)}"
              placeholder="Saluran Napas"></div>
        </div>
        <div class="field"><label>Nama Indonesia <span class="req">*</span></label>
          <input type="text" name="nama_id" value="${UI.esc(d?.nama_id)}"
            placeholder="ISPA (Infeksi Saluran Napas Atas)"></div>
        <div class="field"><label>Nama Inggris</label>
          <input type="text" name="nama_en" value="${UI.esc(d?.nama_en)}"></div>
        <div class="field mb-0">
          <label class="check mb-8"><input type="checkbox" name="sering_dipakai"
            ${d?.sering_dipakai ? 'checked' : ''}><span>Tampilkan sebagai tombol cepat di layar dokter</span></label>
          <label class="check"><input type="checkbox" name="aktif"
            ${d === null || d.aktif ? 'checked' : ''}><span>Aktif</span></label>
        </div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (b) => {
            const v = UI.nilaiForm(b);
            const g = b.querySelector('#galatIcd');
            if (baru && !v.kode) { g.innerHTML = '<div class="banner err">Kode wajib diisi.</div>'; return false; }
            if (!v.nama_id) { g.innerHTML = '<div class="banner err">Nama Indonesia wajib diisi.</div>'; return false; }
            if (baru) v.kode = v.kode.toUpperCase().trim();
            try { return await DB.simpanIcd10(baru ? v : { ...v, kode: undefined }, baru ? null : d.kode); }
            catch (e) {
              g.innerHTML = `<div class="banner err">${UI.esc(
                (e.message || '').includes('duplicate') ? 'Kode itu sudah ada.' : e.message)}</div>`;
              return false;
            }
        }}
      ]
    });
  }

  /* ================================================================ *
   *  ICD-9-CM
   * ================================================================ */
  async function tabIcd9(w) {
    w.innerHTML = `
      <div class="card">
        <div class="card-head flex-wrap gap-8">
          <div class="search-box flex-1" style="min-width:200px">
            <span class="ico">${UI.ikon('cari',16)}</span>
            <input type="search" id="cariT" placeholder="Cari kode atau nama tindakan…">
          </div>
          <select id="filterKategori" style="width:auto">
            <option value="">Semua kategori</option>
            <option value="GIGI">Gigi</option>
            <option value="UMUM">Umum</option>
            <option value="PENUNJANG">Penunjang</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="btnHapusSemuaT">${UI.ikon('hapus',15)} Hapus semua</button>
          <button class="btn btn-primary btn-sm" id="btnTBaru">${UI.ikon('plus',15)} Tambah tindakan</button>
        </div>
        <div class="card-body tight" id="tabelT">${UI.memuat(4)}</div>
      </div>`;

    const muat = async () => {
      const t = w.querySelector('#tabelT');
      t.innerHTML = UI.memuat(3);
      cache.icd9 = await DB.daftarIcd9(w.querySelector('#cariT').value,
                                       w.querySelector('#filterKategori').value || null);
      gambarTabelIcd9(t, cache.icd9);
    };
    w.querySelector('#cariT').addEventListener('input', UI.tunda(muat, 250));
    w.querySelector('#filterKategori').addEventListener('change', muat);
    w.querySelector('#btnTBaru').addEventListener('click', async () => {
      if (await modalIcd9()) muat();
    });
    w.querySelector('#btnHapusSemuaT').addEventListener('click', async () => {
      if (!cache.icd9.length) { UI.toast('Tidak ada tindakan untuk dihapus.', 'warn'); return; }
      if (!await modalHapusSemua('tindakan ICD-9-CM yang sedang tampil', cache.icd9.length)) return;
      const { berhasil, gagal } = await hapusMassal(cache.icd9, (d) => d.kode, DB.hapusIcd9);
      UI.toast(ringkasanHapus(berhasil, gagal.length), gagal.length ? 'warn' : 'ok', 6000);
      muat();
    });
    await muat();
  }

  function gambarTabelIcd9(t, data) {
    if (!data.length) { t.innerHTML = UI.kosong('Tidak ada tindakan', 'Ubah kata pencarian.'); return; }
    t.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th style="width:86px">Kode</th><th>Nama tindakan</th>
        <th style="width:110px">Kategori</th><th style="width:128px">Perlu nomor gigi</th>
        <th style="width:132px">Sering dipakai</th><th style="width:76px">Aktif</th>
        <th style="width:1%"></th></tr></thead>
      <tbody>${data.map((d, i) => `
        <tr>
          <td class="mono"><b>${UI.esc(d.kode)}</b></td>
          <td>${UI.esc(d.nama_id)}
            ${d.nama_en ? `<div class="text-xs text-muted">${UI.esc(d.nama_en)}</div>` : ''}</td>
          <td><span class="badge ${d.kategori === 'GIGI' ? 'b-bpjs' : 'b-umum'}">${UI.esc(d.kategori || '—')}</span></td>
          <td class="check-cell"><label class="check"><input type="checkbox" data-gigi="${i}"
            ${d.per_gigi ? 'checked' : ''}><span class="text-xs">Per gigi</span></label></td>
          <td class="check-cell"><label class="check"><input type="checkbox" data-favt="${i}"
            ${d.sering_dipakai ? 'checked' : ''}><span class="text-xs">Sering</span></label></td>
          <td class="check-cell"><label class="check"><input type="checkbox" data-aktift="${i}"
            ${d.aktif ? 'checked' : ''}><span class="text-xs">Aktif</span></label></td>
          <td class="text-right"><button class="btn btn-secondary btn-sm" data-ubah-t="${i}">Ubah</button>
            <button class="btn btn-ghost btn-sm" data-hapus-t="${i}">Hapus</button></td>
        </tr>`).join('')}</tbody></table></div>`;

    const ubah = async (d, patch, kotak) => {
      try { await DB.simpanIcd9(patch, d.kode); Object.assign(d, patch); }
      catch (e) { kotak.checked = !kotak.checked; UI.toast(e.message, 'err'); }
    };
    t.querySelectorAll('[data-gigi]').forEach(c => c.addEventListener('change', () =>
      ubah(data[+c.dataset.gigi], { per_gigi: c.checked }, c)));
    t.querySelectorAll('[data-favt]').forEach(c => c.addEventListener('change', () =>
      ubah(data[+c.dataset.favt], { sering_dipakai: c.checked }, c)));
    t.querySelectorAll('[data-aktift]').forEach(c => c.addEventListener('change', () =>
      ubah(data[+c.dataset.aktift], { aktif: c.checked }, c)));
    t.querySelectorAll('[data-ubah-t]').forEach(b => b.addEventListener('click', async () => {
      if (await modalIcd9(data[+b.dataset.ubahT])) gambarTab(document.getElementById('isiMaster'));
    }));
    t.querySelectorAll('[data-hapus-t]').forEach(b => b.addEventListener('click', async () => {
      const d = data[+b.dataset.hapusT];
      if (!await UI.konfirmasi(`Hapus tindakan ${d.kode}?`,
          'Baris ini dihapus permanen. Kalau masih dipakai sebagai tindakan pada suatu kunjungan atau tarif kasir, penghapusan akan ditolak — nonaktifkan saja lewat kotak centang Aktif.',
          'Hapus', true)) return;
      try {
        await DB.hapusIcd9(d.kode);
        UI.toast('Tindakan dihapus.', 'ok');
        gambarTab(document.getElementById('isiMaster'));
      } catch (e) { UI.toast(pesanGagalHapus(e), 'err', 6000); }
    }));
  }

  async function modalIcd9(d = null) {
    const baru = !d;
    return await UI.modal({
      judul: baru ? 'Tambah tindakan ICD-9-CM' : `Ubah tindakan ${d.kode}`,
      isi: `<div id="galatT"></div>
        <div class="form-row c2">
          <div class="field"><label>Kode ICD-9-CM <span class="req">*</span></label>
            <input type="text" name="kode" value="${UI.esc(d?.kode)}" ${baru ? '' : 'disabled'}
              placeholder="23.09" maxlength="10"></div>
          <div class="field"><label>Kategori</label>
            <select name="kategori">
              ${['GIGI','UMUM','PENUNJANG'].map(k =>
                `<option ${(d?.kategori || 'UMUM') === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select></div>
        </div>
        <div class="field"><label>Nama tindakan <span class="req">*</span></label>
          <input type="text" name="nama_id" value="${UI.esc(d?.nama_id)}"
            placeholder="Pencabutan gigi tetap"></div>
        <div class="field"><label>Nama Inggris</label>
          <input type="text" name="nama_en" value="${UI.esc(d?.nama_en)}"></div>
        <div class="field"><label>Kode tindakan PCare</label>
          <input type="text" name="kode_pcare" value="${UI.esc(d?.kode_pcare)}" class="mono">
          <div class="hint">Diisi dari referensi tindakan BPJS. Tindakan tanpa kode ini
            tercatat di rekam medis tetapi tidak bisa dikirim sebagai tindakan PCare.</div></div>
        <div class="field mb-0">
          <label class="check mb-8"><input type="checkbox" name="per_gigi"
            ${d?.per_gigi ? 'checked' : ''}><span>Tindakan pada satu gigi tertentu — meminta nomor gigi</span></label>
          <label class="check mb-8"><input type="checkbox" name="sering_dipakai"
            ${d?.sering_dipakai ? 'checked' : ''}><span>Tampilkan lebih dulu saat dicari</span></label>
          <label class="check"><input type="checkbox" name="aktif"
            ${d === null || d.aktif ? 'checked' : ''}><span>Aktif</span></label>
        </div>`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (b) => {
            const v = UI.nilaiForm(b);
            const g = b.querySelector('#galatT');
            if (baru && !v.kode) { g.innerHTML = '<div class="banner err">Kode wajib diisi.</div>'; return false; }
            if (!v.nama_id) { g.innerHTML = '<div class="banner err">Nama tindakan wajib diisi.</div>'; return false; }
            if (baru) v.kode = v.kode.trim();
            try { return await DB.simpanIcd9(baru ? v : { ...v, kode: undefined }, baru ? null : d.kode); }
            catch (e) {
              g.innerHTML = `<div class="banner err">${UI.esc(
                (e.message || '').includes('duplicate') ? 'Kode itu sudah ada.' : e.message)}</div>`;
              return false;
            }
        }}
      ]
    });
  }


  /* ================================================================ *
   *  PEMERIKSAAN LABORATORIUM
   *
   *  Yang paling penting di layar ini bukan daftar pemeriksaannya,
   *  melainkan NILAI RUJUKANNYA. Nilai bawaan yang ikut terpasang adalah
   *  nilai umum yang lazim dipakai di Indonesia, BUKAN nilai alat yang
   *  dipakai klinik ini — dan alat berbeda punya rentang berbeda. Karena
   *  itu peringatannya dipasang di atas layar, bukan di catatan kaki.
   * ================================================================ */
  const KELOMPOK_LAB = ['Hematologi', 'Kimia Klinik', 'Urinalisis', 'Imunoserologi',
                        'Mikrobiologi', 'Feses', 'Lainnya'];

  async function tabLab(w) {
    w.innerHTML = `
      <div class="banner warn mb-16">${UI.ikon('peringatan',16)}
        <div><b>Cocokkan nilai rujukan dengan alat klinik sebelum lab dipakai melayani pasien.</b>
        Nilai bawaan di bawah ini nilai umum, bukan nilai alat Anda; yang sah adalah yang
        tercetak pada sisipan reagen. Memperbaikinya sekarang tidak mengubah hasil yang
        sudah pernah keluar — tiap lembar hasil menyimpan salinan nilai rujukan yang
        berlaku saat itu.</div></div>

      <div class="card">
        <div class="card-head">
          <div class="flex-1"><h2>Pemeriksaan laboratorium</h2>
            <div class="sub">Daftar pemeriksaan, satuannya, dan nilai rujukannya</div></div>
          <button class="btn btn-secondary btn-sm" id="btnHapusSemuaLab">${UI.ikon('hapus',15)} Hapus semua</button>
          <button class="btn btn-primary btn-sm" id="btnLabBaru">${UI.ikon('plus',15)} Tambah</button>
        </div>
        <div class="card-body">
          <div class="search-box"><span class="ico">${UI.ikon('cari',16)}</span>
            <input type="text" id="cariLab" placeholder="Cari nama atau kode pemeriksaan…"></div>
        </div>
        <div class="card-body tight" id="tabelLab">${UI.memuat(4)}</div>
      </div>`;

    cache.lab = await DB.refLab(false);
    const labTerfilter = () => {
      const k = (w.querySelector('#cariLab').value || '').toLowerCase();
      return cache.lab.filter(m => !k || m.nama.toLowerCase().includes(k) || m.kode.toLowerCase().includes(k));
    };
    const gambar = () => gambarTabelLab(w.querySelector('#tabelLab'), labTerfilter());
    w.querySelector('#cariLab').addEventListener('input', UI.tunda(gambar, 200));
    w.querySelector('#btnLabBaru').addEventListener('click', async () => {
      if (await modalLab(null)) {
        cache.lab = await DB.refLab(false);
        gambar();
      }
    });
    w.querySelector('#btnHapusSemuaLab').addEventListener('click', async () => {
      const daftar = labTerfilter();
      if (!daftar.length) { UI.toast('Tidak ada pemeriksaan untuk dihapus.', 'warn'); return; }
      if (!await modalHapusSemua('pemeriksaan lab yang sedang tampil', daftar.length)) return;
      const { berhasil, gagal } = await hapusMassal(daftar, (m) => m.id, DB.hapusLab);
      UI.toast(ringkasanHapus(berhasil, gagal.length), gagal.length ? 'warn' : 'ok', 6000);
      cache.lab = await DB.refLab(false);
      gambar();
    });
    w.querySelector('#tabelLab').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-lab]'); if (!b) return;
      const m = cache.lab.find(x => x.id === b.dataset.lab);
      if (b.dataset.aksi === 'rujukan') { await modalRujukan(m); }
      else if (b.dataset.aksi === 'hapus') {
        if (!await UI.konfirmasi(`Hapus pemeriksaan "${m.nama}"?`,
            'Baris ini beserta nilai rujukannya dihapus permanen. Kalau pemeriksaan ini sudah pernah punya hasil pasien, penghapusan akan ditolak — nonaktifkan saja lewat kotak centang Aktif.',
            'Hapus', true)) return;
        try { await DB.hapusLab(m.id); UI.toast('Pemeriksaan dihapus.', 'ok'); }
        catch (e2) { UI.toast(pesanGagalHapus(e2), 'err', 6000); return; }
      }
      else if (!await modalLab(m)) return;
      cache.lab = await DB.refLab(false);
      gambar();
    });
    gambar();
  }

  function gambarTabelLab(t, data) {
    if (!data.length) {
      t.innerHTML = UI.kosong('Tidak ada pemeriksaan', 'Coba kata kunci lain.');
      return;
    }
    t.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th style="width:90px">Kode</th><th>Pemeriksaan</th>
        <th style="width:130px">Kelompok</th><th style="width:80px">Satuan</th>
        <th style="width:90px">Jenis</th><th style="width:120px">Nilai rujukan</th>
        <th style="width:170px"></th></tr></thead>
      <tbody>${data.map(m => `<tr ${m.aktif ? '' : 'style="opacity:.55"'}>
        <td class="mono"><b>${UI.esc(m.kode)}</b></td>
        <td>${UI.esc(m.nama)}${m.aktif ? '' : ' <span class="badge b-batal">nonaktif</span>'}</td>
        <td class="muted">${UI.esc(m.kelompok)}</td>
        <td class="muted">${UI.esc(m.satuan || '—')}</td>
        <td class="muted">${UI.esc(m.jenis_nilai)}</td>
        <td>${(m.rujukan || []).length
          ? `<span class="badge b-ok">${m.rujukan.length} baris</span>`
          : `<span class="badge b-warn">belum ada</span>`}</td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm" data-lab="${m.id}" data-aksi="rujukan">Nilai rujukan</button>
          <button class="btn btn-ghost btn-sm" data-lab="${m.id}" data-aksi="ubah">Ubah</button>
          <button class="btn btn-ghost btn-sm" data-lab="${m.id}" data-aksi="hapus">Hapus</button>
        </td></tr>`).join('')}</tbody></table></div>`;
  }

  async function modalLab(m) {
    const hasil = await UI.modal({
      judul: m ? 'Ubah pemeriksaan' : 'Tambah pemeriksaan laboratorium',
      isi: `
        <div class="form-row c2">
          <div class="field"><label for="lbKode">Kode internal</label>
            <input type="text" id="lbKode" value="${UI.esc(m?.kode || '')}"
              placeholder="mis. HB" ${m ? 'readonly' : ''}></div>
          <div class="field"><label for="lbKelompok">Kelompok</label>
            <select id="lbKelompok">${KELOMPOK_LAB.map(k =>
              `<option ${m?.kelompok === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="lbNama">Nama pemeriksaan</label>
          <input type="text" id="lbNama" value="${UI.esc(m?.nama || '')}"></div>
        <div class="form-row c3">
          <div class="field"><label for="lbSatuan">Satuan <span class="opt">opsional</span></label>
            <input type="text" id="lbSatuan" value="${UI.esc(m?.satuan || '')}" placeholder="g/dL"></div>
          <div class="field"><label for="lbJenis">Jenis nilai</label>
            <select id="lbJenis">
              <option value="ANGKA"   ${m?.jenis_nilai === 'ANGKA'   ? 'selected' : ''}>Angka</option>
              <option value="PILIHAN" ${m?.jenis_nilai === 'PILIHAN' ? 'selected' : ''}>Pilihan</option>
              <option value="TEKS"    ${m?.jenis_nilai === 'TEKS'    ? 'selected' : ''}>Teks bebas</option>
            </select></div>
          <div class="field"><label for="lbDesimal">Angka di belakang koma</label>
            <input type="number" id="lbDesimal" min="0" max="4" value="${m?.desimal ?? 1}"></div>
        </div>
        <div class="hint mb-12">Angka di belakang koma juga menentukan cara aplikasi membaca
          ketikan petugas: pemeriksaan tanpa desimal membaca "7.500" sebagai 7500,
          yang berdesimal membaca "1.005" sebagai 1,005.</div>
        <div class="field"><label for="lbPilihan">Daftar pilihan
            <span class="opt">pisahkan dengan koma, hanya untuk jenis Pilihan</span></label>
          <input type="text" id="lbPilihan" value="${UI.esc((m?.pilihan || []).join(', '))}"
            placeholder="Negatif, Positif"></div>
        <div class="field"><label for="lbNormal">Jawaban yang dianggap normal
            <span class="opt">untuk jenis Pilihan / Teks</span></label>
          <input type="text" id="lbNormal" value="${UI.esc(m?.teks_normal || '')}" placeholder="Negatif"></div>
        <div class="form-row c2">
          <div class="field mb-0"><label for="lbLoinc">Kode LOINC
              <span class="opt">diisi setelah terdaftar SatuSehat</span></label>
            <input type="text" id="lbLoinc" value="${UI.esc(m?.kode_loinc || '')}"></div>
          <div class="field mb-0"><label for="lbUrutan">Urutan tampil</label>
            <input type="number" id="lbUrutan" value="${m?.urutan ?? 0}"></div>
        </div>
        ${m ? `<label class="check mt-16"><input type="checkbox" id="lbAktif"
          ${m.aktif ? 'checked' : ''}><span>Aktif — muncul saat dokter meminta pemeriksaan</span></label>` : ''}`,
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: 'Simpan', kelas: 'btn-primary', aksi: async (b) => {
            const kode = b.querySelector('#lbKode').value.trim().toUpperCase();
            const nama = b.querySelector('#lbNama').value.trim();
            if (!kode || !nama) { UI.toast('Kode dan nama wajib diisi.', 'err'); return false; }
            const pil = b.querySelector('#lbPilihan').value.split(',')
              .map(x => x.trim()).filter(Boolean);
            try {
              await DB.simpanRefLab({
                id: m ? m.id : undefined,
                kode, nama,
                kelompok: b.querySelector('#lbKelompok').value,
                satuan: b.querySelector('#lbSatuan').value.trim() || null,
                jenis_nilai: b.querySelector('#lbJenis').value,
                desimal: Math.max(0, Math.min(4, Number(b.querySelector('#lbDesimal').value) || 0)),
                pilihan: pil.length ? pil : null,
                teks_normal: b.querySelector('#lbNormal').value.trim() || null,
                kode_loinc: b.querySelector('#lbLoinc').value.trim() || null,
                urutan: Number(b.querySelector('#lbUrutan').value) || 0,
                aktif: m ? b.querySelector('#lbAktif').checked : true
              });
              UI.toast('Tersimpan.');
              return true;
            } catch (e) {
              UI.toast((e.message || '').includes('duplicate')
                ? 'Kode itu sudah dipakai pemeriksaan lain.'
                : (e.message || 'Gagal menyimpan.'), 'err');
              return false;
            }
          } }
      ]
    });
    return hasil === true;
  }

  /* Nilai rujukan per jenis kelamin dan rentang umur. Umur diisi dalam
     TAHUN di layar tetapi disimpan dalam BULAN: rentang bayi hanya masuk
     akal dalam bulan, sedangkan petugas berpikir dalam tahun. */
  async function modalRujukan(m) {
    const keTahun = (bulan) => bulan === null || bulan === undefined ? null : bulan / 12;

    const gambar = (b) => {
      const daftar = (m.rujukan || []).slice().sort((x, y) =>
        String(x.jenis_kelamin || '').localeCompare(String(y.jenis_kelamin || '')) ||
        (x.umur_min_bulan || 0) - (y.umur_min_bulan || 0));
      b.querySelector('#daftarRuj').innerHTML = !daftar.length
        ? `<div class="banner warn mb-0">${UI.ikon('peringatan',16)}<div>Belum ada nilai rujukan.
             Selama kosong, hasil pemeriksaan ini tidak akan ditandai Tinggi atau Rendah.</div></div>`
        : `<div class="table-wrap"><table class="tbl">
            <thead><tr><th>Berlaku untuk</th><th>Umur</th><th>Normal</th>
              <th>Kritis (bawah / atas)</th><th></th></tr></thead>
            <tbody>${daftar.map(r => `<tr>
              <td>${r.jenis_kelamin === 'L' ? 'Laki-laki'
                   : r.jenis_kelamin === 'P' ? 'Perempuan' : 'Semua'}</td>
              <td class="muted">${r.umur_min_bulan == null && r.umur_max_bulan == null
                ? 'semua umur'
                : `${keTahun(r.umur_min_bulan) ?? 0} – ${r.umur_max_bulan == null
                    ? '∞' : keTahun(r.umur_max_bulan)} th`}</td>
              <td class="mono">${UI.esc(LabCore.teksRujukan(r, m) || '—')}</td>
              <td class="mono muted">${r.kritis_bawah ?? '—'} / ${r.kritis_atas ?? '—'}</td>
              <td class="text-right"><button class="btn btn-ghost btn-sm"
                data-hapus-ruj="${r.id}">Hapus</button></td>
            </tr>`).join('')}</tbody></table></div>`;

      b.querySelectorAll('[data-hapus-ruj]').forEach(x => x.addEventListener('click', async () => {
        if (!await UI.konfirmasi('Hapus baris nilai rujukan?',
          'Hasil yang sudah pernah keluar tidak ikut berubah — masing-masing menyimpan salinannya sendiri.',
          'Hapus', true)) return;
        try {
          await DB.hapusRujukan(x.dataset.hapusRuj);
          m.rujukan = (m.rujukan || []).filter(r => r.id !== x.dataset.hapusRuj);
          gambar(b);
        } catch (e) { UI.toast(e.message || 'Gagal menghapus.', 'err'); }
      }));
    };

    await UI.modal({
      judul: 'Nilai rujukan — ' + m.nama,
      lebar: true,
      isi: `
        <div id="daftarRuj" class="mb-16"></div>
        <div class="fieldset"><legend>Tambah baris</legend>
          <div class="form-row c3">
            <div class="field"><label for="rjJk">Berlaku untuk</label>
              <select id="rjJk"><option value="">Semua</option>
                <option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
            <div class="field"><label for="rjUmin">Umur dari (tahun)</label>
              <input type="number" id="rjUmin" step="0.01" placeholder="0"></div>
            <div class="field"><label for="rjUmax">Sampai (tahun)</label>
              <input type="number" id="rjUmax" step="0.01" placeholder="kosong = tanpa batas"></div>
          </div>
          <div class="form-row c4">
            <div class="field"><label for="rjBawah">Batas bawah</label>
              <input type="number" id="rjBawah" step="any"></div>
            <div class="field"><label for="rjAtas">Batas atas</label>
              <input type="number" id="rjAtas" step="any"></div>
            <div class="field"><label for="rjKb">Kritis bawah</label>
              <input type="number" id="rjKb" step="any"></div>
            <div class="field"><label for="rjKa">Kritis atas</label>
              <input type="number" id="rjKa" step="any"></div>
          </div>
          <div class="field"><label for="rjTeks">Teks pada lembar hasil
              <span class="opt">kosongkan untuk dibentuk otomatis dari batasnya</span></label>
            <input type="text" id="rjTeks" placeholder="mis. &lt; 200"></div>
          <div class="hint mb-0">Nilai kritis adalah hasil yang harus segera diberitahukan ke
            dokter, bukan sekadar di luar rentang normal. Kosongkan bila tidak dipakai.</div>
          <button class="btn btn-secondary btn-sm mt-16" id="btnTambahRuj">Tambah baris</button>
        </div>`,
      siap: (b) => {
        gambar(b);
        b.querySelector('#btnTambahRuj').addEventListener('click', async () => {
          const ang = (id) => {
            const v = b.querySelector(id).value.trim();
            return v === '' ? null : Number(v);
          };
          const uminTh = ang('#rjUmin'), umaxTh = ang('#rjUmax');
          const patch = {
            lab_id: m.id,
            jenis_kelamin: b.querySelector('#rjJk').value || null,
            umur_min_bulan: uminTh === null ? null : Math.round(uminTh * 12),
            umur_max_bulan: umaxTh === null ? null : Math.round(umaxTh * 12),
            batas_bawah: ang('#rjBawah'), batas_atas: ang('#rjAtas'),
            kritis_bawah: ang('#rjKb'),   kritis_atas: ang('#rjKa'),
            teks: b.querySelector('#rjTeks').value.trim() || null
          };
          if (patch.batas_bawah === null && patch.batas_atas === null && !patch.teks) {
            UI.toast('Isi minimal batas bawah, batas atas, atau teks rujukan.', 'err');
            return;
          }
          try {
            const baru = await DB.simpanRujukan(patch);
            m.rujukan = (m.rujukan || []).concat(baru);
            b.querySelectorAll('.fieldset input').forEach(i => { i.value = ''; });
            gambar(b);
            UI.toast('Baris nilai rujukan ditambahkan.');
          } catch (e) { UI.toast(e.message || 'Gagal menambah.', 'err'); }
        });
      },
      tombol: [{ teks: 'Tutup', nilai: true, kelas: 'btn-primary' }]
    });
  }

  return { render, bacaCsv, petakanBarisObat, modalObat };
})();

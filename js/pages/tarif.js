/* =====================================================================
   TARIF & TAMPILAN INVOICE — halaman admin.

   Dua hal yang dikelola di sini:
     1. Master tarif tindakan & layanan, BERVERSI. Tarif naik itu wajar;
        yang tidak boleh adalah tagihan bulan lalu ikut berubah karenanya.
        Karena itu tarif tidak pernah disunting di tempat — menaikkan
        tarif berarti membuat baris baru dengan tanggal berlaku baru.
     2. Tampilan invoice PDF & struk thermal, disimpan sebagai satu baris
        JSON di sys_template_invoice. Tidak ada deploy, tidak ada
        perubahan kode.
   ===================================================================== */
const Tarif = (() => {

  let tab = 'tarif';
  let daftar = [];
  let icd9 = [];
  let tersimpan = null;       // salinan template yang berlaku di database
  let contohLunas = true;
  let lebarPratinjau = 58;

  const rp = (n) => UI.rupiah(n);

  async function render(el) {
    el.innerHTML = `
      <div class="mb-16">
        <h1>Tarif &amp; tampilan invoice</h1>
        <p class="text-muted mb-0">Dipakai kasir saat menyusun tagihan dan mencetak kwitansi.</p>
      </div>
      <div class="tabs" id="tabTarif">
        <button class="tab" data-t="tarif">Tarif layanan</button>
        <button class="tab" data-t="invoice">Tampilan invoice</button>
      </div>
      <div id="isiTarif"></div>`;

    el.querySelector('#tabTarif').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tab = b.dataset.t; gambar();
    });
    await gambar();
  }

  async function gambar() {
    document.querySelectorAll('#tabTarif .tab').forEach(b =>
      b.classList.toggle('on', b.dataset.t === tab));
    const el = document.getElementById('isiTarif');
    el.innerHTML = UI.memuat(3);
    if (tab === 'tarif') await gambarTarif(el);
    else await gambarInvoice(el);
  }

  /* ==================================================================
     TAB 1 — MASTER TARIF
     ================================================================== */
  async function gambarTarif(el) {
    daftar = await DB.daftarTarif({ ikutNonaktif: true });

    /* Hanya baris terbaru per kode yang benar-benar berlaku. Versi lama
       tetap ditampilkan sebagai riwayat, karena tagihan lama merujuk
       nilainya dan menghapusnya membuat riwayat tidak bisa dijelaskan. */
    const terbaru = {};
    daftar.filter(t => t.aktif).forEach(t => {
      const k = t.kode_icd9 || t.id;
      if (!terbaru[k] || t.berlaku_mulai > terbaru[k].berlaku_mulai) terbaru[k] = t;
    });

    el.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div style="flex:1"><h2>Tarif tindakan &amp; layanan</h2>
            <div class="sub">Tarif disalin ke tagihan saat disusun, jadi kenaikan tarif
              tidak pernah mengubah tagihan yang sudah terbit.</div></div>
          <button class="btn btn-primary btn-sm" id="btnTarifBaru">${UI.ikon('plus',15)} Tarif baru</button>
        </div>
        <div class="card-body tight">
          ${!daftar.length ? UI.kosong('Belum ada tarif',
              'Tanpa tarif, tindakan tetap masuk tagihan dengan harga Rp 0 dan ditandai '
              + '"tarif belum diisi" — supaya ketahuan, bukan hilang diam-diam.')
            : `<div class="table-wrap"><table class="tbl"><thead><tr>
              <th>Jenis</th><th>Nama</th><th>Kode</th><th class="text-right">Tarif</th>
              <th>Berlaku sejak</th><th>Status</th><th style="width:1%"></th>
            </tr></thead><tbody>${daftar.map(t => {
              const k = t.kode_icd9 || t.id;
              const berlaku = t.aktif && terbaru[k] && terbaru[k].id === t.id;
              return `<tr${berlaku ? '' : ' style="opacity:.55"'}>
                <td class="text-xs">${UI.esc(t.jenis)}</td>
                <td><b>${UI.esc(t.nama)}</b>
                  ${t.otomatis ? '<span class="badge b-info">otomatis</span>' : ''}
                  ${t.keterangan ? `<div class="text-xs text-muted">${UI.esc(t.keterangan)}</div>` : ''}</td>
                <td class="mono text-xs">${UI.esc(t.kode_icd9 || t.kode || '—')}</td>
                <td class="text-right"><b>${rp(t.tarif)}</b></td>
                <td class="mono text-xs">${UI.tglPendek(t.berlaku_mulai)}</td>
                <td>${!t.aktif ? '<span class="badge b-batal">Nonaktif</span>'
                     : berlaku ? '<span class="badge b-ok">Berlaku</span>'
                     : '<span class="badge b-warn">Versi lama</span>'}</td>
                <td class="nowrap">
                  <button class="btn btn-secondary btn-sm" data-ubah="${t.id}">Ubah</button>
                  ${berlaku ? `<button class="btn btn-secondary btn-sm" data-naik="${t.id}"
                    title="Buat versi baru dengan tarif berbeda">Ubah tarif</button>` : ''}
                </td></tr>`; }).join('')}</tbody></table></div>`}
        </div>
      </div>`;

    el.querySelector('#btnTarifBaru').addEventListener('click', () => dialogTarif(null));
    el.querySelectorAll('[data-ubah]').forEach(b =>
      b.addEventListener('click', () => dialogTarif(daftar.find(t => t.id === b.dataset.ubah))));
    el.querySelectorAll('[data-naik]').forEach(b =>
      b.addEventListener('click', () =>
        dialogTarif(daftar.find(t => t.id === b.dataset.naik), true)));
  }

  async function dialogTarif(t, versiBaru = false) {
    if (!icd9.length) { try { icd9 = await DB.daftarIcd9('', null, 400); } catch (e) { icd9 = []; } }
    const baru = !t || versiBaru;

    await UI.modal({
      judul: versiBaru ? 'Ubah tarif — buat versi baru'
           : t ? 'Ubah keterangan tarif' : 'Tarif baru',
      isi: `
        ${versiBaru ? `<div class="banner info mb-16"><div>Tarif lama tidak diubah, melainkan
          disimpan sebagai riwayat. Tagihan yang sudah terbit tetap memakai angka lamanya;
          tagihan baru memakai angka ini sejak tanggal berlaku di bawah.</div></div>` : ''}
        <div class="form-row c2">
          <div class="field"><label>Jenis</label>
            <select name="jenis">
              <option value="TINDAKAN">Tindakan (ICD-9-CM)</option>
              <option value="LAYANAN">Layanan (karcis, administrasi, surat)</option>
              <option value="LAIN">Lain-lain</option>
            </select></div>
          <div class="field"><label>Tarif (Rp) *</label>
            <input type="number" name="tarif" min="0" step="any" value="${t ? t.tarif : 0}"></div>
        </div>
        <div class="field" id="wrapIcd"><label>Kode tindakan ICD-9-CM</label>
          <select name="kode_icd9"><option value="">— tidak tertaut ICD-9 —</option>
            ${icd9.map(i => `<option value="${UI.esc(i.kode)}">${UI.esc(i.kode)} — ${UI.esc(i.nama_id)}</option>`).join('')}
          </select>
          <div class="hint">Tarif tindakan dicocokkan lewat kode ini saat tagihan disusun.</div></div>
        <div class="form-row c2">
          <div class="field"><label>Nama tampil *</label>
            <input type="text" name="nama" value="${UI.esc(t?.nama || '')}"></div>
          <div class="field"><label>Kode internal</label>
            <input type="text" name="kode" value="${UI.esc(t?.kode || '')}"></div>
        </div>
        <div class="form-row c2">
          <div class="field"><label>Berlaku mulai</label>
            <input type="date" name="berlaku_mulai"
                   value="${baru ? UI.hariIni() : UI.esc(t.berlaku_mulai)}"></div>
          <div class="field"><label>&nbsp;</label>
            <label class="check"><input type="checkbox" name="aktif" ${!t || t.aktif ? 'checked' : ''}>
              <span>Aktif</span></label></div>
        </div>
        <div class="field"><label class="check">
          <input type="checkbox" name="otomatis" ${t?.otomatis ? 'checked' : ''}>
          <span>Tambahkan otomatis ke setiap tagihan baru</span></label>
          <div class="hint">Hanya untuk jenis Layanan. Berguna untuk karcis atau biaya
            administrasi yang selalu ada. Kunjungan BPJS tetap tidak ditagih.</div></div>
        <div class="field"><label>Keterangan</label>
          <input type="text" name="keterangan" value="${UI.esc(t?.keterangan || '')}"></div>`,
      siap: (badan) => {
        if (t) {
          badan.querySelector('[name=jenis]').value = t.jenis;
          badan.querySelector('[name=kode_icd9]').value = t.kode_icd9 || '';
        }
        const sel = badan.querySelector('[name=jenis]');
        const wrap = badan.querySelector('#wrapIcd');
        const atur = () => { wrap.style.display = sel.value === 'TINDAKAN' ? '' : 'none'; };
        sel.addEventListener('change', atur); atur();
      },
      tombol: [
        { teks: 'Batal', nilai: null },
        { teks: baru ? 'Simpan tarif' : 'Simpan perubahan', kelas: 'btn-primary',
          aksi: async (badan) => {
            const f = UI.nilaiForm(badan);
            if (!f.nama) { UI.toast('Nama tampil wajib diisi.', 'err'); return false; }
            const rec = {
              jenis: f.jenis, kode_icd9: f.jenis === 'TINDAKAN' ? (f.kode_icd9 || null) : null,
              kode: f.kode, nama: f.nama, tarif: Number(f.tarif) || 0,
              otomatis: !!f.otomatis, aktif: !!f.aktif,
              berlaku_mulai: f.berlaku_mulai, keterangan: f.keterangan
            };
            try {
              await DB.simpanTarif(rec, baru ? null : t.id);
              UI.toast('Tarif tersimpan.');
              await gambar();
            } catch (e) { UI.toast(e.message, 'err'); return false; }
          } }
      ]
    });
  }

  /* ==================================================================
     TAB 2 — TAMPILAN INVOICE
     ================================================================== */
  async function gambarInvoice(el) {
    const hasil = await DB.templateInvoice();
    tersimpan = TemplateInvoice.get();

    el.innerHTML = `
      ${hasil.ok ? '' : `<div class="banner warn mb-16"><div>${UI.esc(hasil.alasan)}
        Halaman tetap bisa dipakai dengan nilai bawaan.</div></div>`}
      <div class="banner info mb-16"><div>Perubahan di sini langsung dipakai halaman
        <b>Kasir</b> pada pemuatan berikutnya. Tidak ada deploy, tidak ada perubahan kode.</div></div>

      <div class="split">
        <div>
          <div class="card mb-16">
            <div class="card-head"><h2>Identitas klinik</h2></div>
            <div class="card-body">
              <div class="form-row c2">
                <div class="field"><label>Nama klinik</label>
                  <input type="text" data-jalur="identitas.nama"></div>
                <div class="field"><label>Telepon</label>
                  <input type="text" data-jalur="identitas.telepon"></div>
              </div>
              <div class="field"><label>Alamat</label>
                <textarea data-jalur="identitas.alamat" rows="2"></textarea></div>
              <div class="form-row c2">
                <div class="field"><label>Email</label>
                  <input type="text" data-jalur="identitas.email"></div>
                <div class="field"><label>Visi / semboyan</label>
                  <input type="text" data-jalur="identitas.visi">
                  <div class="hint">Kosongkan bila tidak ingin ditampilkan.</div></div>
              </div>
              <button class="btn btn-secondary btn-sm" id="btnDariFaskes">
                Ambil dari profil klinik</button>
            </div>
          </div>

          <div class="card mb-16">
            <div class="card-head"><h2>Kwitansi PDF</h2></div>
            <div class="card-body">
              <div class="form-row c3">
                <div class="field"><label>Judul saat lunas</label>
                  <input type="text" data-jalur="pdf.judulLunas"></div>
                <div class="field"><label>Judul saat belum lunas</label>
                  <input type="text" data-jalur="pdf.judulBelumLunas"></div>
                <div class="field"><label>Judul untuk BPJS</label>
                  <input type="text" data-jalur="pdf.judulPenjamin">
                  <div class="hint">Tidak ada uang diterima, jadi bukan kwitansi.</div></div>
              </div>
              <div class="form-row c2">
                <div class="field"><label>Warna judul &amp; garis</label>
                  <input type="color" data-warna="pdf.warnaAksen" style="height:40px">
                  <input type="text" data-jalur="pdf.warnaAksen" placeholder="#d81b06"></div>
                <div class="field"><label>Warna nilai total</label>
                  <input type="color" data-warna="pdf.warnaTotal" style="height:40px">
                  <input type="text" data-jalur="pdf.warnaTotal" placeholder="#1a8f0a"></div>
              </div>
              <div class="field"><label>Yang ditampilkan</label>
                <div class="form-row c2">
                  ${saklar('pdf.tampilVisi','Visi / semboyan')}
                  ${saklar('pdf.tampilEmail','Email di kepala')}
                  ${saklar('pdf.tampilNomorRm','Nomor rekam medis')}
                  ${saklar('pdf.tampilPenjamin','Penjamin (BPJS / Umum)')}
                  ${saklar('pdf.tampilPoliDokter','Poli &amp; nama dokter')}
                  ${saklar('pdf.tampilKolomDiskon','Kolom diskon')}
                  ${saklar('pdf.tampilRiwayatBayar','Rincian riwayat pembayaran')}
                  ${saklar('pdf.tampilWaktuDibuat','Waktu pembuatan')}
                </div></div>
              <div class="field"><label>Catatan kaki halaman</label>
                <input type="text" data-jalur="pdf.catatanKaki"></div>
              <div class="field">${saklar('pdf.tandaTangan.aktif','Sediakan ruang tanda tangan')}</div>
              <div class="form-row c3">
                <div class="field"><label>Kota</label><input type="text" data-jalur="pdf.tandaTangan.kota"></div>
                <div class="field"><label>Jabatan</label><input type="text" data-jalur="pdf.tandaTangan.jabatan"></div>
                <div class="field"><label>Nama penanda tangan</label>
                  <input type="text" data-jalur="pdf.tandaTangan.nama">
                  <div class="hint">Kosongkan untuk garis titik-titik.</div></div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Struk thermal</h2></div>
            <div class="card-body">
              <div class="form-row c3">
                <div class="field"><label>Stempel lunas</label>
                  <input type="text" data-jalur="struk.capLunas"></div>
                <div class="field"><label>Stempel sebagian</label>
                  <input type="text" data-jalur="struk.capSebagian"></div>
                <div class="field"><label>Stempel belum lunas</label>
                  <input type="text" data-jalur="struk.capBelumLunas"></div>
              </div>
              <div class="field"><label>Yang dicetak</label>
                <div class="form-row c2">
                  ${saklar('struk.tampilAlamat','Alamat klinik')}
                  ${saklar('struk.tampilTelepon','Nomor telepon')}
                  ${saklar('struk.tampilNamaPelanggan','Nama pasien')}
                  ${saklar('struk.tampilNomorRm','Nomor rekam medis')}
                  ${saklar('struk.tampilPenjamin','Penjamin')}
                  ${saklar('struk.tampilPetugas','Nama kasir')}
                  ${saklar('struk.tampilRincianBayar','Rincian pembayaran')}
                  ${saklar('struk.tampilStempel','Stempel status')}
                  ${saklar('struk.tampilWaktuCetak','Waktu pencetakan')}
                  ${saklar('struk.potongKertas','Kirim perintah potong kertas')}
                </div></div>
              <div class="field"><label>Baris tambahan di kepala</label>
                <textarea data-jalur="struk.barisKepala" data-baris="1" rows="2"
                  placeholder="Satu baris per baris teks"></textarea>
                <div class="hint">Maksimal 4 baris, mis. nomor izin klinik. Dicetak rata tengah.</div></div>
              <div class="field"><label>Catatan kaki</label>
                <input type="text" data-jalur="struk.catatanKaki"></div>
              <div class="field"><label>Baris tambahan di kaki</label>
                <textarea data-jalur="struk.barisKaki" data-baris="1" rows="2"></textarea></div>
              <div class="form-row c2">
                <div class="field"><label>Lebar kertas bawaan</label>
                  <select data-jalur="struk.lebarBaku" data-angka="1">
                    <option value="58">58 mm</option><option value="80">80 mm</option></select></div>
                <div class="field"><label>Baris kosong di akhir</label>
                  <input type="number" data-jalur="struk.barisKosongAkhir" data-angka="1"
                         min="0" max="10" step="1">
                  <div class="hint">Agar struk keluar cukup jauh untuk disobek.</div></div>
              </div>
            </div>
          </div>
        </div>

        <div style="position:sticky;top:16px">
          <div class="card mb-16">
            <div class="card-head"><h2 style="font-size:14px">Pratinjau struk</h2></div>
            <div class="card-body">
              <div class="radio-row mb-16">
                <button type="button" class="radio-chip" data-contoh="lunas">Umum, lunas</button>
                <button type="button" class="radio-chip" data-contoh="bpjs">BPJS</button>
              </div>
              <div class="radio-row mb-16">
                <button type="button" class="radio-chip" data-lebar="58">58 mm</button>
                <button type="button" class="radio-chip" data-lebar="80">80 mm</button>
              </div>
              <pre id="pratinjau" style="font-family:ui-monospace,'Courier New',monospace;
                font-size:10.5px;line-height:1.4;white-space:pre;overflow-x:auto;
                background:#fff;border:1px solid var(--ink-200);border-radius:10px;
                padding:12px;margin:0"></pre>
              <div class="hint" style="margin-top:8px">Dirender mesin yang sama dengan yang
                mencetak ke printer, jadi ini bukan tiruan.</div>
            </div>
          </div>
          <div class="btn-group">
            <button class="btn btn-primary" id="btnSimpanTpl">Simpan</button>
            <button class="btn btn-secondary" id="btnBatalTpl">Batalkan</button>
            <button class="btn btn-secondary" id="btnBawaanTpl">Nilai bawaan</button>
          </div>
          <div class="hint" id="statusTpl" style="margin-top:8px"></div>
        </div>
      </div>`;

    isiForm(el, tersimpan);
    el.querySelectorAll('[data-jalur]').forEach(i => {
      i.addEventListener('input', () => gambarPratinjau(el));
      i.addEventListener('change', () => gambarPratinjau(el));
    });
    el.querySelectorAll('[data-warna]').forEach(w =>
      w.addEventListener('input', () => {
        const teks = el.querySelector(`[data-jalur="${w.dataset.warna}"]`);
        if (teks) { teks.value = w.value; gambarPratinjau(el); }
      }));
    el.querySelectorAll('[data-contoh]').forEach(b =>
      b.addEventListener('click', () => {
        contohLunas = b.dataset.contoh === 'lunas'; gambarPratinjau(el);
      }));
    el.querySelectorAll('[data-lebar]').forEach(b =>
      b.addEventListener('click', () => {
        lebarPratinjau = Number(b.dataset.lebar); gambarPratinjau(el);
      }));

    el.querySelector('#btnDariFaskes').addEventListener('click', async () => {
      try {
        const f = await DB.faskes();
        const isi = { 'identitas.nama': f.nama, 'identitas.telepon': f.telepon,
                      'identitas.email': f.email,
                      'identitas.alamat': [f.alamat, f.kelurahan, f.kecamatan,
                                           f.kabupaten, f.provinsi].filter(Boolean).join(', ') };
        Object.entries(isi).forEach(([j, v]) => {
          const i = el.querySelector(`[data-jalur="${j}"]`);
          if (i && v) i.value = v;
        });
        gambarPratinjau(el);
        UI.toast('Diambil dari profil klinik. Tekan Simpan untuk menerapkannya.');
      } catch (e) { UI.toast(e.message, 'err'); }
    });

    el.querySelector('#btnSimpanTpl').addEventListener('click', async () => {
      try {
        await DB.simpanTemplateInvoice(bacaForm(el));
        tersimpan = TemplateInvoice.get();
        isiForm(el, tersimpan);
        gambarPratinjau(el);
        UI.toast('Tampilan invoice tersimpan.');
      } catch (e) { UI.toast(e.message, 'err'); }
    });
    el.querySelector('#btnBatalTpl').addEventListener('click', async () => {
      if (!await UI.konfirmasi('Buang perubahan?',
        'Isian kembali ke yang tersimpan di database.', 'Buang')) return;
      await gambar();
    });
    el.querySelector('#btnBawaanTpl').addEventListener('click', async () => {
      if (!await UI.konfirmasi('Kembalikan nilai bawaan?',
        'Belum ada yang ditulis ke database sampai Anda menekan Simpan.', 'Muat bawaan')) return;
      isiForm(el, TemplateInvoice.bawaan());
      gambarPratinjau(el);
    });

    gambarPratinjau(el);
    const kapan = TemplateInvoice.diubahPada();
    el.querySelector('#statusTpl').textContent = kapan
      ? 'Terakhir diubah ' + UI.tglIndo(kapan) + ', ' + UI.jam(kapan) + ' WITA.'
      : 'Belum pernah diubah.';
  }

  const saklar = (jalur, label) =>
    `<label class="check" style="margin-bottom:8px">
       <input type="checkbox" data-jalur="${jalur}"><span>${label}</span></label>`;

  /* Pemetaan form ↔ template lewat atribut data-jalur. Satu fungsi baca
     dan satu fungsi tulis melayani seluruh form, jadi menambah pengaturan
     baru cukup menambah satu elemen di HTML. */
  const ambilJalur = (o, j) => j.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  function taruhJalur(o, j, v) {
    const bag = j.split('.');
    let x = o;
    for (let i = 0; i < bag.length - 1; i++) {
      if (typeof x[bag[i]] !== 'object' || x[bag[i]] === null) x[bag[i]] = {};
      x = x[bag[i]];
    }
    x[bag[bag.length - 1]] = v;
  }

  function isiForm(el, k) {
    el.querySelectorAll('[data-jalur]').forEach(i => {
      const v = ambilJalur(k, i.dataset.jalur);
      if (i.type === 'checkbox') i.checked = !!v;
      else if (i.dataset.baris === '1') i.value = (Array.isArray(v) ? v : []).join('\n');
      else i.value = (v == null ? '' : String(v));
    });
    el.querySelectorAll('[data-warna]').forEach(w => {
      const teks = el.querySelector(`[data-jalur="${w.dataset.warna}"]`);
      if (teks && /^#[0-9a-fA-F]{6}$/.test(teks.value)) w.value = teks.value;
    });
  }

  function bacaForm(el) {
    const k = {};
    el.querySelectorAll('[data-jalur]').forEach(i => {
      let v;
      if (i.type === 'checkbox') v = i.checked;
      else if (i.dataset.baris === '1') v = i.value.split('\n').map(s => s.trim()).filter(Boolean);
      else if (i.dataset.angka === '1') v = Number(i.value);
      else v = i.value;
      taruhJalur(k, i.dataset.jalur, v);
    });
    /* Dibersihkan di sini juga, bukan hanya saat menyimpan, supaya
       pratinjau menampilkan apa yang BENAR-BENAR akan tersimpan —
       termasuk warna salah ketik yang jatuh kembali ke bawaan. */
    return TemplateInvoice.bersihkan(k);
  }

  /* Data contoh untuk pratinjau — dua keadaan yang paling berbeda
     bentuknya: pasien umum yang membayar, dan kunjungan BPJS yang
     tidak menagih apa pun. */
  function contohData(k) {
    const bpjs = !contohLunas;
    const item = bpjs
      ? [{ item_name: 'Konsultasi dokter umum (ditanggung)', quantity: 1,
           unit_price: 50000, discount_pct: 0, line_total: 0 },
         { item_name: 'Amoxicillin 500 mg (10 Tablet) (ditanggung)', quantity: 10,
           unit_price: 1500, discount_pct: 0, line_total: 0 }]
      : [{ item_name: 'Konsultasi dokter umum', quantity: 1,
           unit_price: 50000, discount_pct: 0, line_total: 50000 },
         { item_name: 'Amoxicillin 500 mg (10 Tablet)', quantity: 10,
           unit_price: 1500, discount_pct: 0, line_total: 15000 }];
    const total = bpjs ? 0 : 65000;
    return {
      bisnis: { nama: k.identitas.nama, alamat: k.identitas.alamat,
                telp: k.identitas.telepon, catatanKaki: k.struk.catatanKaki },
      tpl: k.struk,
      inv: { invoice_number: 'INV-2026-0123', invoice_date: '2026-09-01',
             customer_name: 'Budi Santoso', no_rm: '000123',
             penjamin: bpjs ? 'BPJS' : 'UMUM',
             total, amount_paid: total,
             payment_status: 'lunas', notes: '' },
      items: item,
      payments: bpjs ? [] : [{ paid_at: '2026-09-01', amount: 65000,
                               method: 'tunai', cash_received: 100000 }],
      opsi: { lebarMm: lebarPratinjau,
              judul: bpjs ? k.pdf.judulPenjamin : null,
              petugas: App.siapa()?.nama || 'Kasir',
              dicetakPada: 'Dicetak 1 September 2026, 09:15 WITA' }
    };
  }

  function gambarPratinjau(el) {
    el.querySelectorAll('[data-contoh]').forEach(b =>
      b.classList.toggle('on', (b.dataset.contoh === 'lunas') === contohLunas));
    el.querySelectorAll('[data-lebar]').forEach(b =>
      b.classList.toggle('on', Number(b.dataset.lebar) === lebarPratinjau));

    const kotak = el.querySelector('#pratinjau');
    if (typeof StrukCore === 'undefined') { kotak.textContent = 'struk_core.js belum dimuat.'; return; }
    const k = bacaForm(el);
    kotak.textContent = StrukCore.keTeks(
      StrukCore.susunStruk(contohData(k)), lebarPratinjau);
  }

  return { render };
})();

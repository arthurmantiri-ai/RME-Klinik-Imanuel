/* =====================================================================
   KOMPONEN — potongan tampilan yang dipakai lebih dari satu halaman.
   ===================================================================== */
const Komponen = (() => {

  /* Bilah identitas pasien di atas layar kajian / pemeriksaan / rekam medis.
     compact=true memakai varian .patient-summary yang lebih pendek — dipakai
     di halaman Pemeriksaan supaya ruang vertikal lebih banyak tersisa untuk
     pekerjaan klinis, bukan identitas pasien. */
  function bilahPasien(k, alergi = [], compact = false) {
    const p = k.pasien;
    const alergiBerat = alergi.filter(a => a.tingkat === 'BERAT');
    const teksAlergi = alergi.length
      ? alergi.map(a => a.nama + (a.tingkat === 'BERAT' ? ' (BERAT)' : '')).join(', ')
      : null;

    return `
      <div class="patient-bar ${compact ? 'compact' : ''}">
        <div class="pb-avatar">${UI.inisial(p.nama)}</div>
        <div class="pb-main">
          <b>${UI.esc(p.nama)}</b>
          <span>No. RM ${UI.esc(p.no_rm)} · ${p.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} ·
                ${UI.umurTeks(p.tanggal_lahir)} · ${UI.tglPendek(p.tanggal_lahir)}</span>
        </div>
        <div class="pb-meta">
          <div><span class="k">No. antrian</span><span class="v">${k.no_antrian ?? '-'}</span></div>
          <div><span class="k">Poli</span><span class="v">${UI.esc(k.poli?.nama || '-')}</span></div>
          <div><span class="k">Cara bayar</span><span class="v">${UI.esc(k.cara_bayar)}</span></div>
          <div><span class="k">Kunjungan</span><span class="v">${UI.tglPendek(k.tanggal)}</span></div>
        </div>
        ${(teksAlergi || p.catatan_penting) ? `
          <div class="alert-allergy">
            ${UI.ikon('peringatan', 15)}
            ${p.catatan_penting ? `<b>${UI.esc(p.catatan_penting)}</b>${teksAlergi ? ' · ' : ''}` : ''}
            ${teksAlergi ? `Alergi: ${UI.esc(teksAlergi)}` : ''}
          </div>` : ''}
      </div>`;
  }

  /* Kotak tanda vital — nilai di luar batas normal diberi warna */
  function kotakVital(ka) {
    if (!ka) return `<div class="banner warn mb-0"><div>
      Kajian awal belum diisi perawat. Tanda vital belum tersedia.</div></div>`;

    const item = [
      ['Tekanan darah', ka.sistolik && ka.diastolik ? `${ka.sistolik}/${ka.diastolik}` : null, 'mmHg',
        UI.vitalTidakNormal('sistolik', ka.sistolik) || UI.vitalTidakNormal('diastolik', ka.diastolik)],
      ['Nadi', ka.nadi, 'x/mnt', UI.vitalTidakNormal('nadi', ka.nadi)],
      ['Napas', ka.nafas, 'x/mnt', UI.vitalTidakNormal('nafas', ka.nafas)],
      ['Suhu', ka.suhu, '°C', UI.vitalTidakNormal('suhu', ka.suhu)],
      ['SpO₂', ka.spo2, '%', UI.vitalTidakNormal('spo2', ka.spo2)],
      ['Berat badan', ka.berat_badan, 'kg', false],
      ['Tinggi badan', ka.tinggi_badan, 'cm', false],
      ['IMT', ka.imt, 'kg/m²', ka.imt && (ka.imt < 18.5 || ka.imt >= 25)]
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');

    if (!item.length) return `<div class="banner warn mb-0"><div>Tanda vital belum diisi.</div></div>`;

    return `<div class="vitals">${item.map(([k, v, sat, abn]) => `
      <div class="vital ${abn ? 'abn' : ''}">
        <div class="k">${k}</div>
        <div class="v">${UI.esc(v)}<small>${sat}</small></div>
      </div>`).join('')}</div>`;
  }

  /* Ringkasan SOAP untuk tampilan rekam medis */
  function blokSoap(pm) {
    if (!pm) return '<p class="text-muted mb-0">Belum ada catatan pemeriksaan.</p>';
    const baris = [['S', pm.subjective], ['O', pm.objective], ['A', pm.assessment], ['P', pm.plan]];
    return baris.filter(([, v]) => v).map(([l, v]) => `
      <div class="soap-block">
        <span class="s-lbl">${l}</span><div class="s-txt">${UI.esc(v)}</div>
      </div>`).join('') || '<p class="text-muted mb-0">Belum ada catatan pemeriksaan.</p>';
  }

  /* Kotak pencarian dengan saran (ICD-10 / obat)

     `bolehBuatBaru` + `onBuatBaru` (11 Sep 2026): kalau diisi, dan kata yang
     diketik tidak cocok PERSIS dengan salah satu hasil (dicocokkan lewat
     `namaFn`), muncul satu baris tambahan "+ <teksBuatBaru>" di bawah daftar
     hasil. Memilihnya memanggil `onBuatBaru(kataKetik)`, bukan `onPilih`.

     Dibuat untuk dialog "Obat Masuk": sebelumnya obat yang belum ada di
     Master Data harus dibuat dulu di halaman Master Data (langkah terpisah),
     baru dicari lagi di sini. Sekarang halaman pemanggil bisa membuka form
     "Tambah obat" langsung dari sini lewat `onBuatBaru`, tanpa keluar dari
     dialog. Parameter baru semuanya opsional — pemanggil lama yang tidak
     mengisinya berjalan persis seperti sebelumnya. */
  function comboCari({ wadah, placeholder, cariFn, formatFn, onPilih, nilaiAwal = '',
                        bolehBuatBaru = false, onBuatBaru = null,
                        namaFn = (h) => h.nama, teksBuatBaru = (kata) => `Tambah baru: "${kata}"` }) {
    wadah.innerHTML = `
      <div class="combo">
        <div class="search-box">
          <span class="ico">${UI.ikon('cari', 16)}</span>
          <input type="text" class="combo-input" placeholder="${UI.esc(placeholder)}"
                 value="${UI.esc(nilaiAwal)}" autocomplete="off">
        </div>
        <div class="combo-list"></div>
      </div>`;

    const input = wadah.querySelector('.combo-input');
    const list  = wadah.querySelector('.combo-list');
    let hasil = [], sorot = -1, tampilkanBuat = false;

    const tutup = () => { list.classList.remove('open'); sorot = -1; };

    // Indeks paling besar yang boleh disorot: item hasil terakhir, atau
    // baris "buat baru" (satu posisi setelahnya) kalau sedang ditampilkan.
    const batasSorot = () => hasil.length - 1 + (tampilkanBuat ? 1 : 0);

    const gambar = () => {
      const kata = input.value.trim();
      tampilkanBuat = bolehBuatBaru && kata.length >= 2 &&
        !hasil.some(h => String(namaFn(h) || '').trim().toLowerCase() === kata.toLowerCase());

      if (!hasil.length && !tampilkanBuat) {
        list.innerHTML = `<div class="combo-empty">Tidak ada hasil yang cocok</div>`;
      } else {
        const barisHasil = hasil.map((h, i) =>
          `<div class="combo-item ${i === sorot ? 'hl' : ''}" data-i="${i}">${formatFn(h)}</div>`).join('');
        const barisBuat = tampilkanBuat
          ? `<div class="combo-item combo-item-buat ${sorot === hasil.length ? 'hl' : ''}" data-buat="1">
               ${UI.ikon('plus', 14)} ${UI.esc(teksBuatBaru(kata))}</div>`
          : '';
        list.innerHTML = barisHasil + barisBuat;
      }
      list.classList.add('open');
    };

    const muat = UI.tunda(async () => {
      try { hasil = await cariFn(input.value.trim()); gambar(); }
      catch (e) { hasil = []; gambar(); }
    }, 220);

    input.addEventListener('input', muat);
    input.addEventListener('focus', muat);
    input.addEventListener('keydown', (e) => {
      if (!list.classList.contains('open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sorot = Math.min(sorot + 1, batasSorot()); gambar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sorot = Math.max(sorot - 1, 0); gambar(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (tampilkanBuat && sorot === hasil.length) {
          const kata = input.value.trim();
          input.value = ''; tutup();
          if (onBuatBaru) onBuatBaru(kata);
        } else if (sorot >= 0 && hasil[sorot]) { onPilih(hasil[sorot]); input.value = ''; tutup(); }
      } else if (e.key === 'Escape') tutup();
    });
    list.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-buat]')) {
        e.preventDefault();
        const kata = input.value.trim();
        input.value = ''; tutup();
        if (onBuatBaru) onBuatBaru(kata);
        return;
      }
      const it = e.target.closest('[data-i]'); if (!it) return;
      e.preventDefault();
      onPilih(hasil[+it.dataset.i]); input.value = ''; tutup();
    });
    input.addEventListener('blur', () => setTimeout(tutup, 140));

    return { fokus: () => input.focus(), bersihkan: () => { input.value = ''; tutup(); } };
  }

  return { bilahPasien, kotakVital, blokSoap, comboCari };
})();

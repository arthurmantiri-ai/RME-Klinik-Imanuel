/* =====================================================================
   KRONIS PANTAU CORE — klasifikasi status pemantauan kronis (Tahap 2):
   obat bulanan, jadwal lab, kuota statin, dan peringatan H-3 (fungsi
   murni, tidak menyentuh DOM maupun Supabase).

   ---------------------------------------------------------------------
   KENAPA LABEL/WARNA DIHITUNG DI SINI, BUKAN DI SQL

   Berbeda dengan penandaan Tinggi/Rendah/Kritis di modul lab — yang
   BERLAKU di database (lab_hitung_tanda menulis ke kolom `tanda`, dan
   js/lab_core.js punya kembarannya yang harus disamakan & diuji
   berpasangan (lihat test/README.md) — SQL di 18_kronis_pantau.sql
   SENGAJA tidak pernah menyimpan status pemantauan. Ia hanya memulangkan
   fakta mentah (tanggal, jumlah, hari lewat jadwal). Klasifikasi
   AMAN/MENDEKATI/TERLAMBAT ada SATU-SATUNYA di sini, supaya mengubah
   toleransi (mis. dari 14 menjadi 10 hari) tidak perlu memasang ulang
   SQL, dan supaya tidak ada dua sumber kebenaran yang bisa berselisih.
   ===================================================================== */
const KronisPantauCore = (() => {
  'use strict';

  // Diambil dari keputusan 4 Sep 2026 (claude/rancangan-kronis.md):
  // jadwal lab bertoleransi 14 hari; obat kronis boleh diambil ulang
  // paling cepat H-3 sebelum jadwal bulanannya.
  const TOLERANSI_LAB_HARI = 14;
  const H3_HARI = 3;

  /* ---------------------------------------------------------------- */
  /* 1. "Belum ambil obat bulan ini"                                   */
  /* ---------------------------------------------------------------- */

  /* baris: { bulan_ini_ambil, bulan_tertinggal, terakhir_ambil } —
     satu baris v_kronis_obat_bulan_ini. */
  function statusObat(baris) {
    const b = baris || {};
    if (b.bulan_ini_ambil) return 'SUDAH';
    if (!b.terakhir_ambil) return 'BELUM_PERNAH';
    return 'TERLAMBAT';
  }

  const LABEL_STATUS_OBAT = {
    SUDAH: 'Sudah ambil bulan ini',
    BELUM_PERNAH: 'Belum pernah ambil',
    TERLAMBAT: 'Belum ambil bulan ini'
  };

  function labelStatusObat(baris) {
    const s = statusObat(baris);
    if (s === 'TERLAMBAT') {
      const n = Number((baris || {}).bulan_tertinggal) || 0;
      return n > 1 ? `Tertinggal ${n} bulan` : LABEL_STATUS_OBAT.TERLAMBAT;
    }
    return LABEL_STATUS_OBAT[s];
  }

  function warnaStatusObat(baris) {
    const s = statusObat(baris);
    if (s === 'SUDAH') return 'ok';
    if (s === 'BELUM_PERNAH') return 'warn';
    // TERLAMBAT: makin lama tertinggal, makin serius.
    return (Number((baris || {}).bulan_tertinggal) || 0) >= 2 ? 'danger' : 'warn';
  }

  /* ---------------------------------------------------------------- */
  /* 2. Jadwal & kepatuhan lab                                         */
  /* ---------------------------------------------------------------- */

  /* baris: { hari_lewat_jadwal } — satu baris v_kronis_lab_jadwal.
     hari_lewat_jadwal <= 0   : belum jatuh tempo            -> AMAN
     0 < hari <= toleransi    : sudah jatuh tempo, masih wajar -> MENDEKATI
     hari > toleransi         : lewat toleransi               -> TERLAMBAT */
  function statusLab(baris, toleransi = TOLERANSI_LAB_HARI) {
    const hari = Number((baris || {}).hari_lewat_jadwal);
    if (!Number.isFinite(hari) || hari <= 0) return 'AMAN';
    if (hari <= toleransi) return 'MENDEKATI';
    return 'TERLAMBAT';
  }

  const LABEL_STATUS_LAB = {
    AMAN: 'Aman', MENDEKATI: 'Jatuh tempo', TERLAMBAT: 'Terlambat kontrol lab'
  };

  function labelStatusLab(baris, toleransi = TOLERANSI_LAB_HARI) {
    const s = statusLab(baris, toleransi);
    if (s === 'TERLAMBAT') {
      const hari = Number((baris || {}).hari_lewat_jadwal) || 0;
      return `Terlambat ${hari - toleransi} hari dari toleransi`;
    }
    return LABEL_STATUS_LAB[s];
  }

  function warnaStatusLab(baris, toleransi = TOLERANSI_LAB_HARI) {
    const s = statusLab(baris, toleransi);
    if (s === 'AMAN') return 'ok';
    if (s === 'MENDEKATI') return 'warn';
    return 'danger';
  }

  /* ---------------------------------------------------------------- */
  /* 3. Kuota obat berkuota (statin)                                   */
  /* ---------------------------------------------------------------- */

  /* baris: { maks, terpakai } — satu baris v_kronis_statin.
     Dipulangkan sebagai objek, bukan boolean tunggal, karena halaman
     apotek & periksa perlu menampilkan angkanya ("2 dari 3"), bukan
     cuma warna. */
  function statinInfo(baris) {
    const b = baris || {};
    const maks = Number(b.maks) || 0;
    const terpakai = Number(b.terpakai) || 0;
    const sisa = Math.max(0, maks - terpakai);
    return {
      maks, terpakai, sisa,
      // Peringatan pada penebusan yang SUDAH mencapai atau melewati
      // kuota — bukan penolakan (keputusan 4 Sep 2026), murni tampilan.
      peringatan: terpakai >= maks,
      mendekati: !((terpakai >= maks)) && (maks - terpakai) === 1
    };
  }

  function labelStatin(baris) {
    const i = statinInfo(baris);
    if (i.peringatan) return `Kuota terlampaui (${i.terpakai}/${i.maks})`;
    if (i.mendekati)  return `Sisa kuota tinggal 1 (${i.terpakai}/${i.maks})`;
    return `${i.terpakai}/${i.maks} dipakai`;
  }

  function warnaStatin(baris) {
    const i = statinInfo(baris);
    if (i.peringatan) return 'danger';
    if (i.mendekati)  return 'warn';
    return 'ok';
  }

  /* ---------------------------------------------------------------- */
  /* 4. Peringatan H-3 (pengambilan obat kronis terlalu cepat)         */
  /* ---------------------------------------------------------------- */

  /* hasil: jawaban kronis_h3_cek() — { jadwal_berikutnya,
     hari_menuju_jadwal } atau null (pasien tidak terdaftar kronis). */
  function h3Info(hasil, h3Hari = H3_HARI) {
    if (!hasil) return null;
    const hari = Number(hasil.hari_menuju_jadwal);
    return {
      jadwalBerikutnya: hasil.jadwal_berikutnya,
      hariMenujuJadwal: hari,
      // Positif = masih sekian hari lagi menuju jadwal (mengambil sekarang
      // berarti mengambil lebih cepat). Nol/negatif = sudah waktunya atau
      // sudah lewat, sama sekali tidak "terlalu cepat".
      terlaluCepat: Number.isFinite(hari) && hari > h3Hari
    };
  }

  function pesanH3(hasil, h3Hari = H3_HARI) {
    const i = h3Info(hasil, h3Hari);
    if (!i || !i.terlaluCepat) return null;
    return `Jadwal pengambilan berikutnya masih ${i.hariMenujuJadwal} hari lagi ` +
           `(boleh diambil sejak H-${h3Hari}). Tetap bisa diserahkan bila memang perlu — ` +
           `ini hanya pengingat, bukan penolakan.`;
  }

  /* ---------------------------------------------------------------- */
  /* 5. Pesan siap-pakai untuk tautan wa.me                            */
  /* ---------------------------------------------------------------- */

  /* Ketiga fungsi ini hanya menyusun TEKS — dibentuk jadi tautan oleh
     KronisCore.waTautan() di halaman (dua modul ini sengaja tidak saling
     bergantung, sama seperti alasan kronis_pantau_core.js tidak menyalin
     ulang kunci pasien dari kronis_core.js). */

  function pesanTelponH1(baris) {
    const b = baris || {};
    const nama = b.nama || 'Bapak/Ibu';
    let pesan = `Halo ${nama}, mengingatkan jadwal kontrol Anda besok`;
    if (b.nama_poli) pesan += ` di ${b.nama_poli}`;
    pesan += '.';
    if (b.kontrol_instruksi) pesan += ` ${b.kontrol_instruksi}.`;
    return pesan;
  }

  function pesanPengingatObat(baris) {
    const b = baris || {};
    const nama = b.nama || 'Bapak/Ibu';
    return statusObat(b) === 'BELUM_PERNAH'
      ? `Halo ${nama}, ini pengingat dari klinik untuk mengambil obat rutin kronis Anda.`
      : `Halo ${nama}, kami belum melihat Anda mengambil obat rutin bulan ini. ` +
        `Yuk sempatkan mampir ke klinik.`;
  }

  function pesanPengingatLab(baris) {
    const b = baris || {};
    const nama = b.nama || 'Bapak/Ibu';
    return `Halo ${nama}, sudah waktunya kontrol lab rutin Anda di klinik. ` +
           `Mohon datang dalam waktu dekat ya.`;
  }

  const API = {
    TOLERANSI_LAB_HARI, H3_HARI,
    statusObat, labelStatusObat, warnaStatusObat,
    statusLab, labelStatusLab, warnaStatusLab,
    statinInfo, labelStatin, warnaStatin,
    h3Info, pesanH3,
    pesanTelponH1, pesanPengingatObat, pesanPengingatLab
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

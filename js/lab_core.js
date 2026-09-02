/* =====================================================================
   LAB CORE — pemilihan nilai rujukan, penandaan hasil, dan penafsiran
   angka (fungsi murni)

   Modul ini SENGAJA tidak menyentuh DOM dan tidak memanggil Supabase,
   sehingga bisa diuji di luar peramban: `node test/uji_lab_core.js`.

   ---------------------------------------------------------------------
   KENAPA ATURANNYA DITULIS DUA KALI

   Penandaan Tinggi/Rendah yang BERLAKU adalah yang di database
   (lab_hitung_tanda() pada 11_penunjang.sql). Itu satu-satunya yang
   dipercaya, karena hasil bisa masuk lewat halaman lain atau lewat
   dasbor Supabase, dan semuanya harus ditandai dengan aturan yang sama.

   Yang di sini adalah kembarannya untuk PRATINJAU: petugas mengetik
   angka, dan tanda "Rendah" muncul sebelum ia menekan Simpan. Menunggu
   perjalanan bolak-balik ke server untuk itu terasa lambat pada koneksi
   klinik.

   Dua salinan aturan berarti keduanya bisa berselisih diam-diam, dan
   itulah yang paling berbahaya di sini — layar berkata Normal, database
   menyimpan Tinggi. Karena itu test/uji_lab_core.js memakai contoh yang
   PERSIS SAMA dengan test/uji_penunjang.sql, dan kalau salah satunya
   diubah tanpa yang lain, uji akan gagal.

   ---------------------------------------------------------------------
   SATU HAL YANG TIDAK DISALIN DARI apotek_excel.js

   bacaAngka() di sana membaca "1.005" sebagai 1005, karena di berkas
   Excel apotek titik memang pemisah ribuan. Di lab, 1.005 adalah berat
   jenis urine — angka yang sah dan sering muncul. Karena itu di sini
   penafsiran titik ditentukan oleh berapa desimal yang dipakai
   pemeriksaan tersebut (kolom ref_lab.desimal):

     desimal = 0 (leukosit, trombosit)  → "7.500" berarti 7500
     desimal > 0 (berat jenis urine)    → "1.005" berarti 1,005

   Tanpa aturan itu, satu dari dua pemeriksaan pasti salah baca.
   ===================================================================== */
const LabCore = (() => {
  'use strict';

  /* ------------------------------------------------------------------
     Label tanda. `berat` dipakai untuk mengurutkan: yang paling gawat
     naik ke atas pada ringkasan lembar hasil.
     ------------------------------------------------------------------ */
  const TANDA = {
    BELUM:         { label: '—',      pendek: '',  kelas: 'netral',  berat: 0 },
    NORMAL:        { label: 'Normal', pendek: '',  kelas: 'ok',      berat: 0 },
    RENDAH:        { label: 'Rendah', pendek: 'L', kelas: 'warn',    berat: 2 },
    TINGGI:        { label: 'Tinggi', pendek: 'H', kelas: 'warn',    berat: 2 },
    ABNORMAL:      { label: 'Abnormal', pendek: '!', kelas: 'warn',  berat: 2 },
    KRITIS_RENDAH: { label: 'Kritis rendah', pendek: 'LL', kelas: 'err', berat: 3 },
    KRITIS_TINGGI: { label: 'Kritis tinggi', pendek: 'HH', kelas: 'err', berat: 3 }
  };

  const JENIS_PENUNJANG = [
    { kode: 'RO_PERIAPIKAL',  label: 'Rontgen periapikal',   gigi: true  },
    { kode: 'RO_BITEWING',    label: 'Rontgen bitewing',     gigi: true  },
    { kode: 'RO_PANORAMIK',   label: 'Rontgen panoramik',    gigi: true  },
    { kode: 'RO_OKLUSAL',     label: 'Rontgen oklusal',      gigi: true  },
    { kode: 'RO_SEFALOMETRI', label: 'Rontgen sefalometri',  gigi: false },
    { kode: 'RO_THORAX',      label: 'Rontgen toraks',       gigi: false },
    { kode: 'RO_LAIN',        label: 'Rontgen lainnya',      gigi: false },
    { kode: 'EKG',            label: 'EKG',                  gigi: false },
    { kode: 'USG',            label: 'USG',                  gigi: false },
    { kode: 'LAINNYA',        label: 'Penunjang lainnya',    gigi: false }
  ];

  const JENIS_LAMPIRAN = [
    { kode: 'FILM_RONTGEN',    label: 'Film rontgen' },
    { kode: 'HASIL_LAB_LUAR',  label: 'Lembar hasil lab luar' },
    { kode: 'SURAT_RUJUKAN',   label: 'Surat rujukan' },
    { kode: 'HASIL_EKG',       label: 'Rekaman EKG' },
    { kode: 'HASIL_USG',       label: 'Hasil USG' },
    { kode: 'INFORMED_CONSENT',label: 'Informed consent' },
    { kode: 'RESUME_LUAR',     label: 'Resume medis dari luar' },
    { kode: 'IDENTITAS',       label: 'Salinan identitas / kartu' },
    { kode: 'LAINNYA',         label: 'Lainnya' }
  ];

  const labelJenis = (kode) =>
    (JENIS_PENUNJANG.find(j => j.kode === kode) || {}).label || kode || '-';
  const jenisPakaiGigi = (kode) =>
    !!(JENIS_PENUNJANG.find(j => j.kode === kode) || {}).gigi;
  const labelLampiran = (kode) =>
    (JENIS_LAMPIRAN.find(j => j.kode === kode) || {}).label || kode || '-';

  /* ------------------------------------------------------------------
     Umur dalam bulan. Dipakai untuk memilih baris nilai rujukan anak.
     ------------------------------------------------------------------ */
  function umurBulan(tglLahir, pada) {
    if (!tglLahir) return null;
    const l = new Date(tglLahir), n = pada ? new Date(pada) : new Date();
    if (isNaN(l) || isNaN(n)) return null;
    let bulan = (n.getFullYear() - l.getFullYear()) * 12 + (n.getMonth() - l.getMonth());
    if (n.getDate() < l.getDate()) bulan -= 1;
    return bulan < 0 ? 0 : bulan;
  }

  /* ------------------------------------------------------------------
     Memilih baris nilai rujukan yang paling khusus.

     Urutan kekhususan harus sama persis dengan lab_rujukan_untuk() di
     11_penunjang.sql: baris dengan jenis kelamin menang atas baris tanpa
     jenis kelamin; di antara yang setara, rentang umur tersempit menang.

     Tanpa aturan kedua, hemoglobin anak tiga tahun bisa dinilai dengan
     rentang dewasa hanya karena baris dewasa kebetulan ada lebih dulu di
     daftar — dan 12,0 g/dL akan terbaca "rendah" padahal normal.
     ------------------------------------------------------------------ */
  function pilihRujukan(daftar, jenisKelamin, umurBln) {
    const cocok = (daftar || []).filter(r =>
      (r.jenis_kelamin == null || r.jenis_kelamin === jenisKelamin) &&
      (r.umur_min_bulan == null || umurBln == null || umurBln >= r.umur_min_bulan) &&
      (r.umur_max_bulan == null || umurBln == null || umurBln <  r.umur_max_bulan));
    if (!cocok.length) return null;

    const lebar = (r) =>
      (r.umur_max_bulan == null ? 2147483647 : r.umur_max_bulan) -
      (r.umur_min_bulan == null ? 0 : r.umur_min_bulan);

    return cocok.slice().sort((a, b) => {
      const ja = a.jenis_kelamin != null ? 0 : 1;
      const jb = b.jenis_kelamin != null ? 0 : 1;
      if (ja !== jb) return ja - jb;
      return lebar(a) - lebar(b);
    })[0];
  }

  /* ------------------------------------------------------------------
     Menandai sebuah nilai. Kembaran lab_tanda() di 11_penunjang.sql.

     Nilai kritis diperiksa LEBIH DULU daripada batas biasa: hemoglobin
     6,2 bukan sekadar "rendah", ia harus segera diberitahukan ke dokter.
     Kalau urutannya dibalik, kasus paling gawat justru tampil paling
     tenang.
     ------------------------------------------------------------------ */
  function tandaAngka(nilai, ruj) {
    if (nilai === null || nilai === undefined || nilai === '' || isNaN(nilai)) return 'BELUM';
    const r = ruj || {};
    const n  = Number(nilai);
    const kb = r.kritis_bawah, ka = r.kritis_atas;
    const bb = r.batas_bawah,  ba = r.batas_atas;
    if (kb !== null && kb !== undefined && n <= Number(kb)) return 'KRITIS_RENDAH';
    if (ka !== null && ka !== undefined && n >= Number(ka)) return 'KRITIS_TINGGI';
    if (bb !== null && bb !== undefined && n <  Number(bb)) return 'RENDAH';
    if (ba !== null && ba !== undefined && n >  Number(ba)) return 'TINGGI';
    if ((bb === null || bb === undefined) && (ba === null || ba === undefined)) return 'BELUM';
    return 'NORMAL';
  }

  function tandaTeks(nilaiTeks, teksNormal) {
    const v = (nilaiTeks == null ? '' : String(nilaiTeks)).trim();
    if (!v) return 'BELUM';
    if (teksNormal == null || teksNormal === '') return 'NORMAL';
    return v.toLowerCase() === String(teksNormal).trim().toLowerCase() ? 'NORMAL' : 'ABNORMAL';
  }

  /* Satu pintu: pilih cara menandai berdasarkan jenis nilai pemeriksaan. */
  function tandai(lab, ruj, nilaiAngka, nilaiTeks) {
    if (!lab) return 'BELUM';
    return lab.jenis_nilai === 'ANGKA'
      ? tandaAngka(nilaiAngka, ruj)
      : tandaTeks(nilaiTeks, lab.teks_normal);
  }

  /* ------------------------------------------------------------------
     Format angka seperti to_char(n,'FM999999990.0999') di PostgreSQL:
     tanpa pemisah ribuan, sedikitnya satu angka di belakang koma, dan
     nol di belakang dibuang. Ditiru persis supaya teks rujukan yang
     dibuat di layar sama dengan yang disimpan database.
     ------------------------------------------------------------------ */
  function fmSql(n) {
    if (n === null || n === undefined || n === '') return '';
    let s = (Math.round(Number(n) * 10000) / 10000).toFixed(4);
    s = s.replace(/(\.\d)0+$/, '$1').replace(/(\.\d*[1-9])0+$/, '$1');
    return s;
  }

  function teksRujukan(ruj, lab) {
    if (ruj && ruj.teks) return ruj.teks;
    const bb = ruj && ruj.batas_bawah, ba = ruj && ruj.batas_atas;
    const ada = (v) => v !== null && v !== undefined && v !== '';
    if (ada(bb) && ada(ba)) return fmSql(bb) + ' - ' + fmSql(ba);
    if (ada(ba)) return '< ' + fmSql(ba);
    if (ada(bb)) return '> ' + fmSql(bb);
    return (lab && lab.teks_normal) || '';
  }

  /* ------------------------------------------------------------------
     Membaca angka yang diketik petugas. Lihat catatan di kepala berkas:
     titik ditafsirkan sebagai pemisah ribuan hanya bila pemeriksaannya
     memang tidak berdesimal DAN kelompoknya tepat tiga angka.
     ------------------------------------------------------------------ */
  function bacaNilai(v, desimal) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;

    let s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    if (!/^-?[\d.,]+$/.test(s)) return null;

    const pemisah = s.match(/[.,]/g) || [];
    if (!pemisah.length) { const n = parseFloat(s); return isFinite(n) ? n : null; }

    const posTitik = s.lastIndexOf('.'), posKoma = s.lastIndexOf(',');
    const posAkhir = Math.max(posTitik, posKoma);
    const ekor = s.slice(posAkhir + 1);
    const duaMacam = posTitik >= 0 && posKoma >= 0;

    let ribuan;
    if (duaMacam)                 ribuan = false;     // yang terakhir pasti desimal
    else if (pemisah.length > 1)  ribuan = true;      // 1.234.567
    else ribuan = (ekor.length === 3 && Number(desimal || 0) === 0);

    if (ribuan) {
      s = s.replace(/[.,]/g, '');
    } else {
      const desimalChar = posTitik > posKoma ? '.' : ',';
      const ribuanChar  = desimalChar === '.' ? ',' : '.';
      s = s.split(ribuanChar).join('').replace(desimalChar, '.');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  /* Tampilan angka bergaya Indonesia: koma untuk desimal.

     `desimal` adalah jumlah angka MINIMAL di belakang koma, bukan maksimal.
     Kalau ia dijadikan batas atas, petugas yang mengetik 99,5 pada glukosa
     (desimal = 0) akan melihat 100 di layar dan di lembar cetak, sementara
     database menyimpan 99,5 dan menandainya dari 99,5. Layar dan berkas
     yang tidak sepakat soal angka adalah cacat yang mahal di rekam medis. */
  function formatNilai(n, desimal) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '';
    const d = Math.max(0, Math.min(4, Number(desimal) || 0));
    const pecahan = String(Math.round(Number(n) * 10000) / 10000).split('.')[1] || '';
    return Number(n).toLocaleString('id-ID', {
      minimumFractionDigits: d,
      maximumFractionDigits: Math.max(d, Math.min(4, pecahan.length))
    });
  }

  /* ------------------------------------------------------------------
     Ringkasan satu lembar hasil — dipakai untuk lencana di antrean lab
     dan untuk memutuskan apakah tombol "Selesaikan" boleh aktif.
     ------------------------------------------------------------------ */
  function ringkasLembar(hasil) {
    const h = hasil || [];
    const terisi = h.filter(x =>
      (x.nilai_angka !== null && x.nilai_angka !== undefined && x.nilai_angka !== '') ||
      (x.nilai_teks != null && String(x.nilai_teks).trim() !== ''));
    const takNormal = h.filter(x => (TANDA[x.tanda] || {}).berat >= 2);
    const kritis    = h.filter(x => (TANDA[x.tanda] || {}).berat >= 3);
    return {
      total: h.length,
      terisi: terisi.length,
      kosong: h.length - terisi.length,
      takNormal: takNormal.length,
      kritis: kritis.length,
      siapDitutup: h.length > 0 && terisi.length === h.length
    };
  }

  /* Urutan tampil: yang gawat di atas, sisanya menurut urutan lembar. */
  function urutMenonjol(hasil) {
    return (hasil || []).slice().sort((a, b) =>
      ((TANDA[b.tanda] || {}).berat || 0) - ((TANDA[a.tanda] || {}).berat || 0) ||
      (a.urutan || 0) - (b.urutan || 0));
  }

  /* Kelompokkan menurut kelompok pemeriksaan, untuk lembar hasil cetak. */
  function kelompokkan(hasil, master) {
    const peta = {};
    (master || []).forEach(m => { peta[m.id] = m.kelompok || 'Lainnya'; });
    const grup = new Map();
    (hasil || []).forEach(h => {
      const k = h.kelompok || peta[h.lab_id] || 'Lainnya';
      if (!grup.has(k)) grup.set(k, []);
      grup.get(k).push(h);
    });
    return Array.from(grup, ([kelompok, isi]) => ({
      kelompok, isi: isi.slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0))
    }));
  }

  /* ------------------------------------------------------------------
     Tren satu pemeriksaan pada satu pasien: urut menurut tanggal, dengan
     selisih terhadap pemeriksaan sebelumnya. Inilah yang tidak mungkin
     didapat kalau hasil lab hanya disimpan sebagai foto lembar.
     ------------------------------------------------------------------ */
  function susunTren(baris) {
    const urut = (baris || [])
      .filter(b => b.nilai_angka !== null && b.nilai_angka !== undefined)
      .slice()
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    return urut.map((b, i) => {
      const sebelum = i > 0 ? Number(urut[i - 1].nilai_angka) : null;
      const kini = Number(b.nilai_angka);
      return Object.assign({}, b, {
        nilai: kini,
        selisih: sebelum === null ? null : Number((kini - sebelum).toFixed(4)),
        arah: sebelum === null ? null : (kini > sebelum ? 'naik' : kini < sebelum ? 'turun' : 'tetap')
      });
    });
  }

  /* Nilai teks/pilihan yang tidak ada di daftar pilihan adalah salah
     ketik, bukan hasil. Ditahan di layar sebelum sampai ke database. */
  function validasi(lab, nilaiAngka, nilaiTeks) {
    if (!lab) return 'Pemeriksaan tidak dikenal.';
    if (lab.jenis_nilai === 'ANGKA') {
      if (nilaiAngka === null || nilaiAngka === undefined || nilaiAngka === '') return null;
      if (isNaN(Number(nilaiAngka))) return 'Nilai harus berupa angka.';
      if (Number(nilaiAngka) < 0) return 'Nilai tidak boleh negatif.';
      return null;
    }
    if (lab.jenis_nilai === 'PILIHAN') {
      const v = (nilaiTeks == null ? '' : String(nilaiTeks)).trim();
      if (!v) return null;
      const daftar = lab.pilihan || [];
      if (daftar.length && !daftar.some(p => p.toLowerCase() === v.toLowerCase()))
        return 'Pilih salah satu: ' + daftar.join(', ');
    }
    return null;
  }

  const API = {
    TANDA, JENIS_PENUNJANG, JENIS_LAMPIRAN,
    labelJenis, jenisPakaiGigi, labelLampiran,
    umurBulan, pilihRujukan, tandaAngka, tandaTeks, tandai,
    fmSql, teksRujukan, bacaNilai, formatNilai,
    ringkasLembar, urutMenonjol, kelompokkan, susunTren, validasi
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

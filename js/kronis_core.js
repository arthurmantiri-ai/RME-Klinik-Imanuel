/* =====================================================================
   KRONIS CORE — pembacaan berkas ekspor portal, kunci pasien, pemetaan
   diagnosis, dan penilaian usulan pasangan (fungsi murni)

   Modul ini SENGAJA tidak menyentuh DOM dan tidak memanggil Supabase,
   sehingga bisa diuji di luar peramban: `node test/uji_kronis_core.js`.

   ---------------------------------------------------------------------
   KENAPA KUNCI PASIEN DITULIS DUA KALI

   Yang BERLAKU adalah kronis_kunci() di sql/16_kronis.sql — itulah yang
   benar-benar mengelompokkan baris portal menjadi orang. Yang di sini
   kembarannya, dipakai halaman untuk menghitung "berapa orang" pada
   pratinjau sebelum apa pun dikirim ke server.

   Dua salinan bisa berselisih diam-diam, dan selisihnya di sini punya
   akibat yang tidak enak: pratinjau berkata 120 orang, yang masuk 138,
   dan tidak ada yang tahu mana yang benar. Karena itu
   test/uji_kronis_core.js memakai contoh yang PERSIS SAMA dengan
   uji nomor 1 dan 2 pada test/uji_kronis.sql.

   ---------------------------------------------------------------------
   KENAPA PEMBACA CSV DITULIS SENDIRI, BUKAN MEMAKAI SheetJS

   Berkas ekspor portal hanya punya satu kolom berisi JSON. Memuat
   pustaka 900 KB dari CDN untuk memecah teks bertanda koma adalah
   ketergantungan yang tidak perlu — dan CDN yang tidak terjangkau pada
   jam praktek berarti migrasi berhenti tanpa sebab yang kelihatan.

   Pembaca di bawah menangani tiga hal yang benar-benar muncul di berkas
   Supabase: tanda kutip ganda di dalam teks, koma di dalam teks, dan
   GANTI BARIS DI DALAM TEKS. Yang ketiga bukan kemungkinan teoretis:
   kolom resep_tetap portal memang berisi beberapa baris obat.
   ===================================================================== */
const KronisCore = (() => {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* 1. Pembaca CSV                                                    */
  /* ---------------------------------------------------------------- */

  /* Memecah teks CSV menjadi array-of-array. Mengikuti RFC 4180:
     - Bidang boleh dibungkus tanda kutip ganda.
     - Di dalam bungkus itu, "" berarti satu tanda kutip.
     - Di dalam bungkus itu, koma dan ganti baris adalah isi, bukan pemisah.
     BOM di awal berkas dibuang: Excel menaruhnya, dan tanpa dibuang
     nama kolom pertama menjadi "﻿baris" yang tidak cocok dengan apa pun. */
  function pecahCsv(teks) {
    const s = String(teks || '').replace(/^﻿/, '');
    const hasil = [];
    let baris = [], bidang = '', dalamKutip = false, i = 0;

    while (i < s.length) {
      const c = s[i];
      if (dalamKutip) {
        if (c === '"') {
          if (s[i + 1] === '"') { bidang += '"'; i += 2; continue; }
          dalamKutip = false; i++; continue;
        }
        bidang += c; i++; continue;
      }
      if (c === '"') { dalamKutip = true; i++; continue; }
      if (c === ',') { baris.push(bidang); bidang = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { baris.push(bidang); hasil.push(baris); baris = []; bidang = ''; i++; continue; }
      bidang += c; i++;
    }
    if (bidang !== '' || baris.length) { baris.push(bidang); hasil.push(baris); }
    return hasil;
  }

  /* Mengubah teks CSV ekspor portal menjadi array objek.

     Dua bentuk diterima, karena keduanya benar-benar terjadi:
       a. satu kolom bernama "baris" berisi JSON  — hasil ekspor-portal.sql
       b. kolom apa adanya dari tabel portal      — hasil "select *" biasa

     Baris yang JSON-nya rusak TIDAK membatalkan seluruh berkas: ia
     dikumpulkan di `gagal` supaya kelihatan, sementara sisanya tetap
     bisa dimasukkan. Berkas 4.000 baris yang ditolak seluruhnya karena
     satu baris cacat adalah cara tercepat membuat migrasi ditinggalkan. */
  function bacaEkspor(teks) {
    const tabel = pecahCsv(teks).filter(r => r.some(c => String(c).trim() !== ''));
    if (!tabel.length) return { baris: [], gagal: [], bentuk: 'kosong' };

    const kepala = tabel[0].map(h => String(h || '').trim());
    const isi = tabel.slice(1);
    const baris = [], gagal = [];

    if (kepala.length === 1 && kepala[0].toLowerCase() === 'baris') {
      isi.forEach((r, n) => {
        const t = String(r[0] || '').trim();
        if (!t) return;
        try {
          const o = JSON.parse(t);
          if (o && typeof o === 'object') baris.push(o);
          else gagal.push({ baris: n + 2, sebab: 'Bukan objek JSON.' });
        } catch (e) {
          gagal.push({ baris: n + 2, sebab: 'JSON tidak terbaca.' });
        }
      });
      return { baris, gagal, bentuk: 'json' };
    }

    isi.forEach((r) => {
      const o = {};
      kepala.forEach((h, k) => { if (h) o[h] = r[k] === undefined ? null : r[k]; });
      baris.push(o);
    });
    return { baris, gagal, bentuk: 'kolom' };
  }

  /* ---------------------------------------------------------------- */
  /* 2. Kunci pasien — kembaran kronis_kunci() di 16_kronis.sql        */
  /* ---------------------------------------------------------------- */

  const angkaSaja = (v) => String(v == null ? '' : v).replace(/\D/g, '');

  function kunci(nama, bpjs) {
    const b = angkaSaja(bpjs);
    if (b !== '') return 'b:' + b;
    return 'n:' + String(nama == null ? '' : nama).trim().toLowerCase();
  }

  /* ---------------------------------------------------------------- */
  /* 3. Pemetaan diagnosis portal — kembaran kronis_kode_diagnosa()    */
  /* ---------------------------------------------------------------- */

  /* Portal menulis diagnosis dengan dua kebiasaan berbeda:
       obat kronis : 'Hipertensi, Diabetes Melitus'
       lab rutin   : 'HPT+DM'
     Koma, tanda tambah, garis miring, dan titik koma sama-sama pemisah. */
  function kodeDiagnosa(teks, daftarRef) {
    const ref = daftarRef || REF_BAWAAN;
    const potong = String(teks == null ? '' : teks)
      .replace(/[+/;]/g, ',')
      .split(',')
      .map(x => x.trim().toLowerCase())
      .filter(Boolean);
    const keluar = new Set();
    potong.forEach(kata => {
      ref.forEach(d => {
        if ((d.alias || []).some(a => String(a).trim().toLowerCase() === kata)) keluar.add(d.kode);
      });
    });
    return [...keluar].sort();
  }

  /* Salinan isi ref_kronis_diagnosa, dipakai bila halaman belum sempat
     memuatnya dari database (pratinjau berkas sebelum apa pun dikirim). */
  const REF_BAWAAN = [
    { kode: 'HPT',      nama: 'Hipertensi',       bulan_lab: 6,    alias: ['Hipertensi','HPT','HT'] },
    { kode: 'DM',       nama: 'Diabetes Melitus', bulan_lab: 3,    alias: ['Diabetes Melitus','DM','DMT2'] },
    { kode: 'ASMA',     nama: 'Asma',             bulan_lab: null, alias: ['Asma'] },
    { kode: 'PPOK',     nama: 'PPOK',             bulan_lab: null, alias: ['PPOK'] },
    { kode: 'JANTUNG',  nama: 'Jantung',          bulan_lab: null, alias: ['Jantung','PJK'] },
    { kode: 'SKIZO',    nama: 'Skizofrenia',      bulan_lab: null, alias: ['Skizofrenia'] },
    { kode: 'EPILEPSI', nama: 'Epilepsi',         bulan_lab: null, alias: ['Epilepsi'] },
    { kode: 'STROKE',   nama: 'Stroke',           bulan_lab: null, alias: ['Stroke'] },
    { kode: 'CKD',      nama: 'CKD',              bulan_lab: null, alias: ['CKD','Gagal Ginjal Kronik'] },
    { kode: 'SLE',      nama: 'SLE',              bulan_lab: null, alias: ['SLE','Lupus'] }
  ];

  /* ---------------------------------------------------------------- */
  /* 4. Ringkasan berkas sebelum dikirim                               */
  /* ---------------------------------------------------------------- */

  /* Nama tabel portal -> nama sumber yang dikenal kronis_impor_tampung().
     Ditebak dari kolom yang ada, bukan dari nama berkas: berkas yang
     tertukar namanya saat diunduh jauh lebih sering daripada berkas yang
     isinya salah. */
  function tebakSumber(barisPertama) {
    const o = barisPertama || {};
    const ada = (k) => Object.prototype.hasOwnProperty.call(o, k);
    if (ada('tanggal_ambil'))                     return 'OBAT_KRONIS';
    if (ada('tanggal_lab'))                       return 'LAB_RUTIN';
    if (ada('tanggal_kontrol'))                   return 'PASIEN_KONTROL';
    if (ada('resep_tetap') || ada('statin_obat')) return 'KRONIS_TERAPI';
    return null;
  }

  const LABEL_SUMBER = {
    KRONIS_TERAPI:  'Pendaftaran terapi kronis',
    OBAT_KRONIS:    'Riwayat pengambilan obat',
    LAB_RUTIN:      'Riwayat pemeriksaan lab',
    PASIEN_KONTROL: 'Jadwal kontrol pasien'
  };

  /* Berapa ORANG di dalam berkas, dan berapa yang tanpa nomor BPJS.
     Angka kedua itu yang paling berguna: baris tanpa BPJS tidak akan
     pernah bisa ditempel otomatis, jadi ia langsung memberi tahu berapa
     banyak pekerjaan tangan yang menanti. */
  function ringkasBerkas(baris) {
    const orang = new Map();
    let tanpaNama = 0;
    (baris || []).forEach(r => {
      const nama = String(r.nama_pasien == null ? '' : r.nama_pasien).trim();
      if (!nama) { tanpaNama++; return; }
      const k = kunci(nama, r.no_bpjs);
      if (!orang.has(k)) orang.set(k, { kunci: k, nama, bpjs: angkaSaja(r.no_bpjs), jml: 0 });
      orang.get(k).jml++;
    });
    const daftar = [...orang.values()];
    return {
      baris: (baris || []).length,
      tanpaNama,
      orang: daftar.length,
      tanpaBpjs: daftar.filter(o => !o.bpjs).length,
      daftar
    };
  }

  /* ---------------------------------------------------------------- */
  /* 5. Usulan pasangan — kembaran kronis_impor_usulan()               */
  /* ---------------------------------------------------------------- */

  /* Dipakai HANYA untuk mengurutkan ulang dan memberi label di layar;
     yang menentukan tetap fungsi SQL. Ditulis di sini supaya urutan yang
     dilihat petugas tidak berubah-ubah ketika jaringan lambat dan
     jawaban server datang tidak berurutan. */
  const KATEGORI = { 100: 'Nomor BPJS sama', 90: 'Nama sama persis' };

  function labelSkor(skor) {
    const n = Number(skor) || 0;
    if (n >= 100) return KATEGORI[100];
    if (n >= 90)  return KATEGORI[90];
    if (n >= 60)  return 'Nama sangat mirip';
    if (n >= 40)  return 'Nama mirip';
    return 'Kemiripan rendah';
  }

  /* Warna lencana. Sengaja TIDAK ada hijau di bawah 90: kemiripan nama
     70% terlihat meyakinkan di layar dan sama sekali bukan bukti. */
  function warnaSkor(skor) {
    const n = Number(skor) || 0;
    if (n >= 100) return 'ok';
    if (n >= 90)  return 'info';
    return 'warn';
  }

  /* Apakah sepasang boleh ditempel TANPA ditanya lagi.
     Syaratnya dua, dan keduanya wajib:
       - nomor BPJS sama persis
       - nomor itu hanya menunjuk SATU pasien
     Nomor BPJS yang menunjuk dua pasien adalah tanda salah ketik pada
     salah satunya; menebak di situ berarti menempelkan riwayat penyakit
     seseorang ke orang lain. */
  function bolehOtomatis(kunciPortal, usulan) {
    const list = usulan || [];
    if (!String(kunciPortal || '').startsWith('b:')) return false;
    const seratus = list.filter(u => Number(u.skor) >= 100);
    return seratus.length === 1;
  }

  /* ---------------------------------------------------------------- */
  /* 6. Nomor & tautan WhatsApp                                        */
  /* ---------------------------------------------------------------- */

  /* Keputusan Arthur 4 Sep 2026: cukup tautan, tidak ada pengiriman
     otomatis. Karena itu di sini hanya ada perapian nomor. */
  function waNomor(telp) {
    let d = angkaSaja(telp);
    if (!d) return null;
    if (d.startsWith('62')) return d;
    if (d.startsWith('0'))  return '62' + d.slice(1);
    if (d.startsWith('8'))  return '62' + d;
    return d;
  }

  function waTautan(telp, pesan) {
    const no = waNomor(telp);
    if (!no) return null;
    return 'https://wa.me/' + no + (pesan ? '?text=' + encodeURIComponent(pesan) : '');
  }

  /* ---------------------------------------------------------------- */
  /* 7. Pemecah resep rutin portal                                     */
  /* ---------------------------------------------------------------- */

  /* Kotak teks resep_tetap portal dipecah per baris. Baris kosong dibuang,
     spasi tepi dirapikan, dan urutannya dipertahankan — dokter menulis
     obat utama di baris pertama, dan urutan itu punya arti baginya. */
  function pecahResep(teks) {
    return String(teks == null ? '' : teks)
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  const API = {
    pecahCsv, bacaEkspor,
    kunci, angkaSaja, kodeDiagnosa, REF_BAWAAN,
    tebakSumber, LABEL_SUMBER, ringkasBerkas,
    labelSkor, warnaSkor, bolehOtomatis,
    waNomor, waTautan, pecahResep
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

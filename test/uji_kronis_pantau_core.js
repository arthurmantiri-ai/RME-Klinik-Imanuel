/* Uji fungsi murni kronis_pantau_core.js — dijalankan dengan `node`,
   tanpa peramban dan tanpa database.

   Berbeda dengan uji_kronis_core.js (yang membandingkan dua salinan
   ATURAN YANG SAMA), berkas ini menguji klasifikasi yang HANYA ada di
   satu tempat: SQL di 18_kronis_pantau.sql sengaja tidak pernah
   menghitung label Aman/Terlambat, jadi tidak ada pasangan SQL untuk
   dibandingkan di sini — lihat catatan di kepala kronis_pantau_core.js.
   Yang diuji adalah ambang batasnya sendiri: 0 hari, tepat di batas
   toleransi 14 hari, dan satu hari lewatnya. */
'use strict';
const K = require('../js/kronis_pantau_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}

/* ==================================================================== */
console.log('\n1. Status "belum ambil obat bulan ini"');

cek('sudah ambil bulan ini = SUDAH',
  K.statusObat({ bulan_ini_ambil: true, terakhir_ambil: '2026-09-07' }) === 'SUDAH');
cek('belum pernah sama sekali = BELUM_PERNAH',
  K.statusObat({ bulan_ini_ambil: false, terakhir_ambil: null }) === 'BELUM_PERNAH');
cek('pernah ambil tapi bukan bulan ini = TERLAMBAT',
  K.statusObat({ bulan_ini_ambil: false, terakhir_ambil: '2026-07-10' }) === 'TERLAMBAT');

cek('label tertinggal 1 bulan pakai kalimat baku',
  K.labelStatusObat({ bulan_ini_ambil: false, terakhir_ambil: '2026-08-01', bulan_tertinggal: 1 })
    === 'Belum ambil bulan ini');
cek('label tertinggal >1 bulan menyebut angkanya',
  K.labelStatusObat({ bulan_ini_ambil: false, terakhir_ambil: '2026-05-01', bulan_tertinggal: 4 })
    === 'Tertinggal 4 bulan');

cek('warna SUDAH = ok', K.warnaStatusObat({ bulan_ini_ambil: true }) === 'ok');
cek('warna BELUM_PERNAH = warn (bukan danger — belum tentu pasien bermasalah)',
  K.warnaStatusObat({ bulan_ini_ambil: false, terakhir_ambil: null }) === 'warn');
cek('warna tertinggal 1 bulan = warn',
  K.warnaStatusObat({ bulan_ini_ambil: false, terakhir_ambil: 'x', bulan_tertinggal: 1 }) === 'warn');
cek('warna tertinggal 2 bulan atau lebih = danger',
  K.warnaStatusObat({ bulan_ini_ambil: false, terakhir_ambil: 'x', bulan_tertinggal: 2 }) === 'danger');

/* ==================================================================== */
console.log('\n2. Jadwal & kepatuhan lab (toleransi 14 hari)');

cek('belum jatuh tempo (negatif) = AMAN', K.statusLab({ hari_lewat_jadwal: -5 }) === 'AMAN');
cek('tepat hari jatuh tempo (0) = AMAN, bukan MENDEKATI',
  K.statusLab({ hari_lewat_jadwal: 0 }) === 'AMAN');
cek('sehari lewat = MENDEKATI', K.statusLab({ hari_lewat_jadwal: 1 }) === 'MENDEKATI');
cek('tepat di batas toleransi (14) MASIH MENDEKATI, belum TERLAMBAT',
  K.statusLab({ hari_lewat_jadwal: 14 }) === 'MENDEKATI');
cek('satu hari lewat toleransi (15) = TERLAMBAT',
  K.statusLab({ hari_lewat_jadwal: 15 }) === 'TERLAMBAT');
cek('toleransi bisa diubah tanpa mengubah kode (uji dengan toleransi 7)',
  K.statusLab({ hari_lewat_jadwal: 10 }, 7) === 'TERLAMBAT');

cek('label terlambat menyebut selisih SETELAH toleransi, bukan hari mentah',
  K.labelStatusLab({ hari_lewat_jadwal: 20 }) === 'Terlambat 6 hari dari toleransi');
cek('warna AMAN = ok', K.warnaStatusLab({ hari_lewat_jadwal: -1 }) === 'ok');
cek('warna MENDEKATI = warn', K.warnaStatusLab({ hari_lewat_jadwal: 5 }) === 'warn');
cek('warna TERLAMBAT = danger', K.warnaStatusLab({ hari_lewat_jadwal: 30 }) === 'danger');

/* ==================================================================== */
console.log('\n3. Kuota obat berkuota (statin)');

cek('belum dipakai sama sekali: sisa penuh, tidak ada peringatan',
  JSON.stringify(K.statinInfo({ maks: 3, terpakai: 0 })) ===
  JSON.stringify({ maks: 3, terpakai: 0, sisa: 3, peringatan: false, mendekati: false }));
cek('sisa tepat 1 = mendekati, bukan peringatan',
  (() => { const i = K.statinInfo({ maks: 3, terpakai: 2 });
           return i.sisa === 1 && i.mendekati === true && i.peringatan === false; })());
cek('tepat di kuota (3/3) = peringatan',
  K.statinInfo({ maks: 3, terpakai: 3 }).peringatan === true);
cek('melebihi kuota tidak minus (sisa dilantai di 0)',
  K.statinInfo({ maks: 3, terpakai: 5 }).sisa === 0);
cek('label menyebut angka terpakai/maks',
  K.labelStatin({ maks: 3, terpakai: 1 }) === '1/3 dipakai');
cek('label peringatan menyebut "terlampaui"',
  K.labelStatin({ maks: 3, terpakai: 4 }).includes('terlampaui'));
cek('warna peringatan = danger', K.warnaStatin({ maks: 3, terpakai: 3 }) === 'danger');
cek('warna mendekati = warn', K.warnaStatin({ maks: 3, terpakai: 2 }) === 'warn');
cek('warna aman = ok', K.warnaStatin({ maks: 3, terpakai: 0 }) === 'ok');

/* ==================================================================== */
console.log('\n4. Peringatan H-3');

cek('pasien tidak terdaftar kronis (null) memulangkan null, bukan meledak',
  K.h3Info(null) === null && K.pesanH3(null) === null);
cek('jauh dari jadwal (10 hari lagi) = terlalu cepat',
  K.h3Info({ hari_menuju_jadwal: 10 }).terlaluCepat === true);
cek('tepat H-3 BOLEH diambil, bukan "terlalu cepat"',
  K.h3Info({ hari_menuju_jadwal: 3 }).terlaluCepat === false);
cek('H-4 masih terlalu cepat (satu hari sebelum boleh)',
  K.h3Info({ hari_menuju_jadwal: 4 }).terlaluCepat === true);
cek('jadwal sudah lewat (negatif) sama sekali tidak "terlalu cepat"',
  K.h3Info({ hari_menuju_jadwal: -5 }).terlaluCepat === false);
cek('pesan H-3 menyebutkan peringatan, bukan penolakan',
  K.pesanH3({ hari_menuju_jadwal: 10 }).toLowerCase().includes('bukan penolakan'));
cek('tidak ada pesan ketika tidak terlalu cepat',
  K.pesanH3({ hari_menuju_jadwal: 1 }) === null);

/* ==================================================================== */
console.log('\n5. Pesan daftar telepon H-1');

cek('pesan menyebut nama pasien',
  K.pesanTelponH1({ nama: 'Budi Santoso' }).includes('Budi Santoso'));
cek('pesan menyertakan instruksi petugas bila ada',
  K.pesanTelponH1({ nama: 'Budi', kontrol_instruksi: 'Puasa 10 jam' }).includes('Puasa 10 jam'));
cek('tanpa nama tidak meledak (jatuh ke sapaan umum)',
  typeof K.pesanTelponH1({}) === 'string' && K.pesanTelponH1({}).length > 0);

cek('pesan pengingat obat beda kalimat untuk belum-pernah vs sudah-tertinggal',
  K.pesanPengingatObat({ nama: 'A', bulan_ini_ambil: false, terakhir_ambil: null })
    !== K.pesanPengingatObat({ nama: 'A', bulan_ini_ambil: false, terakhir_ambil: '2026-01-01' }));
cek('pesan pengingat lab menyebut nama pasien',
  K.pesanPengingatLab({ nama: 'Siti' }).includes('Siti'));

console.log(`\n${lulus} pemeriksaan lulus — kronis_pantau_core.js`);

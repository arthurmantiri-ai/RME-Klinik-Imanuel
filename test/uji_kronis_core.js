/* Uji fungsi murni kronis_core.js — dijalankan dengan `node`, tanpa
   peramban dan tanpa database.

   ---------------------------------------------------------------------
   CONTOH DI SINI SAMA PERSIS DENGAN test/uji_kronis.sql

   Dua aturan modul kronis ditulis dua kali, dan keduanya diuji dengan
   nilai yang sama persis di kedua sisi:

     kunci pasien       kronis_kunci()          ↔  KronisCore.kunci()
     pemetaan diagnosis kronis_kode_diagnosa()  ↔  KronisCore.kodeDiagnosa()

   Kalau salah satunya diubah, uji ini GAGAL — bukan pratinjau di layar
   yang diam-diam berselisih dengan apa yang benar-benar masuk. Selisih
   di sini bergejala buruk: layar berkata "120 orang akan dimasukkan",
   yang masuk 138, dan tidak ada yang tahu angka mana yang benar.

   BERKAS INI DIJALANKAN DI ZONA WAKTU BARAT, sama seperti uji core yang
   lain. Modul ini memang tidak membaca jam mana pun — dan justru itu
   yang dijaga: begitu ada yang menyelipkan new Date() ke dalamnya, uji
   ini yang pertama berteriak. */
'use strict';
process.env.TZ = 'America/Los_Angeles';
const K = require('../js/kronis_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ==================================================================== */
console.log('\n1. Kunci pasien — contoh sama persis dengan uji_kronis.sql nomor 1');

cek('BPJS menang atas nama', K.kunci('Budi Santoso', '0001234567890') === 'b:0001234567890');
cek('tanda baca pada BPJS diabaikan', K.kunci('Budi', '000-123 456 7890') === 'b:0001234567890');
cek('tanpa BPJS jatuh ke nama', K.kunci('  Siti Aminah ', null) === 'n:siti aminah');
cek('BPJS kosong sama dengan tanpa BPJS', K.kunci('Siti Aminah', '') === 'n:siti aminah');
cek('BPJS tanpa angka jatuh ke nama', K.kunci('Ahmad', '-') === 'n:ahmad');
/* Nol di depan TIDAK dibuang. Kalau dibuang, dua nomor BPJS berbeda bisa
   menjadi kunci yang sama, dan dua orang tergabung jadi satu. */
cek('nol depan dipertahankan', K.kunci('X', '0001') === 'b:0001');
cek('nama kosong tetap menghasilkan kunci', K.kunci('', null) === 'n:');

/* ==================================================================== */
console.log('\n2. Pemetaan diagnosis — contoh sama persis dengan uji_kronis.sql nomor 2');

cek('bentuk obat kronis',
  sama(K.kodeDiagnosa('Hipertensi, Diabetes Melitus'), ['DM', 'HPT']),
  JSON.stringify(K.kodeDiagnosa('Hipertensi, Diabetes Melitus')));
cek('bentuk lab rutin HPT+DM', sama(K.kodeDiagnosa('HPT+DM'), ['DM', 'HPT']));
cek('DM tunggal', sama(K.kodeDiagnosa('DM'), ['DM']));
cek('dua diagnosis paru', sama(K.kodeDiagnosa('Asma, PPOK'), ['ASMA', 'PPOK']));
cek('yang bukan kronis tidak dipetakan', sama(K.kodeDiagnosa('Batuk Pilek'), []));
cek('null tidak meledak', sama(K.kodeDiagnosa(null), []));
cek('alias ganda tetap satu kode', sama(K.kodeDiagnosa('Hipertensi, HPT'), ['HPT']));
cek('huruf besar-kecil tidak berpengaruh', sama(K.kodeDiagnosa('hipertensi'), ['HPT']));

console.log('\n3. Hanya HPT dan DM yang punya jatah lab');
cek('dua diagnosis berjatah lab',
  K.REF_BAWAAN.filter(d => d.bulan_lab != null).length === 2);
cek('DM tiap 3 bulan', K.REF_BAWAAN.find(d => d.kode === 'DM').bulan_lab === 3);
cek('HPT tiap 6 bulan', K.REF_BAWAAN.find(d => d.kode === 'HPT').bulan_lab === 6);
cek('sepuluh diagnosis kronis', K.REF_BAWAAN.length === 10);

/* ==================================================================== */
console.log('\n4. Pembaca CSV');

cek('baris biasa', sama(K.pecahCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]));
cek('koma di dalam kutip bukan pemisah',
  sama(K.pecahCsv('a\n"satu, dua"\n'), [['a'], ['satu, dua']]));
cek('kutip ganda di dalam kutip',
  sama(K.pecahCsv('a\n"dia bilang ""ya"""\n'), [['a'], ['dia bilang "ya"']]));
/* Inilah alasan pembaca ini ditulis sendiri: resep_tetap portal berisi
   beberapa baris obat, dan pemecah berbasis split('\n') akan memotongnya. */
cek('ganti baris di dalam kutip bukan akhir baris',
  sama(K.pecahCsv('a\n"Amlodipine\nMetformin"\n'), [['a'], ['Amlodipine\nMetformin']]));
cek('CRLF tidak meninggalkan \\r', sama(K.pecahCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]));
cek('baris terakhir tanpa ganti baris tetap terbaca',
  sama(K.pecahCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]));
cek('BOM Excel dibuang', K.pecahCsv('﻿baris\n')[0][0] === 'baris');
cek('bidang kosong tetap jadi kolom', sama(K.pecahCsv('a,b,c\n1,,3\n'), [['a','b','c'], ['1','','3']]));

/* ==================================================================== */
console.log('\n5. Membaca berkas ekspor portal');

const csvJson = 'baris\n' +
  '"{""id"":1,""nama_pasien"":""Budi Santoso"",""no_bpjs"":""0001234567890"",' +
  '""resep_tetap"":""Amlodipine 5 mg\\nMetformin 500 mg""}"\n' +
  '"{""id"":2,""nama_pasien"":""Siti Aminah"",""no_bpjs"":null}"\n';

let hasil = K.bacaEkspor(csvJson);
cek('bentuk JSON dikenali', hasil.bentuk === 'json');
cek('dua baris terbaca', hasil.baris.length === 2, String(hasil.baris.length));
cek('tidak ada yang gagal', hasil.gagal.length === 0);
cek('ganti baris di dalam resep utuh',
  hasil.baris[0].resep_tetap === 'Amlodipine 5 mg\nMetformin 500 mg',
  JSON.stringify(hasil.baris[0].resep_tetap));

/* Satu baris rusak tidak boleh membatalkan seluruh berkas. */
hasil = K.bacaEkspor('baris\n"{""nama_pasien"":""A""}"\nbukan-json\n"{""nama_pasien"":""B""}"\n');
cek('baris rusak dilewati, sisanya tetap terbaca', hasil.baris.length === 2, String(hasil.baris.length));
cek('baris rusak dilaporkan', hasil.gagal.length === 1 && hasil.gagal[0].baris === 3,
  JSON.stringify(hasil.gagal));

/* Bentuk kedua: "select *" biasa, kolom apa adanya. */
hasil = K.bacaEkspor('nama_pasien,no_bpjs,tanggal_ambil\nBudi,0001,2026-01-05\n');
cek('bentuk kolom dikenali', hasil.bentuk === 'kolom');
cek('kolom jadi kunci objek', hasil.baris[0].nama_pasien === 'Budi' &&
  hasil.baris[0].tanggal_ambil === '2026-01-05');

cek('berkas kosong tidak meledak', K.bacaEkspor('').bentuk === 'kosong');
cek('berkas hanya kepala tidak meledak', K.bacaEkspor('baris\n').baris.length === 0);

/* ==================================================================== */
console.log('\n6. Menebak sumber dari isi, bukan dari nama berkas');

cek('riwayat ambil obat', K.tebakSumber({ tanggal_ambil: '2026-01-01' }) === 'OBAT_KRONIS');
cek('riwayat lab',        K.tebakSumber({ tanggal_lab: '2026-01-01' }) === 'LAB_RUTIN');
cek('jadwal kontrol',     K.tebakSumber({ tanggal_kontrol: '2026-01-01' }) === 'PASIEN_KONTROL');
cek('pendaftaran terapi', K.tebakSumber({ resep_tetap: 'Amlodipine' }) === 'KRONIS_TERAPI');
cek('terapi dikenali dari kolom statin', K.tebakSumber({ statin_obat: 'Simvastatin' }) === 'KRONIS_TERAPI');
cek('yang tidak dikenali memulangkan null', K.tebakSumber({ apa_ini: 1 }) === null);
cek('objek kosong tidak meledak', K.tebakSumber(null) === null);
/* Urutan pemeriksaan penting: baris obat_kronis punya kolom diagnosis
   sama seperti kronis_terapi, jadi tanggal_ambil harus diperiksa dulu. */
cek('obat kronis menang atas terapi',
  K.tebakSumber({ tanggal_ambil: '2026-01-01', resep_tetap: 'x' }) === 'OBAT_KRONIS');

/* ==================================================================== */
console.log('\n7. Ringkasan berkas — berapa ORANG, dan berapa yang tanpa BPJS');

const baris = [
  { nama_pasien: 'Budi Santoso', no_bpjs: '0001234567890' },
  { nama_pasien: 'Budi Santoso', no_bpjs: '000-123-456-7890' },   // orang yang sama
  { nama_pasien: 'Siti Aminah',  no_bpjs: null },
  { nama_pasien: 'Siti Aminah',  no_bpjs: '' },                    // orang yang sama
  { nama_pasien: '',             no_bpjs: '0009' }                 // tanpa nama
];
const r = K.ringkasBerkas(baris);
cek('lima baris', r.baris === 5);
cek('dua orang', r.orang === 2, String(r.orang));
cek('satu tanpa nama dilaporkan', r.tanpaNama === 1);
cek('satu orang tanpa BPJS', r.tanpaBpjs === 1, String(r.tanpaBpjs));
cek('hitungan per orang benar',
  r.daftar.find(o => o.kunci === 'b:0001234567890').jml === 2);
cek('berkas kosong tidak meledak', K.ringkasBerkas(null).orang === 0);

/* ==================================================================== */
console.log('\n8. Label & warna usulan — tidak ada hijau untuk tebakan');

cek('BPJS sama', K.labelSkor(100) === 'Nomor BPJS sama');
cek('nama sama persis', K.labelSkor(90) === 'Nama sama persis');
cek('nama sangat mirip', K.labelSkor(72) === 'Nama sangat mirip');
cek('nama mirip', K.labelSkor(45) === 'Nama mirip');
cek('kemiripan rendah', K.labelSkor(10) === 'Kemiripan rendah');
cek('hanya BPJS sama yang berwarna hijau', K.warnaSkor(100) === 'ok');
cek('nama sama persis belum hijau', K.warnaSkor(90) === 'info');
cek('kemiripan 80 persen tetap peringatan', K.warnaSkor(80) === 'warn');

/* ==================================================================== */
console.log('\n9. Kapan boleh ditempel tanpa ditanya');

cek('BPJS sama dan tunggal boleh',
  K.bolehOtomatis('b:0001', [{ skor: 100 }]) === true);
cek('BPJS sama tapi menunjuk dua pasien TIDAK boleh',
  K.bolehOtomatis('b:0001', [{ skor: 100 }, { skor: 100 }]) === false);
cek('tanpa BPJS tidak pernah otomatis',
  K.bolehOtomatis('n:budi santoso', [{ skor: 100 }]) === false);
cek('nama sama persis saja tidak cukup',
  K.bolehOtomatis('b:0001', [{ skor: 90 }]) === false);
cek('tanpa usulan tidak meledak', K.bolehOtomatis('b:0001', null) === false);

/* ==================================================================== */
console.log('\n10. Nomor WhatsApp');

cek('08 jadi 628', K.waNomor('081234567890') === '6281234567890');
cek('8 di depan jadi 628', K.waNomor('81234567890') === '6281234567890');
cek('62 dibiarkan', K.waNomor('6281234567890') === '6281234567890');
cek('tanda baca dibuang', K.waNomor('0812-3456-7890') === '6281234567890');
cek('kosong memulangkan null', K.waNomor('') === null);
cek('bukan angka memulangkan null', K.waNomor('-') === null);
cek('tautan memuat pesan tersandi',
  K.waTautan('081234567890', 'Halo Pak') === 'https://wa.me/6281234567890?text=Halo%20Pak');
cek('tanpa nomor tidak ada tautan', K.waTautan(null, 'x') === null);
cek('tanpa pesan tetap jadi tautan',
  K.waTautan('081234567890') === 'https://wa.me/6281234567890');

/* ==================================================================== */
console.log('\n11. Pemecah resep rutin portal');

cek('tiga baris obat',
  sama(K.pecahResep('Amlodipine 5 mg\nMetformin 500 mg\nSimvastatin 20 mg'),
       ['Amlodipine 5 mg', 'Metformin 500 mg', 'Simvastatin 20 mg']));
cek('baris kosong dibuang', sama(K.pecahResep('A\n\n\nB'), ['A', 'B']));
cek('spasi tepi dirapikan', sama(K.pecahResep('  A  \n  B'), ['A', 'B']));
cek('CRLF ikut terpecah', sama(K.pecahResep('A\r\nB'), ['A', 'B']));
cek('kosong memulangkan larik kosong', sama(K.pecahResep(''), []));
cek('null tidak meledak', sama(K.pecahResep(null), []));

console.log(`\n${lulus} pemeriksaan lulus — kronis_core.js`);

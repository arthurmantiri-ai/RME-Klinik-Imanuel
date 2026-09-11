/* Uji fungsi murni pra_daftar_core.js — dijalankan dengan `node`, tanpa
   peramban dan tanpa database. */
'use strict';
const K = require('../js/pra_daftar_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}

const SEKARANG = new Date('2026-09-11T00:00:00Z');

/* ==================================================================== */
console.log('\n1. Normalisasi jenis kelamin');

cek('L langsung', K.normalisasiJK('L') === 'L');
cek('p kecil', K.normalisasiJK('p') === 'P');
cek('Laki-laki', K.normalisasiJK('Laki-laki') === 'L');
cek('Perempuan dengan spasi tepi', K.normalisasiJK('  Perempuan ') === 'P');
cek('nilai tak dikenal = null', K.normalisasiJK('X') === null);
cek('kosong = null', K.normalisasiJK('') === null);

/* ==================================================================== */
console.log('\n2. Normalisasi tanggal lahir');

cek('ISO langsung', K.normalisasiTanggal('2019-08-14', SEKARANG) === '2019-08-14');
cek('D/M/Y (format Excel Indonesia)', K.normalisasiTanggal('14/08/2019', SEKARANG) === '2019-08-14');
cek('D-M-Y', K.normalisasiTanggal('14-08-2019', SEKARANG) === '2019-08-14');
cek('bulan 13 ditolak', K.normalisasiTanggal('14/13/2019', SEKARANG) === null);
cek('31 Februari ditolak (bukan digenapkan jadi Maret)',
  K.normalisasiTanggal('2019-02-31', SEKARANG) === null);
cek('tahun sebelum 1900 ditolak', K.normalisasiTanggal('1850-01-01', SEKARANG) === null);
cek('tanggal di masa depan ditolak', K.normalisasiTanggal('2026-12-31', SEKARANG) === null);
cek('tepat hari ini diterima', K.normalisasiTanggal('2026-09-11', SEKARANG) === '2026-09-11');
cek('kosong = null', K.normalisasiTanggal('', SEKARANG) === null);
cek('teks acak = null', K.normalisasiTanggal('tidak tahu', SEKARANG) === null);

/* ==================================================================== */
console.log('\n3. Normalisasi NIK');

cek('16 digit diterima', K.normalisasiNik('3374012345678901') === '3374012345678901');
cek('dengan spasi/strip dirapikan dulu', K.normalisasiNik('3374 0123 4567 8901') === '3374012345678901');
cek('kurang dari 16 digit = null', K.normalisasiNik('12345') === null);
cek('kosong = null', K.normalisasiNik('') === null);

/* ==================================================================== */
console.log('\n4. Pemetaan header berkas (kolom boleh sedikit berbeda)');

cek('header baku dikenali semua',
  Array.from(K.petakanHeader(['nama', 'nik', 'no_bpjs', 'tanggal_lahir', 'jenis_kelamin', 'alamat']).dikenal).length === 6);
cek('variasi penulisan header tetap dikenali',
  Array.from(K.petakanHeader(['Nama Pasien', 'No. BPJS', 'Tgl Lahir', 'JK']).dikenal).sort().join(',')
    === 'jenis_kelamin,nama,no_bpjs,tanggal_lahir');
cek('kolom tidak dikenal tidak ikut dipetakan',
  !K.petakanHeader(['nama', 'kolom_asing']).dikenal.has('kolom_asing'));

/* ==================================================================== */
console.log('\n5. Membaca berkas lengkap — baris siap vs tidak lengkap');

const CSV_BAIK =
  'nama,nik,no_bpjs,tanggal_lahir,jenis_kelamin,alamat\n' +
  'Budi Santoso,3374012345678901,0001234567890,1980-05-01,L,Jl. Mawar 1\n' +
  'Siti Aminah,,0009876543210,14/03/1975,P,\n';

const hasilBaik = K.bacaBerkas(CSV_BAIK);
cek('dua baris terbaca', hasilBaik.baris.length === 2);
cek('baris 1 siap (semua wajib terisi)', hasilBaik.baris[0].siap === true);
cek('baris 1 tanggal lahir jadi ISO', hasilBaik.baris[0].tanggal_lahir === '1980-05-01');
cek('baris 2 tanpa NIK tetap siap (NIK opsional)', hasilBaik.baris[1].siap === true);
cek('baris 2 tanggal D/M/Y terbaca benar', hasilBaik.baris[1].tanggal_lahir === '1975-03-14');
cek('nomor baris Excel benar (baris 1 data = baris 2 berkas)', hasilBaik.baris[0].baris === 2);

const CSV_KURANG =
  'nama,tanggal_lahir,jenis_kelamin\n' +
  ',1980-05-01,L\n' +
  'Ani,,P\n' +
  'Dedi,1980-05-01,X\n';

const hasilKurang = K.bacaBerkas(CSV_KURANG);
cek('nama kosong = tidak siap', hasilKurang.baris[0].siap === false
  && hasilKurang.baris[0].wajib.some(m => m.includes('Nama kosong')));
cek('tanggal lahir kosong = tidak siap', hasilKurang.baris[1].siap === false
  && hasilKurang.baris[1].wajib.some(m => m.includes('Tanggal lahir kosong')));
cek('jenis kelamin tak dikenali = tidak siap', hasilKurang.baris[2].siap === false
  && hasilKurang.baris[2].wajib.some(m => m.includes('Jenis kelamin tidak dikenali')));

const CSV_NIK_RUSAK =
  'nama,nik,tanggal_lahir,jenis_kelamin\n' +
  'Tono,12345,1980-05-01,L\n';
const hasilNikRusak = K.bacaBerkas(CSV_NIK_RUSAK);
cek('NIK bukan 16 digit TIDAK menyumbat baris (hanya peringatan)',
  hasilNikRusak.baris[0].siap === true);
cek('NIK yang rusak dikosongkan, bukan disimpan apa adanya',
  hasilNikRusak.baris[0].nik === null);
cek('peringatan NIK tercatat', hasilNikRusak.baris[0].peringatan.some(m => m.includes('NIK')));

/* ==================================================================== */
console.log('\n6. Duplikat DI DALAM satu berkas (bukan usulan — wajib dicek manusia)');

const CSV_DUPLIKAT_NIK =
  'nama,nik,tanggal_lahir,jenis_kelamin\n' +
  'Budi Santoso,3374012345678901,1980-05-01,L\n' +
  'Budi Santoso,3374012345678901,1980-05-01,L\n';
const hasilDupNik = K.bacaBerkas(CSV_DUPLIKAT_NIK);
cek('baris pertama dengan NIK tetap siap', hasilDupNik.baris[0].siap === true);
cek('baris kedua dengan NIK sama ditandai tidak siap', hasilDupNik.baris[1].siap === false
  && hasilDupNik.baris[1].wajib.some(m => m.includes('sudah muncul')));

const CSV_DUPLIKAT_NAMA =
  'nama,tanggal_lahir,jenis_kelamin\n' +
  'Budi Santoso,1980-05-01,L\n' +
  'budi santoso,1980-05-01,L\n';   // huruf besar/kecil berbeda, tetap dianggap sama
const hasilDupNama = K.bacaBerkas(CSV_DUPLIKAT_NAMA);
cek('nama sama + tanggal lahir sama (tanpa NIK) juga tertangkap sebagai duplikat',
  hasilDupNama.baris[1].siap === false
  && hasilDupNama.baris[1].wajib.some(m => m.includes('sudah muncul')));

const CSV_BUDI_KEMBAR =   // beda 1 huruf di nama, tanggal lahir sama — TIDAK dianggap duplikat di sini
  'nama,tanggal_lahir,jenis_kelamin\n' +
  'Budi Santoso,1980-05-01,L\n' +
  'Budi Santosa,1980-05-01,L\n';
const hasilBudiKembar = K.bacaBerkas(CSV_BUDI_KEMBAR);
cek('nama BERBEDA satu huruf TIDAK ditolak sebagai duplikat berkas — ' +
  'itu tugas pasien_cari_mirip() di server, bukan pengecekan lokal ini',
  hasilBudiKembar.baris[1].siap === true);

/* ==================================================================== */
console.log('\n7. Ringkasan pratinjau');

const rk = K.ringkas(hasilKurang.baris);
cek('total sesuai jumlah baris', rk.total === 3);
cek('siap = 0 (ketiganya kurang lengkap)', rk.siap === 0);
cek('tidakLengkap = 3', rk.tidakLengkap === 3);

console.log(`\n${lulus} pemeriksaan lulus — pra_daftar_core.js`);

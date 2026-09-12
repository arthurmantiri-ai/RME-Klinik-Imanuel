/* Uji fungsi murni antrean_core.js — dijalankan dengan `node`, tanpa
   peramban dan tanpa database.

   ---------------------------------------------------------------------
   CONTOH DI SINI SAMA PERSIS DENGAN test/uji_antrean.sql

   Tiga aturan ditulis dua kali di proyek ini, dan tiga-tiganya sengaja
   diuji dengan nilai yang sama persis di kedua sisi:

     bentuk nomor antrean    kolom `nomor` di tabel antrean  ↔  formatNomor()
     pemeriksaan nomor kartu antrol_periksa_kartu()          ↔  periksaKartu()
     pemeriksaan NIK         antrol_periksa_nik()            ↔  periksaNik()

   Kalau salah satunya diubah, salah satu uji GAGAL — bukan hasilnya yang
   berselisih diam-diam antara layar petugas dan jawaban ke BPJS.

   BERKAS INI DIJALANKAN DI ZONA WAKTU BARAT, alasan yang sama dengan
   uji_surat_core dan uji_periksa_core: perbandingan jadwal di sini
   memakai teks 'HH:MM' justru supaya zona waktu perangkat tidak pernah
   ikut menentukan poli buka atau tutup. Menjalankannya di
   America/Los_Angeles membuat pelanggaran aturan itu gagal keras. */
'use strict';
process.env.TZ = 'America/Los_Angeles';
const A = require('../js/antrean_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}

/* ===================================================================
   1. Bentuk nomor antrean
   =================================================================== */
cek('nomor berpadding tiga digit', A.formatNomor('Q', 1) === 'Q-001', A.formatNomor('Q', 1));
cek('nomor dua digit', A.formatNomor('Q', 14) === 'Q-014');
cek('nomor tiga digit utuh', A.formatNomor('R', 115) === 'R-115');

/* Contoh yang sama dengan uji 2 di test/uji_antrean.sql.
   lpad('1000', 3, '0') di PostgreSQL MEMOTONG jadi '100'; padStart tidak.
   Di SQL perbedaan itu ditutup greatest(3, length(...)). Kalau salah satu
   sisi lupa, uji inilah yang gagal — bukan nomor antrean pasien ke-1000
   yang diam-diam bertabrakan dengan pasien ke-100. */
cek('nomor empat digit tidak terpotong', A.formatNomor('R', 1000) === 'R-1000',
    A.formatNomor('R', 1000));

cek('awalan huruf selalu kapital', A.formatNomor('q', 3) === 'Q-003');
cek('nomor tidak sah memulangkan kosong', A.formatNomor('Q', 0) === '' &&
    A.formatNomor('Q', null) === '' && A.formatNomor('Q', 'abc') === '');

const p = A.pecahNomor('Q-014');
cek('nomor bisa diurai kembali', p && p.prefix === 'Q' && p.urut === 14);
cek('nomor asal tidak terurai', A.pecahNomor('bukan nomor') === null);

/* ===================================================================
   2. Kalimat panggilan
   =================================================================== */
cek('nomor dieja tanpa nol dan tanda hubung', A.ejaNomor('A-014') === 'A, 14',
    A.ejaNomor('A-014'));
/* "A-014" dibaca pembaca suara sebagai "A minus nol satu empat".
   Yang dikirim ke pembaca suara karena itu kalimat yang sudah dieja. */
cek('kalimat panggilan menyebut tujuan',
    A.teksPanggilan('A-014', 'Poli Umum') === 'Nomor antrean A, 14, silakan menuju Poli Umum.',
    A.teksPanggilan('A-014', 'Poli Umum'));
cek('tanpa tujuan tetap berkalimat utuh',
    A.teksPanggilan('B-003', null) === 'Nomor antrean B, 3.',
    A.teksPanggilan('B-003', null));
cek('panggilan ulang diberi awalan',
    A.teksPanggilan('A-014', 'Loket 1', 2).startsWith('Panggilan ulang. '),
    A.teksPanggilan('A-014', 'Loket 1', 2));
cek('panggilan pertama tidak diberi awalan',
    !A.teksPanggilan('A-014', 'Loket 1', 1).includes('Panggilan ulang'));

/* ===================================================================
   3. Pemeriksaan identitas — nilai yang sama dengan uji 4 di uji_antrean.sql
   =================================================================== */
cek('kartu kosong', A.periksaKartu('') === 'Nomor kartu tidak boleh kosong');
cek('kartu berhuruf', A.periksaKartu('000987654321X') === 'Format nomor kartu tidak sesuai');
cek('kartu kurang digit', A.periksaKartu('12345') === 'Nomor kartu harus 13 digit');
cek('kartu benar lolos', A.periksaKartu('0009876543210') === null);
cek('kartu berspasi tetap lolos', A.periksaKartu(' 0009876543210 ') === null);

cek('NIK kosong', A.periksaNik('') === 'NIK tidak boleh kosong');
cek('NIK kurang digit', A.periksaNik('123') === 'NIK harus 16 digit');
cek('NIK berhuruf', A.periksaNik('737104040404000X') === 'Format NIK tidak sesuai');
cek('NIK benar lolos', A.periksaNik('7371040404040001') === null);

/* Urutan pemeriksaan ikut diuji: nomor yang kosong harus berpesan
   "tidak boleh kosong", bukan "harus 13 digit". Petugas yang membaca
   "harus 13 digit" pada kolom kosong akan mencari nomor yang salah
   ketik, bukan mengisi kolomnya. */
cek('urutan pesan: kosong sebelum panjang',
    A.periksaKartu('').includes('kosong') && A.periksaNik('').includes('kosong'));

cek('tanggal salah format ditolak',
    A.periksaTanggal('05-09-2026') !== null && A.periksaTanggal('2026-13-01') !== null);
cek('tanggal benar lolos', A.periksaTanggal('2026-09-05') === null);

/* ===================================================================
   4. Jadwal
   =================================================================== */
const JADWAL = { jam_buka: '08:00:00', jam_tutup: '12:00:00',
                 jam_tutup_online: '11:00:00', sisa_kuota_online: 5 };

cek('poli buka pada jam praktek', A.sedangBuka(JADWAL, '09:30') === true);
cek('poli tutup sebelum buka', A.sedangBuka(JADWAL, '07:00') === false);
cek('poli tutup setelah jam tutup', A.sedangBuka(JADWAL, '12:30') === false);
cek('jam detik dipotong', A.jamPendek('08:00:00') === '08:00');

/* Contoh yang sama dengan uji 14 di test/uji_antrean.sql:
   jam tutup online berlaku untuk HARI INI saja. Menolak pemesanan untuk
   besok karena jam tutup hari ini adalah bug yang paling mudah dibuat. */
let r = A.bolehDaftarOnline(JADWAL, '2026-09-05', '2026-09-05', '11:30');
cek('lewat jam tutup online hari ini ditolak', !r.boleh && /ditutup pukul 11:00/.test(r.alasan), r.alasan);

r = A.bolehDaftarOnline(JADWAL, '2026-09-06', '2026-09-05', '11:30');
cek('pemesanan untuk besok tidak terkena jam tutup hari ini', r.boleh === true, r.alasan);

r = A.bolehDaftarOnline(JADWAL, '2026-09-04', '2026-09-05', '09:00');
cek('tanggal mundur ditolak', !r.boleh && /mundur/.test(r.alasan), r.alasan);

r = A.bolehDaftarOnline({ ...JADWAL, sisa_kuota_online: 0 }, '2026-09-06', '2026-09-05', '09:00');
cek('kuota online TIDAK LAGI membatasi (12 Sep 2026, permintaan Arthur)', r.boleh === true, r.alasan);

r = A.bolehDaftarOnline(null, '2026-09-06', '2026-09-05', '09:00');
cek('poli tanpa jadwal ditolak', !r.boleh);

r = A.bolehDaftarOnline(JADWAL, '2026-09-05', '2026-09-05', '09:00');
cek('dalam jam diterima', r.boleh === true, r.alasan);

/* ===================================================================
   5. Estimasi
   =================================================================== */
cek('tidak ada di depan berarti segera', A.estimasiTeks(0, 10) === 'Segera dipanggil');
cek('estimasi menit', A.estimasiMenit(4, 10) === 40);
cek('estimasi dalam menit terbaca', A.estimasiTeks(4, 10) === '± 40 menit lagi');
cek('estimasi lebih dari sejam', A.estimasiTeks(9, 10) === '± 1 jam 30 menit lagi',
    A.estimasiTeks(9, 10));
cek('estimasi jam bulat', A.estimasiTeks(12, 10) === '± 2 jam lagi', A.estimasiTeks(12, 10));
cek('jumlah negatif tidak membuat estimasi minus', A.estimasiMenit(-3, 10) === 0);

/* ===================================================================
   6. Keadaan antrean
   =================================================================== */
cek('nomor menunggu masih aktif', A.masihAktif({ status: 'MENUNGGU' }));
cek('pemesanan online yang belum hadir masih aktif', A.masihAktif({ status: 'BELUM_HADIR' }));
cek('nomor selesai tidak aktif', !A.masihAktif({ status: 'SELESAI' }));
/* Nomor yang batal dan tidak hadir harus keluar dari hitungan: kursinya
   memang kosong, dan kuotanya kembali (uji 16 di uji_antrean.sql). */
cek('nomor batal tidak aktif', !A.masihAktif({ status: 'BATAL' }));
cek('nomor tidak hadir tidak aktif', !A.masihAktif({ status: 'TIDAK_HADIR' }));
cek('objek kosong tidak dianggap aktif', !A.masihAktif(null) && !A.masihAktif({}));

cek('label sumber Mobile JKN', A.labelSumber('ONLINE') === 'Mobile JKN');
cek('label status belum hadir', A.labelStatus('BELUM_HADIR')[0] === 'Belum hadir');

/* ===================================================================
   7. Token & tautan layar
   =================================================================== */
const acakTetap = (n) => Array.from({ length: n }, (_, i) => i);
const t1 = A.acakToken(40, acakTetap);
cek('token sepanjang yang diminta', t1.length === 40, String(t1.length));
cek('token hanya huruf dan angka aman', /^[a-z2-9]+$/.test(t1), t1);
/* Huruf l, angka 0 dan 1 dihilangkan: token ini akan diketik ulang
   orang yang menyalinnya dari layar ke TV. */
cek('token tanpa huruf yang mudah tertukar', !/[l01]/.test(t1), t1);

/* Token pendek berbahaya: ia satu-satunya yang menjaga alamat layar.
   Fungsi database menolak di bawah 24 karakter; di sini panjangnya
   dinaikkan diam-diam supaya tidak mungkin terkirim token pendek. */
cek('permintaan token pendek dinaikkan ke batas aman',
    A.acakToken(8, acakTetap).length === 24);

cek('tautan layar terbentuk',
    A.urlLayar('https://klinik.netlify.app/app.html', 'abc123') ===
    'https://klinik.netlify.app/display.html?t=abc123',
    A.urlLayar('https://klinik.netlify.app/app.html', 'abc123'));
cek('tautan layar dari akar situs',
    A.urlLayar('https://klinik.netlify.app/', 'abc') ===
    'https://klinik.netlify.app/display.html?t=abc');
cek('tanpa token tidak ada tautan', A.urlLayar('https://x.id', '') === '');

/* ===================================================================
   8. Membaca jawaban Antrol
   =================================================================== */
let b = A.bacaJawaban({
  response: { nomorantrean: 'Q-003', angkaantrean: '3', namapoli: 'Poli Umum',
              sisaantrean: '2', antreanpanggil: 'Q-001' },
  metadata: { message: 'Ok', code: 200 }
});
cek('jawaban sukses terbaca', b.ok && /Q-003/.test(b.ringkas) && !b.pasienBaru, b.ringkas);

/* Kode 202 BUKAN kegagalan: nomornya terbit, hanya pesertanya belum
   terdaftar sebagai pasien. Membacanya sebagai gagal berarti petugas
   mengira pasien tidak dapat nomor — padahal ia sudah berangkat. */
b = A.bacaJawaban({
  response: { nomorantrean: 'Q-004', namapoli: 'Poli Umum', sisaantrean: '3' },
  metadata: { message: 'Ok', code: 202 }
});
cek('kode 202 dibaca sebagai berhasil', b.ok === true && b.pasienBaru === true);

b = A.bacaJawaban({ metadata: {
  message: 'Nomor antrean hanya dapat diambil satu kali pada tanggal dan poli yang sama',
  code: 201 } });
cek('jawaban gagal terbaca', !b.ok && /satu kali/.test(b.ringkas), b.ringkas);
cek('jawaban kosong tidak meledak', A.bacaJawaban(null).ok === false);
cek('jawaban tanpa metadata tidak meledak', A.bacaJawaban({}).ok === false);

console.log(`\n${lulus} pemeriksaan lulus — antrean_core.js`);

/* Uji fungsi murni lab_core.js — dijalankan dengan `node`, tanpa peramban
   dan tanpa database.

   Contoh nilai rujukan di bawah disalin dari isian awal di
   sql/11_penunjang.sql, dan hasil yang diharapkan sama persis dengan yang
   diuji di test/uji_penunjang.sql. Dua salinan aturan penandaan (satu di
   database, satu di layar) hanya aman kalau keduanya diuji dengan contoh
   yang sama: kalau seed di SQL diubah, uji SQL nomor 1 & 2 gagal; kalau
   penandaan di JS diubah, berkas ini yang gagal. */
'use strict';
const L = require('../js/lab_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}

/* ---------------------------------------------------- Nilai rujukan Hb */
/* Sama dengan baris seed HB di sql/11_penunjang.sql. Sengaja diacak
   urutannya: pemilihan tidak boleh bergantung pada urutan daftar. */
const rujHb = [
  { jenis_kelamin: null, umur_min_bulan:  72, umur_max_bulan: 180, batas_bawah: 11.5, batas_atas: 15.5, kritis_bawah: 7, kritis_atas: 20 },
  { jenis_kelamin: 'L',  umur_min_bulan: 180, umur_max_bulan: null, batas_bawah: 13.0, batas_atas: 17.0, kritis_bawah: 7, kritis_atas: 20 },
  { jenis_kelamin: null, umur_min_bulan:   1, umur_max_bulan:  12, batas_bawah: 10.5, batas_atas: 13.5, kritis_bawah: 7, kritis_atas: 20 },
  { jenis_kelamin: 'P',  umur_min_bulan: 180, umur_max_bulan: null, batas_bawah: 12.0, batas_atas: 15.0, kritis_bawah: 7, kritis_atas: 20 },
  { jenis_kelamin: null, umur_min_bulan:  12, umur_max_bulan:  72, batas_bawah: 11.5, batas_atas: 13.5, kritis_bawah: 7, kritis_atas: 20 },
  { jenis_kelamin: null, umur_min_bulan:   0, umur_max_bulan:   1, batas_bawah: 14.0, batas_atas: 22.0, kritis_bawah: 9, kritis_atas: 24 }
];
const labHb = { jenis_nilai: 'ANGKA', desimal: 1, teks_normal: null };

cek('rujukan laki-laki dewasa 13,0-17,0',
    L.pilihRujukan(rujHb, 'L', 420).batas_bawah === 13.0);
cek('rujukan perempuan dewasa 12,0-15,0',
    L.pilihRujukan(rujHb, 'P', 360).batas_bawah === 12.0);

/* Rentang tersempit menang. Anak 3 tahun cocok dengan baris [12,72)
   dan tidak dengan yang lain; kalau logikanya salah, ia bisa jatuh ke
   baris dewasa yang jauh lebih longgar. */
const anak = L.pilihRujukan(rujHb, 'L', 36);
cek('rujukan anak 3 tahun 11,5-13,5',
    anak.batas_bawah === 11.5 && anak.batas_atas === 13.5,
    'dapat ' + anak.batas_bawah + '-' + anak.batas_atas);
const bayi = L.pilihRujukan(rujHb, 'P', 6);
cek('rujukan bayi 6 bulan 10,5-13,5',
    bayi.batas_bawah === 10.5 && bayi.batas_atas === 13.5);
const bbl = L.pilihRujukan(rujHb, 'L', 0);
cek('rujukan bayi baru lahir 14,0-22,0',
    bbl.batas_bawah === 14.0 && bbl.batas_atas === 22.0);

/* Baris berjenis kelamin menang atas baris umum, walaupun rentang
   umurnya lebih lebar. Inilah yang memisahkan Hb laki-laki dari umum. */
const campur = [
  { jenis_kelamin: null, umur_min_bulan: 180, umur_max_bulan: 240, batas_bawah: 1, batas_atas: 2 },
  { jenis_kelamin: 'L',  umur_min_bulan: null, umur_max_bulan: null, batas_bawah: 9, batas_atas: 9 }
];
cek('jenis kelamin lebih menentukan daripada sempitnya rentang umur',
    L.pilihRujukan(campur, 'L', 200).batas_bawah === 9);

cek('pasien tanpa tanggal lahir tetap dapat rujukan menurut jenis kelamin',
    L.pilihRujukan(rujHb, 'L', null).batas_bawah === 13.0);

/* ------------------------------------------------------------ Penandaan */
/* Contoh-contoh ini kembar dengan uji nomor 3 dan 4 di uji_penunjang.sql */
cek('Hb 12,5 pada laki-laki = RENDAH',
    L.tandaAngka(12.5, L.pilihRujukan(rujHb, 'L', 420)) === 'RENDAH');
cek('Hb 12,5 pada perempuan = NORMAL',
    L.tandaAngka(12.5, L.pilihRujukan(rujHb, 'P', 360)) === 'NORMAL');

const rL = L.pilihRujukan(rujHb, 'L', 420);
cek('Hb 11,0 = RENDAH',        L.tandaAngka(11.0, rL) === 'RENDAH');
cek('Hb 6,2 = KRITIS_RENDAH',  L.tandaAngka(6.2,  rL) === 'KRITIS_RENDAH');
cek('Hb 21,0 = KRITIS_TINGGI', L.tandaAngka(21.0, rL) === 'KRITIS_TINGGI');
cek('Hb 14,0 = NORMAL',        L.tandaAngka(14.0, rL) === 'NORMAL');
cek('nilai kosong = BELUM',    L.tandaAngka(null, rL) === 'BELUM');

/* Batas dihitung inklusif di sisi kritis dan eksklusif di sisi biasa,
   sama seperti fungsi lab_tanda() di database. */
cek('tepat di batas bawah masih NORMAL', L.tandaAngka(13.0, rL) === 'NORMAL');
cek('tepat di batas atas masih NORMAL',  L.tandaAngka(17.0, rL) === 'NORMAL');
cek('tepat di nilai kritis sudah kritis', L.tandaAngka(7.0, rL) === 'KRITIS_RENDAH');

cek('tanpa batas sama sekali, nilai tidak bisa ditandai',
    L.tandaAngka(5, { batas_bawah: null, batas_atas: null }) === 'BELUM');

/* Pemeriksaan berupa pilihan — kembar dengan uji nomor 5 di SQL */
cek('HBsAg Non Reaktif = NORMAL',  L.tandaTeks('Non Reaktif', 'Non Reaktif') === 'NORMAL');
cek('HBsAg Reaktif = ABNORMAL',    L.tandaTeks('Reaktif', 'Non Reaktif') === 'ABNORMAL');
cek('beda huruf besar-kecil tetap NORMAL',
    L.tandaTeks('  non reaktif ', 'Non Reaktif') === 'NORMAL');
cek('tanpa teks normal, apa pun dianggap NORMAL',
    L.tandaTeks('Kuning jernih', null) === 'NORMAL');

cek('tandai() memilih cara sesuai jenis nilai',
    L.tandai(labHb, rL, 12.5, null) === 'RENDAH' &&
    L.tandai({ jenis_nilai: 'PILIHAN', teks_normal: 'Negatif' }, null, null, 'Positif') === 'ABNORMAL');

/* ------------------------------------------------------- Teks rujukan */
/* Harus sama persis dengan yang dibentuk to_char(...,'FM999999990.0999')
   di database — lihat uji nomor 6 di uji_penunjang.sql */
cek('teks rujukan asam urat laki-laki "3.4 - 7.0"',
    L.teksRujukan({ batas_bawah: 3.4, batas_atas: 7.0 }) === '3.4 - 7.0',
    'dapat "' + L.teksRujukan({ batas_bawah: 3.4, batas_atas: 7.0 }) + '"');
cek('hanya batas atas → "< 200"',
    L.teksRujukan({ batas_bawah: null, batas_atas: 200 }) === '< 200.0');
cek('hanya batas bawah → "> 40"',
    L.teksRujukan({ batas_bawah: 40, batas_atas: null }) === '> 40.0');
cek('teks tertulis mengalahkan batas angka',
    L.teksRujukan({ batas_bawah: 40, batas_atas: null, teks: '> 40' }) === '> 40');
cek('tanpa batas apa pun, dipakai teks normal pemeriksaan',
    L.teksRujukan(null, { teks_normal: 'Negatif' }) === 'Negatif');
cek('fmSql menyisakan satu desimal untuk bilangan bulat',
    L.fmSql(150000) === '150000.0' && L.fmSql(1.005) === '1.005');

/* --------------------------------------------- Membaca angka diketik */
/* Inilah alasan lab tidak memakai bacaAngka() milik apotek_excel.js. */
cek('berat jenis urine "1.005" terbaca 1,005 (desimal 3)',
    L.bacaNilai('1.005', 3) === 1.005);
cek('berat jenis urine "1,005" terbaca 1,005',
    L.bacaNilai('1,005', 3) === 1.005);
cek('leukosit "7.500" terbaca 7500 (tanpa desimal)',
    L.bacaNilai('7.500', 0) === 7500);
cek('trombosit "150.000" terbaca 150000',
    L.bacaNilai('150.000', 0) === 150000);
cek('hemoglobin "12,5" terbaca 12,5',
    L.bacaNilai('12,5', 1) === 12.5);
cek('hemoglobin "12.5" terbaca 12,5',
    L.bacaNilai('12.5', 1) === 12.5);
cek('"1.234.567" terbaca 1234567',
    L.bacaNilai('1.234.567', 0) === 1234567);
cek('"1.234,5" terbaca 1234,5',
    L.bacaNilai('1.234,5', 1) === 1234.5);
cek('angka yang sudah berupa number dibiarkan',
    L.bacaNilai(12.5, 1) === 12.5);
cek('spasi dan teks kosong menghasilkan null',
    L.bacaNilai('   ', 1) === null && L.bacaNilai('', 1) === null && L.bacaNilai(null, 1) === null);
cek('teks bukan angka ditolak, tidak jadi NaN',
    L.bacaNilai('positif', 1) === null && L.bacaNilai('12abc', 1) === null);

cek('formatNilai memakai koma desimal Indonesia',
    L.formatNilai(12.5, 1) === '12,5' && L.formatNilai(7500, 0) === '7.500');
/* `desimal` adalah jumlah angka MINIMAL di belakang koma. Kalau ia jadi batas
   atas, 99,5 pada glukosa (desimal 0) tampil sebagai 100 di layar dan di
   lembar cetak sementara database menyimpan 99,5 — dan penandaannya dihitung
   dari 99,5. Layar dan berkas yang tidak sepakat soal angka adalah cacat yang
   mahal di rekam medis. */
cek('angka berdesimal tidak dibulatkan hanya karena pemeriksaannya bulat',
    L.formatNilai(99.5, 0) === '99,5', 'dapat ' + L.formatNilai(99.5, 0));
cek('angka bulat tetap tampil bulat',
    L.formatNilai(110, 0) === '110');
cek('desimal wajib tetap ditampilkan walau nilainya bulat',
    L.formatNilai(14, 1) === '14,0');
cek('ketelitian berlebih dipotong di empat angka',
    L.formatNilai(1.23456, 1) === '1,2346', 'dapat ' + L.formatNilai(1.23456, 1));

/* ------------------------------------------------------------- Umur */
cek('umurBulan 3 tahun tepat = 36 bulan',
    L.umurBulan('2023-09-02', '2026-09-02') === 36);
cek('umurBulan sehari sebelum ulang bulan belum genap',
    L.umurBulan('2026-08-15', '2026-09-14') === 0);
cek('umurBulan tanpa tanggal lahir = null',
    L.umurBulan(null) === null);

/* -------------------------------------------------- Ringkasan lembar */
const lembar = [
  { urutan: 1, nilai_angka: 6.0,  tanda: 'KRITIS_RENDAH' },
  { urutan: 2, nilai_angka: 110,  tanda: 'NORMAL' },
  { urutan: 3, nilai_angka: null, nilai_teks: null, tanda: 'BELUM' },
  { urutan: 4, nilai_teks: 'Reaktif', tanda: 'ABNORMAL' }
];
const r = L.ringkasLembar(lembar);
cek('ringkasan menghitung yang terisi', r.terisi === 3 && r.kosong === 1);
cek('ringkasan menghitung yang tak normal', r.takNormal === 2, 'dapat ' + r.takNormal);
cek('ringkasan menghitung yang kritis', r.kritis === 1);
cek('lembar dengan isian kosong belum siap ditutup', r.siapDitutup === false);
cek('lembar penuh siap ditutup',
    L.ringkasLembar(lembar.filter(x => x.tanda !== 'BELUM')).siapDitutup === true);
cek('lembar kosong tidak dianggap siap ditutup',
    L.ringkasLembar([]).siapDitutup === false);

const menonjol = L.urutMenonjol(lembar).map(x => x.urutan);
cek('yang kritis naik ke atas, sisanya menurut urutan lembar',
    JSON.stringify(menonjol) === JSON.stringify([1, 4, 2, 3]),
    'dapat ' + menonjol.join(','));

/* ------------------------------------------------------------- Tren */
const tren = L.susunTren([
  { tanggal: '2026-03-01', nilai_angka: 14.0 },
  { tanggal: '2026-01-05', nilai_angka: 12.0 },
  { tanggal: '2026-02-01', nilai_angka: 13.5 },
  { tanggal: '2026-04-01', nilai_angka: null }
]);
cek('tren diurutkan menurut tanggal',
    tren.map(t => t.tanggal).join(',') === '2026-01-05,2026-02-01,2026-03-01');
cek('baris tanpa angka tidak masuk tren', tren.length === 3);
cek('titik pertama tidak punya selisih', tren[0].selisih === null);
cek('selisih dihitung terhadap pemeriksaan sebelumnya',
    tren[1].selisih === 1.5 && tren[1].arah === 'naik');
cek('penurunan ditandai turun',
    L.susunTren([{ tanggal: '2026-01-01', nilai_angka: 5 },
                 { tanggal: '2026-02-01', nilai_angka: 3 }])[1].arah === 'turun');

/* -------------------------------------------------------- Validasi */
const labPilihan = { jenis_nilai: 'PILIHAN', pilihan: ['Negatif', 'Positif'], teks_normal: 'Negatif' };
cek('pilihan di luar daftar ditolak',
    /Pilih salah satu/.test(L.validasi(labPilihan, null, 'Reaktif')));
cek('pilihan yang sah diterima', L.validasi(labPilihan, null, 'Positif') === null);
cek('pilihan beda huruf besar-kecil diterima', L.validasi(labPilihan, null, 'negatif') === null);
cek('nilai negatif ditolak', /negatif/.test(L.validasi(labHb, -1, null)));
cek('bukan angka ditolak', /angka/.test(L.validasi(labHb, 'abc', null)));
cek('kosong bukan kesalahan — hanya belum diisi',
    L.validasi(labHb, '', null) === null && L.validasi(labPilihan, null, '') === null);

/* ------------------------------------------------- Kelompok & label */
const grup = L.kelompokkan(
  [{ lab_id: 'a', urutan: 2 }, { lab_id: 'b', urutan: 1 }, { lab_id: 'c', urutan: 1 }],
  [{ id: 'a', kelompok: 'Hematologi' }, { id: 'b', kelompok: 'Hematologi' },
   { id: 'c', kelompok: 'Kimia Klinik' }]);
cek('hasil dikelompokkan menurut kelompok pemeriksaan', grup.length === 2);
cek('di dalam kelompok tetap urut lembar',
    grup[0].isi.map(x => x.urutan).join(',') === '1,2');

cek('jenis rontgen gigi ditandai perlu nomor gigi',
    L.jenisPakaiGigi('RO_PERIAPIKAL') === true && L.jenisPakaiGigi('EKG') === false);
cek('label jenis penunjang dalam bahasa Indonesia',
    L.labelJenis('RO_PANORAMIK') === 'Rontgen panoramik');
cek('jenis tak dikenal dikembalikan apa adanya, bukan undefined',
    L.labelJenis('ENTAH') === 'ENTAH' && L.labelJenis(null) === '-');
cek('label jenis lampiran tersedia',
    L.labelLampiran('FILM_RONTGEN') === 'Film rontgen');

console.log('\n' + lulus + ' pemeriksaan lab_core LULUS');

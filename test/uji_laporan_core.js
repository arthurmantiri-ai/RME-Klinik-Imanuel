/* Uji fungsi murni laporan_core.js — dijalankan dengan `node`, tanpa
   peramban dan tanpa database. Lihat catatan di kepala laporan_core.js
   untuk kenapa jam kunjungan dan kategori usia dihitung di sini, bukan
   di SQL maupun langsung di pages/laporan.js. */
'use strict';
const L = require('../js/laporan_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}

/* ======================================================================
   1. Util tanggal/bulan
   ====================================================================== */
console.log('1. Util tanggal/bulan');

cek('kunciBulan mengambil YYYY-MM dari tanggal penuh', L.kunciBulan('2026-09-08') === '2026-09');
cek('kunciBulan menolak teks yang bukan tanggal', L.kunciBulan('bukan-tanggal') === null);
cek('labelBulanPendek: September jadi "Sep 26"', L.labelBulanPendek('2026-09') === 'Sep 26');
cek('labelBulanPendek: Januari jadi "Jan 26"', L.labelBulanPendek('2026-01') === 'Jan 26');

cek('geserBulan maju melewati akhir tahun', L.geserBulan('2026-11', 2) === '2027-01');
cek('geserBulan mundur melewati awal tahun', L.geserBulan('2026-01', -1) === '2025-12');
cek('geserBulan 0 mengembalikan bulan yang sama', L.geserBulan('2026-05', 0) === '2026-05');
cek('geserBulan mundur banyak sekaligus (>12 bulan)', L.geserBulan('2026-05', -14) === '2025-03');

{
  const d = L.daftarBulanMundur(6, '2026-09');
  cek('daftarBulanMundur: 6 bulan, tertua lebih dulu',
    d.length === 6 && d[0] === '2026-04' && d[5] === '2026-09',
    JSON.stringify(d));
}

cek('selisihHari: dua tanggal sama = 0', L.selisihHari('2026-09-08', '2026-09-08') === 0);
cek('selisihHari: melewati pergantian bulan', L.selisihHari('2026-01-31', '2026-02-01') === 1);
cek('selisihHari: melewati tahun kabisat (2024)', L.selisihHari('2024-02-28', '2024-03-01') === 2);
cek('selisihHari: tanggal tidak sah -> null', L.selisihHari('2026-09-08', 'x') === null);

/* ======================================================================
   2. Rekap kunjungan harian & bulanan
   ====================================================================== */
console.log('\n2. Rekap kunjungan harian & bulanan');

const kunjunganContoh = [
  { tanggal: '2026-09-01', jenis_poli: 'UMUM', cara_bayar: 'BPJS',  jenis_kunjungan: 'BARU' },
  { tanggal: '2026-09-01', jenis_poli: 'GIGI', cara_bayar: 'UMUM',  jenis_kunjungan: 'LAMA' },
  { tanggal: '2026-09-02', jenis_poli: 'UMUM', cara_bayar: 'UMUM',  jenis_kunjungan: 'LAMA' },
  { tanggal: '2026-08-15', jenis_poli: 'KIA',  cara_bayar: 'BPJS',  jenis_kunjungan: 'BARU' }
];

{
  const tren = L.rekapTrenHarian(kunjunganContoh, ['2026-09-01', '2026-09-02', '2026-09-03']);
  cek('rekapTrenHarian: 3 hari diminta, 3 hari dikembalikan', tren.length === 3);
  cek('rekapTrenHarian: 1 Sep ada 2 kunjungan (umum+gigi)', tren[0].total === 2 && tren[0].umum === 1 && tren[0].gigi === 1);
  cek('rekapTrenHarian: 3 Sep tidak ada data = nol, bukan hilang', tren[2].total === 0);
}

{
  const bulanan = L.rekapPerBulan(kunjunganContoh, L.daftarBulanMundur(2, '2026-09'));
  cek('rekapPerBulan: Agustus (bulan pertama) dapat 1 dari KIA', bulanan[0].bulan === '2026-08' && bulanan[0].kia === 1);
  cek('rekapPerBulan: September dapat 3, 1 BPJS + 2 non-BPJS', bulanan[1].total === 3 && bulanan[1].bpjs === 1 && bulanan[1].nonBpjs === 2);
  cek('rekapPerBulan: jenis_kunjungan BARU/LAMA terhitung terpisah', bulanan[1].baru === 1 && bulanan[1].lama === 2);
}

cek('jenis_poli tak dikenal (mis. null) jatuh ke "lainnya", bukan error',
  (() => { const r = L.rekapPerHari([{ tanggal: '2026-01-01', cara_bayar: 'UMUM' }]); return r.get('2026-01-01').lainnya === 1; })());

/* ======================================================================
   3. Heatmap jam kunjungan
   ====================================================================== */
console.log('\n3. Heatmap jam kunjungan');

{
  const rows = [
    { jam_daftar: 0 },              // tengah malam SAH, bukan "tanpa jam"
    { jam_daftar: 8 }, { jam_daftar: 8 }, { jam_daftar: 9 },
    { jam_daftar: 23 },              // di luar rentang 6-21 default
    { jam_daftar: null },            // tanpa jam
    { jam_daftar: undefined }        // tanpa jam
  ];
  const r = L.rekapJamKunjungan(rows, 6, 21);
  cek('heatmap: jam 0 dihitung sebagai jam sah, masuk "luar" (di luar 6-21)',
    r.luar === 2, `luar=${r.luar}`); // jam 0 dan jam 23 sama-sama di luar 6-21
  cek('heatmap: null/undefined masuk tanpaJam, bukan luar maupun ember',
    r.tanpaJam === 2, `tanpaJam=${r.tanpaJam}`);
  cek('heatmap: jam 8 muncul 2x di ember indeks (8-6)=2', r.ember[2] === 2);
  cek('heatmap: total = luar + tanpaJam + terhitung', r.total === r.luar + r.tanpaJam + r.terhitung);
  cek('heatmap: total keseluruhan sama dengan jumlah baris', r.total === rows.length);
}

{
  const r = L.rekapJamKunjungan([{ jam_daftar: 6 }, { jam_daftar: 20 }], 6, 21);
  cek('heatmap: batas bawah (jamAwal) masuk ember pertama', r.ember[0] === 1);
  cek('heatmap: batas atas tereksklusi (jamAkhir) masuk ember terakhir, bukan luar',
    r.ember[r.ember.length - 1] === 1 && r.luar === 0);
}

/* ======================================================================
   4. Rekap per dokter
   ====================================================================== */
console.log('\n4. Rekap per dokter');

{
  const rows = [
    { nama_dokter: 'dr. Andi', jenis_poli: 'UMUM' },
    { nama_dokter: 'dr. Andi ', jenis_poli: 'UMUM' },   // spasi beda, harus digabung
    { nama_dokter: 'dr. Budi', jenis_poli: 'GIGI' },
    { nama_dokter: 'dr. Budi', jenis_poli: 'GIGI' },
    { nama_dokter: 'dr. Budi', jenis_poli: 'GIGI' },
    { nama_dokter: '', jenis_poli: 'UMUM' },
    { nama_dokter: '  ', jenis_poli: 'UMUM' }
  ];
  const r = L.rekapDokter(rows);
  cek('rekapDokter: "dr. Andi" dan "dr. Andi " digabung jadi satu baris (2)',
    r.find(x => x.nama === 'dr. Andi').jml === 2);
  cek('rekapDokter: dr. Budi (3) di atas dr. Andi (2) meski nol/kosong ada',
    r[0].nama === 'dr. Budi' && r[0].jml === 3);
  cek('rekapDokter: baris tanpa nama SELALU di paling bawah walau jumlahnya 2',
    r[r.length - 1].kosong === true && r[r.length - 1].jml === 2);
}

/* ======================================================================
   5. Rujukan — pemilihan tujuan & label
   ====================================================================== */
console.log('\n5. Rujukan');

cek('labelJenisRujukan: kode dikenal -> label Indonesia',
  L.labelJenisRujukan('RUJUK_INTERNAL') === 'Rujukan Internal');
cek('labelJenisRujukan: kode tak dikenal -> kode itu sendiri, tidak mengarang',
  L.labelJenisRujukan('RUJUK_LAIN') === 'RUJUK_LAIN');

cek('tujuanRujukan internal: pakai nama poli internal',
  L.tujuanRujukan({ jenis_rujukan: 'RUJUK_INTERNAL', tujuan_poli_internal: 'Poli Gigi' }).teks === 'Poli Gigi');
cek('tujuanRujukan internal tanpa poli terpilih: pesan jelas, bukan kosong/undefined',
  L.tujuanRujukan({ jenis_rujukan: 'RUJUK_INTERNAL' }).teks.includes('belum dipilih'));

{
  const t = L.tujuanRujukan({
    jenis_rujukan: 'RUJUK_LANJUT', tujuan_faskes_kode: 'RSUD Uji', rujuk_ppk_kode: '0123R001',
    tujuan_subspesialis: 'Penyakit Dalam', tujuan_sarana: 'Tanpa Sarana Khusus'
  });
  cek('tujuanRujukan lanjut: nama faskes + kode BPJS di teks', t.teks === 'RSUD Uji (0123R001)');
  cek('tujuanRujukan lanjut: subspesialis & sarana masuk rinci', t.rinci.length === 2);
}
cek('tujuanRujukan lanjut: kode ada tapi faskesnya belum dipetakan -> tetap tampil, bukan hilang',
  L.tujuanRujukan({ jenis_rujukan: 'RUJUK_LANJUT', rujuk_ppk_kode: '9999X' }).teks.includes('9999X'));

cek('tujuanRujukan IGD: pakai kolom teks lama',
  L.tujuanRujukan({ jenis_rujukan: 'RUJUK_IGD', tujuan_teks: 'RS Bergerak' }).teks === 'RS Bergerak');

{
  const r = L.rekapRujukanPerBulan(
    [{ tanggal: '2026-09-01' }, { tanggal: '2026-09-15' }, { tanggal: '2026-08-01' }],
    L.daftarBulanMundur(2, '2026-09'));
  cek('rekapRujukanPerBulan: September dapat 2, Agustus dapat 1',
    r[1].jumlah === 2 && r[0].jumlah === 1);
}

/* ======================================================================
   6. Keuangan
   ====================================================================== */
console.log('\n6. Keuangan');

{
  const rows = [
    { tanggal: '2026-09-01', nilai_layanan: 150000, ditagih: 0, jumlah_tagihan: 1 },
    { tanggal: '2026-09-05', nilai_layanan: 500000, ditagih: 500000, jumlah_tagihan: 1 }
  ];
  const r = L.rekapNilaiLayananPerBulan(rows, ['2026-09']);
  cek('rekapNilaiLayananPerBulan: nilai_layanan dijumlah tanpa syarat',
    r[0].nilaiLayanan === 650000);
  cek('rekapNilaiLayananPerBulan: ditagih TIDAK ikut menjumlah nilai_layanan (dua kolom terpisah)',
    r[0].ditagih === 500000);
}

{
  const rows = [
    { tanggal: '2026-09-01', jenis_poli: 'UMUM', uang_masuk: 100000 },
    { tanggal: '2026-09-01', jenis_poli: 'GIGI', uang_masuk: 300000 },
    { tanggal: '2026-09-02', jenis_poli: 'GIGI', uang_masuk: 200000 }
  ];
  const total = L.rekapUangMasukPerBulan(rows, ['2026-09']);
  cek('rekapUangMasukPerBulan (tanpa pisah poli): dijumlah semua', total[0].total === 600000);

  const pisah = L.rekapUangMasukPerBulan(rows, ['2026-09'], true);
  cek('rekapUangMasukPerBulan (pisah poli): umum dan gigi terpisah',
    pisah[0].umum === 100000 && pisah[0].gigi === 500000);
  cek('rekapUangMasukPerBulan (pisah poli): total tetap sama dengan jumlah semua bucket',
    pisah[0].total === 600000);
}

/* ======================================================================
   7. Kategori usia Puskesmas (SP2TP/LB1) & rekap diagnosa
   ====================================================================== */
console.log('\n7. Kategori usia & rekap Puskesmas');

const KU = L.KATEGORI_USIA;
cek('usia 0 hari -> 0-7 hari', L.kategoriUsia('2026-09-08', '2026-09-08') === '0-7 hari');
cek('usia tepat 7 hari -> masih 0-7 hari (batas atas inklusif)',
  L.kategoriUsia('2026-09-01', '2026-09-08') === '0-7 hari');
cek('usia 8 hari -> pindah ke 8-28 hari', L.kategoriUsia('2026-08-31', '2026-09-08') === '8-28 hari');
cek('usia tepat 28 hari -> masih 8-28 hari', L.kategoriUsia('2026-08-11', '2026-09-08') === '8-28 hari');
cek('usia 29 hari -> pindah ke 29 hari-11 bulan', L.kategoriUsia('2026-08-10', '2026-09-08') === '29 hari - 11 bulan');
cek('usia 364 hari -> masih di bawah 1 tahun', L.kategoriUsia('2025-09-09', '2026-09-08') === '29 hari - 11 bulan');
cek('usia >=1 tahun tapi <5 -> 1-4 tahun', L.kategoriUsia('2024-01-01', '2026-09-08') === '1-4 tahun');
cek('usia 5 tahun -> 5-9 tahun', L.kategoriUsia('2021-01-01', '2026-09-08') === '5-9 tahun');
cek('usia 10 tahun -> 10-14 tahun', L.kategoriUsia('2016-01-01', '2026-09-08') === '10-14 tahun');
cek('usia 15 tahun -> 15-19 tahun', L.kategoriUsia('2011-01-01', '2026-09-08') === '15-19 tahun');
cek('usia 20 tahun -> 20-44 tahun', L.kategoriUsia('2006-01-01', '2026-09-08') === '20-44 tahun');
cek('usia 45 tahun -> 45-54 tahun', L.kategoriUsia('1981-01-01', '2026-09-08') === '45-54 tahun');
cek('usia 55 tahun -> 55-59 tahun', L.kategoriUsia('1971-01-01', '2026-09-08') === '55-59 tahun');
cek('usia 60 tahun -> 60-69 tahun', L.kategoriUsia('1966-01-01', '2026-09-08') === '60-69 tahun');
cek('usia 70 tahun -> ≥70 tahun', L.kategoriUsia('1956-01-01', '2026-09-08') === '≥70 tahun');
cek('semua 12 kategori baku tersedia di KATEGORI_USIA', KU.length === 12);
cek('tanggal lahir SESUDAH tanggal acuan (data cacat) -> null, tidak mengarang kategori',
  L.kategoriUsia('2026-09-09', '2026-09-08') === null);
cek('tanggal lahir kosong -> null', L.kategoriUsia(null, '2026-09-08') === null);

{
  const rows = [
    { kode_icd10: 'J06.9', nama: 'ISPA', tanggal: '2026-09-01', tanggal_lahir: '2020-01-01', jenis_kelamin: 'L' },
    { kode_icd10: 'J06.9', nama: 'ISPA', tanggal: '2026-09-02', tanggal_lahir: '1990-01-01', jenis_kelamin: 'P' },
    { kode_icd10: 'I10',   nama: 'Hipertensi esensial', tanggal: '2026-09-01', tanggal_lahir: '1970-01-01', jenis_kelamin: 'P' },
    // Diagnosa dengan tanggal_lahir cacat: tetap dihitung di total/L-P, tidak di kategori usia mana pun.
    { kode_icd10: 'I10', nama: 'Hipertensi esensial', tanggal: '2026-09-03', tanggal_lahir: '2026-09-10', jenis_kelamin: 'L' }
  ];
  const rekap = L.rekapPuskesmas(rows);
  cek('rekapPuskesmas: diurutkan dari kasus terbanyak', rekap[0].kode === 'J06.9' && rekap[0].total === 2);
  cek('rekapPuskesmas: L/P tertally benar', rekap[0].L === 1 && rekap[0].P === 1);
  cek('rekapPuskesmas: I10 total tetap 2 walau satu barisnya usia cacat (direkonsiliasi)',
    rekap[1].kode === 'I10' && rekap[1].total === 2);
  const totalKategoriI10 = Object.values(rekap[1].perKategori).reduce((a, b) => a + b, 0);
  cek('rekapPuskesmas: baris usia cacat tidak menambah satu pun kategori (1 dari 2 kasus I10 masuk kategori)',
    totalKategoriI10 === 1);
}

console.log(`\n${lulus} pemeriksaan lulus — laporan_core.js`);

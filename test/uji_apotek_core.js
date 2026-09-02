/* Uji fungsi murni apotek_core.js — dijalankan dengan `node`, tanpa
   peramban dan tanpa database. */
'use strict';
const A = require('../js/apotek_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}
const dekat = (a, b) => Math.abs(a - b) < 0.001;

/* ---------------------------------------------------------------- FEFO */

const batch = [
  { id: 'b1', obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet',
    tgl_expired: '2027-01-31', tgl_masuk: '2026-01-01', stok_sisa: 100, harga_beli: 1000 },
  { id: 'b2', obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet',
    tgl_expired: '2026-10-10', tgl_masuk: '2026-08-01', stok_sisa: 30,  harga_beli: 1200 },
  { id: 'b3', obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet',
    tgl_expired: '2026-08-01', tgl_masuk: '2025-06-01', stok_sisa: 20,  harga_beli: 900 }
];

const urut = A.urutFefo(batch).map(b => b.id);
cek('urutFefo mendahulukan expired terdekat',
    JSON.stringify(urut) === JSON.stringify(['b3', 'b2', 'b1']),
    'dapat ' + urut.join(','));

// Batch yang masuk paling awal (b3, Juni 2025) memang kebetulan juga yang
// paling dekat expired. Yang membedakan FEFO dari FIFO adalah b2: masuk
// belakangan (Agustus 2026) tapi expired lebih dekat daripada b1.
const urutFifo = [...batch].sort((a, b) => a.tgl_masuk.localeCompare(b.tgl_masuk)).map(b => b.id);
cek('FEFO memang berbeda dari FIFO untuk data ini',
    JSON.stringify(urut) !== JSON.stringify(urutFifo),
    'FIFO: ' + urutFifo.join(',') + ' | FEFO: ' + urut.join(','));

const sim = A.simulasiFefo(batch, 40);
cek('simulasiFefo memotong dari batch terdekat expired lebih dulu',
    sim.potongan.length === 2 && sim.potongan[0].batch.id === 'b3' && sim.potongan[0].ambil === 20);
cek('simulasiFefo memakai harga tiap batch, bukan harga rata-rata',
    dekat(sim.totalNilai, 20 * 900 + 20 * 1200), 'dapat ' + sim.totalNilai);
cek('simulasiFefo melaporkan kekurangan', A.simulasiFefo(batch, 999).kurang === 849);
cek('simulasiFefo tidak kekurangan bila cukup', sim.kurang === 0);

cek('batchBolehKeluar mengunci batch kadaluwarsa untuk resep',
    A.batchBolehKeluar(batch, 'Resep Pasien', '2026-09-01').length === 2);
cek('batchBolehKeluar membuka batch kadaluwarsa untuk pemusnahan',
    A.batchBolehKeluar(batch, 'Obat Expired', '2026-09-01').length === 3);

/* --------------------------------------------------- Tanggal & zona waktu */

// Inti perbaikan zona waktu: pukul 07.00 WITA, toISOString() memulangkan
// tanggal KEMARIN karena UTC masih 23.00. hariIniLokal harus tetap hari ini.
const pagiWita = new Date(2026, 8, 1, 7, 0, 0);   // 1 Sep 2026 07:00 waktu lokal
cek('hariIniLokal tidak bergeser satu hari pada jam pagi',
    A.hariIniLokal(pagiWita) === '2026-09-01',
    'dapat ' + A.hariIniLokal(pagiWita));

cek('akhirBulan Februari kabisat', A.akhirBulan('2028-02') === '2028-02-29');
cek('akhirBulan Februari biasa',   A.akhirBulan('2026-02') === '2026-02-28');
cek('akhirBulan 30 hari',          A.akhirBulan('2026-09') === '2026-09-30');

/* ---------------------------------------------------------- Kartu stok */

/* Skenario: stok sekarang 50. Bulan Agustus ada masuk 100 dan keluar 60.
   Setelah Agustus (September) ada keluar 10 lagi.
   Maka saldo akhir Agustus = 50 + 10 = 60, saldo awal Agustus = 60 - 40 = 20. */
const batchKartu = [{ id: 'x', obat_id: 'o1', nama_obat: 'Amoxicillin',
                      satuan: 'Tablet', stok_sisa: 50, harga_beli: 1000,
                      tgl_expired: '2027-01-01', tgl_masuk: '2026-08-01' }];
const trx = [
  { obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'MASUK',
    kategori: 'Pembelian', jumlah: 100, total_nilai: 100000, tanggal: '2026-08-05' },
  { obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'KELUAR',
    kategori: 'Resep Pasien', jumlah: 40, total_nilai: 40000, tanggal: '2026-08-20' },
  { obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'KELUAR',
    kategori: 'Obat Rusak', jumlah: 20, total_nilai: 20000, tanggal: '2026-08-25' },
  { obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'KELUAR',
    kategori: 'Resep Pasien', jumlah: 10, total_nilai: 10000, tanggal: '2026-09-03' }
];

const k = A.kartuObat({ transaksi: trx, batch: batchKartu, obatId: 'o1', bulan: '2026-08' });
cek('kartu: saldo akhir ditarik mundur dari stok sekarang',
    k.saldoAkhir === 60, 'dapat ' + k.saldoAkhir);
cek('kartu: saldo awal = saldo akhir - gerakan bulan itu',
    k.saldoAwal === 20, 'dapat ' + k.saldoAwal);
cek('kartu: tiga hari bergerak di Agustus', k.baris.length === 3);
cek('kartu: saldo berjalan baris terakhir = saldo akhir',
    k.baris[k.baris.length - 1].saldo === k.saldoAkhir);
cek('kartu: rincian per kategori terpisah',
    k.total.perKat['Resep Pasien'].qty === 40 && k.total.perKat['Obat Rusak'].qty === 20);

/* Inti perhitungan mundur: koreksi batch yang tidak menulis baris
   transaksi. Stok fisik dinaikkan dari 50 ke 70 lewat Edit Batch; kartu
   harus ikut naik, bukan tetap di angka lama. Perhitungan maju dari nol
   akan mengabaikan koreksi ini dan berselisih 20 selamanya. */
const batchDikoreksi = [{ ...batchKartu[0], stok_sisa: 70 }];
const k2 = A.kartuObat({ transaksi: trx, batch: batchDikoreksi, obatId: 'o1', bulan: '2026-08' });
cek('kartu ikut koreksi batch yang tidak menulis transaksi',
    k2.saldoAkhir === 80 && k2.saldoAwal === 40,
    `dapat awal ${k2.saldoAwal} akhir ${k2.saldoAkhir}`);

/* Baris yang dibatalkan tidak boleh ikut dihitung. */
const trxBatal = trx.concat([{
  obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'KELUAR',
  kategori: 'Resep Pasien', jumlah: 500, total_nilai: 500000,
  tanggal: '2026-08-10', dibatalkan: true
}]);
const k3 = A.kartuObat({ transaksi: trxBatal, batch: batchKartu, obatId: 'o1', bulan: '2026-08' });
cek('transaksi yang dibatalkan diabaikan',
    k3.saldoAwal === k.saldoAwal && k3.total.keluarQty === k.total.keluarQty,
    `awal ${k3.saldoAwal} vs ${k.saldoAwal}`);

/* ------------------------------------------------------- Rekap harian */

const r = A.rekapHarian({ transaksi: trx, batch: batchKartu, tanggal: '2026-08-20' });
cek('rekap harian: satu obat bergerak', r.jumlahObat === 1);
cek('rekap harian: saldo akhir hari itu ditarik mundur',
    r.baris[0].saldo === 80, 'dapat ' + r.baris[0].saldo);   // 50 + 20 (25 Agu) + 10 (3 Sep)

/* -------------------------------------------------------- Ringkasan */

const ring = A.ringkasStok(batch);
cek('ringkasStok menghitung nilai aset per batch',
    dekat(ring.nilaiAset, 100 * 1000 + 30 * 1200 + 20 * 900), 'dapat ' + ring.nilaiAset);
cek('ringkasStok menghitung jenis obat, bukan jumlah batch',
    ring.jenisObat === 1 && ring.jumlahBatch === 3);

/* -------------------------------------------------- Laporan bulanan */

const lap = A.laporanBulan(trx, '2026-08');
cek('laporan: total pembelian', lap.pembelianRp === 100000 && lap.pembelianQty === 100);
cek('laporan: total keluar',    lap.keluarRp === 60000 && lap.keluarQty === 60);
cek('laporan: selisih',         lap.selisihRp === 40000);
cek('laporan: rincian per obat', lap.perObat.length === 1 && lap.perObat[0].keluarQty === 60);

/* ------------------------------------------------------ Daftar obat */

const daftar = A.daftarObat([], trx);
cek('daftarObat menyertakan obat yang batch-nya sudah habis',
    daftar.length === 1 && daftar[0].obat_id === 'o1');

console.log(`\n${lulus} pemeriksaan lulus.`);

/* ------------------------------------ Saldo awal terpisah dari pembelian */

const trxSaldo = [
  { obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'MASUK',
    kategori: 'Saldo Awal', jumlah: 500, total_nilai: 300000, tanggal: '2026-08-01' },
  { obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'MASUK',
    kategori: 'Pembelian', jumlah: 100, total_nilai: 60000, tanggal: '2026-08-05' },
  { obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet', jenis: 'KELUAR',
    kategori: 'Resep Pasien', jumlah: 40, total_nilai: 24000, tanggal: '2026-08-20' }
];
const lapS = A.laporanBulan(trxSaldo, '2026-08');
cek('pemuatan stok awal tidak dihitung sebagai pembelian',
    lapS.pembelianRp === 60000, 'dapat ' + lapS.pembelianRp);
cek('pemuatan stok awal dilaporkan tersendiri',
    lapS.saldoAwalRp === 300000 && lapS.saldoAwalQty === 500,
    `dapat ${lapS.saldoAwalRp} / ${lapS.saldoAwalQty}`);
cek('selisih bulan dihitung tanpa saldo awal',
    lapS.selisihRp === 60000 - 24000, 'dapat ' + lapS.selisihRp);

/* Saldo awal tetap menggerakkan stok, jadi kartu stok WAJIB ikut
   menghitungnya — hanya laporan pembelian yang memisahkannya. */
const kartuS = A.kartuObat({
  transaksi: trxSaldo,
  batch: [{ id: 'x', obat_id: 'o1', nama_obat: 'Amoxicillin', satuan: 'Tablet',
            stok_sisa: 560, harga_beli: 600, tgl_expired: '2028-01-01', tgl_masuk: '2026-08-01' }],
  obatId: 'o1', bulan: '2026-08'
});
cek('kartu stok tetap menghitung saldo awal sebagai pemasukan',
    kartuS.total.masukQty === 600 && kartuS.saldoAwal === 0,
    `masuk ${kartuS.total.masukQty}, saldo awal ${kartuS.saldoAwal}`);

console.log(`\n${lulus} pemeriksaan lulus (termasuk saldo awal).`);

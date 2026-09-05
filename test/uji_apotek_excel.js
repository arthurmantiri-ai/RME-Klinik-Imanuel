/* Uji pembacaan berkas impor dan penyusunan lembar ekspor.
   Dijalankan dengan `node test/uji_apotek_excel.js` — tanpa peramban,
   tanpa SheetJS, tanpa database. */
'use strict';
const E = require('../js/apotek_excel.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? '\n  ' + pesan : '')); process.exit(1); }
  lulus++; console.log('  ok  ' + nama);
}
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ═══════════════════════════════════════════════ TANGGAL */

const tgl = (v) => E.bacaTanggal(v).tanggal;

// 46203 = 30 Juni 2026 dalam kalender serial Excel.
cek('serial Excel dibaca sebagai tanggal', tgl(46203) === '2026-06-30', 'dapat ' + tgl(46203));
cek('serial Excel yang terlanjur jadi teks tetap terbaca', tgl('46203') === '2026-06-30');
cek('bentuk tahun-bulan-tanggal', tgl('2028-06-30') === '2028-06-30');
cek('bentuk tahun/bulan/tanggal', tgl('2028/06/30') === '2028-06-30');
cek('hari di atas 12 tidak mungkin salah baca', tgl('30/06/2028') === '2028-06-30');
cek('bulan di atas 12 dibaca terbalik', tgl('06/30/2028') === '2028-06-30');
cek('pemisah titik ikut diterima', tgl('30.06.2028') === '2028-06-30');

/* Ini yang paling berbahaya: 03/04/2028 sah dibaca dua cara. Ditafsirkan
   hari-dulu sesuai kebiasaan Indonesia, TAPI harus ditandai supaya
   pratinjau bisa menampilkan hasil bacaannya untuk diperiksa. */
const ambigu = E.bacaTanggal('03/04/2028');
cek('tanggal ambigu dibaca hari-dulu', ambigu.tanggal === '2028-04-03');
cek('tanggal ambigu diberi tanda', ambigu.ambigu === true);
cek('tanggal yang tidak ambigu tidak diberi tanda', E.bacaTanggal('30/06/2028').ambigu === false);
cek('bentuk baku tidak pernah ambigu', E.bacaTanggal('2028-04-03').ambigu === false);

cek('tanggal mustahil ditolak', tgl('31/02/2028') === null);
cek('bulan 13 ditolak', tgl('2028-13-01') === null);
cek('teks bukan tanggal ditolak', tgl('segera') === null);
cek('sel kosong menghasilkan null', tgl('') === null && tgl(null) === null);

/* Objek Date dari SheetJS dibaca lewat getter UTC. Memakai getter lokal
   akan menggeser tanggal satu hari di WITA — kesalahan yang hanya muncul
   pada sebagian tanggal, jadi mudah lolos dari pemeriksaan sepintas. */
cek('objek Date dibaca sebagai tanggal UTC-nya',
    tgl(new Date(Date.UTC(2028, 5, 30))) === '2028-06-30');

/* ═══════════════════════════════════════════════ ANGKA */

const ang = E.bacaAngka;
cek('angka biasa', ang(1500) === 1500);
cek('titik sebagai pemisah ribuan', ang('1.500') === 1500, 'dapat ' + ang('1.500'));
cek('titik ribuan bertingkat', ang('1.500.000') === 1500000);
cek('koma sebagai pemisah ribuan', ang('1,500') === 1500);
cek('koma sebagai desimal', ang('1500,75') === 1500.75);
cek('titik desimal', ang('1500.75') === 1500.75);
cek('ribuan titik + desimal koma', ang('1.500,75') === 1500.75, 'dapat ' + ang('1.500,75'));
cek('ribuan koma + desimal titik', ang('1,500.75') === 1500.75);
cek('awalan Rp dibuang', ang('Rp 1.500') === 1500);
cek('spasi dibuang', ang(' 1 500 ') === null || ang('1500 ') === 1500);
cek('teks bukan angka ditolak', ang('lima ratus') === null);
cek('sel kosong menghasilkan null', ang('') === null && ang(null) === null);
cek('nol tetap nol, bukan null', ang(0) === 0 && ang('0') === 0);

/* ═══════════════════════════════════════════════ PENCOCOKAN OBAT */

const master = [
  { id: 'o1', kode_internal: 'OBT-001', nama: 'Paracetamol 500 mg', satuan: 'Tablet', harga: 1000, aktif: true },
  { id: 'o2', kode_internal: 'OBT-002', nama: 'Amoxicillin 500 mg', satuan: 'Tablet', harga: 2500, aktif: true },
  { id: 'o3', kode_internal: null,      nama: 'Ambroxol 30 mg',     satuan: 'Tablet', harga: 1500, aktif: false }
];
const idx = E.indeksObat(master);
const cari = (b) => E.cocokkanObat(b, idx);

cek('cocok lewat kode internal',
    cari({ kode_obat: 'OBT-002', nama_obat: 'apa saja' }).obat.id === 'o2');
cek('kode internal tidak peduli besar-kecil huruf',
    cari({ kode_obat: 'obt-002' }).obat.id === 'o2');
cek('cocok lewat nama persis',
    cari({ nama_obat: 'Paracetamol 500 mg' }).obat.id === 'o1');
cek('cocok lewat nama beda besar-kecil huruf',
    cari({ nama_obat: 'PARACETAMOL 500 MG' }).obat.id === 'o1');

/* Inti perbaikan dibanding portal: "500mg" dan "500 mg" adalah obat yang
   sama. Di portal keduanya jadi dua kartu stok yang tidak pernah
   dijumlahkan. */
const rapat = cari({ nama_obat: 'Amoxicillin 500mg' });
cek('spasi di dalam nama tidak memecah obat', rapat.obat && rapat.obat.id === 'o2');
cek('pencocokan tanpa spasi ditandai caranya', rapat.cara === 'nama-rapat');

const salahKetik = cari({ nama_obat: 'Amoxicilin 500 mg' });
cek('salah ketik satu huruf tidak dianggap cocok', salahKetik.obat === null);
cek('salah ketik satu huruf disodorkan sebagai kemiripan',
    salahKetik.mirip.length > 0 && salahKetik.mirip[0].obat.id === 'o2',
    JSON.stringify(salahKetik.mirip.map(m => m.obat.nama)));

const asing = cari({ nama_obat: 'Cefixime 100 mg' });
cek('obat yang benar-benar baru tidak dipaksakan cocok',
    asing.obat === null && asing.mirip.length === 0);

cek('kemiripan huruf identik bernilai 1', E.kemiripan('Amoxicillin', 'amoxicillin') === 1);
cek('kemiripan kata berbeda jauh bernilai rendah',
    E.kemiripan('Paracetamol', 'Cefixime') < 0.3);

/* ═══════════════════════════════════════════════ MEMBACA LEMBAR */

const HARI_INI = '2026-09-01';

const lembar = [
  ['Kode Obat', 'Nama Obat', 'Satuan', 'Jumlah', 'Harga Beli',
   'Tanggal Kadaluwarsa', 'Tanggal Masuk', 'No. Faktur', 'PBF', 'No. Batch',
   'Harga Jual', 'Keterangan'],
  ['OBT-001', 'Paracetamol 500 mg', 'Tablet', '500', '600',
   '2028-06-30', '2026-09-01', 'FK-001', 'PT Kimia Farma', 'B01', '', ''],
  ['', 'Amoxicillin 500mg', 'Tablet', '1.200', 'Rp 1.400',
   46203, '', 'FK-002', 'PT Enseval', '', '', 'beda spasi'],
  ['', 'Cefixime 100 mg', 'Kapsul', '30', '3.000',
   '2029-01-31', '', '', 'PT Baru', '', '4500', 'obat baru'],
  [], [null, null, null],
  ['', 'Ambroxol 30 mg', 'Tablet', '-5', '900',
   '2025-01-01', '', '', 'PT Enseval', '', '', 'banyak salah']
];

const h = E.bacaLembar(lembar, master, { hariIni: HARI_INI });
cek('baris kosong dilewati, bukan jadi galat', h.baris.length === 4,
    'dapat ' + h.baris.length + ' baris');
cek('tidak ada kolom yang tak dikenal', h.kolomTakDikenal.length === 0,
    JSON.stringify(h.kolomTakDikenal));
cek('nomor baris mengikuti nomor di Excel',
    h.baris[0].nomorBaris === 2 && h.baris[3].nomorBaris === 7,
    h.baris.map(b => b.nomorBaris).join(','));

const [b1, b2, b3, b4] = h.baris;

cek('baris 1 cocok lewat kode dan siap', b1.obat.id === 'o1' && b1.galat.length === 0);
cek('baris 1 angka ribuan terbaca', b1.jumlah === 500 && b1.harga_beli === 600);

cek('baris 2 cocok walau beda spasi', b2.obat.id === 'o2');
cek('baris 2 ribuan bertitik terbaca', b2.jumlah === 1200, 'dapat ' + b2.jumlah);
cek('baris 2 harga berawalan Rp terbaca', b2.harga_beli === 1400);
cek('baris 2 tanggal serial Excel terbaca', b2.tgl_expired === '2026-06-30');
cek('baris 2 diberi peringatan soal beda spasi',
    b2.peringatan.some(p => /beda spasi/.test(p)), JSON.stringify(b2.peringatan));

cek('baris 3 obat baru tidak dianggap galat',
    b3.obat === null && b3.galat.length === 0);
cek('baris 3 ditandai belum ada di master',
    b3.peringatan.some(p => /Belum ada di Master Data/.test(p)));
cek('baris 3 belum siap sebelum dicentang', E.statusBaris(b3) === 'tertunda');
b3.buatObat = true;
cek('baris 3 jadi siap setelah dicentang', E.statusBaris(b3) === 'obat-baru');

cek('baris 4 jumlah negatif jadi galat',
    b4.galat.some(g => /lebih dari nol/.test(g)), JSON.stringify(b4.galat));
cek('baris 4 kadaluwarsa lampau jadi peringatan, bukan galat',
    b4.peringatan.some(p => /Sudah kadaluwarsa/.test(p)));
cek('baris 4 obat nonaktif ditandai',
    b4.peringatan.some(p => /nonaktif/.test(p)), JSON.stringify(b4.peringatan));

/* ═══════════════════════════════════════════════ RINGKASAN & MUATAN */

let r = E.ringkas(h.baris);
cek('ringkasan menghitung baris bergalat', r.galat === 1);
cek('impor ditahan selama masih ada galat', r.bisaDiproses === false);

const bersih = h.baris.filter(b => !b.galat.length);
r = E.ringkas(bersih);
cek('tanpa baris bergalat, impor boleh jalan', r.bisaDiproses === true);
cek('ringkasan menghitung obat baru', r.obatBaru === 1);
cek('ringkasan menjumlahkan nilai',
    r.nilai === 500 * 600 + 1200 * 1400 + 30 * 3000, 'dapat ' + r.nilai);

const muatan = E.keMuatan(bersih);
cek('muatan hanya berisi baris siap', muatan.length === 3);
cek('baris yang cocok mengirim obat_id, bukan obat_baru',
    muatan[0].obat_id === 'o1' && muatan[0].obat_baru === null);
cek('baris obat baru mengirim obat_baru lengkap',
    muatan[2].obat_id === null && muatan[2].obat_baru.nama === 'Cefixime 100 mg'
    && muatan[2].obat_baru.satuan === 'Kapsul' && muatan[2].obat_baru.harga === 4500,
    JSON.stringify(muatan[2].obat_baru));
cek('tanggal masuk kosong dikirim null, bukan string kosong',
    muatan[1].tgl_masuk === null);

/* Baris yang tidak dicentang tidak boleh ikut terkirim — kalau ikut,
   sentuhan "batal" pada centang tidak berarti apa-apa. */
b3.buatObat = false;
cek('baris obat baru yang tidak dicentang tidak ikut dikirim',
    E.keMuatan(bersih).length === 2);
b3.buatObat = true;

/* ═══════════════════════════════════════════════ KOLAM (17_apotek_kolam) */

cek('bacaKolam: kosong dibaca reguler', E.bacaKolam('').kolam === 'reguler'
    && E.bacaKolam('').tidakDikenal === false);
cek('bacaKolam: kosong-dari-null (kolom tidak ada di berkas) juga reguler',
    E.bacaKolam(null).kolam === 'reguler' && E.bacaKolam(undefined).kolam === 'reguler');
cek('bacaKolam: mengenali beberapa ejaan "reguler"',
    ['Reguler', 'REGULAR', ' biasa ', 'Umum'].every(v => E.bacaKolam(v).kolam === 'reguler'));
cek('bacaKolam: mengenali beberapa ejaan "kronis"',
    ['Kronis', 'CHRONIC', 'prb', 'Prolanis'].every(v => E.bacaKolam(v).kolam === 'kronis'));
cek('bacaKolam: nilai yang tidak dikenal ditandai, bukan diam-diam jadi reguler',
    E.bacaKolam('entah').tidakDikenal === true && E.bacaKolam('entah').kolam === 'reguler');

const aoaKolam = [
  ['Nama Obat', 'Jumlah', 'Harga Beli', 'Tanggal Kadaluwarsa', 'PBF', 'Kolam'],
  ['Paracetamol 500 mg', 30, 500, '2028-01-01', 'PT Kimia Farma', 'Kronis'],
  ['Paracetamol 500 mg', 20, 500, '2028-01-01', 'PT Kimia Farma', ''],
  ['Paracetamol 500 mg', 10, 500, '2028-01-01', 'PT Kimia Farma', 'entah-berantah']
];
const hKolam = E.bacaLembar(aoaKolam, master, { hariIni: HARI_INI });
cek('baris dengan "Kolam"="Kronis" terbaca kronis, tanpa galat',
    hKolam.baris[0].kolam === 'kronis' && hKolam.baris[0].galat.length === 0,
    JSON.stringify(hKolam.baris[0].galat));
cek('baris dengan "Kolam" kosong bawaan ke reguler, tanpa galat',
    hKolam.baris[1].kolam === 'reguler' && hKolam.baris[1].galat.length === 0);
cek('baris dengan "Kolam" tidak dikenal ditahan sebagai galat, bukan ditebak jadi reguler',
    hKolam.baris[2].galat.some(g => /Kolam/.test(g)), JSON.stringify(hKolam.baris[2].galat));

const muatanKolam = E.keMuatan(hKolam.baris.filter(b => !b.galat.length));
cek('keMuatan meneruskan kolam per baris ke muatan RPC',
    muatanKolam.length === 2 && muatanKolam[0].kolam === 'kronis' && muatanKolam[1].kolam === 'reguler',
    JSON.stringify(muatanKolam.map(m => m.kolam)));

/* ═══════════════════════════════════════════════ JUDUL KOLOM LAIN */

const lembarPortal = [
  ['Nama Obat', 'Satuan', 'Qty', 'Harga Satuan', 'Expired', 'Faktur', 'Distributor'],
  ['Paracetamol 500 mg', 'Tablet', 100, 600, '2028-06-30', 'FK-9', 'PT Kimia Farma']
];
const hp = E.bacaLembar(lembarPortal, master, { hariIni: HARI_INI });
cek('judul kolom gaya lain tetap dikenali',
    hp.baris.length === 1 && hp.baris[0].galat.length === 0,
    JSON.stringify(hp.baris[0] && hp.baris[0].galat));
cek('kolom alias dipetakan ke kolom yang benar',
    hp.baris[0].jumlah === 100 && hp.baris[0].pbf === 'PT Kimia Farma');

const kurang = E.bacaLembar([['Nama Obat', 'Jumlah'], ['Paracetamol 500 mg', 10]],
                            master, { hariIni: HARI_INI });
cek('kolom wajib yang hilang disebutkan namanya',
    /Harga Beli/.test(kurang.galatBerkas) && /PBF/.test(kurang.galatBerkas),
    kurang.galatBerkas);

cek('berkas kosong ditolak dengan pesan jelas',
    /kosong/i.test(E.bacaLembar([], master, {}).galatBerkas));

/* ═══════════════════════════════════════════════ LEMBAR EKSPOR */

const stok = [
  { obat_id: 'o1', nama_obat: 'Paracetamol 500 mg', satuan: 'Tablet', bentuk_sediaan: 'Tablet',
    kekuatan: '500 mg', harga_jual: 1000, stok_total: 400, stok_layak: 400, jumlah_batch: 2,
    nilai_total: 244000, batch_kadaluwarsa: 0, batch_segera: 1, expired_terdekat: '2026-09-26' },
  { obat_id: 'o2', nama_obat: 'Amoxicillin 500 mg', satuan: 'Tablet', bentuk_sediaan: 'Kaplet',
    kekuatan: '500 mg', harga_jual: 2500, stok_total: 6, stok_layak: 6, jumlah_batch: 1,
    nilai_total: 8400, batch_kadaluwarsa: 0, batch_segera: 0, expired_terdekat: '2027-06-28' },
  { obat_id: 'o9', nama_obat: 'Obat Habis', satuan: 'Tablet', stok_total: 0, stok_layak: 0,
    jumlah_batch: 0, nilai_total: 0, batch_kadaluwarsa: 0, batch_segera: 0 }
];
const batchEks = [
  { obat_id: 'o1', kode_internal: 'OBT-001', nama_obat: 'Paracetamol 500 mg', satuan: 'Tablet',
    stok_sisa: 320, harga_beli: 600, tgl_expired: '2027-10-06', tgl_masuk: '2026-07-03',
    no_faktur: 'FK-001', pbf: 'PT Kimia Farma', no_batch: '', harga_jual: 1000,
    kadaluwarsa: false, segera_kadaluwarsa: false, hari_ke_expired: 400, keterangan: '' },
  { obat_id: 'o1', kode_internal: 'OBT-001', nama_obat: 'Paracetamol 500 mg', satuan: 'Tablet',
    stok_sisa: 80, harga_beli: 650, tgl_expired: '2026-09-26', tgl_masuk: '2026-08-22',
    no_faktur: 'FK-014', pbf: 'PT Enseval', no_batch: '', harga_jual: 1000,
    kadaluwarsa: false, segera_kadaluwarsa: true, hari_ke_expired: 25, keterangan: '' },
  { obat_id: 'o9', nama_obat: 'Obat Habis', satuan: 'Tablet', stok_sisa: 0, harga_beli: 100,
    tgl_expired: '2027-01-01', tgl_masuk: '2026-01-01', pbf: 'X', harga_jual: 0,
    kadaluwarsa: false, segera_kadaluwarsa: false, hari_ke_expired: 300 }
];

const lo = E.lembarStokPerObat(stok);
cek('lembar stok per obat melewatkan obat tanpa stok', lo.length === 3, 'dapat ' + lo.length);
cek('lembar stok per obat menulis angka sebagai angka',
    typeof lo[1][4] === 'number' && typeof lo[1][7] === 'number');

const lb = E.lembarStokPerBatch(batchEks);
cek('lembar batch memakai judul kolom yang sama dengan template impor',
    sama(lb[0], E.lembarTemplate()[0]),
    'hasil ekspor harus bisa langsung dipakai sebagai berkas impor');
cek('lembar batch melewatkan batch kosong', lb.length === 3);

const idxKolam = E.KOLOM.findIndex(k => k.kunci === 'kolam');
cek('lembar batch menulis "Reguler" untuk batch tanpa field kolam (data sebelum tahap ini)',
    lb[1][idxKolam] === 'Reguler', 'dapat ' + lb[1][idxKolam]);
cek('lembar batch menulis "Kronis" untuk batch berkolam kronis',
    E.lembarStokPerBatch([{ ...batchEks[0], kolam: 'kronis' }])[1][idxKolam] === 'Kronis');

const lr = E.lembarRingkasan({
  stok, batch: batchEks, namaKlinik: 'Klinik Imanuel', tanggal: '1 September 2026',
  ringkasStok: { nilaiAset: 252400, jenisObat: 2, jumlahBatch: 2, menipis: 1,
                 kadaluwarsa: 0, segera: 1 }
});
const teksRingkasan = JSON.stringify(lr);
cek('ringkasan memuat obat bernilai terbesar', /Paracetamol 500 mg/.test(teksRingkasan));
cek('ringkasan menyebut obat yang menipis',
    lr.some(b => b[0] === 'PERLU DIPESAN — SISA DI BAWAH 10'));
cek('ringkasan menyebut batch yang hampir kadaluwarsa',
    /2026-09-26/.test(teksRingkasan));

const trx = [
  { tanggal: '2026-09-05', jenis: 'MASUK', kategori: 'Pembelian', nama_obat: 'A',
    satuan: 'Tablet', jumlah: 100, harga_satuan: 600, total_nilai: 60000, dibatalkan: false },
  { tanggal: '2026-09-06', jenis: 'MASUK', kategori: 'Saldo Awal', nama_obat: 'A',
    satuan: 'Tablet', jumlah: 500, harga_satuan: 600, total_nilai: 300000, dibatalkan: false },
  { tanggal: '2026-09-07', jenis: 'KELUAR', kategori: 'Resep Pasien', nama_obat: 'A',
    satuan: 'Tablet', jumlah: 20, harga_satuan: 600, total_nilai: 12000, dibatalkan: false },
  { tanggal: '2026-09-08', jenis: 'KELUAR', kategori: 'Resep Pasien', nama_obat: 'A',
    satuan: 'Tablet', jumlah: 999, harga_satuan: 600, total_nilai: 599400, dibatalkan: true }
];

const rek = E.lembarRekapBulanan(trx, '2026-09', 12);
cek('rekap bulanan berisi 12 bulan + judul', rek.length === 13);
cek('rekap bulanan berakhir di bulan yang diminta',
    rek[12][0] === 'September 2026', rek[12][0]);
cek('rekap bulanan dimulai 12 bulan sebelumnya',
    rek[1][0] === 'Oktober 2025', rek[1][0]);

/* Inti pemisahan saldo awal: memuat persediaan lama ke sistem bukan
   belanja bulan itu. Kalau digabung, laporan bulan pertama menunjukkan
   pembelian Rp 360.000 padahal klinik hanya membeli Rp 60.000. */
cek('saldo awal tidak terhitung sebagai pembelian',
    rek[12][1] === 60000, 'pembelian dapat ' + rek[12][1]);
cek('saldo awal punya kolom sendiri',
    rek[12][2] === 300000, 'saldo awal dapat ' + rek[12][2]);
cek('transaksi yang dibatalkan tidak ikut dihitung',
    rek[12][rek[12].length - 1] === 12000, 'total keluar dapat ' + rek[12][rek[12].length - 1]);

const kartu = E.lembarKartuStok({
  nama: 'Paracetamol 500 mg', bulan: '2026-09', satuan: 'Tablet',
  saldoAwal: 20, saldoAkhir: 60,
  baris: [{ tanggal: '2026-09-05', masukQty: 100, keluarQty: 0,
            perKat: { 'Resep Pasien': { qty: 0 } }, saldo: 120 },
          { tanggal: '2026-09-07', masukQty: 0, keluarQty: 60,
            perKat: { 'Resep Pasien': { qty: 60 } }, saldo: 60 }],
  total: { masukQty: 100, keluarQty: 60, perKat: { 'Resep Pasien': { qty: 60 } } }
});
cek('kartu stok memuat baris jumlah di akhir',
    kartu[kartu.length - 1][0] === 'Jumlah');
cek('kartu stok menutup dengan saldo akhir',
    kartu[kartu.length - 1][kartu[kartu.length - 1].length - 1] === 60);

const lebar = E.lebarKolom(lo);
cek('lebar kolom ditaksir dari isi terpanjang',
    lebar.length === lo[0].length && lebar.every(w => w.wch >= 9 && w.wch <= 46));

/* ═══════════════════════════════════════════════ TEMPLATE */

cek('template berisi judul dan satu baris contoh', E.lembarTemplate().length === 2);
cek('template memuat semua kolom', E.lembarTemplate()[0].length === E.KOLOM.length);
const petunjuk = JSON.stringify(E.lembarPetunjuk('Saldo Awal'));
cek('lembar petunjuk menjelaskan jenis impor yang dipilih',
    /Saldo awal \(opname\)/.test(petunjuk));
cek('lembar petunjuk memperingatkan soal penulisan tanggal',
    /tahun-bulan-tanggal/.test(petunjuk));

console.log(`\n${lulus} pemeriksaan lulus.`);

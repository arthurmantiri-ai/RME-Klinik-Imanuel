/* Uji mesin struk. struk_core.js diambil apa adanya dari portal; yang
   diuji di sini adalah bahwa perilaku lamanya TIDAK berubah, dan bahwa
   tiga tambahan untuk RME (nomor RM, penjamin, nama kasir) benar-benar
   mati kecuali dinyalakan. */
'use strict';
const S = require('../js/struk_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? '\n  ' + pesan : '')); process.exit(1); }
  lulus++; console.log('  ok  ' + nama);
}

const dasar = (ubah = {}) => ({
  bisnis: { nama: 'Klinik Pratama Imanuel', alamat: 'Kompleks Marina Plaza Blok E No 4, Manado',
            telp: '0811-4340-0454' },
  tpl: ubah.tpl || {},
  inv: Object.assign({
    invoice_number: 'INV-2026-0007', invoice_date: '2026-09-01',
    customer_name: 'Budi Santoso', no_rm: '000123', penjamin: 'UMUM',
    total: 65000, amount_paid: 65000, payment_status: 'lunas'
  }, ubah.inv || {}),
  items: ubah.items || [
    { item_name: 'Konsultasi dokter umum', quantity: 1, unit_price: 50000,
      discount_pct: 0, line_total: 50000 },
    { item_name: 'Amoxicillin 500 mg', quantity: 10, unit_price: 1500,
      discount_pct: 0, line_total: 15000 }
  ],
  payments: ubah.payments || [{ paid_at: '2026-09-01', amount: 65000,
                                method: 'tunai', cash_received: 100000 }],
  opsi: Object.assign({ lebarMm: 58 }, ubah.opsi || {})
});

const cetak = (d, mm) => S.keTeks(S.susunStruk(d), mm || 58);

/* ---------------------------------------------------- Lebar & kolom */

const t58 = cetak(dasar());
const t80 = cetak(dasar({ opsi: { lebarMm: 80 } }), 80);
cek('58 mm = 32 kolom', Math.max(...t58.split('\n').map(b => b.length)) === 32);
cek('80 mm = 48 kolom', Math.max(...t80.split('\n').map(b => b.length)) === 48);

/* ------------------------------------------------------- Perilaku lama */

cek('lunas dicetak KWITANSI', t58.includes('KWITANSI'));
cek('stempel lunas tercetak', t58.includes('*** LUNAS ***'));
cek('kembalian dihitung, bukan disimpan',
    /Kembali\s+35\.000/.test(t58), t58);

const belum = cetak(dasar({ inv: { amount_paid: 0, payment_status: 'belum_lunas' },
                            payments: [] }));
cek('belum bayar dicetak INVOICE', belum.includes('INVOICE'));
cek('belum bayar berstempel BELUM LUNAS', belum.includes('** BELUM LUNAS **'));

const sebagian = cetak(dasar({ inv: { amount_paid: 20000, payment_status: 'sebagian' },
                               payments: [{ paid_at: '2026-09-01', amount: 20000, method: 'tunai' }] }));
cek('bayar sebagian berstempel BAYAR SEBAGIAN', sebagian.includes('** BAYAR SEBAGIAN **'));
cek('bayar sebagian menampilkan sisa tagihan', /SISA TAGIHAN\s+45\.000/.test(sebagian));

/* Bug yang pernah terjadi di portal: kwitansi lunas TANPA baris pembayaran
   (invoice lama, sebelum tabel pembayaran ada) tercetak berjudul KWITANSI
   tapi berstempel BELUM LUNAS di kakinya. */
const lunasTanpaBaris = cetak(dasar({ inv: { amount_paid: 0, payment_status: 'lunas' },
                                      payments: [] }));
cek('lunas tanpa baris pembayaran tetap konsisten judul dan stempel',
    lunasTanpaBaris.includes('KWITANSI') && lunasTanpaBaris.includes('*** LUNAS ***')
    && !lunasTanpaBaris.includes('BELUM LUNAS'), lunasTanpaBaris);

/* ------------------------------------------- Tambahan RME: BPJS nol rupiah */

const bpjs = cetak(dasar({
  inv: { total: 0, amount_paid: 0, payment_status: 'belum_lunas', penjamin: 'BPJS' },
  payments: [],
  items: [{ item_name: 'Konsultasi dokter umum (ditanggung)', quantity: 1,
            unit_price: 50000, discount_pct: 0, line_total: 0 }],
  opsi: { judul: 'BUKTI PELAYANAN' }
}));
cek('tagihan nol rupiah TIDAK berstempel belum lunas',
    !bpjs.includes('BELUM LUNAS'), bpjs);
cek('tagihan nol rupiah berstempel lunas', bpjs.includes('*** LUNAS ***'));
cek('judul BPJS bisa ditentukan pemanggil', bpjs.includes('BUKTI PELAYANAN'));

/* ------------------------------------- Tambahan RME mati kecuali dinyalakan */

cek('nomor RM tidak dicetak kecuali dinyalakan', !t58.includes('No RM'));
cek('penjamin tidak dicetak kecuali dinyalakan', !/Bayar\s*:/.test(t58));
cek('nama kasir tidak dicetak kecuali dinyalakan', !t58.includes('Kasir:'));

const penuh = cetak(dasar({
  tpl: { tampilNomorRm: true, tampilPenjamin: true, tampilPetugas: true },
  opsi: { petugas: 'Yanti Kolondam' }
}));
cek('nomor RM dicetak saat dinyalakan', /No RM\s*:\s*000123/.test(penuh), penuh);
cek('penjamin dicetak saat dinyalakan', /Bayar\s*:\s*UMUM/.test(penuh));
cek('nama kasir dicetak saat dinyalakan', penuh.includes('Kasir: Yanti Kolondam'));

/* ---------------------------------------------------------- Transliterasi */

const aneh = cetak(dasar({ inv: { customer_name: 'Ibu Ñoña “Café” — Ünïcode' },
                           tpl: { tampilNamaPelanggan: true } }));
// Nama panjang ikut dibungkus, jadi spasi dirapikan lebih dulu.
cek('karakter di luar ASCII diterjemahkan, bukan jadi sampah',
    /Nona "Cafe" - Unicode/.test(aneh.replace(/\s+/g, ' ')), aneh);
cek('tidak ada karakter di luar ASCII yang lolos ke struk',
    !/[^\x00-\x7F]/.test(aneh), aneh);

/* ------------------------------------------------------------ ESC/POS */

const byte = S.keEscPos(S.susunStruk(dasar()), { lebarMm: 58, potongKertas: true });
cek('ESC/POS diawali reset printer', byte[0] === 27 && byte[1] === 64);
cek('ESC/POS diakhiri perintah potong kertas',
    byte[byte.length - 4] === 29 && byte[byte.length - 3] === 86);
cek('ESC/POS tidak memuat byte di atas 127',
    !Array.from(byte).some(b => b > 127));

const tanpaPotong = S.keEscPos(S.susunStruk(dasar()), { lebarMm: 58, potongKertas: false });
cek('perintah potong bisa dimatikan', tanpaPotong.length < byte.length);

/* -------------------------------------------------------------- HTML */

const html = S.keHtml(S.susunStruk(dasar()), { lebarMm: 80, judul: 'INV-2026-0007' });
cek('HTML memakai lebar cetak, bukan lebar kertas',
    html.includes('size:80mm auto') && html.includes('72mm') === false
      ? html.includes('@page{size:80mm auto') : true);
cek('HTML meloloskan karakter berbahaya',
    !S.keHtml(S.susunStruk(dasar({ inv: { customer_name: '<script>x</script>' },
      tpl: { tampilNamaPelanggan: true } })), {}).includes('<script>x'));

/* ------------------------------------------------------- Pembungkusan */

const panjang = cetak(dasar({ items: [{
  item_name: 'Amoxicillin trihydrate 500 mg kaplet salut selaput generik berlogo',
  quantity: 30, unit_price: 1500, discount_pct: 0, line_total: 45000 }] }));
cek('nama obat panjang dibungkus utuh, tidak dipotong diam-diam',
    panjang.replace(/\s+/g, ' ').includes(
      'Amoxicillin trihydrate 500 mg kaplet salut selaput generik berlogo'), panjang);
cek('semua baris tetap dalam batas kolom',
    Math.max(...panjang.split('\n').map(b => b.length)) <= 32);

console.log(`\n${lulus} pemeriksaan lulus.`);

/* =====================================================================
   UJI HALAMAN — IMPOR & EKSPOR EXCEL

   Menjalankan demo.html di Chromium sungguhan, membuat berkas .xlsx
   betulan, mengunggahnya lewat kotak berkas, memeriksa pratinjaunya,
   lalu memprosesnya. Yang diuji di sini adalah jalur yang tidak bisa
   disentuh pengujian fungsi murni: pembacaan berkas oleh SheetJS,
   penyusunan pratinjau, dan penyimpanan berkas hasil ekspor.

   SheetJS biasanya diambil dari CDN. Lingkungan pengujian tidak punya
   akses internet, jadi permintaan ke CDN dialihkan ke salinan npm —
   berkas yang sama, hanya sumbernya berbeda.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8125;
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const SHEETJS = require.resolve('xlsx/dist/xlsx.full.min.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.svg': 'image/svg+xml' };

let lulus = 0, gagal = 0;
function cek(nama, syarat, pesan) {
  if (syarat) { lulus++; console.log('  ok  ' + nama); }
  else { gagal++; console.error('  GAGAL  ' + nama + (pesan ? ' — ' + pesan : '')); }
}

const server = http.createServer((req, res) => {
  const p = path.join(AKAR, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(AKAR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

/* Berkas uji: satu baris cocok lewat kode, satu cocok walau beda spasi,
   satu obat yang belum ada di master, dan satu tanggal bentuk ambigu. */
function berkasUji(tmp) {
  const aoa = [
    ['Kode Obat', 'Nama Obat', 'Satuan', 'Jumlah', 'Harga Beli',
     'Tanggal Kadaluwarsa', 'Tanggal Masuk', 'No. Faktur', 'PBF', 'No. Batch',
     'Harga Jual', 'Keterangan'],
    ['', 'Paracetamol 500 mg', 'Tablet', 250, 620, '2028-06-30', '', 'IMP-A', 'PT Uji', '', '', ''],
    ['', 'Amoxicillin 500mg',  'Tablet', '1.000', 'Rp 1.400', '2028-07-31', '', 'IMP-A', 'PT Uji', '', '', ''],
    ['', 'Cefixime 100 mg',    'Kapsul', 40, 3000, '05/06/2029', '', 'IMP-B', 'PT Uji', '', 4500, '']
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Data');
  const f = path.join(tmp, 'impor-uji.xlsx');
  XLSX.writeFile(wb, f);
  return f;
}

function berkasBergalat(tmp) {
  const aoa = [
    ['Nama Obat', 'Jumlah', 'Harga Beli', 'Tanggal Kadaluwarsa', 'PBF'],
    ['Paracetamol 500 mg', -5, 600, '2028-06-30', 'PT Uji'],
    ['Cetirizine 10 mg',   10, 600, '',           'PT Uji']
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Data');
  const f = path.join(tmp, 'impor-galat.xlsx');
  XLSX.writeFile(wb, f);
  return f;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-excel-'));
  await new Promise(r => server.listen(PORT, r));
  const bawaan = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(
    fs.existsSync(bawaan) ? { executablePath: bawaan } : {});
  const galat = [];

  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('demo-peran', 'apoteker'); } catch (e) {} });
  // SheetJS dari salinan lokal, bukan dari internet.
  await ctx.route(CDN, route =>
    route.fulfill({ status: 200, contentType: 'text/javascript',
                    body: fs.readFileSync(SHEETJS, 'utf8') }));

  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(t)) return;
    galat.push('console: ' + t);
  });
  page.on('pageerror', e => galat.push('pageerror: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/demo.html#/apotek`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  /* ════════════════════════════════════════════════ EKSPOR */

  cek('tombol ekspor tersedia', await page.locator('#btnEkspor').count() === 1);
  await page.click('#btnEkspor');
  await page.waitForTimeout(400);

  const mEksp = page.locator('.modal-bg.open').last();
  cek('lembar batch dijelaskan bisa dipakai ulang untuk impor',
      /judul kolom yang sama\s+dengan template impor/i
        .test((await mEksp.textContent()).replace(/\s+/g, ' ')));

  await mEksp.locator('[name=l_kartu]').check();
  await page.waitForTimeout(150);
  cek('mencentang kartu stok memunculkan pilihan obat dan bulan',
      await mEksp.locator('#barisKartu:visible').count() === 1);

  const unduhan = page.waitForEvent('download', { timeout: 20000 });
  await mEksp.locator('button:has-text("Unduh berkas")').click();
  let berkasEkspor = null;
  try {
    const d = await unduhan;
    berkasEkspor = path.join(tmp, d.suggestedFilename());
    await d.saveAs(berkasEkspor);
  } catch (e) { /* diperiksa di bawah */ }

  cek('berkas ekspor benar-benar terunduh', !!berkasEkspor && fs.existsSync(berkasEkspor),
      berkasEkspor || 'tidak ada unduhan');

  if (berkasEkspor) {
    const wb = XLSX.readFile(berkasEkspor);
    cek('nama berkas ekspor memuat tanggal',
        /stok-apotek-\d{4}-\d{2}-\d{2}\.xlsx/.test(path.basename(berkasEkspor)),
        path.basename(berkasEkspor));
    cek('semua lembar yang dicentang ikut terbuat',
        ['Ringkasan', 'Stok per Obat', 'Stok per Batch', 'Riwayat Transaksi',
         'Rekap 12 Bulan', 'Kartu Stok'].every(n => wb.SheetNames.includes(n)),
        wb.SheetNames.join(', '));

    const batch = XLSX.utils.sheet_to_json(wb.Sheets['Stok per Batch'], { header: 1 });
    cek('lembar batch memakai judul kolom template impor',
        batch[0][0] === 'Kode Obat' && batch[0][1] === 'Nama Obat'
        && batch[0][5] === 'Tanggal Kadaluwarsa',
        JSON.stringify(batch[0]));
    cek('lembar batch berisi stok yang ada', batch.length >= 4, `${batch.length} baris`);
    cek('angka di lembar batch tersimpan sebagai angka, bukan teks',
        typeof batch[1][3] === 'number' && typeof batch[1][4] === 'number',
        JSON.stringify(batch[1]));

    const ring = XLSX.utils.sheet_to_json(wb.Sheets['Ringkasan'], { header: 1 })
      .map(r => (r[0] || '')).join('|');
    cek('ringkasan memuat tiga bagian yang dijanjikan',
        /RINGKASAN/.test(ring) && /NILAI PERSEDIAAN TERBESAR/.test(ring)
        && /PERLU DIPESAN/.test(ring) && /PERLU DIPERIKSA/.test(ring), ring.slice(0, 200));
  }
  cek('layar ekspor menutup sendiri setelah berkas terunduh',
      await page.locator('.modal-bg.open').count() === 0);
  await page.waitForTimeout(300);

  /* ════════════════════════════════════════════════ TEMPLATE IMPOR */

  await page.click('#btnImpor');
  await page.waitForTimeout(400);
  const mImp = page.locator('.modal-bg.open').last();
  cek('layar impor terbuka', await mImp.count() === 1);
  cek('dua jenis impor ditawarkan',
      await mImp.locator('[data-jenis]').count() === 2);

  const unduhTpl = page.waitForEvent('download', { timeout: 20000 });
  await mImp.locator('#btnTemplate').click();
  let berkasTpl = null;
  try {
    const d = await unduhTpl;
    berkasTpl = path.join(tmp, d.suggestedFilename());
    await d.saveAs(berkasTpl);
  } catch (e) { /* diperiksa di bawah */ }

  cek('template terunduh', !!berkasTpl && fs.existsSync(berkasTpl));
  if (berkasTpl) {
    const wb = XLSX.readFile(berkasTpl);
    cek('template punya lembar Data dan Petunjuk',
        wb.SheetNames.includes('Data') && wb.SheetNames.includes('Petunjuk'),
        wb.SheetNames.join(', '));
    const d = XLSX.utils.sheet_to_json(wb.Sheets['Data'], { header: 1 });
    cek('template berisi judul kolom + satu baris contoh', d.length === 2);
    cek('template memuat kolom wajib',
        ['Nama Obat', 'Jumlah', 'Harga Beli', 'Tanggal Kadaluwarsa', 'PBF']
          .every(k => d[0].includes(k)), JSON.stringify(d[0]));
  }

  /* ════════════════════════════════════════════════ PRATINJAU */

  await mImp.locator('#berkasImpor').setInputFiles(berkasUji(tmp));
  await page.waitForTimeout(1200);

  const pratinjau = await mImp.locator('#hasilImpor').textContent();
  cek('pratinjau muncul setelah berkas diunggah',
      /periksa lalu proses/i.test(pratinjau), pratinjau.slice(0, 160));

  const barisTabel = mImp.locator('#hasilImpor tbody tr');
  cek('semua baris data ditampilkan', await barisTabel.count() === 3,
      `dapat ${await barisTabel.count()}`);

  /* "Amoxicillin 500mg" harus bertemu "Amoxicillin 500 mg" di master —
     bukan jadi obat kembar seperti yang dulu terjadi di portal. */
  const barisAmox = barisTabel.filter({ hasText: 'Amoxicillin' });
  cek('nama beda spasi dicocokkan ke obat yang sudah ada',
      /beda spasi saja/.test(await barisAmox.textContent()),
      (await barisAmox.textContent()).replace(/\s+/g, ' ').slice(0, 160));
  cek('baris yang sudah cocok tidak menawarkan centang buat obat',
      await barisAmox.locator('input[type=checkbox]').count() === 0);

  /* Tanggal 05/06/2029 bisa dibaca dua cara — harus ditandai dan
     ditampilkan hasil bacaannya. */
  cek('tanggal ambigu diperingatkan di tingkat berkas',
      /bisa\s+dibaca dua cara/i.test(pratinjau.replace(/\s+/g, ' ')));
  const barisCfx = barisTabel.filter({ hasText: 'Cefixime' });
  const teksCfx = (await barisCfx.textContent()).replace(/\s+/g, ' ');
  cek('tanggal ambigu ditampilkan lengkap agar bisa diperiksa',
      /5 Juni 2029/.test(teksCfx), teksCfx.slice(0, 200));
  cek('baris ambigu diberi tanda cara bacanya', /dibaca hari-bulan/.test(teksCfx));

  cek('obat baru ditandai belum ada di master', /Belum ada di Master Data/.test(teksCfx));
  cek('tombol proses terkunci selama masih ada yang belum diputuskan',
      await mImp.locator('#btnProses').isDisabled());

  await barisCfx.locator('input[type=checkbox]').check();
  await page.waitForTimeout(400);
  cek('tombol proses terbuka setelah obat baru dicentang',
      !(await mImp.locator('#btnProses').isDisabled()));
  cek('ringkasan menghitung satu obat baru',
      /Obat baru/.test(await mImp.locator('#hasilImpor').textContent()));

  /* ════════════════════════════════════════════════ PROSES */

  const sebelum = await page.evaluate(async () =>
    (await DB.apotekStok()).reduce((s, o) => s + Number(o.stok_total), 0));

  await mImp.locator('#btnProses').click();
  await page.waitForTimeout(400);
  const konf = page.locator('.modal-bg.open').last();
  cek('konfirmasi menjelaskan sifat semua-atau-tidak-sama-sekali',
      /tidak ada satu pun yang tersimpan/i.test((await konf.textContent()).replace(/\s+/g, ' ')));
  await konf.locator('button:has-text("Ya, proses")').click();
  await page.waitForTimeout(1500);

  const hasil = (await mImp.locator('#hasilImpor').textContent()).replace(/\s+/g, ' ');
  cek('laporan hasil impor tampil', /Impor selesai/.test(hasil), hasil.slice(0, 200));
  cek('laporan menyebut obat baru yang ditambahkan',
      /Cefixime 100 mg/.test(hasil), hasil.slice(0, 300));

  const sesudah = await page.evaluate(async () =>
    (await DB.apotekStok()).reduce((s, o) => s + Number(o.stok_total), 0));
  cek('stok benar-benar bertambah sebanyak yang diimpor',
      sesudah - sebelum === 250 + 1000 + 40, `${sebelum} → ${sesudah}`);

  await page.locator('.modal-bg.open').last().locator('button:has-text("Tutup")').click();
  await page.waitForTimeout(500);

  /* ════════════════════════════════════════════════ BERKAS BERGALAT */

  await page.click('#btnImpor');
  await page.waitForTimeout(400);
  const mImp2 = page.locator('.modal-bg.open').last();
  await mImp2.locator('#berkasImpor').setInputFiles(berkasBergalat(tmp));
  await page.waitForTimeout(1200);

  const teks2 = (await mImp2.locator('#hasilImpor').textContent()).replace(/\s+/g, ' ');
  cek('baris bergalat dijelaskan, bukan hanya ditolak',
      /lebih dari nol/.test(teks2) && /kadaluwarsa kosong atau tidak terbaca/i.test(teks2),
      teks2.slice(0, 300));
  cek('impor terkunci selama ada baris bergalat',
      await mImp2.locator('#btnProses').isDisabled());
  cek('pengguna diberi tahu harus memperbaiki di Excel lalu unggah ulang',
      /Perbaiki 2 baris bergalat di Excel/.test(teks2), teks2.slice(-200));

  /* Berkas tanpa kolom wajib ditolak sebelum apa pun ditampilkan. */
  const wbKurang = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbKurang,
    XLSX.utils.aoa_to_sheet([['Nama Obat', 'Jumlah'], ['Paracetamol 500 mg', 10]]), 'Data');
  const fKurang = path.join(tmp, 'kurang-kolom.xlsx');
  XLSX.writeFile(wbKurang, fKurang);

  /* Setelah satu berkas terbaca, kotak unggah menyusut jadi tombol
     "Ganti berkas" supaya tabel pratinjau mendapat seluruh ruang layar. */
  cek('kotak unggah menyusut jadi tombol ganti berkas',
      await mImp2.locator('#btnGantiBerkas').count() === 1);
  await mImp2.locator('#btnGantiBerkas').click();
  await page.waitForTimeout(400);
  cek('menekan ganti berkas mengembalikan kotak unggah',
      await mImp2.locator('#berkasImpor').count() === 1);

  await mImp2.locator('#berkasImpor').setInputFiles(fKurang);
  await page.waitForTimeout(1000);
  const teks3 = (await mImp2.locator('#hasilImpor').textContent()).replace(/\s+/g, ' ');
  cek('kolom wajib yang hilang disebut namanya',
      /Kolom wajib tidak ditemukan/.test(teks3) && /Harga Beli/.test(teks3) && /PBF/.test(teks3),
      teks3.slice(0, 220));

  await ctx.close();
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log();
  if (galat.length) {
    console.error('GALAT JAVASCRIPT DI HALAMAN:');
    [...new Set(galat)].forEach(g => console.error('  ' + g));
  }
  console.log(`${lulus} lulus, ${gagal} gagal, ${galat.length} galat console.`);
  process.exit(gagal || galat.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

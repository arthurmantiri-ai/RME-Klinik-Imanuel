/* =====================================================================
   UJI HALAMAN LAPORAN (Tahap 3) — menjalankan demo.html di Chromium
   sungguhan.

   Yang diuji di sini, bukan di uji_laporan_core.js maupun uji_laporan.sql:
   1. GERBANG ADMIN. Lima tab baru (Overview & Tren, Rujukan, Register
      Poli, Keuangan, Puskesmas) harus TERTUTUP untuk peran selain admin
      — hanya Ringkasan yang boleh terlihat. App.boleh([]) yang menjaga
      ini ada di js/pages/laporan.js, dan hanya bisa dibuktikan lewat
      peramban sungguhan dengan peran yang benar-benar berbeda.
   2. Chart.js BENAR-BENAR TERPASANG ke kanvasnya (bukan cuma elemen
      <canvas> kosong yang tergambar rapi tanpa satu pun grafik).
      Chart.getChart(kanvas) memulangkan instance nyata kalau berhasil.
   3. Navigasi bulan (Overview) dan filter (Rujukan/Register/Puskesmas)
      benar-benar mengubah isi tabel/grafik, bukan cuma mengubah nilai
      elemen <input>/<select>-nya.
   4. Pemisahan "nilai layanan" vs "uang masuk" di tab Keuangan tetap
      dua angka berbeda, bukan diam-diam disatukan jadi satu.

   Chart.js dimuat lazy dari CDN oleh js/pages/laporan.js (persis seperti
   SheetJS di js/pages/apotek.js) — di sini permintaan itu dialihkan ke
   salinan npm `chart.js`, sama seperti xlsx di uji_impor_halaman.js.
   Jalankan `npm install playwright xlsx chart.js` dulu (lihat
   test/README.md) sebelum menjalankan berkas ini.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8134;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.svg': 'image/svg+xml', '.json': 'application/json' };

const CHART_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js';
/* Bukan require.resolve('chart.js/dist/...') — package.json chart.js
   punya peta "exports" yang menutup subpath dist/ dari resolusi modul
   (beda dengan xlsx). Jalur berkas dibangun langsung karena yang
   dibutuhkan cuma isi berkasnya, bukan modulnya. */
const CHART_LOKAL = path.join(AKAR, 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js');

let lulus = 0, gagal = 0;
function cek(nama, syarat, pesan) {
  if (syarat) { lulus++; console.log('  ok  ' + nama); }
  else { gagal++; console.error('  GAGAL  ' + nama + (pesan ? ' — ' + pesan : '')); }
}

const server = http.createServer((req, res) => {
  const p = path.join(AKAR, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(AKAR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end('tidak ditemukan'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const bawaan = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(
    fs.existsSync(bawaan) ? { executablePath: bawaan } : { executablePath: '/opt/pw-browsers/chromium' });
  const galat = [];

  async function halamanBaru(peran) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(p => {
      try { localStorage.setItem('demo-peran', p); } catch (e) { /* abaikan */ }
    }, peran);
    await ctx.route(CHART_CDN, route =>
      route.fulfill({ status: 200, contentType: 'text/javascript',
                      body: fs.readFileSync(CHART_LOKAL, 'utf8') }));
    const page = await ctx.newPage();
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(t)) return;
      galat.push(`[${peran}] console: ${t}`);
    });
    page.on('pageerror', e => galat.push(`[${peran}] pageerror: ${e.message}`));
    return { ctx, page };
  }

  const alamat = `http://127.0.0.1:${PORT}/demo.html`;

  /* ================================================================
     A. GERBANG LAPORAN LANJUTAN (9 Sep 2026 — dulu 'GERBANG ADMIN') —
        dokter dan admin (staf loket, dulu 'pendaftaran') hanya boleh
        lihat Ringkasan; master melihat keenam tab.
     ================================================================ */
  for (const peran of ['dokter', 'admin', 'perawat', 'apoteker']) {
    const { ctx, page } = await halamanBaru(peran);
    await page.goto(alamat + '#/laporan', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const tab = await page.locator('#tabs .tab').allTextContents();
    cek(`peran ${peran} hanya melihat tab Ringkasan`, tab.length === 1 && tab[0] === 'Ringkasan',
        'dapat: ' + JSON.stringify(tab));
    // Mencoba masuk langsung lewat URL juga harus jatuh kembali ke Ringkasan.
    await page.goto(alamat + '#/laporan/keuangan', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    cek(`peran ${peran} tidak bisa membuka tab Keuangan lewat URL langsung`,
        (await page.locator('#tabs .tab.on').textContent()) === 'Ringkasan');
    await ctx.close();
  }

  const { ctx, page } = await halamanBaru('master');
  await page.goto(alamat + '#/laporan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tabAdmin = await page.locator('#tabs .tab').allTextContents();
  cek('master melihat keenam tab', tabAdmin.length === 6, 'dapat: ' + JSON.stringify(tabAdmin));

  /* ================================================================
     B. OVERVIEW & TREN
     ================================================================ */
  await page.click('#tabs [data-t="overview"]');
  await page.waitForTimeout(1200);

  const ov = page.locator('#isiTab');
  cek('snapshot hari ini tergambar dengan angka (bukan NaN)',
      !/NaN/.test(await ov.textContent()));
  cek('Perbandingan Antar Bulan tergambar', /Perbandingan Antar Bulan/.test(await ov.textContent()));
  cek('Kalender Kunjungan tergambar', /Kalender Kunjungan/.test(await ov.textContent()));
  cek('Pola Jam Kunjungan tergambar', /Pola Jam Kunjungan/.test(await ov.textContent()));
  cek('Kinerja Dokter tergambar', /Kinerja Dokter/.test(await ov.textContent()));
  cek('Sepuluh Besar Penyakit ikut tergambar di Overview', /Sepuluh Besar Penyakit/.test(await ov.textContent()));

  const jumlahGrafik = await page.evaluate(() =>
    [...document.querySelectorAll('#isiTab canvas')].filter(c => window.Chart.getChart(c)).length);
  cek('ketujuh kanvas Chart.js benar-benar terpasang grafiknya (bukan kanvas kosong)',
      jumlahGrafik === 7, 'dapat ' + jumlahGrafik);

  // Navigasi bulan pada Kinerja Dokter harus benar-benar mengubah isinya.
  const dokterSebelum = await page.locator('#ovDokter').textContent();
  await page.click('#ovDokter #dokPrev');
  await page.waitForTimeout(400);
  const dokterSesudah = await page.locator('#ovDokter').textContent();
  cek('tombol ‹ pada Kinerja Dokter mengganti bulan yang ditampilkan',
      dokterSebelum !== dokterSesudah);

  // Tukar bulan pembanding harus menukar nilai kartu, bukan cuma labelnya.
  const bandingSebelum = await page.locator('#ovBanding').textContent();
  await page.click('#ovBanding #ovSwap');
  await page.waitForTimeout(400);
  const bandingSesudah = await page.locator('#ovBanding').textContent();
  cek('tombol tukar (⇄) pada Perbandingan Antar Bulan benar-benar mengganti isi kartu',
      bandingSebelum !== bandingSesudah);

  // Toggle metrik heatmap.
  await page.click('#ovHeatmap [data-m="gigi"]');
  await page.waitForTimeout(300);
  cek('tombol metrik "Gigi" pada Kalender Kunjungan menjadi aktif',
      await page.locator('#ovHeatmap [data-m="gigi"]').evaluate(el => el.classList.contains('btn-primary')));

  /* ================================================================
     C. RUJUKAN
     ================================================================ */
  await page.click('#tabs [data-t="rujukan"]');
  await page.waitForTimeout(500);
  // Rentang sebulan mungkin tidak berisi rujukan (peluangnya kecil per
  // hari) — perlebar ke enam bulan supaya pengujian ini tidak bergantung
  // pada keberuntungan tanggal saat dijalankan.
  await page.fill('#rjDari', '2000-01-01');
  await page.click('#rjTampil');
  await page.waitForTimeout(500);
  const jumlahSemua = await page.locator('#rjIsi tbody tr').count();
  cek('tabel rujukan berisi baris ketika periode diperlebar', jumlahSemua > 0, 'dapat ' + jumlahSemua);

  await page.selectOption('#rjJenis', 'RUJUK_IGD');
  await page.waitForTimeout(300);
  const badgeJenis = await page.locator('#rjIsi tbody .badge').allTextContents();
  cek('filter jenis rujukan "Rujukan IGD" hanya menampilkan baris IGD',
      badgeJenis.length > 0 && badgeJenis.every(t => t.trim() === 'Rujukan IGD'),
      JSON.stringify(badgeJenis));

  /* ================================================================
     D. REGISTER POLI — kolom Tindakan hanya muncul untuk Poli Gigi.
     ================================================================ */
  await page.click('#tabs [data-t="register"]');
  await page.waitForTimeout(500);
  await page.fill('#rgDari', '2000-01-01');
  await page.click('#rgTampil');
  await page.waitForTimeout(500);
  cek('kolom Tindakan TIDAK ada saat filter "Semua poli"',
      await page.locator('#rgIsi th:has-text("Tindakan")').count() === 0);

  await page.selectOption('#rgPoli', 'GIGI');
  await page.waitForTimeout(500);
  cek('kolom Tindakan MUNCUL saat filter Poli Gigi',
      await page.locator('#rgIsi th:has-text("Tindakan")').count() === 1);
  const barisGigi = await page.locator('#rgIsi tbody tr').count();
  cek('register Poli Gigi berisi baris', barisGigi > 0, 'dapat ' + barisGigi);

  /* ================================================================
     E. KEUANGAN — nilai layanan dan uang masuk tetap dua angka berbeda.
     ================================================================ */
  await page.click('#tabs [data-t="keuangan"]');
  await page.waitForTimeout(500);
  await page.fill('#kuDari', '2000-01-01');
  await page.click('#kuTampil');
  await page.waitForTimeout(500);
  const teksKeuangan = await page.locator('#kuIsi').textContent();
  cek('penjelasan beda nilai layanan vs uang masuk tergambar',
      /tidak pernah masuk kas/.test(teksKeuangan));
  const nilaiLayanan = await page.locator('#kuIsi .stat').nth(0).locator('.val').textContent();
  const uangMasuk = await page.locator('#kuIsi .stat').nth(3).locator('.val').textContent();
  cek('Nilai Layanan dan Uang Masuk BUKAN angka yang sama (BPJS tidak ikut masuk kas)',
      nilaiLayanan.trim() !== uangMasuk.trim(), `${nilaiLayanan} vs ${uangMasuk}`);
  cek('tabel per hari berisi baris', await page.locator('#kuIsi table').first()
      .locator('tbody tr').count() > 0);

  /* ================================================================
     F. PUSKESMAS — 12 kategori usia SP2TP/LB1 dan pencarian.
     ================================================================ */
  await page.click('#tabs [data-t="puskesmas"]');
  await page.waitForTimeout(500);
  await page.fill('#pkDari', '2000-01-01');
  await page.click('#pkTampil');
  await page.waitForTimeout(500);
  const kolomUsia = await page.locator('#pkIsi thead th').allTextContents();
  cek('kedua belas kategori usia SP2TP/LB1 ada sebagai kolom',
      ['0-7 hari', '8-28 hari', '29 hari - 11 bulan', '1-4 tahun', '5-9 tahun',
       '10-14 tahun', '15-19 tahun', '20-44 tahun', '45-54 tahun',
       '55-59 tahun', '60-69 tahun', '≥70 tahun'].every(k => kolomUsia.includes(k)),
      JSON.stringify(kolomUsia));

  const barisSebelum = await page.locator('#pkIsi tbody tr').count();
  await page.fill('#pkCari', 'zzz-tidak-ada-diagnosa-seperti-ini');
  await page.waitForTimeout(400);
  cek('pencarian diagnosa yang tidak ada menampilkan "tidak ada diagnosa"',
      /Tidak ada diagnosa/.test(await page.locator('#pkIsi').textContent()));
  await page.fill('#pkCari', '');
  await page.waitForTimeout(400);
  cek('mengosongkan pencarian mengembalikan seluruh baris',
      await page.locator('#pkIsi tbody tr').count() === barisSebelum);

  await ctx.close();
  await browser.close();
  server.close();

  console.log();
  if (galat.length) {
    console.error('GALAT JAVASCRIPT DI HALAMAN:');
    [...new Set(galat)].forEach(g => console.error('  ' + g));
  }
  console.log(`${lulus} lulus, ${gagal} gagal, ${galat.length} galat console.`);
  process.exit(gagal || galat.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

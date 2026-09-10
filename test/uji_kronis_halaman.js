/* =====================================================================
   UJI HALAMAN MIGRASI PORTAL — menjalankan demo.html di Chromium
   sungguhan.

   Tiga hal di halaman ini tidak bisa diuji dari database, dan
   ketiga-tiganya adalah tempat pencocokan bisa menjadi salah tanpa
   satu pun galat muncul:

   1. HALAMAN INI HANYA UNTUK ADMIN.
      RLS memang sudah menutup tabelnya (uji_kronis.sql nomor 19). Yang
      diuji DI SINI adalah bahwa halamannya sendiri menolak dibuka —
      supaya petugas non-admin tidak melihat daftar nama pasien lengkap
      dengan nomor BPJS-nya lebih dulu, lalu menemukan tombolnya tidak
      bekerja.

   2. USULAN PASANGAN TIDAK BOLEH TERLIHAT MEYAKINKAN KETIKA IA TEBAKAN.
      Kemiripan nama 70% dan nomor BPJS yang sama persis harus TERBACA
      BERBEDA di layar. Ini satu-satunya penjaga yang tersisa ketika
      petugas mengerjakan baris keseratus dan mulai menekan tombol
      tanpa membaca.

   3. TEMPELAN YANG SALAH HARUS BISA DILEPAS.
      Halaman yang bisa menempel tapi tidak bisa membatalkan membuat
      petugas berhenti di baris pertama yang meragukan — dan migrasinya
      tidak pernah selesai.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8131;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.svg': 'image/svg+xml', '.json': 'application/json' };

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
    fs.existsSync(bawaan) ? { executablePath: bawaan } : {});
  const galat = [];

  async function halamanBaru(peran) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(p => {
      try { localStorage.setItem('demo-peran', p); } catch (e) {}
    }, peran);
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
     A. BUKAN MASTER — halaman menolak, menu tidak menawarkan
     ================================================================ */
  for (const peran of ['dokter', 'admin', 'apoteker']) {
    const { ctx, page } = await halamanBaru(peran);
    await page.goto(alamat + '#/migrasi', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const isi = await page.locator('#view').textContent();
    cek(`${peran}: halaman migrasi ditolak`, /Akses ditolak/.test(isi), isi.slice(0, 120));
    /* Yang paling penting: tidak ada satu pun nama pasien portal yang
       terlanjur tergambar sebelum penolakannya muncul. */
    cek(`${peran}: tidak ada nama pasien portal yang bocor`,
        !/Budi Santoso|Rina Wijaya/.test(isi));
    cek(`${peran}: menu tidak menawarkan Migrasi Portal`,
        !(await page.locator('.nav a[href="#/migrasi"]').count()));

    await ctx.close();
  }

  /* ================================================================
     B. MASTER (9 Sep 2026 — dulu bernama 'admin') — alur pencocokan
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('master');
    await page.goto(alamat + '#/migrasi', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    cek('menu menawarkan Migrasi Portal untuk master',
        await page.locator('.nav a[href="#/migrasi"]').count() === 1);

    const ringkas = await page.locator('#ringkasMigrasi').textContent();
    cek('ringkasan menyebut jumlah orang di titipan', /Orang di titipan/.test(ringkas));
    /* Angka yang paling menentukan beban kerja: yang tanpa BPJS. */
    cek('peringatan orang tanpa nomor BPJS muncul',
        /tidak punya nomor BPJS/.test(ringkas), ringkas.slice(0, 200));
    cek('ringkasan menyebut jumlah baris riwayat',
        /pengambilan obat/.test(ringkas) && /pemeriksaan lab/.test(ringkas));

    /* --------- Tab 1: unggah --------- */
    cek('tab unggah terbuka lebih dulu',
        (await page.locator('#isiTab').textContent()).includes('Unggah berkas ekspor portal'));
    cek('tombol kirim mati selama belum ada berkas',
        await page.locator('#btnKirim').isDisabled());

    /* --------- Tab 2: cocokkan --------- */
    await page.locator('#tabs [data-t="cocok"]').click();
    await page.waitForTimeout(800);

    const baris = await page.locator('#daftarTitipan tbody tr').count();
    cek('daftar titipan menunggu tergambar', baris >= 2, 'dapat ' + baris);

    /* Baris pertama langsung terbuka: tujuan halaman ini menyelesaikan
       antrean, bukan menatap daftar. */
    const kartu = await page.locator('#kartuCocok').textContent();
    cek('kartu pencocokan langsung terbuka', /Pasien mana orang ini/.test(kartu),
        kartu.slice(0, 160));
    cek('diagnosis portal terpetakan jadi lencana kode',
        /HPT/.test(kartu) && /DM/.test(kartu), kartu.slice(0, 300));
    cek('resep rutin portal ikut terlihat', /Amlodipine/.test(kartu));

    /* --- Inti nomor 2: tebakan tidak boleh terlihat seperti kepastian --- */
    const lencana = await page.locator('#daftarUsulan .badge').allTextContents();
    cek('usulan teratas ditandai "Nomor BPJS sama"',
        lencana[0] === 'Nomor BPJS sama', JSON.stringify(lencana));
    const hijau = await page.locator('#daftarUsulan .badge.b-ok').count();
    cek('hanya satu usulan yang berwarna hijau', hijau === 1, 'dapat ' + hijau);
    const kuning = await page.locator('#daftarUsulan .badge.b-warn').count();
    cek('usulan berdasar kemiripan nama diberi warna peringatan', kuning >= 1);
    cek('spanduk "boleh ditempel otomatis" muncul untuk BPJS tunggal',
        /bisa ditempel lewat tombol/.test(kartu), kartu.slice(-300));

    /* --- Baris tanpa nomor BPJS: tidak boleh ada satu pun yang hijau ---
       Di sinilah pencocokan paling mudah salah, dan satu-satunya penjaga
       yang tersisa adalah warna lencananya. */
    const barisRina = page.locator('#daftarTitipan tr', { hasText: 'Rina Wijaya' });
    if (await barisRina.count()) {
      await barisRina.first().click();
      await page.waitForTimeout(800);
      cek('baris tanpa BPJS: tidak ada usulan berwarna hijau',
          await page.locator('#daftarUsulan .badge.b-ok').count() === 0);
      cek('baris tanpa BPJS: tidak ditawari tempel otomatis',
          !/bisa ditempel lewat tombol/.test(await page.locator('#kartuCocok').textContent()));
      cek('tanpa pasien mirip, petugas diarahkan mendaftarkan dulu',
          /Daftarkan orang ini lebih dulu/.test(await page.locator('#kartuCocok').textContent()) ||
          await page.locator('#daftarUsulan .card').count() > 0);
      /* Kembali ke Budi untuk langkah berikutnya. */
      await page.locator('#daftarTitipan tr', { hasText: 'Budi Santoso' }).first().click();
      await page.waitForTimeout(800);
    }

    /* --------- Menempel --------- */
    await page.locator('#daftarUsulan [data-pilih]').first().click();
    await page.waitForTimeout(400);
    cek('penempelan minta konfirmasi lebih dulu',
        await page.locator('.modal-bg').count() === 1);
    const tanya = await page.locator('.modal-body').textContent();
    cek('konfirmasi menyebut kedua nama', /Budi Santoso/.test(tanya), tanya.slice(0, 200));
    cek('konfirmasi menyebut bahwa ini bisa dibatalkan', /dibatalkan/.test(tanya));

    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(900);

    const setelah = await page.locator('#ringkasMigrasi').textContent();
    cek('ringkasan ikut diperbarui setelah menempel',
        /Sudah tertempel/.test(setelah));

    /* --------- Inti nomor 3: melepas kembali --------- */
    await page.locator('#fStatus').selectOption('COCOK');
    await page.waitForTimeout(800);
    const kartuCocok = await page.locator('#kartuCocok').textContent();
    cek('kartu yang sudah tertempel menyebut pasien tujuannya',
        /sudah menempel ke/.test(kartuCocok), kartuCocok.slice(0, 200));
    cek('tombol batalkan tersedia',
        await page.locator('#btnBatalCocok').count() === 1);

    await page.locator('#btnBatalCocok').click();
    await page.waitForTimeout(400);
    await page.locator('.modal-foot .btn-danger').click();
    await page.waitForTimeout(900);

    await page.locator('#fStatus').selectOption('MENUNGGU');
    await page.waitForTimeout(800);
    const kembali = await page.locator('#daftarTitipan').textContent();
    cek('baris yang dibatalkan kembali ke daftar menunggu',
        /Budi Santoso/.test(kembali), kembali.slice(0, 200));

    /* --------- Mengabaikan --------- */
    await page.locator('#btnAbaikan').click();
    await page.waitForTimeout(400);
    cek('alasan diabaikan bisa diketik, bukan langsung dihapus',
        await page.locator('#abAlasan').count() === 1);
    await page.locator('.modal-foot .btn-danger').click();
    await page.waitForTimeout(900);

    await page.locator('#fStatus').selectOption('ABAIKAN');
    await page.waitForTimeout(800);
    cek('baris pindah ke daftar diabaikan',
        /Budi Santoso/.test(await page.locator('#daftarTitipan').textContent()));

    await ctx.close();
  }

  /* ================================================================
     C. TEMPEL OTOMATIS — hanya yang BPJS-nya cocok persis
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('master');
    await page.goto(alamat + '#/migrasi', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('#tabs [data-t="cocok"]').click();
    await page.waitForTimeout(800);

    await page.locator('#btnOtomatis').click();
    await page.waitForTimeout(400);
    const tanya = await page.locator('.modal-body').textContent();
    cek('konfirmasi otomatis menjelaskan batasnya',
        /cocok PERSIS/.test(tanya) && /dua pasien/.test(tanya), tanya.slice(0, 260));

    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(1200);

    const hasil = await page.locator('.modal-body').textContent();
    cek('hasil menyebut berapa yang tertempel', /tertempel otomatis/.test(hasil),
        hasil.slice(0, 200));
    /* Rina Wijaya tidak punya nomor BPJS: ia HARUS tersisa. Kalau
       tertempel juga, artinya kemiripan nama ikut dipakai menebak. */
    cek('yang tanpa BPJS tetap tersisa', /tetap menunggu/.test(hasil));

    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(900);

    await page.locator('#fStatus').selectOption('MENUNGGU');
    await page.waitForTimeout(800);
    const menunggu = await page.locator('#daftarTitipan').textContent();
    cek('Rina Wijaya (tanpa BPJS) masih menunggu manusia',
        /Rina Wijaya/.test(menunggu), menunggu.slice(0, 200));

    await ctx.close();
  }

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

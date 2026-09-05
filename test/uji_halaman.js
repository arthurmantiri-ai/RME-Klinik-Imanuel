/* =====================================================================
   UJI HALAMAN — menjalankan demo.html di Chromium sungguhan dan
   menelusuri alur apotek & kasir.

   Yang dicari di sini bukan tampilan, melainkan galat JavaScript: nama
   fungsi yang salah ketik, elemen yang tidak ada, dan urutan pemuatan
   berkas yang keliru. Semuanya lolos dari `node --check` tetapi membuat
   halaman kosong di layar apoteker.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali. Halaman yang "kelihatan
   jalan" tapi memuntahkan galat di console adalah halaman yang akan
   rusak pada data yang sedikit berbeda.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8123;
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
  /* Chromium sudah tersedia di lingkungan ini; versinya belum tentu sama
     dengan yang dicari Playwright, jadi jalurnya disebut langsung. */
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
      /* Google Fonts tidak bisa dijangkau dari lingkungan pengujian.
         Itu kegagalan jaringan, bukan cacat halaman — aplikasi memang
         dirancang tetap terbaca dengan huruf bawaan sistem. */
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
     APOTEKER
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('apoteker');
    await page.goto(alamat + '#/apotek', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    cek('menu Apotek tampil untuk apoteker',
        await page.locator('a[href="#/apotek"]').count() > 0);
    cek('judul halaman apotek termuat',
        (await page.locator('h1').first().textContent()).includes('Apotek'));
    cek('kartu ringkasan nilai aset terisi',
        /Rp/.test(await page.locator('#ringkasan .stat').first().textContent()));

    // --- Tab stok: pengelompokan & urutan FEFO
    await page.click('#tabApotek [data-t="stok"]');
    await page.waitForTimeout(250);
    const barisGrup = await page.locator('#isiStok .grup-row').count();
    cek('stok dikelompokkan per obat', barisGrup >= 4, `dapat ${barisGrup} grup`);

    /* Paracetamol punya tiga batch: bt-1 (reguler, expired lama), bt-2
       (reguler, masuk belakangan tapi hampir kadaluwarsa), dan bt-6
       (kolam kronis, expired menengah). Dengan FIFO bt-2 akan mengendap
       sampai kadaluwarsa; dengan FEFO ia yang keluar duluan. Itulah yang
       diperiksa di bawah. bt-6 sengaja ditambahkan supaya tab Stok punya
       pecahan reguler/kronis yang nyata untuk satu obat yang sama. */
    const grupPct = page.locator('#isiStok .grup-row').filter({ hasText: 'Paracetamol' });
    await grupPct.click();
    await page.waitForTimeout(200);
    const idPct = await grupPct.getAttribute('data-grup');
    const batchPct = page.locator(`#isiStok .batch-row[data-induk="${idPct}"]:visible`);
    cek('klik grup membuka rincian batch', await batchPct.count() === 3,
        `dapat ${await batchPct.count()}`);

    const barisPertama = await batchPct.first().textContent();
    cek('batch paling dekat kadaluwarsa ditandai keluar duluan',
        /keluar duluan/i.test(barisPertama), barisPertama.replace(/\s+/g, ' ').slice(0, 120));
    cek('batch pertama FEFO adalah yang expired-nya terdekat, bukan yang masuk terdulu',
        /PT Enseval/.test(barisPertama),
        'harusnya batch PT Enseval (masuk belakangan, expired lebih dekat)');

    // --- Tab riwayat
    await page.click('#tabApotek [data-t="riwayat"]');
    await page.waitForTimeout(250);
    cek('riwayat transaksi terisi',
        await page.locator('#isiRiwayat tbody tr').count() >= 3);

    // --- Tab kartu stok
    await page.click('#tabApotek [data-t="kartu"]');
    await page.waitForTimeout(300);
    cek('kartu stok menampilkan empat kotak ringkasan',
        await page.locator('#kartuRingkas .stat').count() === 4);

    // --- Tab laporan
    await page.click('#tabApotek [data-t="laporan"]');
    await page.waitForTimeout(300);
    cek('laporan bulanan termuat',
        (await page.locator('#isiApotek').textContent()).includes('Pembelian obat'));

    // --- Penyerahan resep: alur inti apotek
    await page.click('#tabApotek [data-t="antrean"]');
    await page.waitForTimeout(300);
    cek('antrean resep berisi resep dokter',
        await page.locator('#antreanBelum tbody tr').count() >= 1);

    await page.click('#antreanBelum button:has-text("Serahkan")');
    await page.waitForTimeout(400);
    const modal = page.locator('.modal-bg.open').last();
    cek('layar penyerahan resep terbuka', await modal.count() === 1);
    cek('resep menampilkan kolom stok layak',
        (await modal.textContent()).includes('Stok layak'));

    const isian = modal.locator('input[data-item]');
    cek('jumlah diserahkan bisa diisi per butir', await isian.count() >= 3);

    /* Yang tercatat keluar adalah yang DISERAHKAN, bukan yang diresepkan.
       Resep meminta 10 Paracetamol; apoteker hanya menyerahkan 4. */
    await isian.nth(0).fill('4');
    await modal.locator('button:has-text("Serahkan & potong stok")').click();
    await page.waitForTimeout(500);
    const konfirm = page.locator('.modal-bg.open').last();
    if (await konfirm.count() && /sebagian/i.test(await konfirm.textContent())) {
      await konfirm.locator('button:has-text("Ya, serahkan")').click();
      await page.waitForTimeout(600);
    }

    await page.click('#tabApotek [data-t="riwayat"]');
    await page.waitForTimeout(400);
    const riwayat = await page.locator('#isiRiwayat').textContent();
    cek('penyerahan tercatat sebagai obat keluar kategori resep',
        riwayat.includes('Resep Pasien'));

    await ctx.close();
  }

  /* ================================================================
     KASIR
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('kasir');
    await page.goto(alamat + '#/kasir', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    cek('halaman kasir termuat',
        (await page.locator('h1').first().textContent()).includes('Kasir'));
    cek('daftar kunjungan menunggu ditagih terisi',
        await page.locator('[data-susun]').count() >= 1);

    /* Pasien UMUM — yang benar-benar membayar di meja kasir.
       Penyaringnya regex, bukan string: hasText dengan string mencocokkan
       tanpa memandang besar-kecil huruf, sehingga "Poli Umum" ikut
       terjaring dan yang terpilih justru pasien BPJS. */
    const barisUmum = page.locator('#isiKasir tbody tr').filter({ hasText: /\bUMUM\b/ });
    cek('ada kunjungan umum di daftar menunggu', await barisUmum.count() >= 1);
    await barisUmum.first().locator('[data-susun]').click();
    await page.waitForTimeout(800);

    const modal = page.locator('.modal-bg.open').last();
    cek('layar tagihan terbuka setelah disusun', await modal.count() === 1);
    const isiTagihan = await modal.textContent();
    cek('tagihan memuat baris tindakan',
        /Tindakan/.test(isiTagihan), isiTagihan.replace(/\s+/g, ' ').slice(0, 160));
    cek('tagihan memisahkan nilai layanan dan yang ditagihkan',
        isiTagihan.includes('Nilai seluruh layanan')
        && isiTagihan.includes('Ditagihkan ke pasien'));
    cek('tarif tindakan tersalin dari master tarif',
        /Rp\s?50\.000/.test(isiTagihan), 'konsultasi 89.01 seharusnya Rp 50.000');
    cek('pasien umum ditawari tombol terima pembayaran',
        await modal.locator('button:has-text("Terima pembayaran")').count() === 1);

    // --- Pembayaran tunai dengan kembalian
    await modal.locator('button:has-text("Terima pembayaran")').click();
    await page.waitForTimeout(500);
    const mBayar = page.locator('.modal-bg.open').last();
    cek('layar pembayaran terbuka',
        (await mBayar.textContent()).includes('Sisa tagihan'));

    await mBayar.locator('[name=uang_diterima]').fill('100000');
    await page.waitForTimeout(200);
    const teksKembalian = await mBayar.locator('#kembalian').textContent();
    cek('kembalian dihitung dari uang yang diterima',
        /Kembalian/.test(teksKembalian) && /50\.000/.test(teksKembalian),
        `dapat "${teksKembalian}"`);

    await mBayar.locator('button:has-text("Simpan pembayaran")').click();
    await page.waitForTimeout(1200);

    /* Setelah lunas, kotak cetak dibuka sendiri — kasir tidak perlu
       mencari lagi tagihan yang baru saja dibayarnya. */
    const mCetak = page.locator('.modal-bg.open').last();
    const isiCetak = await mCetak.textContent();
    cek('kotak cetak terbuka otomatis setelah lunas',
        /Cetak INV-/.test(isiCetak), isiCetak.replace(/\s+/g, ' ').slice(0, 120));
    const struk = await mCetak.locator('#pratinjauStruk').textContent();
    cek('pratinjau struk memuat stempel lunas', /LUNAS/.test(struk));
    cek('pratinjau struk mencantumkan kembalian',
        /Kembali/.test(struk), struk.slice(-320));

    await ctx.close();
  }

  /* ================================================================
     KASIR — kunjungan BPJS tidak ditagihkan
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('kasir');
    await page.goto(alamat + '#/kasir', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    /* Cari baris kunjungan berpenjamin BPJS di daftar menunggu. */
    const baris = page.locator('#isiKasir tbody tr').filter({ hasText: 'BPJS' });
    const ada = await baris.count();
    if (ada) {
      await baris.first().locator('[data-susun]').click();
      await page.waitForTimeout(700);
      let k = page.locator('.modal-bg.open').last();
      if (await k.count() && /Resep belum diserahkan/i.test(await k.textContent())) {
        await k.locator('button:has-text("Susun sekarang")').click();
        await page.waitForTimeout(700);
      }
      const teks = await page.locator('.modal-bg.open').last().textContent();
      cek('tagihan BPJS menjelaskan bahwa pasien tidak ditagih',
          /tidak ditagihkan ke pasien/i.test(teks));
      cek('tagihan BPJS tidak menawarkan tombol terima pembayaran',
          !(await page.locator('.modal-bg.open').last().locator('button:has-text("Terima pembayaran")').count()));
    } else {
      cek('ada kunjungan BPJS untuk diuji', false, 'tidak ditemukan di data demo');
    }
    await ctx.close();
  }

  /* ================================================================
     ADMIN — tarif & tampilan invoice
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('admin');
    await page.goto(alamat + '#/tarif', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    cek('halaman tarif termuat',
        await page.locator('#tabTarif').count() === 1);
    cek('daftar tarif terisi',
        await page.locator('#isiTarif tbody tr').count() >= 3);

    await page.click('#tabTarif [data-t="invoice"]');
    await page.waitForTimeout(900);
    const pra = await page.locator('#pratinjau').textContent();
    cek('pratinjau struk dirender mesin sungguhan',
        pra.includes('Klinik') && pra.includes('TOTAL'), pra.slice(0, 80));
    cek('pratinjau struk memuat nomor rekam medis', /No RM/.test(pra));

    /* Struk BPJS: total nol, tapi TIDAK boleh berstempel BELUM LUNAS. */
    await page.click('[data-contoh="bpjs"]');
    await page.waitForTimeout(400);
    const praBpjs = await page.locator('#pratinjau').textContent();
    cek('struk BPJS tidak berstempel belum lunas',
        !/BELUM LUNAS/i.test(praBpjs), praBpjs.slice(0, 200));
    cek('struk BPJS memakai judul bukti pelayanan',
        /BUKTI PELAYANAN/i.test(praBpjs));

    await page.click('[data-lebar="80"]');
    await page.waitForTimeout(300);
    const pra80 = await page.locator('#pratinjau').textContent();
    const lebarBaris = Math.max(...pra80.split('\n').map(b => b.length));
    cek('lebar 80 mm memakai 48 kolom', lebarBaris === 48, `dapat ${lebarBaris}`);

    await ctx.close();
  }

  /* ================================================================
     PERAWAT — hak akses
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('perawat');
    await page.goto(alamat + '#/apotek', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    cek('perawat boleh melihat stok tapi tidak mencatat obat masuk',
        await page.locator('#btnMasuk').count() === 0);
    cek('menu Kasir tidak muncul untuk perawat',
        await page.locator('a[href="#/kasir"]').count() === 0);
    cek('menu Tarif tidak muncul untuk perawat',
        await page.locator('a[href="#/tarif"]').count() === 0);
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

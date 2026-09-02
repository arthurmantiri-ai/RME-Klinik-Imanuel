/* =====================================================================
   UJI HALAMAN — LAB & PENUNJANG

   Menjalankan demo.html di Chromium sungguhan dan menelusuri alur
   laboratorium: dokter meminta pemeriksaan, petugas mengisi hasilnya,
   lembar ditutup, dan bacaan rontgen ditulis lalu muncul di odontogram.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8125;
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
     PERAWAT — mengisi hasil laboratorium
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('perawat');
    await page.goto(alamat + '#/lab', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    cek('menu Lab & Penunjang tampil',
        await page.locator('a[href="#/lab"]').count() > 0);
    cek('antrean lab termuat',
        await page.locator('#tabelAntrean tbody tr').count() >= 1,
        'tidak ada baris antrean');

    /* Lembar yang sudah selesai memuat Hb rendah dan leukosit tinggi.
       Keduanya harus terbaca sebagai temuan di luar rujukan, bukan
       sekadar angka. */
    await page.selectOption('#fStatus', '');
    await page.click('#btnMuat');
    await page.waitForTimeout(400);
    const isiAntrean = await page.locator('#tabelAntrean').textContent();
    cek('lembar dengan nilai di luar rujukan ditandai di antrean',
        /di luar rujukan/.test(isiAntrean), isiAntrean.replace(/\s+/g, ' ').slice(0, 160));

    /* Buka lembar yang masih berjalan lalu isi satu nilai. */
    await page.selectOption('#fStatus', 'AKTIF');
    await page.click('#btnMuat');
    await page.waitForTimeout(400);
    await page.locator('#tabelAntrean tbody tr').first().click();
    await page.waitForTimeout(700);

    cek('layar pengisian hasil terbuka',
        (await page.locator('.patient-bar').textContent()).includes('No. lembar'));
    cek('keterangan klinis dari dokter ikut ditampilkan',
        (await page.locator('#view').textContent()).includes('Keterangan dari dokter'));
    cek('tombol Selesaikan mati selama masih ada isian kosong',
        await page.locator('#btnSelesai').isDisabled());

    const kotak = page.locator('[data-hasil]');
    const jml = await kotak.count();
    cek('semua pemeriksaan pada lembar punya kotak isian', jml === 2, `dapat ${jml}`);

    /* Tanda harus muncul sambil mengetik, sebelum apa pun dikirim ke server. */
    await kotak.nth(0).fill('210');
    await page.waitForTimeout(120);
    const pratinjau = await page.locator('tr[data-baris]').filter({ hasText: 'Glukosa' }).textContent();
    cek('tanda tampil sebagai pratinjau sambil mengetik',
        /Tinggi/.test(pratinjau), pratinjau.replace(/\s+/g, ' '));

    /* Glukosa 210 mg/dL — di atas batas atas 140, tapi belum kritis. */
    await kotak.nth(0).fill('210');
    await kotak.nth(0).blur();
    await page.waitForTimeout(400);
    const barisGds = await page.locator('tr[data-baris]').filter({ hasText: 'Glukosa' }).textContent();
    cek('nilai di atas batas langsung ditandai Tinggi',
        /Tinggi/.test(barisGds), barisGds.replace(/\s+/g, ' '));

    cek('tombol Selesaikan masih mati karena satu pemeriksaan belum diisi',
        await page.locator('#btnSelesai').isDisabled());

    /* Kolesterol diketik dengan koma desimal ala Indonesia. */
    await kotak.nth(1).fill('245');
    await kotak.nth(1).blur();
    await page.waitForTimeout(400);
    cek('tombol Selesaikan hidup setelah semua terisi',
        !(await page.locator('#btnSelesai').isDisabled()));
    cek('ringkasan lembar ikut terbarui',
        (await page.locator('#ringkasLembar').textContent()).includes('2 dari 2'));

    /* Tren: hanya mungkin karena hasilnya angka, bukan foto lembar. */
    await page.locator('[data-tren]').first().click();
    await page.waitForTimeout(500);
    const modalTren = page.locator('.modal-bg.open').last();
    cek('modal tren terbuka', await modalTren.count() === 1);
    await modalTren.locator('button:has-text("Tutup")').click();
    await page.waitForTimeout(300);

    /* Menutup lembar. */
    await page.click('#btnSelesai');
    await page.waitForTimeout(400);
    await page.locator('.modal-bg.open').last().locator('button:has-text("Selesaikan")').click();
    await page.waitForTimeout(900);
    cek('lembar tertutup dan ditandai selesai',
        (await page.locator('#view').textContent()).includes('Lembar hasil sudah ditutup'));
    cek('perawat tidak ditawari membuka kunci',
        await page.locator('#btnBuka').count() === 0);
    cek('isian menjadi tidak bisa disunting setelah lembar ditutup',
        await page.locator('[data-hasil]').count() === 0);

    /* Perawat boleh mencatat hasil lab luar, tetapi bukan meminta lab. */
    await page.goto(alamat + '#/lab', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    cek('perawat boleh mencatat hasil lab luar',
        await page.locator('#btnLuar').count() === 1);

    /* Tab arsip: register berkas fisik, tanpa satu pun tombol unggah. */
    await page.click('#tabsLab [data-t="arsip"]');
    await page.waitForTimeout(500);
    const isiArsip = await page.locator('#isiLab').textContent();
    cek('tab arsip menjelaskan berkasnya tetap kertas',
        /Berkasnya tetap kertas/.test(isiArsip));
    cek('tidak ada satu pun kotak unggah berkas di seluruh halaman',
        await page.locator('input[type="file"]').count() === 0);

    await ctx.close();
  }

  /* ================================================================
     DOKTER — meminta lab dan menulis bacaan rontgen
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');

    /* Kunjungan poli gigi, supaya odontogram ikut terlibat. */
    await page.goto(alamat + '#/periksa/kunj-7', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    cek('kartu pemeriksaan penunjang muncul di layar dokter',
        (await page.locator('#view').textContent()).includes('Pemeriksaan penunjang'));
    cek('bacaan rontgen kunjungan ini ikut tampil',
        (await page.locator('#view').textContent()).includes('Karies profunda gigi 36'));

    /* Odontogram menandai gigi yang punya bacaan. */
    const legenda = await page.locator('.odo-legenda').textContent();
    cek('legenda odontogram menjelaskan tanda bacaan rontgen',
        /bacaan rontgen/.test(legenda), legenda.replace(/\s+/g, ' ').slice(0, 140));

    /* Meminta pemeriksaan lab lewat paket. */
    await page.click('#btnMintaLab');
    await page.waitForTimeout(600);
    const modalLab = page.locator('.modal-bg.open').last();
    cek('modal permintaan lab terbuka', await modalLab.count() === 1);

    await modalLab.locator('[data-paket]').first().click();
    await page.waitForTimeout(300);
    const hitung = await modalLab.locator('#hitungLab').textContent();
    cek('memilih paket mencentang beberapa pemeriksaan sekaligus',
        /3 pemeriksaan dipilih/.test(hitung), hitung);

    await modalLab.locator('#catLab').fill('curiga infeksi');
    await modalLab.locator('button:has-text("Kirim ke lab")').click();
    await page.waitForTimeout(1100);
    cek('permintaan lab muncul di kartu penunjang',
        (await page.locator('#view').textContent()).includes('Diminta'));

    /* Menulis bacaan tanpa kesan harus ditolak. */
    await page.click('#btnTulisBacaan');
    await page.waitForTimeout(600);
    const modalBc = page.locator('.modal-bg.open').last();
    cek('modal bacaan terbuka', await modalBc.count() === 1);
    cek('modal bacaan mengingatkan berkasnya dicatat di arsip',
        /Arsip berkas/.test(await modalBc.textContent()));

    await modalBc.locator('#pnTemuan').fill('Gambaran radiolusen apikal');
    await modalBc.locator('button:has-text("Simpan bacaan")').click();
    await page.waitForTimeout(500);
    cek('bacaan tanpa kesan ditolak, modal tetap terbuka',
        await page.locator('.modal-bg.open').count() >= 1);

    /* Nomor gigi karangan ditolak, yang sah menjadi chip. */
    await modalBc.locator('#pnGigi').fill('46 99');
    await modalBc.locator('#pnKesan').click();
    await page.waitForTimeout(400);
    const chip = await modalBc.locator('#chipGigi').textContent();
    cek('nomor gigi sah masuk sebagai chip', /46/.test(chip), chip);
    cek('nomor gigi karangan tidak ikut masuk', !/99/.test(chip), chip);

    await modalBc.locator('#pnKesan').fill('Karies media gigi 46');
    await modalBc.locator('button:has-text("Simpan bacaan")').click();
    await page.waitForTimeout(1200);
    cek('bacaan baru tersimpan dan tampil',
        (await page.locator('#view').textContent()).includes('Karies media gigi 46'));

    /* EKG tidak memerlukan nomor gigi — isiannya harus menghilang. */
    await page.click('#btnTulisBacaan');
    await page.waitForTimeout(600);
    const modalBc2 = page.locator('.modal-bg.open').last();
    await modalBc2.locator('#pnJenis').selectOption('EKG');
    await page.waitForTimeout(250);
    cek('isian nomor gigi disembunyikan untuk pemeriksaan non-gigi',
        !(await modalBc2.locator('#fieldGigi').isVisible()));
    await modalBc2.locator('#pnAsal').selectOption('EKSTERNAL');
    await page.waitForTimeout(250);
    cek('isian nama tempat muncul untuk pemeriksaan dari luar',
        await modalBc2.locator('#barisLuar').isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    /* Bacaan yang ditulis dari halaman Lab — bukan dari layar dokter — juga
       harus bisa dikaitkan ke kunjungan. Tanpa itu ia tidak pernah ditagih
       dan tidak pernah muncul di rekam medis kunjungan mana pun. */
    await page.goto(alamat + '#/lab/penunjang', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.locator('#cariPasienPn input').fill('Budi');
    await page.waitForTimeout(600);
    await page.locator('#cariPasienPn .combo-item').first().click();
    await page.waitForTimeout(700);
    await page.click('#btnBacaanBaru');
    await page.waitForTimeout(700);
    const modalPn = page.locator('.modal-bg.open').last();
    cek('modal bacaan dari halaman Lab menyediakan pemilih kunjungan',
        await modalPn.locator('#pnKunjungan').count() === 1);
    cek('pemilih kunjungan sudah terisi, bukan kosong',
        (await modalPn.locator('#pnKunjungan').inputValue()).length > 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.click('#tabsLab [data-t="arsip"]');
    await page.waitForTimeout(600);
    await page.locator('#cariPasienAr input').fill('Budi');
    await page.waitForTimeout(600);
    await page.locator('#cariPasienAr .combo-item').first().click();
    await page.waitForTimeout(700);
    await page.click('#btnArsipBaru');
    await page.waitForTimeout(700);
    const modalAr = page.locator('.modal-bg.open').last();
    cek('modal arsip juga menyediakan pemilih kunjungan',
        await modalAr.locator('#arKunjungan').count() === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    /* Rekam medis memuat bagian penunjang, termasuk nomor arsip berkasnya. */
    await page.goto(alamat + '#/rekam/kunj-7', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const rm = await page.locator('#view').textContent();
    cek('rekam medis memuat bagian pemeriksaan penunjang',
        /Pemeriksaan penunjang/.test(rm));
    cek('rekam medis menyebut nomor arsip berkas fisiknya',
        /ARS-2026-0001/.test(rm));
    cek('rekam medis menampilkan kesan bacaan',
        /Karies profunda gigi 36/.test(rm));

    await ctx.close();
  }

  /* ================================================================
     APOTEKER — boleh melihat, tidak boleh mengisi
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('apoteker');
    await page.goto(alamat + '#/lab', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    cek('apoteker tetap bisa membuka daftar lab',
        await page.locator('#tabelAntrean').count() === 1);
    cek('apoteker tidak ditawari mencatat hasil lab luar',
        await page.locator('#btnLuar').count() === 0);

    await page.locator('#tabelAntrean tbody tr').first().click();
    await page.waitForTimeout(800);
    cek('apoteker melihat lembar hasil sebagai bacaan saja',
        await page.locator('[data-hasil]').count() === 0);
    cek('apoteker diberi tahu kenapa halaman hanya bisa dibaca',
        /ditampilkan untuk dibaca saja/.test(await page.locator('#view').textContent()));

    await ctx.close();
  }

  /* ================================================================
     ADMIN — master pemeriksaan & nilai rujukan
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('admin');
    await page.goto(alamat + '#/master/lab', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const isi = await page.locator('#isiMaster').textContent();
    cek('master lab memperingatkan nilai rujukan harus dicocokkan dengan alat',
        /Cocokkan nilai rujukan dengan alat klinik/.test(isi));
    cek('daftar pemeriksaan termuat',
        await page.locator('#tabelLab tbody tr').count() >= 5);
    cek('pemeriksaan tanpa nilai rujukan ditandai',
        /belum ada/.test(isi));

    await page.locator('[data-aksi="rujukan"]').first().click();
    await page.waitForTimeout(600);
    const modalRuj = page.locator('.modal-bg.open').last();
    cek('modal nilai rujukan terbuka', await modalRuj.count() === 1);
    cek('baris rujukan laki-laki dan perempuan terpisah',
        (await modalRuj.textContent()).includes('Laki-laki') &&
        (await modalRuj.textContent()).includes('Perempuan'));

    await modalRuj.locator('#rjJk').selectOption('P');
    await modalRuj.locator('#rjUmin').fill('13');
    await modalRuj.locator('#rjBawah').fill('11');
    await modalRuj.locator('#rjAtas').fill('14');
    await modalRuj.locator('#btnTambahRuj').click();
    await page.waitForTimeout(600);
    cek('baris nilai rujukan baru masuk ke daftar',
        (await modalRuj.locator('#daftarRuj').textContent()).includes('11.0 - 14.0'),
        (await modalRuj.locator('#daftarRuj').textContent()).replace(/\s+/g, ' ').slice(0, 200));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    /* Tarif lab: kode diambil dari daftar, tidak diketik bebas. */
    await page.goto(alamat + '#/tarif', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.locator('button:has-text("Tarif baru")').first().click();
    await page.waitForTimeout(600);
    const modalTarif = page.locator('.modal-bg.open').last();
    await modalTarif.locator('[name=jenis]').selectOption('LAB');
    await page.waitForTimeout(300);
    cek('memilih jenis LAB memunculkan daftar pemeriksaan',
        await modalTarif.locator('#wrapLab').isVisible());
    cek('daftar tindakan ICD-9 disembunyikan untuk tarif lab',
        !(await modalTarif.locator('#wrapIcd').isVisible()));
    await modalTarif.locator('[name=kode_lab]').selectOption('HB');
    await page.waitForTimeout(300);
    cek('memilih pemeriksaan mengisi nama tarif otomatis',
        (await modalTarif.locator('[name=nama]').inputValue()) === 'Hemoglobin');
    await page.keyboard.press('Escape');

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

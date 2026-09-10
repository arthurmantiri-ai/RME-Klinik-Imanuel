/* =====================================================================
   UJI HALAMAN SURAT — menjalankan demo.html di Chromium sungguhan dan
   menelusuri alur penerbitan surat keterangan.

   Yang dicari di sini bukan tampilan, melainkan galat JavaScript dan
   perilaku yang salah: formulir yang tidak digambar, nomor yang tidak
   disarankan, peringatan nomor kembar yang tidak muncul, pratinjau yang
   kosong. Semuanya lolos dari `node --check` tetapi membuat dokter
   berhadapan dengan layar kosong sambil pasiennya menunggu.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8126;
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

  /* Isi iframe pratinjau. srcdoc berasal dari halaman yang sama, jadi
     isinya benar-benar bisa dibaca — bukan ditebak dari luar. */
  async function isiPratinjau(page, pemilih) {
    return await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      if (!f || !f.contentDocument || !f.contentDocument.body) return '';
      return f.contentDocument.body.innerText;
    }, pemilih);
  }

  /* ================================================================
     DOKTER — menerbitkan surat keterangan sakit
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/surat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    cek('menu Surat Keterangan tampil',
        await page.locator('a[href="#/surat"]').count() > 0);
    cek('riwayat surat termuat',
        await page.locator('#tabelSurat tbody tr').count() >= 1,
        'tidak ada baris riwayat');
    cek('nomor surat tampil dalam bentuk lengkap',
        /\/SKS\/YAKIM\//.test(await page.locator('#tabelSurat').textContent()));

    /* Masuk ke formulir lewat kunjungan yang sudah selesai diperiksa. */
    await page.goto(alamat + '#/surat/baru/kunj-1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    cek('bilah identitas pasien tampil di formulir',
        (await page.locator('.patient-bar').textContent()).includes('Budi Santoso'));
    cek('enam jenis surat bisa dipilih',
        await page.locator('#pilihJenis .radio-chip').count() === 6,
        'dapat ' + await page.locator('#pilihJenis .radio-chip').count());
    cek('surat keterangan sakit terpilih secara bawaan',
        (await page.locator('#pilihJenis .radio-chip.on').textContent()).includes('Sakit'));

    /* Nomor disarankan dari deret jenis ini, bukan dikosongkan. */
    const nomor = await page.locator('#fNomor').inputValue();
    cek('nomor urut disarankan otomatis', nomor === '13',
        `dapat "${nomor}" — data demo sudah memakai nomor 12`);
    cek('nomor lengkap tersusun di layar',
        /^13\/SKS\/YAKIM\/[IVX]+\/\d{4}$/.test(
          (await page.locator('#nomorJadi').textContent()).trim()),
        await page.locator('#nomorJadi').textContent());

    /* Isian digambar dari daftar di surat_core.js. */
    cek('kolom tanggal mulai istirahat tergambar',
        await page.locator('#m_mulai').count() === 1);
    cek('kolom lama istirahat tergambar',
        await page.locator('#m_lama').count() === 1);
    cek('kolom diagnasa tersembunyi selama centangnya mati',
        !(await page.locator('[data-bungkus="diagnosa_teks"]').isVisible()));

    await page.locator('#m_lama').fill('3');
    await page.waitForTimeout(700);

    let pratinjau = await isiPratinjau(page, '#framePratinjau');
    cek('pratinjau memuat judul surat', pratinjau.includes('SURAT KETERANGAN SAKIT'), pratinjau.slice(0, 120));
    cek('pratinjau memuat nomor surat', /13\/SKS\/YAKIM\//.test(pratinjau));
    cek('pratinjau memuat nama pasien', pratinjau.includes('Budi Santoso'));
    cek('pratinjau menuliskan lama istirahat dengan huruf',
        pratinjau.includes('3 (tiga) hari'), pratinjau.replace(/\s+/g, ' ').slice(0, 260));
    cek('pratinjau memuat nama dan SIP dokter',
        pratinjau.includes('dr. Arthur Mantiri') && pratinjau.includes('446/SIP/2024/0091'));
    cek('diagnosa tidak ikut tercetak secara bawaan', !pratinjau.includes('ISPA'), pratinjau);

    /* Menyalakan centang diagnosa memunculkan kolomnya DAN mengubah
       lembarnya. Dua-duanya diperiksa: kolom yang muncul tanpa mengubah
       surat sama sia-sianya dengan surat yang berubah tanpa kolom. */
    await page.locator('#m_cantumkan_diagnosa').check();
    await page.waitForTimeout(600);
    cek('kolom diagnosa muncul setelah dicentang',
        await page.locator('[data-bungkus="diagnosa_teks"]').isVisible());
    pratinjau = await isiPratinjau(page, '#framePratinjau');
    cek('diagnosa ikut tercetak setelah dicentang', pratinjau.includes('ISPA'), pratinjau);
    await page.locator('#m_cantumkan_diagnosa').uncheck();
    await page.waitForTimeout(500);

    /* Nomor yang sudah dipakai diperingatkan SEBELUM tombol simpan
       ditekan — bukan setelah isiannya keburu hilang. */
    await page.locator('#fNomor').fill('12');
    await page.waitForTimeout(900);
    cek('nomor yang sudah dipakai diperingatkan saat mengetik',
        (await page.locator('#peringatanNomor').textContent()).includes('sudah dipakai'),
        await page.locator('#peringatanNomor').textContent());

    await page.locator('#fNomor').fill('13');
    await page.waitForTimeout(900);
    cek('peringatan hilang setelah nomor diganti',
        (await page.locator('#peringatanNomor').textContent()).trim() === '');

    /* Ganti jenis surat: formulirnya berganti seluruhnya dan nomornya
       disarankan ulang dari deret jenis yang baru. */
    await page.locator('#pilihJenis .radio-chip[data-k="SR"]').click();
    await page.waitForTimeout(1000);
    cek('formulir rujukan menggantikan formulir surat sakit',
        await page.locator('#m_faskes_tujuan').count() === 1 &&
        await page.locator('#m_lama').count() === 0);
    /* Kolom klinis rujukan terisi sendiri dari rekam medis. Inilah yang
       membuat rujukan bisa dicetak dalam hitungan detik alih-alih
       diketik ulang dari layar sebelah. */
    cek('diagnosa rujukan terisi dari diagnosa kunjungan lengkap dengan kode ICD-10',
        /ISPA.*J06\.9/.test(await page.locator('#m_diagnosa_teks').inputValue()),
        await page.locator('#m_diagnosa_teks').inputValue());
    cek('anamnesa rujukan terisi dari keluhan dan catatan SOAP',
        (await page.locator('#m_anamnesa').inputValue()).includes('Batuk'),
        await page.locator('#m_anamnesa').inputValue());
    cek('pemeriksaan rujukan memuat tanda vital dari kajian awal',
        /\d+\/\d+ mmHg/.test(await page.locator('#m_pemeriksaan').inputValue()),
        await page.locator('#m_pemeriksaan').inputValue());
    cek('masa berlaku rujukan terisi bawaan',
        (await page.locator('#m_berlaku_sampai').inputValue()).length === 10);
    cek('deret nomor rujukan terpisah dari surat sakit',
        (await page.locator('#fNomor').inputValue()) === '1',
        'dapat ' + await page.locator('#fNomor').inputValue());
    cek('peringatan PCare muncul pada surat rujukan',
        (await page.locator('#view').textContent()).includes('PCare'));

    pratinjau = await isiPratinjau(page, '#framePratinjau');
    cek('pratinjau rujukan memuat nomor kartu BPJS',
        pratinjau.includes('0001234567890'), pratinjau.replace(/\s+/g, ' ').slice(0, 300));

    /* Keterangan sehat: angka kajian awal terisi sendiri, dan karena
       suhunya 37,8 °C sistem mengingatkan sebelum surat "berbadan sehat"
       tercetak. Peringatan, bukan penolakan — dokter tetap yang
       memutuskan, jadi tombol simpannya harus tetap hidup. */
    await page.locator('#pilihJenis .radio-chip[data-k="SKBS"]').click();
    await page.waitForTimeout(1000);
    cek('tanda vital kajian awal terisi ke keterangan sehat',
        (await page.locator('#m_tekanan_darah').inputValue()) === '138/86',
        await page.locator('#m_tekanan_darah').inputValue());
    cek('kesimpulan sehat dengan suhu demam diperingatkan',
        (await page.locator('#waspadaSurat').textContent()).includes('37.8'),
        await page.locator('#waspadaSurat').textContent());
    cek('peringatan tidak mematikan tombol simpan',
        !(await page.locator('#btnSimpanCetak').isDisabled()));
    await page.locator('#m_kesimpulan').selectOption(
      { index: 1 });   // SEHAT DENGAN CATATAN
    await page.waitForTimeout(600);
    cek('peringatan hilang setelah kesimpulannya diperbaiki',
        (await page.locator('#waspadaSurat').textContent()).trim() === '');

    /* Kembali ke surat sakit, lalu simpan. */
    await page.locator('#pilihJenis .radio-chip[data-k="SKS"]').click();
    await page.waitForTimeout(1000);
    await page.locator('#m_lama').fill('3');
    await page.waitForTimeout(400);
    await page.click('#btnSimpanSaja');
    await page.waitForTimeout(1200);

    const isiRiwayat = await page.locator('#tabelSurat').textContent();
    cek('surat baru muncul di riwayat', /13\/SKS\/YAKIM\//.test(isiRiwayat),
        isiRiwayat.replace(/\s+/g, ' ').slice(0, 200));
    cek('perihal ikut tersimpan', /Istirahat 3 hari/.test(isiRiwayat));

    /* Membuka surat: pratinjau, lalu membatalkannya dengan alasan. */
    await page.locator('#tabelSurat [data-buka]').first().click();
    await page.waitForTimeout(1000);
    const modal = page.locator('.modal-bg.open').last();
    cek('modal surat terbuka', await modal.count() === 1);
    const isiModal = await isiPratinjau(page, '#frameLihat');
    cek('surat tersimpan bisa dibaca ulang dari database',
        isiModal.includes('SURAT KETERANGAN SAKIT'), isiModal.slice(0, 120));

    await modal.locator('button:has-text("Batalkan")').click();
    await page.waitForTimeout(700);
    const modalBatal = page.locator('.modal-bg.open').last();
    cek('dialog pembatalan menjelaskan bahwa nomornya tetap terpakai',
        (await modalBatal.textContent()).includes('tetap terpakai'));
    await modalBatal.locator('button:has-text("Batalkan surat")').click();
    await page.waitForTimeout(500);
    cek('pembatalan tanpa alasan ditolak',
        await page.locator('.modal-bg.open').count() > 0,
        'dialog tertutup padahal alasannya kosong');
    await modalBatal.locator('#alasanBatal').fill('salah tanggal istirahat');
    await modalBatal.locator('button:has-text("Batalkan surat")').click();
    await page.waitForTimeout(1200);

    cek('surat yang dibatalkan ditandai di riwayat',
        (await page.locator('#tabelSurat').textContent()).includes('Dibatalkan'));

    await ctx.close();
  }

  /* ================================================================
     ADMIN (staf loket, 9 Sep 2026 — dulu bernama 'pendaftaran') —
     boleh mencetak ulang, tidak boleh menerbitkan
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('admin');
    await page.goto(alamat + '#/surat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    cek('loket melihat riwayat surat',
        await page.locator('#tabelSurat tbody tr').count() >= 1);
    cek('tombol Buat surat tidak ditawarkan ke loket',
        await page.locator('#btnSuratBaru').count() === 0);

    await page.locator('.tab', { hasText: 'Buat surat' }).click();
    await page.waitForTimeout(700);
    cek('tab Buat surat menjelaskan bahwa hanya dokter yang menerbitkan',
        (await page.locator('#isiSurat').textContent()).includes('Hanya dokter'));

    await page.locator('.tab', { hasText: 'Riwayat' }).click();
    await page.waitForTimeout(700);
    await page.locator('#tabelSurat [data-buka]').first().click();
    await page.waitForTimeout(1000);
    const modal = page.locator('.modal-bg.open').last();
    cek('loket tetap bisa membuka dan mencetak surat',
        await modal.locator('button:has-text("Cetak")').count() === 1);
    cek('loket tidak diberi tombol Batalkan',
        await modal.locator('button:has-text("Batalkan")').count() === 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await ctx.close();
  }

  /* ================================================================
     REKAM MEDIS & PEMERIKSAAN — jalan masuk ke surat
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');

    await page.goto(alamat + '#/rekam/kunj-1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    cek('rekam medis menampilkan daftar surat kunjungan',
        (await page.locator('#kartuSuratRekam').textContent()).includes('Surat Keterangan Sakit'),
        await page.locator('#kartuSuratRekam').textContent());
    cek('rekam medis punya tombol Buat surat',
        await page.locator('a[href="#/surat/baru/kunj-1"]').count() > 0);

    await page.goto(alamat + '#/periksa/kunj-3', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    cek('layar pemeriksaan punya kartu surat',
        await page.locator('#kartuSurat').count() === 1);
    cek('kartu surat menawarkan pembuatan surat dari layar pemeriksaan',
        await page.locator('a[href="#/surat/baru/kunj-3"]').count() > 0);

    await ctx.close();
  }

  /* ================================================================
     MASTER (9 Sep 2026 — dulu bernama 'admin') — pengaturan kop surat
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('master');
    await page.goto(alamat + '#/pengaturan/surat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    cek('tab Kop & Surat tersedia untuk master',
        await page.locator('#pratinjauKop').count() === 1);
    const src = await page.locator('#pratinjauKop').getAttribute('src');
    cek('kop bawaan tertanam sebagai data URI',
        /^data:image\/jpeg;base64,/.test(src || ''), (src || '').slice(0, 40));
    cek('kop bawaan benar-benar berisi gambar', (src || '').length > 50000,
        'panjang ' + (src || '').length);
    cek('kota pada baris tanggal bisa diatur',
        (await page.locator('#fKota').inputValue()).length > 0);
    cek('halaman menjelaskan mengapa tanda tangan tidak disimpan',
        (await page.locator('#isiTab').textContent()).includes('ruang tanda tangan kosong'));

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

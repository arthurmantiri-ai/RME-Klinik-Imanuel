/* =====================================================================
   UJI HALAMAN PEMANTAUAN KRONIS (Tahap 2) — menjalankan demo.html di
   Chromium sungguhan.

   Dua tempat diuji karena keduanya bisa "terlihat benar" sementara
   salah:

   1. HALAMAN PEMANTAUAN KRONIS (baca saja). Status Sudah/Belum
      Pernah/Terlambat, Aman/Mendekati/Terlambat, dan kuota statin semua
      dihitung di kronis_pantau_core.js (lihat catatan di kepala berkas
      itu) — kalau kelas warna atau kalimatnya salah, tabelnya tetap
      tergambar rapi, hanya saja menyesatkan. Tab Telepon H-1 juga harus
      TERTUTUP untuk peran yang tidak berhak melihatnya.

   2. KARTU "BUKU KRONIS" DI HALAMAN PERIKSA. Ini satu-satunya tempat
      pendaftaran/pengubahan terjadi — halaman Pemantauan Kronis sengaja
      hanya membaca. Usulan diagnosa harus muncul begitu dokter menambah
      diagnosa yang cocok, dan mendaftarkan/menghentikan pendaftaran
      harus benar-benar mengubah apa yang terlihat, bukan cuma menutup
      modalnya.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8133;
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
     A. HALAMAN PEMANTAUAN KRONIS — DOKTER
        Tiga tab harus terlihat dan berisi angka yang masuk akal; tab
        Telepon H-1 harus TIDAK ADA untuk peran ini.
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/pantau-kronis', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    cek('tiga tab terlihat untuk dokter', await page.locator('#tabs .tab').count() === 3,
        'dapat ' + await page.locator('#tabs .tab').count());
    cek('tab Telepon H-1 tidak ditawarkan ke dokter',
        !(await page.locator('#tabs .tab', { hasText: 'Telepon H-1' }).count()));

    const obat = await page.locator('#isiTab').textContent();
    cek('Budi Santoso (sudah ambil bulan ini) muncul di tab obat', /Budi Santoso/.test(obat));
    cek('Siti Aminah (belum pernah ambil) muncul di tab obat', /Siti Aminah/.test(obat));
    cek('badge "Belum pernah ambil" tergambar', /Belum pernah ambil/.test(obat), obat.slice(0, 300));
    cek('Sutrisno Hadi tertinggal beberapa bulan muncul di tab obat', /Sutrisno Hadi/.test(obat));
    cek('label tertinggal menyebut angka bulannya', /Tertinggal \d+ bulan/.test(obat),
        obat.slice(0, 300));

    await page.click('#tabs [data-t="lab"]');
    await page.waitForTimeout(500);
    const lab = await page.locator('#isiTab').textContent();
    cek('tab lab hanya memuat pasien DM/HPT (Budi & Sutrisno), bukan Siti (asma saja)',
        /Budi Santoso/.test(lab) && /Sutrisno Hadi/.test(lab) && !/Siti Aminah/.test(lab),
        lab.slice(0, 300));
    cek('status terlambat kontrol lab menyebut selisih dari toleransi',
        /Terlambat \d+ hari dari toleransi/.test(lab), lab.slice(0, 300));

    await page.click('#tabs [data-t="statin"]');
    await page.waitForTimeout(500);
    const statin = await page.locator('#isiTab').textContent();
    cek('kuota statin Sutrisno (6/6) ditandai terlampaui', /terlampaui/.test(statin),
        statin.slice(0, 300));
    cek('kuota statin Budi (2/3) ditandai mendekati', /Sisa kuota tinggal 1/.test(statin),
        statin.slice(0, 300));

    await ctx.close();
  }

  /* ================================================================
     B. HALAMAN PEMANTAUAN KRONIS — PENDAFTARAN
        App.boleh(['pendaftaran']) juga bernilai benar untuk admin, jadi
        peran ini sengaja dipilih untuk membuktikan tab itu tidak
        terbuka untuk SIAPA SAJA, hanya peran yang disebut.
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('pendaftaran');
    await page.goto(alamat + '#/pantau-kronis/telpon', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    cek('empat tab terlihat untuk petugas pendaftaran',
        await page.locator('#tabs .tab').count() === 4);
    const telpon = await page.locator('#isiTab').textContent();
    cek('Budi Santoso (kontrol besok) muncul di daftar telepon H-1', /Budi Santoso/.test(telpon),
        telpon.slice(0, 300));
    cek('instruksi petugas ikut tercetak', /Puasa 10 jam/.test(telpon));
    cek('tautan WhatsApp tersedia untuk pasien yang punya no. HP',
        await page.locator('#isiTab a:has-text("WhatsApp")').count() >= 1);

    await ctx.close();
  }

  /* ================================================================
     C. KARTU "BUKU KRONIS" DI PERIKSA — PASIEN SUDAH TERDAFTAR
        kunj-2 = Sutrisno Hadi (HPT+STROKE, statin simvastatin 6/6).
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/periksa/kunj-2', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const kartu = page.locator('#kartuKronis');
    cek('kartu Buku Kronis tergambar untuk pasien yang sudah terdaftar',
        (await kartu.textContent()).includes('Hipertensi'));
    const isiKartu = await kartu.textContent();
    cek('diagnosis kronis Stroke ikut tercetak', /Stroke/.test(isiKartu));
    cek('obat rutin tercatat tergambar', /Amlodipine 10 mg/.test(isiKartu));
    cek('status kuota statin (terlampaui) ikut tergambar di kartu', /terlampaui/.test(isiKartu),
        isiKartu.slice(0, 300));
    cek('tombol Ubah tersedia untuk dokter', await kartu.locator('#btnUbahKronis').count() === 1);
    cek('tombol Hentikan tersedia untuk dokter', await kartu.locator('#btnHentikanKronis').count() === 1);

    /* Modal ubah harus terisi dari pendaftaran yang sudah ada — bukan
       kosong seolah dokter mendaftarkan dari nol. */
    await kartu.locator('#btnUbahKronis').click();
    await page.waitForTimeout(500);
    const modal = page.locator('.modal-bg.open').last();
    cek('modal ubah buku kronis terbuka', await modal.count() === 1);
    const hptDicentang = await modal.locator('#dfKronisDx input[value="HPT"]').isChecked();
    const strokeDicentang = await modal.locator('#dfKronisDx input[value="STROKE"]').isChecked();
    cek('diagnosis yang sudah terdaftar tampil TERCENTANG di modal, bukan kosong',
        hptDicentang && strokeDicentang);
    cek('jenis statin yang sudah tersimpan terpilih di dropdown',
        await modal.locator('#stKunci').inputValue() === 'simvastatin');
    cek('obat rutin yang sudah tersimpan tergambar di modal',
        (await modal.locator('#tabelObatKronis').textContent()).includes('Amlodipine 10 mg'));

    await modal.locator('button:has-text("Batal")').click();
    await page.waitForTimeout(300);
    cek('modal tertutup tanpa mengubah apa pun setelah Batal',
        await page.locator('.modal-bg.open').count() === 0);

    /* Menghentikan pendaftaran harus benar-benar mengembalikan kartu ke
       keadaan "belum terdaftar" — bukan cuma menutup dialognya. */
    await kartu.locator('#btnHentikanKronis').click();
    await page.waitForTimeout(400);
    await page.locator('.modal-bg.open button:has-text("Hentikan")').click();
    await page.waitForTimeout(800);
    const setelahHenti = await kartu.textContent();
    cek('kartu kembali ke "belum terdaftar" setelah dihentikan',
        /belum terdaftar/.test(setelahHenti), setelahHenti.slice(0, 200));

    await ctx.close();
  }

  /* ================================================================
     D. KARTU "BUKU KRONIS" DI PERIKSA — PASIEN BELUM TERDAFTAR
        kunj-4 = Zahra Aulia, belum punya pendaftaran kronis apa pun.
        Menambah diagnosa Hipertensi harus memunculkan USULAN, dan
        usulan itu harus benar-benar bisa didaftarkan dari modal yang
        sama — bukan sekadar teks yang tergambar lalu tak berbuah apa-apa.
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/periksa/kunj-4', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const kartu = page.locator('#kartuKronis');
    cek('pasien baru mulai dari "belum terdaftar"',
        (await kartu.textContent()).includes('belum terdaftar di buku kronis'));
    /* Tombol daftar manual tetap ada untuk dokter (tanpa usulan pun boleh
       mendaftarkan pasien ke buku kronis) — yang belum boleh muncul
       adalah KALIMAT USULANNYA, sebelum ada diagnosa yang cocok. */
    cek('belum ada kalimat usulan sebelum diagnosa apa pun ditambah',
        !/cocok untuk dipantau kronis/.test(await kartu.textContent()));

    /* Hipertensi (I10) ada di daftar "sering dipakai" pada demo.html. */
    const chipHpt = page.locator('#icdCepat .chip-quick[data-kode="I10"]');
    cek('chip diagnosa cepat Hipertensi tersedia untuk dites', await chipHpt.count() === 1);
    await chipHpt.click();
    await page.waitForTimeout(700);

    const setelahDx = await kartu.textContent();
    cek('usulan pendaftaran kronis muncul begitu diagnosa Hipertensi ditambah',
        /cocok untuk dipantau kronis/.test(setelahDx) && /Hipertensi/.test(setelahDx),
        setelahDx.slice(0, 300));
    cek('tombol "Daftarkan ke buku kronis" muncul mengikuti usulan',
        await kartu.locator('#btnDaftarKronis').count() === 1);

    await kartu.locator('#btnDaftarKronis').click();
    await page.waitForTimeout(500);
    const modal = page.locator('.modal-bg.open').last();
    cek('modal pendaftaran terbuka dari tombol usulan', await modal.count() === 1);
    cek('diagnosis yang diusulkan (Hipertensi) sudah tercentang duluan',
        await modal.locator('#dfKronisDx input[value="HPT"]').isChecked());

    /* Tambah satu obat rutin lewat pencarian, seperti dokter sungguhan. */
    await modal.locator('#cariObatKronis input').fill('amlod');
    await page.waitForTimeout(600);
    const saran = modal.locator('#cariObatKronis .combo-item');
    if (await saran.count()) {
      await saran.first().click();
      await page.waitForTimeout(300);
    }
    cek('obat yang ditambah tergambar di tabel modal',
        (await modal.locator('#tabelObatKronis').textContent()).includes('Amlodipine'));

    await modal.locator('.modal-foot button:has-text("Simpan")').click();
    await page.waitForTimeout(900);
    cek('modal tertutup setelah disimpan', await page.locator('.modal-bg.open').count() === 0);

    const setelahSimpan = await kartu.textContent();
    cek('kartu menampilkan pendaftaran yang baru dibuat',
        /Hipertensi/.test(setelahSimpan) && /Terdaftar sejak/.test(setelahSimpan),
        setelahSimpan.slice(0, 300));
    cek('tombol Ubah & Hentikan muncul setelah pendaftaran dibuat',
        await kartu.locator('#btnUbahKronis').count() === 1 &&
        await kartu.locator('#btnHentikanKronis').count() === 1);

    /* Menyimpan tidak boleh membuat pendaftaran kedua kalau diklik lagi
       lewat "Ubah" — kronis_daftar_simpan() sungguhan MENGGANTI SET,
       bukan menambah baris terapi baru. */
    await kartu.locator('#btnUbahKronis').click();
    await page.waitForTimeout(500);
    const modal2 = page.locator('.modal-bg.open').last();
    cek('modal Ubah kedua membaca pendaftaran yang baru saja dibuat, bukan kosong lagi',
        await modal2.locator('#dfKronisDx input[value="HPT"]').isChecked());
    await modal2.locator('button:has-text("Batal")').click();

    await ctx.close();
  }

  /* ================================================================
     E. KARTU "BUKU KRONIS" — PERAN NON-DOKTER HANYA BOLEH MEMBACA
        Perawat boleh membuka halaman Periksa untuk membaca, tapi
        boleh_kronis_kelola() yang lebih longgar di database TIDAK
        dipakai di halaman ini secara sengaja — lihat catatan di kepala
        fungsi bolehKelolaKronis() pada pages/periksa.js.
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('perawat');
    await page.goto(alamat + '#/periksa/kunj-2', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const kartu = page.locator('#kartuKronis');
    cek('perawat tetap bisa melihat isi buku kronis pasien', /Hipertensi/.test(await kartu.textContent()));
    cek('tombol Ubah TIDAK ditawarkan ke perawat', await kartu.locator('#btnUbahKronis').count() === 0);
    cek('tombol Hentikan TIDAK ditawarkan ke perawat', await kartu.locator('#btnHentikanKronis').count() === 0);

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

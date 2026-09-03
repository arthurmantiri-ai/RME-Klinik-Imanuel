/* =====================================================================
   UJI HALAMAN PEMERIKSAAN TERSTRUKTUR — menjalankan demo.html di
   Chromium sungguhan dan menelusuri alur dokter memeriksa pasien.

   Yang dicari bukan tampilan, melainkan galat JavaScript dan perilaku
   yang salah: sistem pemeriksaan fisik yang tidak tergambar, tombol
   "semua normal" yang ikut menandai sistem yang tidak diperiksa, narasi
   SOAP yang tidak tersusun, blok rujukan yang tidak muncul. Semuanya
   lolos `node --check` tetapi membuat dokter berhadapan dengan layar
   yang salah sambil pasiennya menunggu.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8127;
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
     DOKTER — kunjungan kunj-2 (BPJS, poli umum, kajian awal sudah ada,
     pemeriksaan belum diisi). Inilah keadaan yang dihadapi dokter tiap
     kali memanggil pasien berikutnya.
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/periksa/kunj-2', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    cek('bilah identitas pasien tampil',
        (await page.locator('.patient-bar').textContent()).length > 10);

    /* ---------- Anamnesis ---------- */
    cek('kartu anamnesis terstruktur tergambar',
        await page.locator('#formAnamnesis').count() === 1);
    cek('delapan butir riwayat penyakit sekarang tersedia',
        await page.locator('#formAnamnesis [name^="rps_"]').count() === 8,
        'dapat ' + await page.locator('#formAnamnesis [name^="rps_"]').count());

    /* Diisi dari kajian awal perawat, bukan dikosongkan. Mengetik ulang
       keluhan yang barusan dicatat perawat adalah cara tercepat membuat
       dokter berhenti memakai field terstruktur. */
    const ku = await page.locator('#ku').inputValue();
    cek('keluhan utama terisi sendiri dari kajian awal perawat',
        ku.includes('kontrol tekanan darah'), `dapat "${ku}"`);
    const rpd = await page.locator('#rpd').inputValue();
    cek('riwayat penyakit dahulu ikut terbawa dari kajian awal',
        rpd.includes('Hipertensi'), `dapat "${rpd}"`);

    cek('alergi diminta terpisah per jenis seperti yang diminta PCare',
        await page.locator('[data-alergi]').count() === 3);

    /* ---------- Pemeriksaan fisik ---------- */
    const jmlSistem = await page.locator('.sistem-baris').count();
    cek('seluruh sistem tubuh tergambar sebagai baris', jmlSistem === 13,
        'dapat ' + jmlSistem);
    cek('tiap sistem punya tiga pilihan, bukan dua',
        await page.locator('.sistem-baris').first().locator('.radio-chip').count() === 3);

    await page.click('#btnSemuaNormal');
    await page.waitForTimeout(400);
    const normal = await page.locator('.sistem-baris .radio-chip.on').count();
    /* 12, bukan 13: genitourinaria sengaja tidak ikut. Menandainya normal
       berarti menuliskan pemeriksaan yang tidak dilakukan, atas nama
       dokter, di dokumen hukum. */
    cek('tombol "semua normal" menandai 12 sistem, bukan 13', normal === 12,
        'dapat ' + normal);
    cek('genitourinaria tidak ikut ditandai normal',
        await page.locator('[data-baris="GENITAL"] .radio-chip.on').count() === 0);
    cek('sistem yang normal memperlihatkan kalimat bakunya',
        (await page.locator('[data-baris="PARU"] .sistem-normal').textContent())
          .includes('suara napas vesikuler'));

    /* Menandai satu sistem abnormal membuka kotak temuan + daftar cepat. */
    await page.click('[data-baris="JANTUNG"] [data-status="ABNORMAL"]');
    await page.waitForTimeout(300);
    cek('menandai abnormal membuka kotak temuan',
        await page.locator('[data-temuan="JANTUNG"]').count() === 1);
    const chip = page.locator('[data-lazim="JANTUNG"]');
    cek('temuan yang sering dipakai bisa diklik', await chip.count() > 0);

    await chip.first().click();
    await page.waitForTimeout(200);
    const t1 = await page.locator('[data-temuan="JANTUNG"]').inputValue();
    cek('klik temuan cepat mengisi kotak', t1.length > 3, `dapat "${t1}"`);

    /* Klik kedua MENAMBAH, bukan menimpa: satu sistem sering punya lebih
       dari satu temuan, dan kehilangan yang pertama membuat orang
       berhenti memakai daftar cepat sama sekali. */
    await page.locator('[data-lazim="JANTUNG"]').nth(1).click();
    await page.waitForTimeout(200);
    const t2 = await page.locator('[data-temuan="JANTUNG"]').inputValue();
    cek('klik kedua menambah temuan, bukan menimpa yang pertama',
        t2.includes(t1) && t2.length > t1.length, `dapat "${t2}"`);

    /* Menekan tombol yang sudah menyala membatalkan pilihan. Tanpa ini,
       satu klik salah tidak bisa dibatalkan tanpa memuat ulang halaman. */
    await page.click('[data-baris="KULIT"] [data-status="NORMAL"]');
    await page.waitForTimeout(250);
    cek('menekan pilihan yang sudah menyala membatalkannya',
        await page.locator('[data-baris="KULIT"] .radio-chip.on').count() === 0);
    await page.click('[data-baris="KULIT"] [data-status="NORMAL"]');
    await page.waitForTimeout(250);

    /* ---------- Diagnosa ---------- */
    const chipIcd = page.locator('#icdCepat .chip-quick');
    await chipIcd.nth(0).click(); await page.waitForTimeout(250);
    await chipIcd.nth(1).click(); await page.waitForTimeout(250);
    await chipIcd.nth(2).click(); await page.waitForTimeout(250);
    cek('diagnosa bisa ditambah dari daftar cepat',
        await page.locator('#tabelDiagnosa tbody tr').count() === 3);
    cek('tiap diagnosa ditandai akan jadi kdDiag berapa',
        (await page.locator('#tabelDiagnosa').textContent()).includes('kdDiag1'));

    await chipIcd.nth(3).click(); await page.waitForTimeout(300);
    const tblDx = await page.locator('#tabelDiagnosa').textContent();
    cek('diagnosa keempat ditandai tidak terkirim', tblDx.includes('tidak terkirim'));
    cek('alasannya dijelaskan, bukan cuma ditandai',
        tblDx.includes('PCare hanya menerima tiga diagnosa'));

    /* ---------- Resep ---------- */
    await page.fill('#cariObat input', 'para');
    await page.waitForTimeout(600);
    const saran = page.locator('#cariObat .combo-item');
    if (await saran.count()) {
      await saran.first().click();
      await page.waitForTimeout(400);
      cek('obat masuk daftar resep',
          await page.locator('#tabelResep tbody tr').count() >= 1);
      /* PCare tidak menerima kalimat "3 x sehari 1 tablet"; yang diminta
         dua angka. Angkanya diurai dari kalimat yang memang sudah
         diketik dokter, dan hasilnya diperlihatkan supaya yang tidak
         terurai tidak lolos diam-diam. */
      cek('aturan pakai terbaca sebagai dua angka untuk PCare',
          (await page.locator('#tabelResep').textContent()).includes('signa 3 × 1'),
          await page.locator('#tabelResep').textContent());

      await page.fill('[data-signa="0"]', 'Sesuai anjuran dokter');
      await page.locator('[data-signa="0"]').blur();
      await page.waitForTimeout(400);
      cek('aturan pakai yang tidak berangka ditandai, bukan ditebak',
          (await page.locator('#tabelResep').textContent()).includes('belum terbaca sebagai angka'));

      await page.fill('[data-signa="0"]', '2 kali sehari 1/2 tablet');
      await page.locator('[data-signa="0"]').blur();
      await page.waitForTimeout(400);
      cek('setengah tablet terbaca 0,5 — bukan dibulatkan jadi 1',
          (await page.locator('#tabelResep').textContent()).includes('signa 2 × 0.5'),
          await page.locator('#tabelResep').textContent());
    }

    /* ---------- Tindak lanjut & rujukan ---------- */
    cek('blok rujukan tersembunyi selama pasien tidak dirujuk',
        await page.locator('#wadahRujuk').isHidden());

    await page.selectOption('#tl', 'RUJUK_LANJUT');
    await page.waitForTimeout(300);
    cek('memilih rujuk lanjut memunculkan blok rujukan',
        await page.locator('#wadahRujuk').isVisible());
    cek('faskes tujuan dipilih dari daftar, bukan diketik bebas',
        await page.locator('#rppk option').count() >= 2,
        'dapat ' + await page.locator('#rppk option').count() + ' pilihan');
    cek('sub spesialis dan sarana ikut berkode',
        await page.locator('#rsub').count() === 1 && await page.locator('#rsar').count() === 1);

    cek('kotak alasan TACC tersembunyi selama TACC belum dipilih',
        await page.locator('#wadahTacc').isHidden());
    await page.selectOption('#tacc', 'C1');
    await page.waitForTimeout(300);
    cek('memilih TACC memunculkan kotak alasan yang wajib diisi',
        await page.locator('#wadahTacc').isVisible());
    await page.selectOption('#tacc', 'TIDAK');
    await page.selectOption('#tl', 'SELESAI');
    await page.waitForTimeout(300);

    /* ---------- Kesiapan pengiriman ---------- */
    cek('kartu kesiapan BPJS tampil untuk pasien JKN',
        await page.locator('#ringkasKirim').count() === 1);
    const ringkas = await page.locator('#ringkasKirim').textContent();
    cek('kekurangan data ditulis dengan bahasa manusia',
        /Prognosa|diagnosa|Suhu|belum/i.test(ringkas), ringkas);

    /* ---------- Narasi SOAP tersusun sendiri ---------- */
    await page.click('#btnSusunSoap');
    await page.waitForTimeout(500);
    const O = await page.locator('#objective').inputValue();
    cek('bagian O tersusun sendiri dari isian terstruktur', O.length > 40, O);
    cek('O memuat tanda vital sebagai kalimat', /TD 152\/94/.test(O), O);
    cek('O memuat temuan abnormal yang tadi diketik',
        O.includes(t2.split(',')[0].trim()), O);
    const S = await page.locator('#subjective').inputValue();
    cek('bagian S tersusun dari keluhan utama', S.includes('kontrol tekanan darah'), S);
    const A = await page.locator('#assessment').inputValue();
    cek('bagian A menyebut diagnosa kerja lebih dulu',
        A.startsWith('Diagnosa kerja:'), A);

    /* Yang diketik tangan dokter tidak boleh hilang saat isian lain
       berubah — itu cara tercepat membuat orang berhenti mempercayai
       penyusunan otomatis. */
    await page.fill('#assessment', 'Penilaian saya sendiri, jangan ditimpa.');
    await page.click('[data-baris="MATA"] [data-status="ABNORMAL"]');
    await page.waitForTimeout(300);
    await page.click('#btnSimpanDraf');
    await page.waitForTimeout(900);
    cek('huruf yang diketik tangan tidak ditimpa saat disimpan',
        (await page.locator('#assessment').inputValue())
          === 'Penilaian saya sendiri, jangan ditimpa.',
        await page.locator('#assessment').inputValue());
    cek('penyimpanan sementara berhasil',
        (await page.locator('#statusSimpan').textContent()).includes('disimpan'),
        await page.locator('#statusSimpan').textContent());

    /* ---------- Pratinjau payload PCare ---------- */
    await page.click('#btnLihatPayload');
    await page.waitForTimeout(900);
    const modal = await page.locator('.modal').textContent();
    cek('pratinjau memperlihatkan nama field PCare yang sesungguhnya',
        modal.includes('kdDiag1') && modal.includes('kdStatusPulang')
        && modal.includes('terapiNonObat'), modal.slice(0, 200));
    cek('field yang belum terisi ditandai, bukan dikosongkan diam-diam',
        modal.includes('belum terisi'));
    await page.locator('.modal-foot button').last().click();
    await page.waitForTimeout(300);

    await ctx.close();
  }

  /* ================================================================
     Rekam medis — pemeriksaan fisik ikut tercetak, yang normal pun
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/rekam/kunj-1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const isi = await page.locator('.content').textContent();
    cek('rekam medis memuat tabel pemeriksaan fisik per sistem',
        isi.includes('Pemeriksaan fisik') && isi.includes('Toraks — paru'), '');
    /* Sistem yang normal DISEBUTKAN. Rekam medis yang hanya memuat temuan
       abnormal tidak bisa dibedakan dari yang tidak pernah diperiksa. */
    cek('sistem yang normal ikut disebut, bukan dilewati',
        isi.includes('Dalam batas normal'));
    cek('temuan abnormal tercetak lengkap',
        isi.includes('Faring hiperemis'));
    cek('diagnosis banding ikut tercatat',
        isi.includes('Diagnosis banding') && isi.includes('Pneumonia'));
    cek('terapi non-obat tercetak di tindak lanjut',
        isi.includes('Terapi non-obat'));

    await ctx.close();
  }

  /* ================================================================
     Kunjungan yang sudah dikunci — baca saja
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/periksa/kunj-1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    cek('rekam medis final ditandai sudah dikunci',
        (await page.locator('.banner.ok').first().textContent()).includes('difinalisasi'));
    cek('tombol simpan tidak ditawarkan pada rekam medis terkunci',
        await page.locator('#btnSimpanDraf').count() === 0);
    cek('tombol "semua normal" tidak muncul pada layar baca-saja',
        await page.locator('#btnSemuaNormal').count() === 0);
    cek('temuan tetap terbaca meski tidak bisa diubah',
        (await page.locator('#daftarSistem').textContent()).includes('Faring hiperemis'));

    await ctx.close();
  }

  /* ================================================================
     Perawat — halaman yang sama, tanpa kewenangan menulis
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('perawat');
    await page.goto(alamat + '#/periksa/kunj-2', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    cek('perawat diberi tahu halaman ini baca saja',
        (await page.locator('.banner.info').first().textContent()).includes('dibaca saja'));
    cek('perawat tidak diberi tombol kunci rekam medis',
        await page.locator('#btnFinal').count() === 0);

    await ctx.close();
  }

  /* ================================================================
     Admin — daftar faskes rujukan dan pemetaan kode PCare
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('admin');
    await page.goto(alamat + '#/pengaturan/rujukan', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const isi = await page.locator('#isiTab').textContent();
    cek('tab Rujukan & Kode PCare tersedia untuk admin',
        await page.locator('[data-t="rujukan"]').count() === 1);
    cek('daftar faskes tujuan rujukan tampil', isi.includes('Faskes tujuan rujukan'));
    cek('kode yang diketik sendiri ditandai belum resmi',
        isi.includes('diketik sendiri'));

    /* Kode PCare sengaja TIDAK ditebak sistem. Yang harus ada bukan
       isinya, melainkan tempatnya plus daftar apa saja yang masih kosong. */
    cek('pemetaan kode yang belum diisi didaftar', isi.includes('belum dipetakan'));
    cek('halaman menjelaskan mengapa kodenya tidak ditebak',
        isi.includes('milik BPJS'));
    cek('kotak isian kode PCare tersedia',
        await page.locator('[data-kode-tabel]').count() > 0);

    /* Mengisi satu pemetaan benar-benar menyimpannya. */
    const kotak = page.locator('[data-kode-tabel="ref_prognosa"]').first();
    if (await kotak.count()) {
      await kotak.fill('1');
      await page.click('#btnSimpanKode');
      await page.waitForTimeout(1200);
      cek('pemetaan yang sudah diisi hilang dari daftar kekurangan',
          !(await page.locator('[data-kode-tabel="ref_prognosa"][data-kode-baris="BONAM"]').count()),
          'baris BONAM masih terdaftar sebagai belum dipetakan');
    }

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

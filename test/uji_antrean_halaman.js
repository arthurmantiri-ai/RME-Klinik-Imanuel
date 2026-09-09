/* =====================================================================
   UJI HALAMAN ANTREAN & LAYAR TUNGGU — menjalankan demo.html dan
   display.html di Chromium sungguhan.

   Ada dua hal di modul ini yang tidak bisa diuji dari database, dan
   keduanya adalah bagian yang paling terlihat oleh pasien:

   1. LAYAR TUNGGU TIDAK BOLEH MENYEBUT NAMA SIAPA PUN.
      Fungsi database memang tidak memulangkan nama — itu sudah diuji di
      uji_antrean.sql. Yang diuji DI SINI adalah halamannya: bahwa tidak
      ada satu pun tempat di display.html yang menambahkan nama dari
      sumber lain, dan bahwa yang benar-benar tergambar di layar memang
      hanya nomor.

   2. LAYAR TIDAK BOLEH MENGULANG BUNYI SETIAP MENYEGARKAN DATA.
      Ia menyegarkan tiap tiga detik. Bug "berbunyi terus" hanya muncul
      pada penyegaran KEDUA — tidak akan pernah terlihat dengan membaca
      kode, dan di klinik ia berupa TV yang meneriakkan nomor yang sama
      dua puluh kali per menit.

   Setiap galat console dan setiap pengecualian yang tidak tertangkap
   membuat pengujian ini gagal — tanpa kecuali.
   ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PORT = 8129;
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
     A. PAPAN ANTREAN — petugas pendaftaran
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('pendaftaran');
    await page.goto(alamat + '#/antrian', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    /* Redesain Tahap 4 (9 Sep 2026): kartu kuota per poli pindah dari
       kelas .card generik ke .quota-card semantik (css/style.css bagian
       ANTREAN) — perilakunya sama, hanya nama kelasnya yang berubah. */
    cek('kartu kuota per poli tergambar',
        await page.locator('#kartuKuota .quota-card').count() >= 2,
        'dapat ' + await page.locator('#kartuKuota .quota-card').count());

    cek('empat tab alur antrean tersedia',
        await page.locator('#tabAntrean .tab').count() === 4);

    /* Tab bawaan adalah LOKET: pemesanan Mobile JKN yang pasiennya belum
       diverifikasi. Kalau tab bawaan langsung POLI, pemesanan online tidak
       akan pernah dilihat siapa pun sampai pasiennya bertanya di loket. */
    const barisLoket = await page.locator('#isiAntrean tbody tr').count();
    cek('tab bawaan menampilkan antrean loket', barisLoket >= 2,
        'dapat ' + barisLoket + ' baris');

    const isiLoket = await page.locator('#isiAntrean').textContent();
    cek('pemesanan Mobile JKN ditandai asalnya', isiLoket.includes('Mobile JKN'));
    cek('peserta yang belum jadi pasien diberi peringatan',
        isiLoket.includes('belum jadi pasien klinik'), isiLoket.slice(0, 200));

    /* --------- Memanggil nomor --------- */
    const tombolPanggil = page.locator('#isiAntrean [data-aksi="panggil"]').first();
    cek('tombol panggil tersedia bagi petugas loket', await tombolPanggil.count() === 1);
    await tombolPanggil.click();
    await page.waitForTimeout(700);

    const setelahPanggil = await page.locator('#isiAntrean').textContent();
    cek('nomor yang dipanggil berubah statusnya', /Dipanggil/.test(setelahPanggil));
    cek('panggilan tercatat di daftar panggilan terakhir',
        !(await page.locator('#isiPanggilan').textContent()).includes('Belum ada nomor'));

    /* Panggilan kedua harus berbunyi "Panggil ulang", bukan "Panggil".
       Petugas perlu tahu ia sedang memanggil untuk kali keberapa. */
    const tombolUlang = page.locator('#isiAntrean [data-aksi="panggil"]').first();
    cek('tombol berubah jadi panggil ulang',
        (await tombolUlang.textContent()).includes('ulang'),
        await tombolUlang.textContent());

    /* --------- Pendengar peristiwa tidak menumpuk ---------
       Halaman ini menggambar ulang tabelnya setiap kali ada tindakan.
       Kalau pendengar klik dipasang di dalam fungsi gambar (bukan sekali
       di render), satu klik akan berjalan dua kali setelah penggambaran
       kedua — dan nomor terpanggil dua kali berturut-turut tanpa ada
       yang menekan apa pun. Bug kelas ini pernah terjadi di daftar
       pemeriksaan fisik.

       Barisnya dikunci lewat data-id supaya penggambaran ulang tidak
       memindahkan sasaran klik ke pasien lain. */
    const idBaris = await page.evaluate(() =>
      document.querySelector('#isiAntrean tbody tr[data-id]').dataset.id);
    await page.locator(`#isiAntrean tr[data-id="${idBaris}"] [data-aksi="panggil"]`).click();
    await page.waitForTimeout(700);
    const hitungan = await page.evaluate((id) => {
      const t = document.querySelector(`#isiAntrean tr[data-id="${id}"]`);
      const m = t && /dipanggil (\d+)×/.exec(t.textContent);
      return m ? Number(m[1]) : -1;
    }, idBaris);
    /* Dua klik pada baris yang sama = dipanggil 2×. Kalau pendengarnya
       menumpuk, angkanya melompat ke 3 atau 4. */
    cek('dua klik menaikkan hitungan tepat dua kali', hitungan === 2,
        'dipanggil ' + hitungan + '× setelah dua klik (pendengar menumpuk?)');

    /* --------- Check-in --------- */
    await page.locator('#isiAntrean [data-aksi="checkin"]').first().click();
    await page.waitForTimeout(600);
    cek('dialog check-in terbuka', await page.locator('.modal').count() === 1);
    const isiModal = await page.locator('.modal-body').textContent();
    cek('dialog menampilkan identitas peserta untuk dicocokkan',
        /Kartu BPJS|milik/.test(isiModal), isiModal.slice(0, 160));
    await page.locator('.modal [data-tutup]').click();
    await page.waitForTimeout(300);

    /* --------- Nomor loket tanpa kunjungan --------- */
    await page.click('#btnNomorBaru');
    await page.waitForTimeout(500);
    cek('dialog ambil nomor terbuka', await page.locator('.modal').count() === 1);

    /* Nomor kartu setengah jadi harus DITOLAK di layar, sebelum tersimpan.
       Kartu yang tidak lengkap membuat pemesanan Mobile JKN peserta yang
       sama tidak terdeteksi sebagai duplikat. */
    await page.fill('.modal [name="no_kartu"]', '12345');
    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(500);
    cek('nomor kartu tidak lengkap ditolak sebelum tersimpan',
        (await page.locator('.modal #galatNomor').textContent()).includes('13 digit'),
        await page.locator('.modal #galatNomor').textContent());

    await page.fill('.modal [name="no_kartu"]', '');
    await page.fill('.modal [name="nama_snapshot"]', 'Pasien Uji Loket');
    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(900);
    cek('nomor loket terbit tanpa membuat kunjungan',
        (await page.locator('#isiAntrean').textContent()).includes('Pasien Uji Loket'));

    await ctx.close();
  }

  /* ================================================================
     B. DOKTER — memanggil dari ruang periksa
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('dokter');
    await page.goto(alamat + '#/periksa/kunj-2', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1100);

    /* Tombol panggil harus ada DI HALAMAN PEMERIKSAAN. Kalau hanya ada di
       papan antrean, yang terjadi di klinik adalah dokter membuka pintu
       dan berteriak — dan layar tunggu tidak pernah menunjukkan nomor
       yang benar. */
    cek('bilah panggilan tampil di halaman pemeriksaan dokter',
        await page.locator('#bilahPanggil').count() === 1);
    cek('tombol panggil pasien tersedia',
        await page.locator('#btnPanggilPasien').count() === 1);

    await page.click('#btnPanggilPasien');
    await page.waitForTimeout(800);
    const status = await page.locator('#statusPanggil').textContent();
    cek('panggilan dokter tercatat dan terlihat', /Dipanggil 1×/.test(status), status);
    cek('tombol berubah jadi panggil ulang',
        (await page.locator('#btnPanggilPasien').textContent()).includes('ulang'));

    await page.click('#btnMulaiLayan');
    await page.waitForTimeout(600);
    cek('menandai mulai periksa mengubah keterangan',
        (await page.locator('#statusPanggil').textContent()).includes('Sedang diperiksa'));

    await ctx.close();
  }

  /* ================================================================
     C. ADMIN — jadwal, kuota, layar, Antrol
     ================================================================ */
  {
    const { ctx, page } = await halamanBaru('admin');
    await page.goto(alamat + '#/jadwal', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    cek('daftar kesiapan antrean online tampil',
        await page.locator('#kesiapan').count() === 1);
    const kesiapan = await page.locator('#kesiapan').textContent();
    cek('kesiapan menjelaskan kode poli PCare milik BPJS',
        /kode PCare/i.test(kesiapan), kesiapan.slice(0, 200));

    cek('tujuh hari tergambar untuk tiap poli',
        await page.locator('#isiTab .card').first()
          .locator('tbody tr').count() >= 7);

    /* Kuota online tidak boleh melebihi kuota total: kalau boleh, pasien
       yang datang langsung bisa tidak kebagian kursi sama sekali. */
    await page.locator('[data-aksi="ubah-sesi"]').first().click();
    await page.waitForTimeout(500);
    await page.fill('.modal [name="kuota"]', '10');
    await page.fill('.modal [name="kuota_online"]', '30');
    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(500);
    cek('kuota online melebihi kuota total ditolak',
        (await page.locator('.modal #galatSesi').textContent()).includes('melebihi'),
        await page.locator('.modal #galatSesi').textContent());

    /* Jam tutup lebih awal dari jam buka juga ditolak. */
    await page.fill('.modal [name="kuota_online"]', '5');
    await page.fill('.modal [name="jam_buka"]', '14:00');
    await page.fill('.modal [name="jam_tutup"]', '09:00');
    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(500);
    cek('jam tutup sebelum jam buka ditolak',
        (await page.locator('.modal #galatSesi').textContent()).includes('lebih akhir'));
    await page.locator('.modal [data-tutup]').click();
    await page.waitForTimeout(300);

    /* ---- Tab layar ---- */
    await page.click('#tabs [data-t="layar"]');
    await page.waitForTimeout(700);
    const tautan = await page.locator('#tautanLayar').inputValue();
    cek('tautan layar terbentuk dari token', tautan.includes('display.html?t='), tautan);
    const isiLayar = await page.locator('#isiTab').textContent();
    cek('halaman menjelaskan layar tidak memuat data pasien',
        /tidak ada nama pasien/i.test(isiLayar));

    /* ---- Tab Antrol ---- */
    await page.click('#tabs [data-t="antrol"]');
    await page.waitForTimeout(700);
    const isiAntrol = await page.locator('#isiTab').textContent();
    cek('arah panggilan Antrol dijelaskan terbalik dari PCare',
        /BPJS-lah\s+yang memanggil|BPJS-lah/.test(isiAntrol.replace(/\s+/g, ' ')),
        isiAntrol.slice(0, 200));
    cek('enam endpoint spesifikasi BPJS terdaftar',
        isiAntrol.includes('/antrean/status/{kodepoli}/{tanggal}') &&
        isiAntrol.includes('/antrean/sisapeserta/{nokartu}/{kodepoli}/{tanggal}') &&
        isiAntrol.includes('/peserta') && isiAntrol.includes('/antrean/batal'));
    cek('perintah pemasangan tanpa verifikasi JWT disebutkan',
        isiAntrol.includes('--no-verify-jwt'));

    /* Password akun dibuat sistem dan ditampilkan sekali. */
    await page.click('#btnAkun');
    await page.waitForTimeout(500);
    const sandi = await page.locator('.modal [name="sandi"]').inputValue();
    cek('password web service dibuat acak dan panjang', sandi.length >= 24,
        'panjang ' + sandi.length);
    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(700);
    const konfirmasi = await page.locator('.modal-body').textContent();
    cek('password ditampilkan sekali dengan peringatan',
        /tidak akan pernah ditampilkan lagi/i.test(konfirmasi), konfirmasi.slice(0, 160));
    await page.locator('.modal-foot .btn-primary').click();
    await page.waitForTimeout(600);

    await ctx.close();
  }

  /* ================================================================
     D. LAYAR TUNGGU — display.html
     Supabase diganti tiruan yang memulangkan bentuk data yang sama
     persis dengan fungsi antrean_layar() di database.
     ================================================================ */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(t)) return;
      galat.push(`[layar] console: ${t}`);
    });
    page.on('pageerror', e => galat.push(`[layar] pageerror: ${e.message}`));

    /* Tiruan dipasang SEBELUM skrip halaman berjalan. */
    await ctx.addInitScript(() => {
      window.__panggilan = [
        { id: 101, nomor: 'A-004', tujuan: 'Poli Umum', poli: 'Poli Umum', waktu: '09:12', ulang: 1 },
        { id: 100, nomor: 'A-003', tujuan: 'Loket Pendaftaran', poli: 'Poli Umum', waktu: '09:04', ulang: 2 }
      ];
      window.__jumlahPanggilRpc = 0;
      window.__gagal = false;
      window.supabase = {
        createClient: () => ({
          rpc: async (nama, arg) => {
            window.__jumlahPanggilRpc++;
            // Diperiksa saat dipanggil, bukan saat dibuat: uji putus
            // jaringan di bawah menyalakannya setelah layar berjalan.
            if (window.__gagal) throw new Error('jaringan putus');
            if (nama !== 'antrean_layar') return { data: null, error: new Error('rpc tak dikenal') };
            if (arg.p_token !== 'token-uji-layar-yang-panjang-sekali')
              return { data: { galat: 'Token layar tidak dikenal.' }, error: null };
            return { data: {
              tanggal: '2026-09-05', waktu: '2026-09-05T09:15:00',
              klinik: 'Klinik Pratama Imanuel', judul: 'Antrean Pasien',
              teks_berjalan: 'Mohon menunggu nomor antrean Anda dipanggil.',
              panggilan: window.__panggilan,
              poli: [
                { nama: 'Poli Umum', prefix: 'A', dipanggil: 'A-004',
                  berikut: ['A-005','A-006','A-007'], sisa: 5, selesai: 3 },
                { nama: 'Poli Gigi', prefix: 'B', dipanggil: '',
                  berikut: ['B-001'], sisa: 1, selesai: 0 }
              ]
            }, error: null };
          }
        })
      };
    });

    const alamatLayar = `http://127.0.0.1:${PORT}/display.html`;

    /* ---- Token salah ---- */
    await page.goto(alamatLayar + '?t=token-yang-salah-tapi-cukup-panjang', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    cek('token salah memunculkan pesan, bukan data',
        await page.locator('#pesan:not([hidden])').count() === 1);
    cek('pesan token salah menunjuk ke halaman pengaturan',
        (await page.locator('#pesanIsi').textContent()).includes('Antrean'));

    /* ---- Tanpa token ---- */
    await page.goto(alamatLayar, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    cek('tanpa token layar menolak dan menjelaskan caranya',
        (await page.locator('#pesanJudul').textContent()).includes('belum lengkap'));

    /* ---- Token benar ---- */
    await page.goto(alamatLayar + '?t=token-uji-layar-yang-panjang-sekali', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    cek('layar menampilkan data', await page.locator('#pesan[hidden]').count() === 1);
    cek('nomor yang sedang dipanggil tampil besar',
        (await page.locator('#nomorBesar').textContent()).trim() === 'A-004');
    cek('tujuan panggilan ikut tampil',
        (await page.locator('#tujuanBesar').textContent()).includes('Poli Umum'));
    cek('kartu tiap poli tergambar', await page.locator('.poli').count() === 2);
    cek('poli yang belum memanggil menampilkan tanda hubung, bukan kosong',
        (await page.locator('.poli').nth(1).locator('.besar').textContent()).trim() === '—');
    cek('nomor berikutnya ikut ditampilkan',
        await page.locator('.poli').first().locator('.berikut span').count() === 3);
    cek('panggilan sebelumnya terlihat',
        await page.locator('#riwayat:not([hidden])').count() === 1);
    cek('teks berjalan terisi',
        (await page.locator('#teksJalan').textContent()).length > 10);
    cek('nama klinik tampil',
        (await page.locator('#namaKlinik').textContent()).includes('Imanuel'));

    /* ---------------------------------------------------------------
       INI PEMERIKSAAN YANG PALING PENTING DI BERKAS INI.

       Layar dipasang di ruang tunggu dan dilihat semua orang. Keputusan
       Arthur: nomor saja. Yang diperiksa bukan niat kodenya melainkan
       seluruh teks yang benar-benar tergambar — termasuk atribut dan
       tempat-tempat yang mudah terlupa seperti judul halaman.
       --------------------------------------------------------------- */
    const seluruhTeks = await page.evaluate(() => document.body.innerText);
    const seluruhHtml = await page.content();
    const NAMA_PASIEN = ['Budi', 'Siti', 'Andi', 'Bagas', 'Nurcahyo', 'Mantiri'];
    cek('tidak ada nama pasien di teks layar',
        !NAMA_PASIEN.some(n => seluruhTeks.includes(n)), seluruhTeks.slice(0, 200));
    cek('tidak ada nama pasien tersembunyi di HTML layar',
        !NAMA_PASIEN.some(n => seluruhHtml.includes(n)));
    cek('tidak ada nomor rekam medis di layar', !/\bRM\s*\d|no_rm/i.test(seluruhTeks));
    cek('tidak ada nomor kartu BPJS 13 digit di layar', !/\b\d{13}\b/.test(seluruhHtml));

    /* ---------------------------------------------------------------
       Penyegaran kedua TIDAK boleh dianggap panggilan baru.
       --------------------------------------------------------------- */
    const idAwal = await page.evaluate(() => window.Layar.idTerakhirDibunyikan);
    cek('muatan pertama dicatat, bukan dibunyikan ulang', idAwal === 101,
        'id ' + idAwal);

    await page.waitForTimeout(3400);                 // biarkan satu siklus lewat
    const idSetelah = await page.evaluate(() => window.Layar.idTerakhirDibunyikan);
    cek('data yang sama tidak menaikkan penanda panggilan', idSetelah === 101,
        'id ' + idSetelah);
    cek('layar benar-benar menyegarkan diri',
        (await page.evaluate(() => window.__jumlahPanggilRpc)) >= 2,
        'rpc dipanggil ' + await page.evaluate(() => window.__jumlahPanggilRpc) + '×');

    /* Panggilan baru DIKENALI. */
    await page.evaluate(() => {
      window.__panggilan.unshift({ id: 102, nomor: 'A-005', tujuan: 'Poli Umum',
                                   poli: 'Poli Umum', waktu: '09:20', ulang: 1 });
    });
    await page.waitForTimeout(3400);
    cek('panggilan baru menaikkan penanda',
        (await page.evaluate(() => window.Layar.idTerakhirDibunyikan)) === 102);
    cek('nomor besar ikut berganti',
        (await page.locator('#nomorBesar').textContent()).trim() === 'A-005');

    /* ---------------------------------------------------------------
       JARINGAN PUTUS TIDAK BOLEH MENGOSONGKAN LAYAR.

       Pasien yang melihat layar kosong mengira antreannya hilang dan
       berbondong ke loket — tepat ketika petugas sedang menghadapi
       gangguan jaringan. Yang boleh berubah hanya titik kecil di pojok.
       --------------------------------------------------------------- */
    await page.evaluate(() => { window.__gagal = true; });
    await page.waitForTimeout(3600);

    cek('nomor terakhir tetap terpampang saat jaringan putus',
        (await page.locator('#nomorBesar').textContent()).trim() === 'A-005',
        await page.locator('#nomorBesar').textContent());
    cek('kartu poli tidak ikut hilang', await page.locator('.poli').count() === 2);
    cek('layar tidak menutupi diri dengan pesan galat',
        await page.locator('#pesan[hidden]').count() === 1);
    cek('putusnya sambungan ditandai di pojok',
        await page.locator('#titik.putus').count() === 1);

    /* Dan menyambung lagi tanpa perlu disentuh siapa pun. */
    await page.evaluate(() => { window.__gagal = false; });
    await page.waitForTimeout(3600);
    cek('layar menyambung sendiri saat jaringan kembali',
        await page.locator('#titik.putus').count() === 0);

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

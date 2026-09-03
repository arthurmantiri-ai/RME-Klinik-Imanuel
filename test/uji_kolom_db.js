/* =====================================================================
   UJI KOLOM DB — mencocokkan setiap kolom yang diminta js/db.js dengan
   kolom yang benar-benar ada di berkas SQL, lalu memeriksa daftar kontrak:
   kolom yang WAJIB ikut terpilih karena ada halaman yang menggantungkan
   nasibnya pada kolom itu.

   Kenapa uji ini ada.

   Seluruh uji halaman (uji_halaman.js, uji_lab_halaman.js,
   uji_impor_halaman.js) menjalankan demo.html, dan demo.html memakai
   js/demo-data.js — data contoh yang mengembalikan seluruh isi baris apa
   adanya. Aplikasi sungguhan memakai js/db.js, yang meminta kolom satu per
   satu ke PostgREST. Artinya ada satu kelas kesalahan yang TIDAK BISA
   dilihat oleh uji halaman mana pun: kolom yang ada di database, dipakai
   oleh halaman, tetapi lupa diminta di `.select()`.

   Kesalahan seperti itu tidak melempar galat. PostgREST memulangkan objek
   tanpa kolom tersebut, JavaScript membacanya sebagai undefined, dan
   halaman tetap tampil rapi — hanya saja salah. Persis itu yang terjadi
   pada `poli.jenis`: modul poli gigi (odontogram, pemeriksaan gigi & mulut,
   kolom nomor gigi) hilang seluruhnya dari aplikasi sungguhan sementara 130
   uji halaman tetap lulus.

   Jalankan: node test/uji_kolom_db.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
let lulus = 0, gagal = 0;

function cek(nama, syarat, pesan) {
  if (syarat) { lulus++; console.log('  ok  ' + nama); }
  else { gagal++; console.error('  GAGAL  ' + nama + (pesan ? ' — ' + pesan : '')); }
}

/* ------------------------------------------------------------------ */
/* 1. Kolom setiap tabel, dibaca dari berkas SQL                       */
/* ------------------------------------------------------------------ */

const berkasSql = fs.readdirSync(path.join(AKAR, 'sql')).filter(f => f.endsWith('.sql')).sort();
const SQL = berkasSql.map(f => fs.readFileSync(path.join(AKAR, 'sql', f), 'utf8')).join('\n');

const kolomTabel = {};   // nama tabel -> Set(kolom)
const acuanKolom = {};   // 'tabel.kolom' -> tabel tujuan (dari `references`)

const KATA_BUKAN_KOLOM = new Set([
  'primary', 'foreign', 'unique', 'check', 'constraint', 'exclude', 'like'
]);

/* Membelah pada koma di tingkat kurung terluar. Dipakai dua kali: untuk
   badan `create table` (di mana `numeric(4,2)` tidak boleh terbelah, dan
   `kondisi_lama text, bidang_lama jsonb` pada satu baris harus terbelah)
   dan untuk daftar kolom `.select()`. */
function belahTingkatAtas(teks) {
  const bagian = [];
  let dalam = 0, mulai = 0;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (c === '(') dalam++;
    else if (c === ')') dalam--;
    else if (c === ',' && dalam === 0) { bagian.push(teks.slice(mulai, i)); mulai = i + 1; }
  }
  bagian.push(teks.slice(mulai));
  return bagian.map(s => s.trim()).filter(Boolean);
}

/* create table [if not exists] X ( ... ); */
const reTabel = /create table (?:if not exists )?([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\);/gi;
let m;
while ((m = reTabel.exec(SQL))) {
  const tabel = m[1];
  const set = kolomTabel[tabel] || (kolomTabel[tabel] = new Set());
  const badan = m[2].split('\n').map(b => b.replace(/--.*$/, '')).join('\n');
  belahTingkatAtas(badan).forEach(bagian => {
    const b = bagian.trim();
    const k = b.match(/^([a-z][a-z0-9_]*)\s+[a-z]/i);
    if (!k || KATA_BUKAN_KOLOM.has(k[1].toLowerCase())) return;
    set.add(k[1]);
    const ref = b.match(/references\s+([a-z0-9_]+)\s*\(/i);
    if (ref) acuanKolom[`${tabel}.${k[1]}`] = ref[1];
  });
}

/* alter table X add column [if not exists] Y — dipakai 05_gigi.sql untuk
   menambahkan poli.jenis, jadi tanpa bagian ini uji ini justru buta pada
   kolom yang jadi alasan uji ini ditulis. */
const reAlter = /alter table\s+(?:if exists\s+)?([a-z0-9_]+)\s+add column\s+(?:if not exists\s+)?([a-z0-9_]+)/gi;
while ((m = reAlter.exec(SQL))) {
  (kolomTabel[m[1]] || (kolomTabel[m[1]] = new Set())).add(m[2]);
}

cek('skema SQL terbaca', Object.keys(kolomTabel).length >= 40,
    Object.keys(kolomTabel).length + ' tabel');
cek('kolom poli.jenis ada di skema', kolomTabel.poli && kolomTabel.poli.has('jenis'),
    'dibuat oleh sql/05_gigi.sql');

/* ------------------------------------------------------------------ */
/* 2. Setiap .select() di db.js, beserta tabel asalnya                 */
/* ------------------------------------------------------------------ */

const DB = fs.readFileSync(path.join(AKAR, 'js', 'db.js'), 'utf8');

/* Mengambil isi tanda kurung `.select( ... )` dengan menghitung kurung,
   karena banyak select memuat sumber tersemat yang juga berkurung. */
function isiKurung(teks, posBuka) {
  let dalam = 0;
  for (let i = posBuka; i < teks.length; i++) {
    if (teks[i] === '(') dalam++;
    else if (teks[i] === ')') { dalam--; if (!dalam) return teks.slice(posBuka + 1, i); }
  }
  return null;
}

const permintaan = [];   // {tabel, kolom, baris}
const reFrom = /\.from\((['"`])([a-z0-9_]+)\1\)/gi;
while ((m = reFrom.exec(DB))) {
  const tabel = m[2];
  /* Berhenti di `.from(` berikutnya: `.from('penunjang').delete()` tidak
     boleh meminjam `.select()` milik kueri di bawahnya dan membuat
     kolomnya diperiksa terhadap tabel yang salah. */
  let sesudah = DB.slice(m.index + m[0].length, m.index + 2000);
  const fromLain = sesudah.indexOf('.from(');
  if (fromLain >= 0) sesudah = sesudah.slice(0, fromLain);
  const posSelect = sesudah.indexOf('.select(');
  if (posSelect < 0) continue;
  const isi = isiKurung(sesudah, posSelect + '.select'.length);
  if (isi === null) continue;
  /* Hanya argumen PERTAMA yang berisi daftar kolom. Argumen kedua —
     `{ count: 'exact', head: true }` — harus berhenti dibaca di sini,
     kalau tidak `count`, `exact` dan `head` ikut dikira nama kolom. */
  const awal = isi.search(/\S/);
  const kutip = isi[awal];
  if (!['"', "'", '`'].includes(kutip)) continue;       // .select() tanpa argumen literal
  let tutup = -1;
  for (let i = awal + 1; i < isi.length; i++) {
    if (isi[i] === '\\') { i++; continue; }
    if (isi[i] === kutip) { tutup = i; break; }
  }
  if (tutup < 0) continue;
  const daftar = isi.slice(awal + 1, tutup);
  const baris = DB.slice(0, m.index).split('\n').length;
  permintaan.push({ tabel, daftar: daftar.replace(/\s+/g, ' ').trim(), baris });
}

cek('permintaan .select() terbaca dari db.js', permintaan.length >= 60,
    permintaan.length + ' permintaan');

/* ------------------------------------------------------------------ */
/* 3. Kolom yang diminta harus benar-benar ada                         */
/* ------------------------------------------------------------------ */

const salah = [];
const dilewati = new Set();

function periksaDaftar(tabel, daftar, baris) {
  const kols = kolomTabel[tabel];
  if (!kols) { dilewati.add(tabel); return; }        // view: kolomnya tidak dibaca uji ini
  belahTingkatAtas(daftar).forEach(bagian => {
    /* alias:kolom_kunci(kolom,…), tabel(kolom,…), atau tabel!inner(kolom,…) */
    const tersemat = bagian.match(/^([a-z0-9_!]+)(?::([a-z0-9_!]+))?\(([\s\S]*)\)$/i);
    if (tersemat) {
      const kunci = (tersemat[2] || tersemat[1]).replace(/!.*$/, '');
      const tujuan = acuanKolom[`${tabel}.${kunci}`] || (kolomTabel[kunci] ? kunci : null);
      if (tujuan) periksaDaftar(tujuan, tersemat[3], baris);
      else dilewati.add(`${tabel}.${kunci}`);
      return;
    }
    const nama = bagian.replace(/^[a-z0-9_]+:/i, '')   // alias:kolom
                       .replace(/\.[^,]*$/, '')        // kolom->>jsonb
                       .replace(/!.*$/, '')            // kolom!inner
                       .trim();
    if (!nama || nama === '*' || nama.includes('*')) return;
    if (nama.startsWith('count') || nama.includes('(')) return;
    if (!kols.has(nama)) salah.push(`${tabel}.${nama} (db.js baris ${baris})`);
  });
}

permintaan.forEach(p => periksaDaftar(p.tabel, p.daftar, p.baris));

cek('semua kolom yang diminta db.js ada di skema', salah.length === 0,
    salah.slice(0, 8).join('; '));
if (dilewati.size) console.log('  ·   dilewati (view / relasi tak terlacak): ' + [...dilewati].join(', '));

/* ------------------------------------------------------------------ */
/* 4. KONTRAK — kolom yang wajib diminta karena ada halaman yang       */
/*    diam-diam berubah perilaku kalau kolomnya hilang.                */
/*                                                                     */
/*    Tambahkan baris di sini setiap kali sebuah halaman mulai membaca */
/*    kolom yang tidak jelas terlihat pada `.select()`-nya.            */
/* ------------------------------------------------------------------ */

const KONTRAK = [
  {
    fungsi: 'kunjungan',
    wajib: ['poli:poli_id', 'jenis'],
    alasan: 'poli gigi: odontogram, pemeriksaan gigi & mulut, kolom nomor gigi ' +
            '(pages/periksa.js dan pages/rekam.js membacanya lewat kj.poli.jenis)'
  },
  {
    fungsi: 'kunjungan',
    wajib: ['poli:poli_id', 'nama'],
    alasan: 'nama poli tercetak di kepala rekam medis dan antrean farmasi'
  },
  {
    /* Kontrak berkolom tunggal: kolom yang harus ada di daftar .select()
       teratas fungsinya, bukan di dalam sumber tersemat. */
    fungsi: 'daftarDokter',
    wajib: ['no_sip'],
    alasan: 'nomor SIP tercetak di bawah nama dokter pada SETIAP surat keterangan ' +
            '(pages/surat.js memakainya untuk ttd_sip). Tanpa kolom ini surat keluar ' +
            'tanpa nomor SIP — tetap rapi, tetap tercetak, dan tidak sah sebagai ' +
            'keterangan dokter. Tidak ada galat apa pun yang muncul.'
  }
];

function badanFungsi(nama) {
  const i = DB.indexOf(`async function ${nama}(`);
  if (i < 0) return null;
  return DB.slice(i, i + 900);
}

const punyaKolom = (daftar, kolom) =>
  daftar !== null &&
  belahTingkatAtas(daftar).some(b => b.replace(/^[a-z0-9_]+:/i, '').trim() === kolom ||
                                     b.trim() === '*');

KONTRAK.forEach(k => {
  const badan = badanFungsi(k.fungsi);

  /* Kontrak berkolom tunggal: kolomnya ada di daftar .select() teratas. */
  if (k.wajib.length === 1) {
    const kolom = k.wajib[0];
    const nama = `DB.${k.fungsi}() meminta ${kolom}`;
    if (!badan) { cek(nama, false, `fungsi ${k.fungsi} tidak ditemukan di db.js`); return; }
    const pos = badan.indexOf('.select(');
    if (pos < 0) { cek(nama, false, 'tidak ada .select() di fungsi ini'); return; }
    const isi = isiKurung(badan, pos + '.select'.length);
    cek(nama, punyaKolom(isi === null ? null : isi.replace(/^[`'"]|[`'"]$/g, ''), kolom),
        'tanpa kolom ini: ' + k.alasan);
    return;
  }

  const [semat, kolom] = k.wajib;
  const nama = `DB.${k.fungsi}() meminta ${semat.split(':')[0]}.${kolom}`;
  if (!badan) { cek(nama, false, `fungsi ${k.fungsi} tidak ditemukan di db.js`); return; }
  const pos = badan.indexOf(semat + '(');
  if (pos < 0) { cek(nama, false, `sumber tersemat ${semat} tidak ada`); return; }
  const isi = isiKurung(badan, pos + semat.length);
  cek(nama, punyaKolom(isi, kolom), 'tanpa kolom ini: ' + k.alasan);
});

/* Sisi lain kontrak yang sama: halaman memang masih membacanya.
   Kalau suatu saat periksa.js berhenti memakai poli.jenis, kontrak di atas
   jadi peninggalan yang menyesatkan, bukan penjaga. */
const HALAMAN = ['periksa', 'rekam'].map(n =>
  fs.readFileSync(path.join(AKAR, 'js', 'pages', n + '.js'), 'utf8'));
cek('pages/periksa.js dan pages/rekam.js masih menyalakan poli gigi lewat poli.jenis',
    HALAMAN.every(t => /poli\?\.jenis\s*===\s*'GIGI'/.test(t)),
    'kontrak poli.jenis di atas perlu diperbarui');

/* Data contoh harus sebentuk dengan database, kalau tidak demo.html
   menguji dunia yang tidak ada. */
const DEMO = fs.readFileSync(path.join(AKAR, 'js', 'demo-data.js'), 'utf8');
const poliGigiDemo = /kode:\s*'GIGI'[^}]*jenis:\s*'GIGI'|jenis:\s*'GIGI'[^}]*kode:\s*'GIGI'/.test(DEMO);
cek('demo-data.js memberi poli gigi kolom jenis seperti database', poliGigiDemo);

const SURAT_JS = fs.readFileSync(path.join(AKAR, 'js', 'pages', 'surat.js'), 'utf8');
cek('pages/surat.js masih memakai no_sip dokter untuk tanda tangan',
    /no_sip/.test(SURAT_JS), 'kontrak daftarDokter.no_sip di atas perlu diperbarui');

/* ------------------------------------------------------------------ */
/* 5. Kode jenis surat harus sama di tiga tempat                       */
/*                                                                     */
/*    Kode jenis surat ikut tercetak di nomor surat DAN menjadi kunci  */
/*    asing ke ref_jenis_surat. Kalau js/surat_core.js menawarkan jenis */
/*    yang belum ada di sql/13_surat.sql, dokter mengisi seluruh        */
/*    formulir lalu tombol Simpan gagal dengan galat kunci asing —      */
/*    setelah pasiennya menunggu.                                       */
/* ------------------------------------------------------------------ */
const CORE = fs.readFileSync(path.join(AKAR, 'js', 'surat_core.js'), 'utf8');

const urut = CORE.match(/const urutJenis = \[([^\]]*)\]/);
const kodeJs = urut ? urut[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
cek('daftar jenis surat terbaca dari surat_core.js', kodeJs.length > 0);

const seed = SQL.match(/insert into ref_jenis_surat[\s\S]*?on conflict/i);
const kodeSql = seed ? [...seed[0].matchAll(/\(\s*'([A-Z]+)'\s*,/g)].map(m => m[1]) : [];
cek('daftar jenis surat terbaca dari sql/13_surat.sql', kodeSql.length > 0);

kodeJs.forEach(k => cek(`jenis surat ${k} ada di ref_jenis_surat`, kodeSql.includes(k),
  'formulirnya bisa dibuka, tetapi menyimpannya gagal dengan galat kunci asing'));
kodeSql.forEach(k => cek(`jenis surat ${k} punya bentuk di surat_core.js`, kodeJs.includes(k),
  'ada di database tetapi tidak bisa dipilih dokter mana pun'));

const kodeDemo = [...DEMO.matchAll(/\{\s*kode:\s*'([A-Z]+)',\s*nama:\s*'Surat|\{\s*kode:\s*'(RM)',/g)]
  .map(m => m[1] || m[2]);
kodeJs.forEach(k => cek(`demo-data.js mengenal jenis surat ${k}`, kodeDemo.includes(k),
  'halaman demo menguji dunia yang tidak sama dengan aplikasi'));

/* ------------------------------------------------------------------ */
console.log(`\n${lulus} lulus, ${gagal} gagal.`);
process.exit(gagal ? 1 : 0);

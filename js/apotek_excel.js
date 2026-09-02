/* =====================================================================
   APOTEK EXCEL — pembacaan berkas impor dan penyusunan lembar ekspor.

   Seluruh isi berkas ini fungsi murni: tidak menyentuh DOM, tidak
   memanggil Supabase, dan tidak memuat SheetJS. Masukannya array biasa,
   keluarannya array biasa. `js/pages/apotek.js` yang menyambungkannya ke
   SheetJS dan ke layar.

   Alasannya bukan kerapian. Bagian paling rawan dari impor Excel adalah
   penafsiran nilai — tanggal yang datang sebagai angka, ribuan yang
   dituliskan dengan titik, nama obat yang beda satu spasi — dan
   satu-satunya cara menguji semua itu dengan tuntas adalah menjalankannya
   di luar peramban: `node test/uji_apotek_excel.js`.
   ===================================================================== */
const ApotekExcel = (() => {
  'use strict';

  /* ------------------------------------------------------------------
     KOLOM TEMPLATE

     `kunci` dipakai di dalam kode; `judul` yang tampil di berkas Excel.
     `alias` menampung ejaan lain yang mungkin dipakai orang — termasuk
     judul kolom dari modul stok portal, supaya berkas ekspor portal bisa
     langsung dipakai untuk memindahkan stok ke RME tanpa diedit dulu.
     ------------------------------------------------------------------ */
  const KOLOM = [
    { kunci: 'kode_obat',   judul: 'Kode Obat',    wajib: false,
      alias: ['kode', 'kode internal', 'kode_internal'],
      contoh: 'OBT-001',
      bantu: 'Kode di Master Data. Cara pencocokan paling aman — kalau diisi, nama diabaikan.' },
    { kunci: 'nama_obat',   judul: 'Nama Obat',    wajib: true,
      alias: ['nama', 'obat', 'nama obat'],
      contoh: 'Paracetamol 500 mg',
      bantu: 'Wajib. Dicocokkan dengan Master Data; beda spasi dan besar-kecil huruf diabaikan.' },
    { kunci: 'satuan',      judul: 'Satuan',       wajib: false,
      alias: ['satuan terkecil'],
      contoh: 'Tablet',
      bantu: 'Hanya dipakai bila obatnya belum ada di Master Data.' },
    { kunci: 'jumlah',      judul: 'Jumlah',       wajib: true,
      alias: ['qty', 'kuantitas', 'jumlah masuk', 'stok'],
      contoh: '500',
      bantu: 'Wajib. Dalam satuan terkecil.' },
    { kunci: 'harga_beli',  judul: 'Harga Beli',   wajib: true,
      alias: ['harga', 'harga satuan', 'harga beli satuan', 'harga_satuan'],
      contoh: '600',
      bantu: 'Wajib. Harga per satuan terkecil, bukan per box.' },
    { kunci: 'tgl_expired', judul: 'Tanggal Kadaluwarsa', wajib: true,
      alias: ['expired', 'exp', 'kadaluarsa', 'kadaluwarsa', 'tgl expired', 'tanggal expired'],
      contoh: '2028-06-30',
      bantu: 'Wajib. Tulis tahun-bulan-tanggal (2028-06-30) supaya tidak ada salah baca.' },
    { kunci: 'tgl_masuk',   judul: 'Tanggal Masuk', wajib: false,
      alias: ['tgl masuk', 'tanggal terima', 'tgl_masuk'],
      contoh: '2026-09-01',
      bantu: 'Kosongkan untuk memakai tanggal hari ini.' },
    { kunci: 'no_faktur',   judul: 'No. Faktur',   wajib: false,
      alias: ['faktur', 'no faktur', 'nomor faktur', 'no_faktur'],
      contoh: 'FK-2026/09/001',
      bantu: 'Ikut membedakan batch. Dua kiriman dengan faktur berbeda jadi dua batch.' },
    { kunci: 'pbf',         judul: 'PBF',          wajib: true,
      alias: ['distributor', 'supplier', 'pemasok', 'nama pbf'],
      contoh: 'PT Kimia Farma',
      bantu: 'Wajib. Untuk saldo awal, isi asal barangnya atau tulis "Opname Awal".' },
    { kunci: 'no_batch',    judul: 'No. Batch',    wajib: false,
      alias: ['batch', 'no batch', 'nomor batch', 'lot'],
      contoh: 'B2609A',
      bantu: 'Nomor batch dari pabrik. Hanya catatan, tidak dipakai mencocokkan.' },
    { kunci: 'harga_jual',  judul: 'Harga Jual',   wajib: false,
      alias: ['jual', 'harga jual satuan'],
      contoh: '1000',
      bantu: 'Hanya dipakai bila obatnya dibuat baru dari berkas ini.' },
    { kunci: 'keterangan',  judul: 'Keterangan',   wajib: false,
      alias: ['catatan', 'ket'],
      contoh: '',
      bantu: 'Bebas.' }
  ];

  const JENIS_IMPOR = [
    { kunci: 'Pembelian',  judul: 'Pembelian / obat masuk',
      bantu: 'Kiriman dari PBF. Masuk laporan pembelian bulan berjalan.' },
    { kunci: 'Saldo Awal', judul: 'Saldo awal (opname)',
      bantu: 'Stok yang sudah ada di rak saat sistem mulai dipakai. '
           + 'Dipisahkan dari pembelian supaya laporan bulan pertama tidak melonjak palsu.' }
  ];

  /* ------------------------------------------------------------------
     PENAFSIRAN NILAI
     ------------------------------------------------------------------ */

  const pad = (n) => String(n).padStart(2, '0');
  const teks = (v) => (v === null || v === undefined) ? '' : String(v).trim();

  /* Judul kolom dinormalkan sebelum dicocokkan: huruf kecil, tanda baca
     jadi spasi. "No. Faktur", "no faktur", dan "NO_FAKTUR" sama saja. */
  const normalKunci = (s) =>
    String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /* Peta judul kolom → kunci internal, sekali bangun. */
  const PETA_KOLOM = (() => {
    const p = {};
    KOLOM.forEach(k => {
      p[normalKunci(k.judul)] = k.kunci;
      p[normalKunci(k.kunci)] = k.kunci;
      (k.alias || []).forEach(a => { p[normalKunci(a)] = k.kunci; });
    });
    return p;
  })();

  /* Angka Excel untuk tanggal: hari sejak 1899-12-30.
     25569 adalah serial untuk 1970-01-01, jadi selisihnya langsung bisa
     diubah ke milidetik epoch. Dibaca kembali dengan getter UTC — memakai
     getter lokal akan menggeser tanggal satu hari untuk zona di timur
     Greenwich, termasuk WITA. */
  function dariSerialExcel(n) {
    const d = new Date(Math.round((Number(n) - 25569) * 86400000));
    if (isNaN(d)) return null;
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  const sah = (th, bl, tg) => {
    if (!(th >= 1900 && th <= 2200 && bl >= 1 && bl <= 12 && tg >= 1 && tg <= 31)) return null;
    const d = new Date(Date.UTC(th, bl - 1, tg));
    if (d.getUTCMonth() !== bl - 1 || d.getUTCDate() !== tg) return null;   // 31 Februari
    return `${th}-${pad(bl)}-${pad(tg)}`;
  };

  /* Mengembalikan { tanggal, ambigu } — tanggal 'YYYY-MM-DD' atau null.
     `ambigu` true bila urutan hari/bulan tidak bisa dipastikan dari
     angkanya sendiri (03/04/2028 bisa 3 April atau 4 Maret). Ditafsirkan
     hari-dulu sesuai kebiasaan Indonesia, tapi ditandai supaya layar
     pratinjau bisa menampilkan hasil bacaannya untuk diperiksa. */
  function bacaTanggal(v) {
    if (v === null || v === undefined || v === '') return { tanggal: null, ambigu: false };

    if (v instanceof Date && !isNaN(v)) {
      return { tanggal: `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`,
               ambigu: false };
    }
    if (typeof v === 'number' && isFinite(v)) {
      return { tanggal: dariSerialExcel(v), ambigu: false };
    }

    const s = teks(v);
    if (!s) return { tanggal: null, ambigu: false };

    // Angka yang terlanjur jadi teks — tetap serial Excel.
    if (/^\d{5}(\.\d+)?$/.test(s)) return { tanggal: dariSerialExcel(parseFloat(s)), ambigu: false };

    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) return { tanggal: sah(+m[1], +m[2], +m[3]), ambigu: false };

    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (m) {
      const a = +m[1], b = +m[2], th = +m[3];
      // Kalau salah satunya di atas 12, urutannya tidak mungkin salah baca.
      if (a > 12) return { tanggal: sah(th, b, a), ambigu: false };
      if (b > 12) return { tanggal: sah(th, a, b), ambigu: false };
      return { tanggal: sah(th, b, a), ambigu: true };   // hari dulu, ditandai
    }
    return { tanggal: null, ambigu: false };
  }

  /* Angka dari sel yang mungkin ditulis "Rp 1.500", "1,500", atau "1500,5".
     Aturannya: pemisah yang MUNCUL TERAKHIR adalah pemisah desimal,
     kecuali kalau bentuknya jelas kelompok ribuan. Tanpa aturan ini,
     "1.500" bisa terbaca satu setengah. */
  function bacaAngka(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;

    let s = teks(v).replace(/rp/ig, '').replace(/\s/g, '');
    if (!s) return null;
    if (!/^-?[\d.,]+$/.test(s)) return null;

    const adaTitik = s.includes('.'), adaKoma = s.includes(',');
    if (adaTitik && adaKoma) {
      // Yang terakhir muncul adalah desimal; yang lain pemisah ribuan.
      const desimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
      const ribuan  = desimal === '.' ? ',' : '.';
      s = s.split(ribuan).join('').replace(desimal, '.');
    } else if (adaTitik || adaKoma) {
      const tanda = adaTitik ? '.' : ',';
      const bagian = s.split(tanda);
      const kelompokRibuan = bagian.length > 1
        && bagian.slice(1).every(b => b.length === 3)
        && bagian[0].replace('-', '').length <= 3;
      s = kelompokRibuan ? bagian.join('') : bagian.join('.');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  /* ------------------------------------------------------------------
     PENCOCOKAN NAMA OBAT
     ------------------------------------------------------------------ */

  // Dua kunci. Yang pertama menjaga batas kata; yang kedua membuang
  // spasi sama sekali, sehingga "500mg" dan "500 mg" bertemu.
  const kunciNama  = (s) => normalKunci(s);
  const kunciRapat = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  /* Kemiripan Dice atas bigram huruf. Dipilih karena murah, tidak butuh
     pustaka, dan cukup peka untuk salah ketik satu-dua huruf —
     "Amoxicilin" vs "Amoxicillin" keluar di atas 0,9. */
  function kemiripan(a, b) {
    const x = kunciRapat(a), y = kunciRapat(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
    const pasangan = (s) => {
      const m = new Map();
      for (let i = 0; i < s.length - 1; i++) {
        const g = s.slice(i, i + 2);
        m.set(g, (m.get(g) || 0) + 1);
      }
      return m;
    };
    const pa = pasangan(x), pb = pasangan(y);
    let sama = 0;
    pa.forEach((n, g) => { if (pb.has(g)) sama += Math.min(n, pb.get(g)); });
    return (2 * sama) / ((x.length - 1) + (y.length - 1));
  }

  const AMBANG_MIRIP = 0.82;

  /* Menyusun indeks master obat sekali, dipakai untuk seluruh baris. */
  function indeksObat(master) {
    const kode = new Map(), nama = new Map(), rapat = new Map();
    (master || []).forEach(o => {
      if (o.kode_internal) kode.set(kunciNama(o.kode_internal), o);
      const kn = kunciNama(o.nama);
      if (!nama.has(kn)) nama.set(kn, o);
      const kr = kunciRapat(o.nama);
      if (!rapat.has(kr)) rapat.set(kr, o);
    });
    return { kode, nama, rapat, semua: master || [] };
  }

  /* Mengembalikan { obat, cara, mirip } —
       cara: 'kode' | 'nama' | 'nama-rapat' | null
       mirip: kandidat terdekat bila tidak ada yang cocok persis */
  function cocokkanObat(baris, idx) {
    const kode = teks(baris.kode_obat);
    if (kode) {
      const o = idx.kode.get(kunciNama(kode));
      if (o) return { obat: o, cara: 'kode', mirip: [] };
    }
    const nama = teks(baris.nama_obat);
    if (!nama) return { obat: null, cara: null, mirip: [] };

    let o = idx.nama.get(kunciNama(nama));
    if (o) return { obat: o, cara: 'nama', mirip: [] };

    o = idx.rapat.get(kunciRapat(nama));
    if (o) return { obat: o, cara: 'nama-rapat', mirip: [] };

    const mirip = idx.semua
      .map(x => ({ obat: x, skor: kemiripan(nama, x.nama) }))
      .filter(x => x.skor >= AMBANG_MIRIP)
      .sort((a, b) => b.skor - a.skor)
      .slice(0, 3);
    return { obat: null, cara: null, mirip };
  }

  /* ------------------------------------------------------------------
     MEMBACA SELURUH BERKAS
     ------------------------------------------------------------------ */

  /* `aoa` = array-of-array persis seperti keluaran SheetJS dengan
     { header: 1, raw: true }. Baris pertama dianggap judul kolom. */
  function bacaLembar(aoa, master, opsi) {
    const o = opsi || {};
    const idx = indeksObat(master);
    const hasil = { kolomTakDikenal: [], kolomHilang: [], baris: [], adaAmbigu: false };

    if (!Array.isArray(aoa) || aoa.length < 2) {
      hasil.galatBerkas = 'Berkas kosong atau hanya berisi baris judul.';
      return hasil;
    }

    // --- Judul kolom
    const judul = (aoa[0] || []).map(teks);
    const petaIndeks = {};
    judul.forEach((j, i) => {
      if (!j) return;
      const k = PETA_KOLOM[normalKunci(j)];
      if (k) { if (petaIndeks[k] === undefined) petaIndeks[k] = i; }
      else hasil.kolomTakDikenal.push(j);
    });
    KOLOM.filter(k => k.wajib).forEach(k => {
      if (petaIndeks[k.kunci] === undefined) hasil.kolomHilang.push(k.judul);
    });
    if (hasil.kolomHilang.length) {
      hasil.galatBerkas = 'Kolom wajib tidak ditemukan: ' + hasil.kolomHilang.join(', ')
                        + '. Pakai template yang disediakan, dan jangan mengubah baris judulnya.';
      return hasil;
    }

    // --- Isi
    for (let r = 1; r < aoa.length; r++) {
      const sel = aoa[r] || [];
      const ambil = (k) => petaIndeks[k] === undefined ? null : sel[petaIndeks[k]];

      const mentah = {};
      KOLOM.forEach(k => { mentah[k.kunci] = ambil(k.kunci); });

      // Baris kosong dilewati diam-diam — berkas Excel hampir selalu
      // punya baris kosong di bawah data.
      const adaIsi = KOLOM.some(k => teks(mentah[k.kunci]) !== '');
      if (!adaIsi) continue;

      const exp = bacaTanggal(mentah.tgl_expired);
      const msk = bacaTanggal(mentah.tgl_masuk);
      if (exp.ambigu || msk.ambigu) hasil.adaAmbigu = true;

      const b = {
        nomorBaris: r + 1,                       // nomor seperti terlihat di Excel
        kode_obat:  teks(mentah.kode_obat),
        nama_obat:  teks(mentah.nama_obat),
        satuan:     teks(mentah.satuan),
        jumlah:     bacaAngka(mentah.jumlah),
        harga_beli: bacaAngka(mentah.harga_beli),
        harga_jual: bacaAngka(mentah.harga_jual),
        tgl_expired: exp.tanggal,
        tgl_masuk:   msk.tanggal,
        tglAmbigu:   exp.ambigu || msk.ambigu,
        no_faktur:  teks(mentah.no_faktur),
        pbf:        teks(mentah.pbf),
        no_batch:   teks(mentah.no_batch),
        keterangan: teks(mentah.keterangan),
        galat: [], peringatan: []
      };

      const c = cocokkanObat(b, idx);
      b.obat = c.obat;
      b.caraCocok = c.cara;
      b.mirip = c.mirip;
      /* Obat baru hanya dibuat kalau apoteker mencentangnya di pratinjau.
         Bawaannya mati: menciptakan master data adalah keputusan, bukan
         efek samping dari mengunggah berkas. */
      b.buatObat = false;

      periksaBaris(b, o);
      hasil.baris.push(b);
    }

    if (!hasil.baris.length) hasil.galatBerkas = 'Tidak ada baris berisi data.';
    return hasil;
  }

  /* Pemeriksaan per baris. `galat` menghalangi impor; `peringatan` tidak. */
  function periksaBaris(b, opsi) {
    const o = opsi || {};
    const hariIni = o.hariIni || null;

    b.galat = []; b.peringatan = [];

    if (!b.nama_obat && !b.kode_obat) b.galat.push('Nama obat kosong.');

    if (b.jumlah === null)      b.galat.push('Jumlah kosong atau bukan angka.');
    else if (b.jumlah <= 0)     b.galat.push('Jumlah harus lebih dari nol.');
    else if (b.jumlah > 1e7)    b.galat.push('Jumlah tidak masuk akal (lebih dari 10 juta).');

    if (b.harga_beli === null)  b.galat.push('Harga beli kosong atau bukan angka.');
    else if (b.harga_beli < 0)  b.galat.push('Harga beli tidak boleh negatif.');
    else if (b.harga_beli === 0) b.peringatan.push('Harga beli nol — nilai aset obat ini jadi Rp 0.');

    if (!b.tgl_expired)         b.galat.push('Tanggal kadaluwarsa kosong atau tidak terbaca.');
    else if (hariIni && b.tgl_expired <= hariIni) {
      /* Bukan galat: stok kadaluwarsa memang kadang perlu dimasukkan saat
         saldo awal, justru supaya tercatat lalu dimusnahkan resmi. */
      b.peringatan.push('Sudah kadaluwarsa — tidak akan bisa dikeluarkan untuk pasien.');
    }
    if (teks(b.tgl_masuk) && b.tgl_masuk === null) {
      b.galat.push('Tanggal masuk tidak terbaca.');
    }
    if (!b.pbf) b.galat.push('PBF / distributor kosong.');

    if (!b.obat) {
      if (b.mirip && b.mirip.length) {
        b.peringatan.push('Belum ada di Master Data, tapi mirip dengan: '
          + b.mirip.map(m => `${m.obat.nama} (${Math.round(m.skor * 100)}%)`).join(', '));
      } else {
        b.peringatan.push('Belum ada di Master Data.');
      }
      if (!b.satuan) b.peringatan.push('Satuan kosong — obat baru akan dibuat dengan satuan "Tablet".');
    } else if (b.caraCocok === 'nama-rapat') {
      b.peringatan.push(`Dicocokkan dengan "${b.obat.nama}" (beda spasi saja).`);
    } else if (!b.obat.aktif) {
      b.peringatan.push('Obat ini ditandai nonaktif di Master Data.');
    }
    return b;
  }

  /* Status akhir satu baris, dipakai pratinjau untuk memberi warna. */
  function statusBaris(b) {
    if (b.galat.length) return 'galat';
    if (!b.obat) return b.buatObat ? 'obat-baru' : 'tertunda';
    return 'siap';
  }

  function ringkas(baris) {
    const r = { total: baris.length, siap: 0, galat: 0, obatBaru: 0, tertunda: 0, nilai: 0 };
    baris.forEach(b => {
      const s = statusBaris(b);
      if (s === 'galat') r.galat++;
      else if (s === 'tertunda') r.tertunda++;
      else {
        r.siap++;
        if (s === 'obat-baru') r.obatBaru++;
        r.nilai += (b.jumlah || 0) * (b.harga_beli || 0);
      }
    });
    r.bisaDiproses = r.siap > 0 && r.galat === 0 && r.tertunda === 0;
    return r;
  }

  /* Muatan untuk RPC apotek_impor(). Hanya baris yang benar-benar siap. */
  function keMuatan(baris) {
    return baris.filter(b => !b.galat.length && (b.obat || b.buatObat)).map(b => ({
      obat_id: b.obat ? b.obat.id : null,
      obat_baru: b.obat ? null : {
        nama: b.nama_obat,
        satuan: b.satuan || 'Tablet',
        kode_internal: b.kode_obat || null,
        harga: b.harga_jual === null ? 0 : b.harga_jual
      },
      jumlah: b.jumlah,
      harga_beli: b.harga_beli,
      tgl_expired: b.tgl_expired,
      tgl_masuk: b.tgl_masuk || null,
      no_faktur: b.no_faktur || null,
      pbf: b.pbf,
      no_batch: b.no_batch || null,
      keterangan: b.keterangan || null
    }));
  }

  /* ------------------------------------------------------------------
     LEMBAR TEMPLATE
     ------------------------------------------------------------------ */

  function lembarTemplate() {
    return [KOLOM.map(k => k.judul), KOLOM.map(k => k.contoh)];
  }

  function lembarPetunjuk(jenis) {
    const j = JENIS_IMPOR.find(x => x.kunci === jenis) || JENIS_IMPOR[0];
    return [
      ['CARA MENGISI'],
      [],
      ['1.', 'Isi lembar "Data" mulai baris ke-2. Baris ke-2 berisi contoh — hapus atau timpa.'],
      ['2.', 'Jangan mengubah, memindahkan, atau menghapus baris judul kolom.'],
      ['3.', 'Satu baris = satu batch. Obat yang sama dengan tanggal kadaluwarsa,'],
      ['',   'faktur, atau harga berbeda ditulis di baris terpisah.'],
      ['4.', 'Simpan sebagai .xlsx, lalu unggah lewat tombol Impor di halaman Apotek.'],
      ['5.', 'Semua baris diperiksa dulu dan ditampilkan sebagai pratinjau.'],
      ['',   'Tidak ada satu pun yang tersimpan sebelum Anda menekan Proses.'],
      [],
      ['JENIS IMPOR YANG DIPILIH'],
      [j.judul],
      [j.bantu],
      [],
      ['ARTI TIAP KOLOM'],
      [],
      ['Kolom', 'Wajib?', 'Penjelasan'],
      ...KOLOM.map(k => [k.judul, k.wajib ? 'WAJIB' : 'opsional', k.bantu]),
      [],
      ['CATATAN PENTING'],
      [],
      ['Tanggal', 'Tulis 2028-06-30 (tahun-bulan-tanggal). Bentuk 30/06/2028 juga diterima'],
      ['', 'dan dibaca hari-dulu, tapi hasil bacaannya akan ditampilkan di pratinjau'],
      ['', 'supaya Anda bisa memastikannya.'],
      ['Harga', 'Per satuan terkecil, bukan per box. Boleh ditulis 1.500 atau 1500.'],
      ['Obat baru', 'Baris yang obatnya belum ada di Master Data tidak langsung ditolak:'],
      ['', 'di pratinjau ada centang untuk membuatnya. Kalau ada nama yang mirip,'],
      ['', 'sistem menyebutkannya lebih dulu supaya tidak lahir obat kembar.']
    ];
  }

  /* ------------------------------------------------------------------
     LEMBAR EKSPOR

     Semua fungsi di bawah mengembalikan array-of-array siap diubah
     SheetJS menjadi lembar. Angka dibiarkan sebagai angka — bukan teks
     berformat "Rp 1.500" — supaya masih bisa dijumlahkan di Excel.
     ------------------------------------------------------------------ */

  const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                    'Juli','Agustus','September','Oktober','November','Desember'];
  const labelBulan = (ym) =>
    `${BULAN_ID[parseInt(String(ym).slice(5, 7), 10) - 1] || '?'} ${String(ym).slice(0, 4)}`;

  function lembarStokPerObat(stok) {
    return [
      ['Nama Obat', 'Satuan', 'Bentuk', 'Kekuatan', 'Stok Total', 'Stok Layak Pakai',
       'Jumlah Batch', 'Nilai Beli (Rp)', 'Harga Jual (Rp)', 'Kadaluwarsa Terdekat',
       'Batch Kadaluwarsa', 'Batch Segera Kadaluwarsa'],
      ...(stok || []).filter(s => Number(s.stok_total) > 0).map(s => [
        s.nama_obat, s.satuan, s.bentuk_sediaan || '', s.kekuatan || '',
        Number(s.stok_total), Number(s.stok_layak),
        Number(s.jumlah_batch), Number(s.nilai_total), Number(s.harga_jual || 0),
        s.expired_terdekat || '', Number(s.batch_kadaluwarsa), Number(s.batch_segera)
      ])
    ];
  }

  /* Judul kolomnya sengaja dibuat sama persis dengan template impor,
     supaya lembar ini bisa disimpan sebagai berkas tersendiri lalu
     diunggah kembali — misalnya saat memindahkan stok ke database lain
     atau memulihkan setelah kesalahan besar. */
  function lembarStokPerBatch(batch) {
    return [
      KOLOM.map(k => k.judul),
      ...(batch || []).filter(b => Number(b.stok_sisa) > 0).map(b => [
        b.kode_internal || '', b.nama_obat, b.satuan,
        Number(b.stok_sisa), Number(b.harga_beli), b.tgl_expired, b.tgl_masuk,
        b.no_faktur || '', b.pbf || '', b.no_batch || '',
        Number(b.harga_jual || 0),
        b.keterangan || ''
      ])
    ];
  }

  function lembarRingkasan(opsi) {
    const { stok, batch, ringkasStok, namaKlinik, tanggal } = opsi;
    const aktif = (batch || []).filter(b => Number(b.stok_sisa) > 0);

    const teratas = [...(stok || [])]
      .filter(s => Number(s.nilai_total) > 0)
      .sort((a, b) => b.nilai_total - a.nilai_total).slice(0, 10);
    const menipis = (stok || [])
      .filter(s => Number(s.stok_total) > 0 && Number(s.stok_total) < 10)
      .sort((a, b) => a.stok_total - b.stok_total);
    const bermasalah = aktif
      .filter(b => b.kadaluwarsa || b.segera_kadaluwarsa)
      .sort((a, b) => String(a.tgl_expired).localeCompare(String(b.tgl_expired)));

    const baris = [
      [namaKlinik || 'Klinik', 'Laporan Stok Apotek'],
      ['Dicetak', tanggal],
      [],
      ['RINGKASAN'],
      ['Nilai aset obat (harga beli)', ringkasStok.nilaiAset],
      ['Jenis obat yang ada stoknya', ringkasStok.jenisObat],
      ['Jumlah batch aktif', ringkasStok.jumlahBatch],
      ['Batch dengan sisa di bawah 10', ringkasStok.menipis],
      ['Batch sudah kadaluwarsa', ringkasStok.kadaluwarsa],
      ['Batch kadaluwarsa dalam 30 hari', ringkasStok.segera],
      [],
      ['10 OBAT DENGAN NILAI PERSEDIAAN TERBESAR'],
      ['Nama Obat', 'Stok', 'Satuan', 'Nilai Beli (Rp)']
    ];
    teratas.forEach(s => baris.push([s.nama_obat, Number(s.stok_total), s.satuan, Number(s.nilai_total)]));
    if (!teratas.length) baris.push(['(belum ada stok)']);

    baris.push([], ['PERLU DIPESAN — SISA DI BAWAH 10'],
                   ['Nama Obat', 'Sisa', 'Satuan', 'Kadaluwarsa Terdekat']);
    menipis.forEach(s => baris.push([s.nama_obat, Number(s.stok_total), s.satuan, s.expired_terdekat || '']));
    if (!menipis.length) baris.push(['(tidak ada)']);

    baris.push([], ['PERLU DIPERIKSA — KADALUWARSA ATAU HAMPIR'],
                   ['Nama Obat', 'Kadaluwarsa', 'Sisa Hari', 'Stok', 'PBF', 'No. Faktur']);
    bermasalah.forEach(b => baris.push([
      b.nama_obat, b.tgl_expired, Number(b.hari_ke_expired),
      Number(b.stok_sisa), b.pbf || '', b.no_faktur || ''
    ]));
    if (!bermasalah.length) baris.push(['(tidak ada)']);

    return baris;
  }

  function lembarRiwayat(transaksi) {
    return [
      ['Tanggal', 'Jenis', 'Kategori', 'Nama Obat', 'Satuan', 'Jumlah',
       'Harga Satuan (Rp)', 'Total Nilai (Rp)', 'No. Faktur', 'PBF',
       'Keterangan', 'Dibatalkan'],
      ...(transaksi || []).map(t => [
        t.tanggal, t.jenis, t.kategori, t.nama_obat, t.satuan,
        Number(t.jumlah), Number(t.harga_satuan), Number(t.total_nilai),
        t.no_faktur || '', t.pbf || '', t.keterangan || '',
        t.dibatalkan ? 'YA' : ''
      ])
    ];
  }

  /* Rekap 12 bulan. Saldo awal dipisahkan dari pembelian: memuat
     persediaan lama ke sistem bukan belanja bulan itu, dan kalau
     digabung, laporan bulan pertama tidak bisa dipakai untuk apa pun. */
  function lembarRekapBulanan(transaksi, bulanTerakhir, jumlahBulan) {
    const n = jumlahBulan || 12;
    const bulan = [];
    let [th, bl] = String(bulanTerakhir).split('-').map(Number);
    for (let i = 0; i < n; i++) {
      bulan.unshift(`${th}-${String(bl).padStart(2, '0')}`);
      bl--; if (bl < 1) { bl = 12; th--; }
    }

    const kat = ['Resep Pasien', 'Penjualan Bebas', 'Obat Expired', 'Obat Rusak',
                 'Retur ke PBF', 'Penyesuaian Stok', 'Lainnya'];
    const baris = [['Bulan', 'Pembelian (Rp)', 'Saldo Awal (Rp)',
                    ...kat.map(k => k + ' (Rp)'), 'Total Keluar (Rp)']];

    bulan.forEach(ym => {
      const t = (transaksi || []).filter(x =>
        !x.dibatalkan && String(x.tanggal).slice(0, 7) === ym);
      const jum = (f) => t.filter(f).reduce((s, x) => s + Number(x.total_nilai || 0), 0);
      const keluar = t.filter(x => x.jenis === 'KELUAR');
      baris.push([
        labelBulan(ym),
        jum(x => x.jenis === 'MASUK' && x.kategori !== 'Saldo Awal'),
        jum(x => x.jenis === 'MASUK' && x.kategori === 'Saldo Awal'),
        ...kat.map(k => jum(x => x.jenis === 'KELUAR' && x.kategori === k)),
        keluar.reduce((s, x) => s + Number(x.total_nilai || 0), 0)
      ]);
    });
    return baris;
  }

  function lembarKartuStok(kartu) {
    const kat = ['Resep Pasien', 'Penjualan Bebas', 'Obat Expired', 'Obat Rusak',
                 'Retur ke PBF', 'Penyesuaian Stok', 'Lainnya'];
    return [
      ['Kartu Stok', kartu.nama],
      ['Bulan', labelBulan(kartu.bulan)],
      ['Satuan', kartu.satuan || ''],
      ['Saldo awal', Number(kartu.saldoAwal)],
      [],
      ['Tanggal', 'Masuk', 'Keluar', ...kat, 'Saldo'],
      ...(kartu.baris || []).map(b => [
        b.tanggal, Number(b.masukQty), Number(b.keluarQty),
        ...kat.map(k => Number((b.perKat[k] || {}).qty || 0)),
        Number(b.saldo)
      ]),
      ['Jumlah', Number(kartu.total.masukQty), Number(kartu.total.keluarQty),
       ...kat.map(k => Number((kartu.total.perKat[k] || {}).qty || 0)),
       Number(kartu.saldoAkhir)]
    ];
  }

  /* Lebar kolom yang enak dibaca, ditaksir dari isi terpanjang tiap
     kolom. Tanpa ini setiap lembar ekspor perlu dilebarkan manual dulu
     sebelum bisa dibaca. */
  function lebarKolom(aoa, maks) {
    const batas = maks || 46;
    const lebar = [];
    (aoa || []).forEach(baris => {
      (baris || []).forEach((sel, i) => {
        const p = String(sel === null || sel === undefined ? '' : sel).length;
        if (!lebar[i] || p > lebar[i]) lebar[i] = p;
      });
    });
    return lebar.map(w => ({ wch: Math.min(Math.max((w || 4) + 2, 9), batas) }));
  }

  const API = {
    KOLOM, JENIS_IMPOR, AMBANG_MIRIP,
    normalKunci, bacaTanggal, bacaAngka, kemiripan,
    indeksObat, cocokkanObat, bacaLembar, periksaBaris, statusBaris, ringkas, keMuatan,
    lembarTemplate, lembarPetunjuk,
    lembarStokPerObat, lembarStokPerBatch, lembarRingkasan, lembarRiwayat,
    lembarRekapBulanan, lembarKartuStok, lebarKolom, labelBulan
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

/* =====================================================================
   SURAT CORE — seluruh aturan surat-menyurat klinik, sebagai fungsi murni.

   Berkas ini tidak menyentuh DOM, tidak memanggil Supabase, dan tidak
   membaca jam sistem kecuali lewat parameter. Karena itu seluruh isinya
   bisa diuji dengan `node test/uji_surat_core.js` tanpa peramban dan
   tanpa database.

   Tiga hal yang ditentukan di sini:

     1. BENTUK NOMOR SURAT — dicerminkan dari public.format_no_surat()
        di sql/13_surat.sql. Database tetap yang berwenang; salinan di
        sini hanya supaya pratinjau nomor muncul sambil pengguna
        mengetik. test/uji_surat_core.js dan test/uji_surat.sql sengaja
        memakai contoh yang sama persis supaya keduanya tidak bisa
        berselisih diam-diam.

     2. BENTUK FORMULIR tiap jenis surat (`isian`). Halaman Surat
        menggambar formulirnya dari daftar ini, bukan dari HTML yang
        ditulis satu per satu. Menambah satu pertanyaan pada surat
        rujukan berarti menambah satu baris di sini — tanpa menyentuh
        halaman, tanpa migrasi SQL, dan pratinjau serta PDF-nya ikut
        berubah dengan sendirinya.

     3. MODEL DOKUMEN (`dokumen()`), yaitu daftar blok yang menggambarkan
        isi lembar surat tanpa menyebut HTML maupun PDF sama sekali.
        js/surat_cetak.js menyajikannya dua kali: sekali sebagai halaman
        cetak, sekali sebagai berkas PDF. Satu sumber, dua keluaran —
        supaya yang tampil di layar dan yang terunduh tidak pernah
        berbeda isi.
   ===================================================================== */
const SuratCore = (() => {
  'use strict';

  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const ROMAWI = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

  /* ================================================================== */
  /*  1. TANGGAL                                                        */
  /* ================================================================== */
  /* Semua tanggal di modul ini berbentuk 'YYYY-MM-DD' dan diurai dengan
     tangan, bukan lewat new Date(teks). new Date('2026-09-03') diurai
     sebagai tengah malam UTC; di WITA (UTC+8) getDate() atasnya
     memulangkan tanggal yang sama, tetapi di zona barat ia memulangkan
     tanggal SEBELUMNYA. Surat keterangan sakit yang tanggalnya meleset
     sehari adalah surat yang salah. */
  function urai(iso) {
    if (!iso) return null;
    const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const th = +m[1], bl = +m[2], hr = +m[3];
    if (bl < 1 || bl > 12 || hr < 1 || hr > 31) return null;
    return { tahun: th, bulan: bl, hari: hr };
  }

  function tglIndo(iso, denganHari = false) {
    const d = urai(iso);
    if (!d) return '-';
    const teks = `${d.hari} ${BULAN[d.bulan - 1]} ${d.tahun}`;
    if (!denganHari) return teks;
    const hariNama = HARI[new Date(d.tahun, d.bulan - 1, d.hari).getDay()];
    return `${hariNama}, ${teks}`;
  }

  function namaHari(iso) {
    const d = urai(iso);
    if (!d) return '';
    return HARI[new Date(d.tahun, d.bulan - 1, d.hari).getDay()];
  }

  /* Menambah hari pada tanggal ISO, tetap di zona lokal. */
  function tambahHari(iso, n) {
    const d = urai(iso);
    if (!d) return null;
    const t = new Date(d.tahun, d.bulan - 1, d.hari + Number(n || 0));
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}` +
           `-${String(t.getDate()).padStart(2, '0')}`;
  }

  /* Tanggal terakhir istirahat, dihitung INKLUSIF: istirahat 1 hari
     mulai tanggal 3 berakhir tanggal 3, bukan tanggal 4. Kekeliruan
     satu hari di sini menghasilkan surat yang menyatakan pasien libur
     sehari lebih lama daripada yang dokter maksud. */
  const akhirIstirahat = (mulai, lama) => tambahHari(mulai, Math.max(1, Number(lama) || 1) - 1);

  function umurTahun(tglLahir, padaTanggal) {
    const l = urai(tglLahir), n = urai(padaTanggal);
    if (!l || !n) return null;
    let th = n.tahun - l.tahun;
    if (n.bulan < l.bulan || (n.bulan === l.bulan && n.hari < l.hari)) th--;
    return th < 0 ? null : th;
  }

  /* ================================================================== */
  /*  2. TERBILANG                                                      */
  /* ================================================================== */
  /* Surat resmi menulis lama istirahat dua kali: dengan huruf dan dengan
     angka — "3 (tiga) hari". Bukan hiasan: angka tunggal pada lembar
     cetak gampang diubah dengan pulpen, huruf tidak. */
  const SATUAN = ['nol','satu','dua','tiga','empat','lima','enam','tujuh',
                  'delapan','sembilan','sepuluh','sebelas'];

  function terbilang(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n < 12) return SATUAN[n];
    if (n < 20) return terbilang(n - 10) + ' belas';
    if (n < 100) {
      const sisa = n % 10;
      return terbilang(Math.floor(n / 10)) + ' puluh' + (sisa ? ' ' + terbilang(sisa) : '');
    }
    if (n < 200) return 'seratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
    if (n < 1000) {
      const sisa = n % 100;
      return terbilang(Math.floor(n / 100)) + ' ratus' + (sisa ? ' ' + terbilang(sisa) : '');
    }
    if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
    const sisa = n % 1000;
    return terbilang(Math.floor(n / 1000)) + ' ribu' + (sisa ? ' ' + terbilang(sisa) : '');
  }

  /* "3 (tiga) hari" */
  const angkaHuruf = (n, satuan = '') =>
    `${Number(n)} (${terbilang(n)})${satuan ? ' ' + satuan : ''}`;

  /* ================================================================== */
  /*  3. NOMOR SURAT                                                    */
  /* ================================================================== */
  const bulanRomawi = (b) => ROMAWI[Number(b) - 1] || '?';

  /* Cerminan dari public.format_no_surat() di sql/13_surat.sql.
     XX/JENIS/YAKIM/ROMAWI/TAHUN — nomor urut minimal dua digit. */
  function formatNomor(nomorUrut, jenisKode, bulan, tahun) {
    const n = String(Math.max(0, Math.floor(Number(nomorUrut) || 0))).padStart(2, '0');
    return `${n}/${jenisKode}/YAKIM/${bulanRomawi(bulan)}/${tahun}`;
  }

  /* Bulan & tahun nomor surat mengikuti TANGGAL SURAT, bukan tanggal
     hari ini. Surat yang dibuat 2 Oktober untuk melengkapi agenda bulan
     September tetap bernomor .../IX/2026. */
  function bagianNomor(tanggalSurat) {
    const d = urai(tanggalSurat);
    if (!d) return { bulan: null, tahun: null };
    return { bulan: d.bulan, tahun: d.tahun };
  }

  /* ================================================================== */
  /*  4. BANTUAN ISI                                                    */
  /* ================================================================== */
  const bersih = (v) => (v === null || v === undefined) ? '' : String(v).trim();
  const ada = (v) => bersih(v) !== '';
  const kelamin = (jk) => jk === 'L' ? 'Laki-laki' : jk === 'P' ? 'Perempuan' : '-';

  function alamatPasien(p) {
    if (!p) return '';
    const bagian = [
      bersih(p.alamat),
      (ada(p.rt) || ada(p.rw)) ? `RT ${bersih(p.rt) || '-'}/RW ${bersih(p.rw) || '-'}` : '',
      ada(p.kelurahan) ? 'Kel. ' + bersih(p.kelurahan) : '',
      ada(p.kecamatan) ? 'Kec. ' + bersih(p.kecamatan) : '',
      bersih(p.kabupaten)
    ].filter(Boolean);
    return bagian.join(', ');
  }

  /* Baris identitas yang muncul di hampir semua surat. */
  function identitasPasien(ctx, opsi = {}) {
    const p = ctx.pasien || {};
    const tglAcuan = opsi.pada || ctx.tanggalSurat;
    const umur = umurTahun(p.tanggal_lahir, tglAcuan);
    const baris = [
      ['Nama', bersih(p.nama) || '-'],
      ['Tempat, tanggal lahir',
        [bersih(p.tempat_lahir), tglIndo(p.tanggal_lahir)].filter(x => x && x !== '-').join(', ') || '-'],
      ['Umur', umur === null ? '-' : `${umur} tahun`],
      ['Jenis kelamin', kelamin(p.jenis_kelamin)]
    ];
    if (opsi.pekerjaan !== false && ada(p.pekerjaan)) baris.push(['Pekerjaan', bersih(p.pekerjaan)]);
    if (opsi.nik && ada(p.nik)) baris.push(['NIK', bersih(p.nik)]);
    if (opsi.bpjs && ada(p.no_bpjs)) baris.push(['No. Kartu BPJS', bersih(p.no_bpjs)]);
    baris.push(['Alamat', alamatPasien(p) || '-']);
    baris.push(['No. Rekam Medis', bersih(p.no_rm) || '-']);
    return baris;
  }

  const PEMBUKA = 'Yang bertanda tangan di bawah ini, dokter pada {KLINIK}, ' +
                  'menerangkan bahwa:';
  const PENUTUP = 'Demikian surat keterangan ini dibuat dengan sebenarnya, ' +
                  'untuk dipergunakan sebagaimana mestinya.';

  const pembuka = (ctx) =>
    PEMBUKA.replace('{KLINIK}', bersih(ctx.faskes && ctx.faskes.nama) || 'Klinik Pratama Imanuel');

  /* Diagnosa kunjungan sebagai teks, primer lebih dulu. */
  function teksDiagnosa(ctx, denganKode = true) {
    const d = (ctx.diagnosa || []).slice().sort(
      (a, b) => (a.jenis === 'PRIMER' ? 0 : 1) - (b.jenis === 'PRIMER' ? 0 : 1));
    if (!d.length) return '';
    return d.map(x => bersih(x.nama) + (denganKode && ada(x.kode_icd10)
      ? ` (${bersih(x.kode_icd10)})` : '')).join('; ');
  }

  function teksTerapi(ctx) {
    const r = ctx.resep && ctx.resep.item ? ctx.resep.item : [];
    return r.map(i => {
      const nama = bersih(i.nama_obat || i.nama);
      const jml = i.jumlah ? ` ${i.jumlah}${i.satuan ? ' ' + i.satuan : ''}` : '';
      const signa = ada(i.signa) ? ` — ${bersih(i.signa)}` : '';
      return nama + jml + signa;
    }).filter(Boolean);
  }

  function teksTindakan(ctx) {
    return (ctx.tindakan || []).map(t => {
      const nama = bersih(t.nama);
      const kode = ada(t.kode_icd9 || t.kode) ? ` (${bersih(t.kode_icd9 || t.kode)})` : '';
      const gigi = ada(t.fdi) ? ` — gigi ${bersih(t.fdi)}` : '';
      return nama + kode + gigi;
    }).filter(Boolean);
  }

  /* Tanda vital dari kajian awal, sebagai pasangan label-nilai. */
  function vitalKajian(ka) {
    if (!ka) return [];
    const b = [];
    if (ka.sistolik && ka.diastolik) b.push(['Tekanan darah', `${ka.sistolik}/${ka.diastolik} mmHg`]);
    if (ka.nadi)  b.push(['Nadi', `${ka.nadi} x/menit`]);
    if (ka.nafas) b.push(['Pernapasan', `${ka.nafas} x/menit`]);
    if (ka.suhu)  b.push(['Suhu', `${ka.suhu} °C`]);
    if (ka.berat_badan)  b.push(['Berat badan', `${ka.berat_badan} kg`]);
    if (ka.tinggi_badan) b.push(['Tinggi badan', `${ka.tinggi_badan} cm`]);
    return b;
  }

  /* ================================================================== */
  /*  5. JENIS SURAT                                                    */
  /* ================================================================== */
  /*  Tiap jenis punya empat bagian:
        isian      — pertanyaan pada formulir (halaman menggambarnya)
        awal(ctx)  — nilai bawaan, diambil dari kunjungan yang berjalan
        periksa(d) — daftar pesan kesalahan; kosong berarti boleh simpan
        blok(d,ctx)— isi lembar surat sebagai daftar blok
      Semuanya murni: masuknya data, keluarnya data.                    */

  const BUTA_WARNA = ['Tidak diperiksa', 'Normal (tidak buta warna)',
                      'Buta warna parsial', 'Buta warna total'];

  const ALASAN_RUJUK = [
    'Kompetensi — kasus di luar kewenangan FKTP',
    'Time — perjalanan penyakit memerlukan penanganan lanjutan',
    'Age — usia pasien memerlukan penanganan spesialistik',
    'Complication — terdapat penyulit',
    'Comorbidity — terdapat penyakit penyerta',
    'Fasilitas — sarana/prasarana tidak tersedia di FKTP',
    'Atas permintaan pasien / keluarga'
  ];

  const JENIS = {

    /* ---------------------------------------------------------------- */
    SKS: {
      kode: 'SKS',
      nama: 'Surat Keterangan Sakit',
      judul: 'SURAT KETERANGAN SAKIT',
      keterangan: 'Keterangan istirahat karena sakit, untuk tempat kerja atau sekolah.',
      perluKunjungan: true,
      isian: [
        { nama: 'mulai', label: 'Istirahat mulai tanggal', tipe: 'tanggal', wajib: true, kolom: 6 },
        { nama: 'lama', label: 'Lama istirahat (hari)', tipe: 'angka', wajib: true,
          min: 1, max: 30, kolom: 6,
          bantuan: 'Dihitung inklusif: 1 hari berarti hari itu juga.' },
        { nama: 'keperluan', label: 'Untuk keperluan', tipe: 'teks', kolom: 12,
          saran: ['Keperluan tempat bekerja', 'Keperluan sekolah', 'Keperluan kuliah'],
          bantuan: 'Boleh dikosongkan.' },
        { nama: 'cantumkan_diagnosa', label: 'Cantumkan diagnosa pada surat', tipe: 'centang',
          bantuan: 'Bawaannya tidak dicantumkan. Diagnosa adalah rahasia medis yang ' +
                   'tidak perlu diketahui atasan atau sekolah pasien. Nyalakan hanya ' +
                   'bila pasien memintanya atau instansinya memang mensyaratkan.' },
        { nama: 'diagnosa_teks', label: 'Diagnosa yang dicantumkan', tipe: 'teks',
          tampilJika: 'cantumkan_diagnosa', kolom: 12 },
        { nama: 'catatan', label: 'Keterangan tambahan', tipe: 'panjang', baris: 2, kolom: 12 }
      ],
      awal(ctx) {
        return {
          mulai: (ctx.kunjungan && ctx.kunjungan.tanggal) || ctx.tanggalSurat,
          lama: 1,
          cantumkan_diagnosa: false,
          diagnosa_teks: teksDiagnosa(ctx, false),
          keperluan: ''
        };
      },
      periksa(d) {
        const p = [];
        if (!urai(d.mulai)) p.push('Tanggal mulai istirahat belum diisi.');
        const lama = Number(d.lama);
        if (!lama || lama < 1) p.push('Lama istirahat minimal 1 hari.');
        else if (lama > 30) p.push('Lama istirahat lebih dari 30 hari — periksa kembali. ' +
                                   'Istirahat sepanjang itu biasanya urusan dokter spesialis.');
        if (d.cantumkan_diagnosa && !ada(d.diagnosa_teks))
          p.push('Diagnosa dipilih untuk dicantumkan, tetapi isiannya kosong.');
        return p;
      },
      waspada(d) {
        const p = [];
        const lama = Number(d.lama);
        if (lama >= 8 && lama <= 30)
          p.push(`Istirahat ${lama} hari cukup panjang untuk klinik pratama. ` +
                 'Pastikan itu memang yang dimaksud sebelum surat dicetak.');
        return p;
      },
      blok(d, ctx) {
        const lama = Math.max(1, Number(d.lama) || 1);
        const sampai = akhirIstirahat(d.mulai, lama);
        const b = [
          { t: 'paragraf', teks: pembuka(ctx) },
          { t: 'identitas', baris: identitasPasien(ctx) },
          { t: 'paragraf', teks:
            `Berdasarkan hasil pemeriksaan pada tanggal ` +
            `${tglIndo((ctx.kunjungan && ctx.kunjungan.tanggal) || ctx.tanggalSurat)}, ` +
            `yang bersangkutan dinyatakan perlu beristirahat selama ` +
            `${angkaHuruf(lama, 'hari')}, terhitung mulai tanggal ` +
            `${tglIndo(d.mulai)} sampai dengan tanggal ${tglIndo(sampai)}.` }
        ];
        if (d.cantumkan_diagnosa && ada(d.diagnosa_teks))
          b.push({ t: 'identitas', baris: [['Diagnosa', bersih(d.diagnosa_teks)]] });
        if (ada(d.catatan)) b.push({ t: 'paragraf', teks: bersih(d.catatan) });
        b.push({ t: 'paragraf', teks: ada(d.keperluan)
          ? `Surat keterangan ini dibuat untuk ${bersih(d.keperluan).toLowerCase()}. ` + PENUTUP
          : PENUTUP });
        return b;
      }
    },

    /* ---------------------------------------------------------------- */
    SR: {
      kode: 'SR',
      nama: 'Surat Rujukan',
      judul: 'SURAT RUJUKAN',
      keterangan: 'Rujukan ke fasilitas kesehatan tingkat lanjut, bentuk mengikuti rujukan BPJS.',
      perluKunjungan: true,
      catatanLayar:
        'Untuk pasien BPJS, rujukan tetap harus dimasukkan ke aplikasi PCare agar ' +
        'sah dan terbaca di rumah sakit. Lembar ini adalah cetakan untuk dibawa ' +
        'pasien, bukan pengganti entri PCare. Bridging PCare belum aktif di RME ini.',
      isian: [
        { nama: 'faskes_tujuan', label: 'Dirujuk ke (nama RS / faskes)', tipe: 'teks',
          wajib: true, kolom: 8 },
        { nama: 'kota_tujuan', label: 'Di kota', tipe: 'teks', kolom: 4 },
        { nama: 'poli_tujuan', label: 'Poli / spesialis tujuan', tipe: 'teks', wajib: true, kolom: 6,
          saran: ['Penyakit Dalam', 'Bedah', 'Anak', 'Obstetri & Ginekologi', 'Mata',
                  'THT-KL', 'Saraf', 'Jantung & Pembuluh Darah', 'Kulit & Kelamin',
                  'Paru', 'Gigi & Mulut', 'Ortopedi', 'Urologi', 'Jiwa', 'Rehabilitasi Medik'] },
        { nama: 'jenis_rujukan', label: 'Jenis rujukan', tipe: 'pilih', kolom: 6,
          opsi: ['Rujukan vertikal (FKTP ke FKRTL)', 'Rujukan parsial (pemeriksaan penunjang)',
                 'Rujukan horizontal (antar FKTP)', 'Rujuk balik'] },
        { nama: 'no_rujukan_pcare', label: 'Nomor rujukan PCare', tipe: 'teks', kolom: 6,
          bantuan: 'Isi bila rujukan sudah dientri di aplikasi PCare. Boleh dikosongkan.' },
        { nama: 'berlaku_sampai', label: 'Rujukan berlaku sampai', tipe: 'tanggal', kolom: 6,
          bantuan: 'Masa berlaku mengikuti ketentuan BPJS yang berlaku. Bawaan 90 hari; ' +
                   'sesuaikan bila ketentuannya berbeda.' },
        { nama: 'diagnosa_teks', label: 'Diagnosa kerja', tipe: 'teks', wajib: true, kolom: 12 },
        { nama: 'anamnesa', label: 'Anamnesa', tipe: 'panjang', baris: 3, kolom: 12 },
        { nama: 'pemeriksaan', label: 'Pemeriksaan fisik & penunjang', tipe: 'panjang',
          baris: 3, kolom: 12 },
        { nama: 'terapi', label: 'Terapi / tindakan yang telah diberikan', tipe: 'panjang',
          baris: 3, kolom: 12 },
        { nama: 'alasan', label: 'Alasan rujukan', tipe: 'pilih', kolom: 12, opsi: ALASAN_RUJUK,
          bantuan: 'BPJS menilai kelayakan rujukan non-spesialistik dari alasan ini (TACC).' },
        { nama: 'catatan', label: 'Catatan untuk dokter penerima', tipe: 'panjang',
          baris: 2, kolom: 12 }
      ],
      awal(ctx) {
        const pm = ctx.pemeriksaan || {};
        const ka = ctx.kajian || {};
        const fisik = vitalKajian(ka).map(([k, v]) => `${k} ${v}`).join('; ');
        return {
          faskes_tujuan: bersih(pm.rujuk_ke_faskes),
          poli_tujuan: bersih(pm.rujuk_spesialis),
          kota_tujuan: bersih(ctx.pengaturan && ctx.pengaturan.kota) || '',
          jenis_rujukan: 'Rujukan vertikal (FKTP ke FKRTL)',
          berlaku_sampai: tambahHari(ctx.tanggalSurat, 90),
          diagnosa_teks: teksDiagnosa(ctx, true),
          anamnesa: [bersih(ka.keluhan_utama), bersih(pm.subjective)].filter(Boolean).join('. '),
          pemeriksaan: [fisik, bersih(pm.objective)].filter(Boolean).join('. '),
          terapi: [teksTindakan(ctx).join('; '), teksTerapi(ctx).join('; '),
                   bersih(pm.terapi_non_obat)].filter(Boolean).join('. '),
          alasan: bersih(pm.rujuk_alasan) || ALASAN_RUJUK[0],
          catatan: ''
        };
      },
      periksa(d) {
        const p = [];
        if (!ada(d.faskes_tujuan)) p.push('Faskes tujuan belum diisi.');
        if (!ada(d.poli_tujuan)) p.push('Poli atau spesialis tujuan belum diisi.');
        if (!ada(d.diagnosa_teks)) p.push('Diagnosa kerja belum diisi.');
        if (!ada(d.anamnesa) && !ada(d.pemeriksaan))
          p.push('Anamnesa dan pemeriksaan dua-duanya kosong. ' +
                 'Rujukan tanpa keduanya akan dikembalikan rumah sakit.');
        return p;
      },
      waspada(d, ctx) {
        const p = [];
        const bpjs = ctx && ctx.kunjungan && ctx.kunjungan.cara_bayar === 'BPJS';
        if (bpjs && !ada(d.no_rujukan_pcare))
          p.push('Kunjungan ini penjaminnya BPJS dan nomor rujukan PCare belum diisi. ' +
                 'Lembar ini tetap boleh dicetak untuk dibawa pasien, tetapi rujukannya ' +
                 'baru sah setelah dientri di aplikasi PCare.');
        const p2 = ctx && ctx.pasien;
        if (bpjs && p2 && !ada(p2.no_bpjs))
          p.push('Nomor kartu BPJS pasien belum terisi di data pasien. ' +
                 'Rumah sakit hampir pasti menanyakannya.');
        return p;
      },
      blok(d, ctx) {
        const b = [
          { t: 'alamat', kepada: bersih(d.faskes_tujuan),
            di: bersih(d.kota_tujuan), poli: bersih(d.poli_tujuan) },
          { t: 'paragraf', teks:
            'Dengan hormat, bersama ini kami mohon pemeriksaan dan penanganan lebih ' +
            'lanjut atas pasien berikut:' },
          { t: 'identitas', baris: identitasPasien(ctx, { nik: true, bpjs: true }) },
          { t: 'seksi', teks: 'Keterangan Klinis' },
          { t: 'identitas', baris: [
            ['Diagnosa kerja', bersih(d.diagnosa_teks) || '-'],
            ['Anamnesa', bersih(d.anamnesa) || '-'],
            ['Pemeriksaan', bersih(d.pemeriksaan) || '-'],
            ['Terapi yang diberikan', bersih(d.terapi) || '-'],
            ['Alasan rujukan', bersih(d.alasan) || '-']
          ].concat(ada(d.catatan) ? [['Catatan', bersih(d.catatan)]] : []) },
          { t: 'seksi', teks: 'Keterangan Rujukan' },
          { t: 'identitas', baris: [
            ['Jenis rujukan', bersih(d.jenis_rujukan) || '-'],
            ['Penjamin', bersih(ctx.kunjungan && ctx.kunjungan.cara_bayar) || '-']
          ].concat(ada(d.no_rujukan_pcare) ? [['No. rujukan PCare', bersih(d.no_rujukan_pcare)]] : [])
           .concat(urai(d.berlaku_sampai) ? [['Berlaku sampai', tglIndo(d.berlaku_sampai)]] : []) },
          { t: 'paragraf', teks:
            'Atas perhatian dan kerja sama yang baik, kami ucapkan terima kasih.' }
        ];
        return b;
      }
    },

    /* ---------------------------------------------------------------- */
    SK: {
      kode: 'SK',
      nama: 'Surat Kontrol',
      judul: 'SURAT KONTROL',
      keterangan: 'Anjuran kontrol ulang pada tanggal tertentu.',
      perluKunjungan: true,
      isian: [
        { nama: 'tanggal_kontrol', label: 'Tanggal kontrol', tipe: 'tanggal', wajib: true, kolom: 6 },
        { nama: 'poli_kontrol', label: 'Kontrol di poli', tipe: 'teks', kolom: 6 },
        { nama: 'dokter_kontrol', label: 'Kepada dokter', tipe: 'teks', kolom: 6,
          bantuan: 'Boleh dikosongkan bila tidak dijadwalkan ke dokter tertentu.' },
        { nama: 'diagnosa_teks', label: 'Diagnosa / keperluan kontrol', tipe: 'teks', kolom: 6 },
        { nama: 'persiapan', label: 'Persiapan sebelum kontrol', tipe: 'panjang', baris: 2,
          kolom: 12, bantuan: 'Contoh: puasa 10 jam, bawa hasil lab sebelumnya, bawa obat yang sedang diminum.' },
        { nama: 'catatan', label: 'Keterangan tambahan', tipe: 'panjang', baris: 2, kolom: 12 }
      ],
      awal(ctx) {
        const pm = ctx.pemeriksaan || {};
        return {
          tanggal_kontrol: pm.tanggal_kontrol || tambahHari(ctx.tanggalSurat, 7),
          poli_kontrol: bersih(ctx.kunjungan && ctx.kunjungan.poli && ctx.kunjungan.poli.nama),
          dokter_kontrol: bersih(ctx.dokter && ctx.dokter.nama),
          diagnosa_teks: teksDiagnosa(ctx, false),
          persiapan: ''
        };
      },
      periksa(d) {
        const p = [];
        if (!urai(d.tanggal_kontrol)) p.push('Tanggal kontrol belum diisi.');
        return p;
      },
      waspada(d, ctx) {
        const p = [];
        const t = ctx && ctx.tanggalSurat;
        if (urai(d.tanggal_kontrol) && urai(t) && String(d.tanggal_kontrol) < String(t))
          p.push('Tanggal kontrol lebih awal daripada tanggal surat. ' +
                 'Periksa kembali sebelum dicetak.');
        return p;
      },
      blok(d, ctx) {
        const b = [
          { t: 'paragraf', teks: pembuka(ctx) },
          { t: 'identitas', baris: identitasPasien(ctx) },
          { t: 'paragraf', teks:
            `Telah mendapat pelayanan di ` +
            `${bersih(ctx.faskes && ctx.faskes.nama) || 'klinik ini'} pada tanggal ` +
            `${tglIndo((ctx.kunjungan && ctx.kunjungan.tanggal) || ctx.tanggalSurat)}` +
            (ada(d.diagnosa_teks) ? ` dengan ${bersih(d.diagnosa_teks)}` : '') +
            `, dan dianjurkan untuk kontrol ulang pada:` },
          { t: 'identitas', baris: [
            ['Hari, tanggal', `${namaHari(d.tanggal_kontrol)}, ${tglIndo(d.tanggal_kontrol)}`],
            ['Tempat', bersih(d.poli_kontrol) || bersih(ctx.faskes && ctx.faskes.nama) || '-']
          ].concat(ada(d.dokter_kontrol) ? [['Kepada', bersih(d.dokter_kontrol)]] : [])
           .concat(ada(d.persiapan) ? [['Persiapan', bersih(d.persiapan)]] : []) }
        ];
        if (ada(d.catatan)) b.push({ t: 'paragraf', teks: bersih(d.catatan) });
        b.push({ t: 'paragraf', teks:
          'Mohon surat ini dibawa saat kontrol. ' + PENUTUP });
        return b;
      }
    },

    /* ---------------------------------------------------------------- */
    SKBS: {
      kode: 'SKBS',
      nama: 'Surat Keterangan Berbadan Sehat',
      judul: 'SURAT KETERANGAN BERBADAN SEHAT',
      keterangan: 'Hasil pemeriksaan kesehatan untuk melamar kerja, sekolah, atau keperluan lain.',
      perluKunjungan: true,
      isian: [
        { nama: 'keperluan', label: 'Untuk keperluan', tipe: 'teks', wajib: true, kolom: 12,
          saran: ['Melamar pekerjaan', 'Melanjutkan pendidikan', 'Pendaftaran sekolah',
                  'Persyaratan CPNS', 'Perpanjangan SIM', 'Mengikuti kegiatan olahraga',
                  'Persyaratan administrasi'] },
        { nama: 'tinggi_badan', label: 'Tinggi badan (cm)', tipe: 'angka', kolom: 3, langkah: '0.1' },
        { nama: 'berat_badan', label: 'Berat badan (kg)', tipe: 'angka', kolom: 3, langkah: '0.1' },
        { nama: 'tekanan_darah', label: 'Tekanan darah (mmHg)', tipe: 'teks', kolom: 3 },
        { nama: 'nadi', label: 'Nadi (x/menit)', tipe: 'angka', kolom: 3 },
        { nama: 'nafas', label: 'Pernapasan (x/menit)', tipe: 'angka', kolom: 3 },
        { nama: 'suhu', label: 'Suhu (°C)', tipe: 'angka', kolom: 3, langkah: '0.1' },
        { nama: 'gol_darah', label: 'Golongan darah', tipe: 'pilih', kolom: 3,
          opsi: ['', 'A', 'B', 'AB', 'O'] },
        { nama: 'buta_warna', label: 'Pemeriksaan buta warna', tipe: 'pilih', kolom: 3,
          opsi: BUTA_WARNA,
          bantuan: 'Jangan diisi "Normal" bila tes Ishihara tidak benar-benar dikerjakan.' },
        { nama: 'kesimpulan', label: 'Kesimpulan', tipe: 'pilih', wajib: true, kolom: 12,
          opsi: ['SEHAT — tidak ditemukan kelainan yang bermakna',
                 'SEHAT DENGAN CATATAN — lihat keterangan di bawah',
                 'TIDAK SEHAT — belum memenuhi syarat untuk keperluan tersebut'] },
        { nama: 'catatan', label: 'Keterangan / catatan pemeriksaan', tipe: 'panjang',
          baris: 2, kolom: 12 }
      ],
      awal(ctx) {
        const ka = ctx.kajian || {};
        const p = ctx.pasien || {};
        return {
          keperluan: '',
          tinggi_badan: ka.tinggi_badan || null,
          berat_badan: ka.berat_badan || null,
          tekanan_darah: (ka.sistolik && ka.diastolik) ? `${ka.sistolik}/${ka.diastolik}` : '',
          nadi: ka.nadi || null,
          nafas: ka.nafas || null,
          suhu: ka.suhu || null,
          gol_darah: bersih(p.gol_darah),
          buta_warna: BUTA_WARNA[0],
          kesimpulan: 'SEHAT — tidak ditemukan kelainan yang bermakna'
        };
      },
      periksa(d) {
        const p = [];
        if (!ada(d.keperluan)) p.push('Keperluan surat belum diisi.');
        if (!ada(d.kesimpulan)) p.push('Kesimpulan pemeriksaan belum dipilih.');
        const adaVital = ['tinggi_badan', 'berat_badan', 'tekanan_darah', 'nadi', 'suhu']
          .some(k => ada(d[k]));
        if (!adaVital) p.push('Belum ada satu pun hasil pemeriksaan yang diisi. ' +
                              'Surat keterangan sehat tanpa angka pemeriksaan tidak ada artinya.');
        return p;
      },
      /* Peringatan, bukan penolakan: dokter tetap yang memutuskan.
         Tetapi menerbitkan "berbadan sehat" sementara angka yang tercetak
         pada surat yang sama menunjukkan demam atau tekanan darah tinggi
         adalah surat yang membantah dirinya sendiri — dan itu terjadi
         justru karena angkanya terisi otomatis dan tidak dibaca ulang. */
      waspada(d) {
        const p = [];
        const sehatPolos = /^SEHAT —/.test(bersih(d.kesimpulan));
        if (!sehatPolos) return p;
        const temuan = [];
        const suhu = Number(d.suhu);
        if (suhu && suhu >= 37.6) temuan.push(`suhu ${d.suhu} °C`);
        const td = bersih(d.tekanan_darah).match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
        if (td) {
          const sis = +td[1], dia = +td[2];
          if (sis >= 140 || dia >= 90) temuan.push(`tekanan darah ${d.tekanan_darah} mmHg`);
          if (sis <= 89 || dia <= 59) temuan.push(`tekanan darah rendah ${d.tekanan_darah} mmHg`);
        }
        const nadi = Number(d.nadi);
        if (nadi && (nadi > 100 || nadi < 50)) temuan.push(`nadi ${d.nadi} x/menit`);
        if (temuan.length)
          p.push('Kesimpulannya "sehat", tetapi angka yang akan ikut tercetak menunjukkan ' +
                 temuan.join(' dan ') + '. Pertimbangkan "SEHAT DENGAN CATATAN", ' +
                 'atau perbaiki angkanya bila salah ketik.');
        return p;
      },
      blok(d, ctx) {
        const hasil = [
          ['Tinggi badan', ada(d.tinggi_badan) ? `${d.tinggi_badan} cm` : ''],
          ['Berat badan', ada(d.berat_badan) ? `${d.berat_badan} kg` : ''],
          ['Tekanan darah', ada(d.tekanan_darah) ? `${bersih(d.tekanan_darah)} mmHg` : ''],
          ['Nadi', ada(d.nadi) ? `${d.nadi} x/menit` : ''],
          ['Pernapasan', ada(d.nafas) ? `${d.nafas} x/menit` : ''],
          ['Suhu', ada(d.suhu) ? `${d.suhu} °C` : ''],
          ['Golongan darah', bersih(d.gol_darah)],
          ['Buta warna', bersih(d.buta_warna) === BUTA_WARNA[0] ? '' : bersih(d.buta_warna)]
        ].filter(([, v]) => ada(v));

        const b = [
          { t: 'paragraf', teks: pembuka(ctx) },
          { t: 'identitas', baris: identitasPasien(ctx) },
          { t: 'paragraf', teks:
            `Telah dilakukan pemeriksaan kesehatan pada tanggal ` +
            `${tglIndo((ctx.kunjungan && ctx.kunjungan.tanggal) || ctx.tanggalSurat)} ` +
            `dengan hasil sebagai berikut:` },
          { t: 'identitas', baris: hasil.length ? hasil : [['Hasil pemeriksaan', '-']] },
          { t: 'paragraf', teks:
            `Berdasarkan hasil pemeriksaan tersebut, yang bersangkutan dinyatakan ` +
            `${bersih(d.kesimpulan).split('—')[0].trim().toLowerCase()}.` }
        ];
        if (ada(d.catatan)) b.push({ t: 'identitas', baris: [['Catatan', bersih(d.catatan)]] });
        b.push({ t: 'paragraf', teks:
          `Surat keterangan ini dibuat untuk ${bersih(d.keperluan).toLowerCase()}. ` + PENUTUP });
        return b;
      }
    },

    /* ---------------------------------------------------------------- */
    RM: {
      kode: 'RM',
      nama: 'Resume Medis',
      judul: 'RESUME MEDIS',
      keterangan: 'Ringkasan pelayanan satu kunjungan untuk asuransi atau rujukan lanjutan.',
      perluKunjungan: true,
      catatanLayar:
        'Resume medis memuat data medis lengkap pasien. Serahkan hanya kepada pasien ' +
        'sendiri atau pihak yang ditunjuk pasien secara tertulis.',
      isian: [
        { nama: 'diserahkan_kepada', label: 'Diserahkan kepada', tipe: 'teks', wajib: true,
          kolom: 6, saran: ['Pasien yang bersangkutan', 'Keluarga pasien',
                            'Perusahaan asuransi', 'Fasilitas kesehatan lanjutan'] },
        { nama: 'keperluan', label: 'Untuk keperluan', tipe: 'teks', kolom: 6,
          saran: ['Klaim asuransi', 'Rujukan lanjutan', 'Arsip pribadi pasien'] },
        { nama: 'anamnesa', label: 'Anamnesa / keluhan', tipe: 'panjang', baris: 3, kolom: 12 },
        { nama: 'pemeriksaan', label: 'Hasil pemeriksaan', tipe: 'panjang', baris: 3, kolom: 12 },
        { nama: 'diagnosa_teks', label: 'Diagnosa', tipe: 'panjang', baris: 2, kolom: 12 },
        { nama: 'tindakan_teks', label: 'Tindakan', tipe: 'panjang', baris: 2, kolom: 12 },
        { nama: 'terapi', label: 'Terapi / obat yang diberikan', tipe: 'panjang', baris: 3, kolom: 12 },
        { nama: 'kondisi_pulang', label: 'Keadaan saat pulang', tipe: 'teks', kolom: 6,
          saran: ['Sembuh', 'Membaik', 'Belum sembuh', 'Dirujuk'] },
        { nama: 'anjuran', label: 'Anjuran / rencana tindak lanjut', tipe: 'panjang',
          baris: 2, kolom: 12 }
      ],
      awal(ctx) {
        const pm = ctx.pemeriksaan || {};
        const ka = ctx.kajian || {};
        const fisik = vitalKajian(ka).map(([k, v]) => `${k} ${v}`).join('; ');
        return {
          diserahkan_kepada: 'Pasien yang bersangkutan',
          keperluan: '',
          anamnesa: [bersih(ka.keluhan_utama), bersih(pm.subjective)].filter(Boolean).join('. '),
          pemeriksaan: [fisik, bersih(pm.objective)].filter(Boolean).join('. '),
          diagnosa_teks: teksDiagnosa(ctx, true),
          tindakan_teks: teksTindakan(ctx).join('; '),
          terapi: teksTerapi(ctx).join('\n'),
          kondisi_pulang: bersih(pm.status_pulang) || 'Membaik',
          anjuran: [bersih(pm.plan), bersih(pm.edukasi)].filter(Boolean).join('. ')
        };
      },
      periksa(d) {
        const p = [];
        if (!ada(d.diserahkan_kepada)) p.push('Kolom "diserahkan kepada" belum diisi.');
        if (!ada(d.diagnosa_teks)) p.push('Diagnosa belum diisi.');
        return p;
      },
      blok(d, ctx) {
        const k = ctx.kunjungan || {};
        return [
          { t: 'identitas', baris: identitasPasien(ctx, { nik: true }) },
          { t: 'seksi', teks: 'Pelayanan' },
          { t: 'identitas', baris: [
            ['Tanggal pelayanan', tglIndo(k.tanggal || ctx.tanggalSurat)],
            ['Unit / poli', bersih(k.poli && k.poli.nama) || '-'],
            ['Dokter pemeriksa', bersih(ctx.dokter && ctx.dokter.nama) || '-'],
            ['Cara bayar', bersih(k.cara_bayar) || '-']
          ] },
          { t: 'seksi', teks: 'Ringkasan Medis' },
          { t: 'identitas', baris: [
            ['Anamnesa', bersih(d.anamnesa) || '-'],
            ['Pemeriksaan', bersih(d.pemeriksaan) || '-'],
            ['Diagnosa', bersih(d.diagnosa_teks) || '-'],
            ['Tindakan', bersih(d.tindakan_teks) || '-'],
            ['Terapi', bersih(d.terapi) || '-'],
            ['Keadaan saat pulang', bersih(d.kondisi_pulang) || '-'],
            ['Anjuran', bersih(d.anjuran) || '-']
          ] },
          { t: 'paragraf', teks:
            `Resume medis ini diserahkan kepada ${bersih(d.diserahkan_kepada).toLowerCase()}` +
            (ada(d.keperluan) ? ` untuk ${bersih(d.keperluan).toLowerCase()}` : '') + '. ' + PENUTUP },
          { t: 'kaki', teks:
            'Dokumen ini memuat informasi medis yang bersifat rahasia. ' +
            'Penggunaan di luar keperluan yang disebutkan di atas tidak dibenarkan.' }
        ];
      }
    },

    /* ---------------------------------------------------------------- */
    SKL: {
      kode: 'SKL',
      nama: 'Surat Keterangan',
      judul: 'SURAT KETERANGAN',
      keterangan: 'Surat keterangan dengan isi bebas, untuk keperluan yang belum ada bentuk bakunya.',
      perluKunjungan: false,
      isian: [
        { nama: 'judul_tambahan', label: 'Judul surat', tipe: 'teks', kolom: 12,
          bantuan: 'Ditulis di bawah judul "SURAT KETERANGAN". Boleh dikosongkan.',
          saran: ['Keterangan Pernah Berobat', 'Keterangan Tidak Menderita Penyakit Menular',
                  'Keterangan Layak Mengikuti Kegiatan', 'Keterangan Pendamping Pasien'] },
        { nama: 'isi', label: 'Isi surat', tipe: 'panjang', baris: 8, wajib: true, kolom: 12,
          bantuan: 'Ditulis apa adanya di bawah data pasien. Satu baris kosong ' +
                   'memisahkan paragraf.' },
        { nama: 'keperluan', label: 'Untuk keperluan', tipe: 'teks', kolom: 12 }
      ],
      awal() {
        return { judul_tambahan: '', isi: '', keperluan: '' };
      },
      periksa(d) {
        const p = [];
        if (!ada(d.isi)) p.push('Isi surat belum diketik.');
        return p;
      },
      blok(d, ctx) {
        const b = [
          { t: 'paragraf', teks: pembuka(ctx) },
          { t: 'identitas', baris: identitasPasien(ctx) }
        ];
        bersih(d.isi).split(/\n\s*\n/).filter(Boolean)
          .forEach(par => b.push({ t: 'paragraf', teks: par.replace(/\n/g, ' ').trim() }));
        b.push({ t: 'paragraf', teks: ada(d.keperluan)
          ? `Surat keterangan ini dibuat untuk ${bersih(d.keperluan).toLowerCase()}. ` + PENUTUP
          : PENUTUP });
        return b;
      }
    }
  };

  const urutJenis = ['SKS', 'SR', 'SK', 'SKBS', 'RM', 'SKL'];
  const daftarJenis = () => urutJenis.map(k => JENIS[k]);
  const jenis = (kode) => JENIS[kode] || null;

  /* ================================================================== */
  /*  6. MODEL DOKUMEN                                                  */
  /* ================================================================== */
  /*  Keluaran fungsi ini adalah SATU-SATUNYA sumber isi lembar surat.
      js/surat_cetak.js menyajikannya sebagai HTML untuk dicetak dan
      sebagai docDefinition pdfmake untuk diunduh. Tidak ada satu pun
      kalimat surat yang ditulis di dua tempat.                          */
  function dokumen(kode, data, ctx) {
    const j = jenis(kode);
    if (!j) throw new Error('Jenis surat tidak dikenal: ' + kode);
    const d = data || {};
    const c = ctx || {};
    const bag = bagianNomor(c.tanggalSurat);

    const judulTambahan = kode === 'SKL' ? bersih(d.judul_tambahan) : '';

    return {
      kode,
      judul: j.judul,
      judulTambahan,
      nomor: c.nomorSurat ||
             (c.nomorUrut ? formatNomor(c.nomorUrut, kode, bag.bulan, bag.tahun) : ''),
      batal: !!c.batal,
      alasanBatal: bersih(c.alasanBatal),
      blok: j.blok(d, c),
      ttd: {
        kotaTanggal: [bersih(c.pengaturan && c.pengaturan.kota) || bersih(c.faskes && c.faskes.kabupaten),
                      tglIndo(c.tanggalSurat)].filter(Boolean).join(', '),
        jabatan: bersih(c.ttdJabatan) || 'Dokter Pemeriksa',
        nama: bersih(c.ttdNama) || bersih(c.dokter && c.dokter.nama) || '',
        sip: bersih(c.ttdSip) || bersih(c.dokter && c.dokter.no_sip) || ''
      },
      kaki: bersih(c.pengaturan && c.pengaturan.catatan_kaki)
    };
  }

  /* Menyusun nilai awal formulir dari kunjungan yang berjalan. */
  function nilaiAwal(kode, ctx) {
    const j = jenis(kode);
    if (!j) return {};
    const dasar = {};
    j.isian.forEach(f => { dasar[f.nama] = f.tipe === 'centang' ? false : ''; });
    return Object.assign(dasar, j.awal(ctx || {}) || {});
  }

  function periksa(kode, data) {
    const j = jenis(kode);
    if (!j) return ['Jenis surat tidak dikenal.'];
    const pesan = [];
    j.isian.forEach(f => {
      if (!f.wajib) return;
      if (f.tampilJika && !data[f.tampilJika]) return;
      if (!ada(data[f.nama])) pesan.push(`${f.label} wajib diisi.`);
    });
    (j.periksa(data || {}) || []).forEach(p => { if (!pesan.includes(p)) pesan.push(p); });
    return pesan;
  }

  /* Peringatan yang TIDAK menghalangi penyimpanan. Dipisahkan dari
     periksa() dengan sengaja: keputusan medis tetap milik dokter, dan
     sistem yang menolak menerbitkan surat karena tidak setuju dengan
     dokternya akan segera dicari akalnya. Yang berguna adalah
     menunjukkan hal yang mudah terlewat — angka yang terisi otomatis
     lalu tidak dibaca ulang, atau rujukan BPJS yang belum masuk PCare. */
  function peringatan(kode, data, ctx) {
    const j = jenis(kode);
    if (!j || typeof j.waspada !== 'function') return [];
    try { return j.waspada(data || {}, ctx || {}) || []; }
    catch (e) { return []; }
  }

  /* Perihal ringkas untuk daftar riwayat surat — supaya barisnya bisa
     dibedakan tanpa membuka suratnya. */
  function perihal(kode, d) {
    d = d || {};
    switch (kode) {
      case 'SKS':  return `Istirahat ${Math.max(1, Number(d.lama) || 1)} hari` +
                          (urai(d.mulai) ? ` mulai ${tglIndo(d.mulai)}` : '');
      case 'SR':   return `Rujuk ke ${bersih(d.faskes_tujuan) || '-'}` +
                          (ada(d.poli_tujuan) ? ` (${bersih(d.poli_tujuan)})` : '');
      case 'SK':   return `Kontrol ${tglIndo(d.tanggal_kontrol)}` +
                          (ada(d.poli_kontrol) ? ` di ${bersih(d.poli_kontrol)}` : '');
      case 'SKBS': return bersih(d.keperluan) || 'Keterangan berbadan sehat';
      case 'RM':   return `Untuk ${bersih(d.diserahkan_kepada) || 'pasien'}`;
      case 'SKL':  return bersih(d.judul_tambahan) ||
                          bersih(d.isi).replace(/\s+/g, ' ').slice(0, 60);
      default:     return '';
    }
  }

  const API = {
    BULAN, HARI, ROMAWI, BUTA_WARNA, ALASAN_RUJUK, PENUTUP,
    urai, tglIndo, namaHari, tambahHari, akhirIstirahat, umurTahun,
    terbilang, angkaHuruf,
    bulanRomawi, formatNomor, bagianNomor,
    alamatPasien, identitasPasien, teksDiagnosa, teksTerapi, teksTindakan, vitalKajian,
    JENIS, daftarJenis, jenis, urutJenis,
    dokumen, nilaiAwal, periksa, peringatan, perihal
  };

  return API;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SuratCore;

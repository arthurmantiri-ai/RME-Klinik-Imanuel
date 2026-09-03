/* =====================================================================
   UJI SURAT CORE — fungsi murni modul surat, tanpa peramban dan tanpa
   database.

   Jalankan: node test/uji_surat_core.js

   Dua hal yang paling penting dijaga di sini:

   1. BENTUK NOMOR SURAT harus sama persis dengan yang disusun database.
      Contoh yang dipakai di bawah SENGAJA sama dengan yang ada di
      test/uji_surat.sql (§1 dan §2). Kalau salah satu diubah tanpa yang
      lain, salah satu berkas uji gagal — bukan tercetak berbeda diam-diam
      di klinik.

   2. TANGGAL TIDAK BOLEH BERGESER SEHARI. Seluruh berkas ini dijalankan
      dengan TZ=America/Los_Angeles, zona yang paling jauh dari WITA di
      arah yang menyakitkan: kalau ada satu saja tanggal yang diurai
      lewat `new Date('2026-09-03')` (yang berarti tengah malam UTC),
      ia akan memulangkan 2 September di sana dan ujinya gagal.
      Surat keterangan sakit yang salah tanggal adalah surat yang salah.
   ===================================================================== */
'use strict';

process.env.TZ = 'America/Los_Angeles';

const path = require('path');
const SuratCore = require(path.join(__dirname, '..', 'js', 'surat_core.js'));
const SuratCetak = require(path.join(__dirname, '..', 'js', 'surat_cetak.js'));

let lulus = 0, gagal = 0;
function cek(nama, syarat, pesan) {
  if (syarat) { lulus++; }
  else { gagal++; console.error('  GAGAL  ' + nama + (pesan ? ' — ' + pesan : '')); }
}
const sama = (nama, dapat, harap) =>
  cek(nama, dapat === harap, `dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`);

/* ------------------------------------------------------------------ */
/* 1. Nomor surat — cerminan public.format_no_surat()                  */
/* ------------------------------------------------------------------ */
sama('nomor surat sakit', SuratCore.formatNomor(7, 'SKS', 9, 2099), '07/SKS/YAKIM/IX/2099');
sama('nomor satu digit diberi nol', SuratCore.formatNomor(1, 'SR', 1, 2099), '01/SR/YAKIM/I/2099');
/* Ini bug yang benar-benar ada di sisi SQL sebelum uji ini ditulis:
   lpad('115', 2, '0') memulangkan '11'. JavaScript padStart tidak
   memotong, jadi keduanya sempat berselisih tanpa ada yang tahu. */
sama('nomor tiga digit tidak dipotong',
     SuratCore.formatNomor(115, 'SKBS', 12, 2099), '115/SKBS/YAKIM/XII/2099');

['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'].forEach((r, i) => {
  sama('romawi bulan ' + (i + 1), SuratCore.bulanRomawi(i + 1), r);
});

/* Bulan & tahun nomor mengikuti tanggal surat, bukan hari ini. */
const bag = SuratCore.bagianNomor('2026-09-03');
cek('bagian nomor dari tanggal surat', bag.bulan === 9 && bag.tahun === 2026,
    JSON.stringify(bag));
const bagOkt = SuratCore.bagianNomor('2026-10-02');
cek('bagian nomor ikut tanggal yang dipilih', bagOkt.bulan === 10, JSON.stringify(bagOkt));

/* ------------------------------------------------------------------ */
/* 2. Tanggal — tidak boleh bergeser sehari di zona mana pun           */
/* ------------------------------------------------------------------ */
sama('tanggal Indonesia', SuratCore.tglIndo('2026-09-03'), '3 September 2026');
sama('tanggal awal tahun', SuratCore.tglIndo('2026-01-01'), '1 Januari 2026');
sama('tanggal akhir tahun', SuratCore.tglIndo('2026-12-31'), '31 Desember 2026');
sama('tanggal dari cap waktu penuh', SuratCore.tglIndo('2026-09-03T23:15:00+08:00'),
     '3 September 2026');
sama('tanggal kosong', SuratCore.tglIndo(null), '-');
sama('tanggal ngawur', SuratCore.tglIndo('bukan tanggal'), '-');
sama('nama hari', SuratCore.namaHari('2026-09-03'), 'Kamis');

sama('tambah hari biasa', SuratCore.tambahHari('2026-09-03', 2), '2026-09-05');
sama('tambah hari lewat akhir bulan', SuratCore.tambahHari('2026-09-30', 3), '2026-10-03');
sama('tambah hari lewat akhir tahun', SuratCore.tambahHari('2026-12-30', 5), '2027-01-04');
sama('tambah 90 hari untuk masa berlaku rujukan',
     SuratCore.tambahHari('2026-09-03', 90), '2026-12-02');

/* Istirahat dihitung INKLUSIF. Meleset satu hari di sini berarti surat
   menyatakan pasien libur sehari lebih lama daripada yang dokter maksud. */
sama('istirahat 1 hari berakhir hari itu juga',
     SuratCore.akhirIstirahat('2026-09-03', 1), '2026-09-03');
sama('istirahat 3 hari', SuratCore.akhirIstirahat('2026-09-03', 3), '2026-09-05');
sama('istirahat melewati akhir bulan',
     SuratCore.akhirIstirahat('2026-09-30', 3), '2026-10-02');

sama('umur pada tanggal surat', SuratCore.umurTahun('1978-04-12', '2026-09-03'), 48);
sama('umur sehari sebelum ulang tahun', SuratCore.umurTahun('1978-09-04', '2026-09-03'), 47);
sama('umur tepat di hari ulang tahun', SuratCore.umurTahun('1978-09-03', '2026-09-03'), 48);

/* ------------------------------------------------------------------ */
/* 3. Terbilang                                                        */
/* ------------------------------------------------------------------ */
[[0,'nol'],[1,'satu'],[3,'tiga'],[10,'sepuluh'],[11,'sebelas'],[12,'dua belas'],
 [15,'lima belas'],[20,'dua puluh'],[21,'dua puluh satu'],[30,'tiga puluh'],
 [100,'seratus'],[101,'seratus satu'],[115,'seratus lima belas'],
 [200,'dua ratus'],[1000,'seribu'],[2500,'dua ribu lima ratus']]
  .forEach(([n, t]) => sama('terbilang ' + n, SuratCore.terbilang(n), t));

sama('angka dan huruf', SuratCore.angkaHuruf(3, 'hari'), '3 (tiga) hari');
sama('angka dan huruf tanpa satuan', SuratCore.angkaHuruf(14), '14 (empat belas)');

/* ------------------------------------------------------------------ */
/* 4. Konteks contoh                                                   */
/* ------------------------------------------------------------------ */
const KTX = {
  faskes: { nama: 'Klinik Pratama Imanuel', kabupaten: 'Kota Manado' },
  pasien: {
    id: 'pas-1', no_rm: '000001', nik: '7171010101900001', no_bpjs: '0001234567890',
    nama: 'Budi Santoso', tempat_lahir: 'Manado', tanggal_lahir: '1978-04-12',
    jenis_kelamin: 'L', pekerjaan: 'Wiraswasta', gol_darah: 'O',
    alamat: 'Jl. Piere Tendean No. 10', rt: '03', rw: '05',
    kelurahan: 'Wenang Selatan', kecamatan: 'Wenang', kabupaten: 'Kota Manado'
  },
  kunjungan: { id: 'kunj-1', no_kunjungan: '20260903-0001', tanggal: '2026-09-03',
               cara_bayar: 'BPJS', poli: { nama: 'Poli Umum', jenis: 'UMUM' } },
  kajian: { sistolik: 130, diastolik: 85, nadi: 88, nafas: 20, suhu: 37.8,
            berat_badan: 68, tinggi_badan: 170, keluhan_utama: 'Batuk dan pilek 3 hari' },
  pemeriksaan: { subjective: 'Batuk berdahak sejak 3 hari', objective: 'Faring hiperemis',
                 assessment: 'ISPA', plan: 'Simtomatik', status_pulang: 'Membaik',
                 edukasi: 'Istirahat cukup', tanggal_kontrol: '2026-09-10',
                 rujuk_ke_faskes: 'RSUD Prof. Kandou', rujuk_spesialis: 'Penyakit Dalam' },
  diagnosa: [{ kode_icd10: 'J06.9', nama: 'ISPA', jenis: 'PRIMER' },
             { kode_icd10: 'K30', nama: 'Dispepsia', jenis: 'SEKUNDER' }],
  tindakan: [{ kode_icd9: '93.94', nama: 'Nebulisasi' }],
  resep: { item: [{ nama_obat: 'Paracetamol 500 mg', jumlah: 10, satuan: 'Tablet',
                    signa: '3x1 sesudah makan' }] },
  dokter: { id: 'peg-1', nama: 'dr. Arthur Mantiri', no_sip: '446/SIP/2024/0091' },
  pengaturan: { kota: 'Manado', catatan_kaki: 'Keaslian surat dapat diperiksa ke klinik.' },
  tanggalSurat: '2026-09-03',
  nomorUrut: 7
};

/* ------------------------------------------------------------------ */
/* 5. Setiap jenis surat: nilai awal, validasi, dan lembarnya          */
/* ------------------------------------------------------------------ */
SuratCore.urutJenis.forEach(kode => {
  const j = SuratCore.jenis(kode);
  cek(kode + ' punya definisi', !!j);

  /* nilaiAwal harus memulangkan SEMUA nama isian. Kalau ada yang
     terlewat, kolomnya tampil kosong padahal datanya ada di rekam medis,
     dan dokter harus mengetik ulang sesuatu yang sudah pernah diketik. */
  const awal = SuratCore.nilaiAwal(kode, KTX);
  j.isian.forEach(f => {
    cek(`${kode}.${f.nama} punya nilai awal`, Object.prototype.hasOwnProperty.call(awal, f.nama));
  });

  /* Lembar surat harus tetap tersusun walaupun isiannya kosong melompong
     — pratinjau digambar sejak kolom pertama diketik. */
  let modelKosong = null;
  try {
    modelKosong = SuratCore.dokumen(kode, {}, Object.assign({}, KTX, { nomorUrut: 1 }));
  } catch (e) {
    cek(kode + ' lembar kosong tidak melempar galat', false, e.message);
  }
  if (modelKosong) {
    cek(kode + ' lembar kosong punya blok', modelKosong.blok.length > 0);
    cek(kode + ' judulnya terisi', !!modelKosong.judul);
  }

  /* Isian wajib benar-benar ditagih. */
  const pesanKosong = SuratCore.periksa(kode, {});
  const adaWajib = j.isian.some(f => f.wajib && !f.tampilJika);
  if (adaWajib) cek(kode + ' menolak isian wajib yang kosong', pesanKosong.length > 0);

  /* Isian yang terisi otomatis harus lolos validasi tanpa diketik apa pun
     lagi — kecuali yang memang cuma bisa dijawab manusia. */
  const model = SuratCore.dokumen(kode, awal, KTX);
  cek(kode + ' lembar dari nilai awal tersusun', model.blok.length > 0);
  cek(kode + ' nomornya terbentuk', model.nomor === '07/' + kode + '/YAKIM/IX/2026');
  cek(kode + ' kota & tanggal di atas tanda tangan',
      model.ttd.kotaTanggal === 'Manado, 3 September 2026', model.ttd.kotaTanggal);
});

/* ------------------------------------------------------------------ */
/* 6. Surat keterangan sakit — kalimat intinya                         */
/* ------------------------------------------------------------------ */
{
  const d = { mulai: '2026-09-03', lama: 2, keperluan: 'Keperluan tempat bekerja',
              cantumkan_diagnosa: false, diagnosa_teks: 'ISPA' };
  const m = SuratCore.dokumen('SKS', d, KTX);
  const teks = m.blok.filter(b => b.t === 'paragraf').map(b => b.teks).join(' ');

  cek('surat sakit menyebut lama istirahat dengan angka dan huruf',
      teks.includes('2 (dua) hari'), teks);
  cek('surat sakit menyebut tanggal mulai', teks.includes('3 September 2026'), teks);
  cek('surat sakit menyebut tanggal akhir yang inklusif',
      teks.includes('4 September 2026'), teks);

  /* Bawaannya diagnosa TIDAK ikut tercetak. Ini keputusan yang diminta
     Arthur; kalau suatu saat berubah, ujinya yang harus diubah lebih
     dulu — bukan diam-diam berubah karena satu baris tergeser. */
  const semua = JSON.stringify(m.blok);
  cek('diagnosa tidak tercetak selama tidak diminta', !semua.includes('ISPA'), semua);

  const m2 = SuratCore.dokumen('SKS', Object.assign({}, d, { cantumkan_diagnosa: true }), KTX);
  cek('diagnosa tercetak bila dokter memintanya',
      JSON.stringify(m2.blok).includes('ISPA'));

  /* Nilai awal mengambil lama istirahat 1 hari dan tanggal kunjungan. */
  const awal = SuratCore.nilaiAwal('SKS', KTX);
  sama('nilai awal surat sakit mulai dari tanggal kunjungan', awal.mulai, '2026-09-03');
  sama('nilai awal lama istirahat', awal.lama, 1);
  sama('nilai awal diagnosa terisi dari rekam medis (walau tidak dicetak)',
       awal.diagnosa_teks, 'ISPA; Dispepsia');

  cek('lama istirahat kosong ditolak', SuratCore.periksa('SKS', { mulai: '2026-09-03' }).length > 0);
  cek('lama istirahat 45 hari diperingatkan',
      SuratCore.periksa('SKS', { mulai: '2026-09-03', lama: 45 }).length > 0);
  cek('lama istirahat wajar diterima',
      SuratCore.periksa('SKS', { mulai: '2026-09-03', lama: 3 }).length === 0);
}

/* ------------------------------------------------------------------ */
/* 7. Surat rujukan — terisi dari rekam medis                          */
/* ------------------------------------------------------------------ */
{
  const awal = SuratCore.nilaiAwal('SR', KTX);
  sama('faskes tujuan diambil dari rencana rujukan dokter',
       awal.faskes_tujuan, 'RSUD Prof. Kandou');
  sama('spesialis tujuan diambil dari rencana rujukan dokter',
       awal.poli_tujuan, 'Penyakit Dalam');
  sama('diagnosa rujukan memuat kode ICD-10',
       awal.diagnosa_teks, 'ISPA (J06.9); Dispepsia (K30)');
  cek('anamnesa rujukan terisi dari keluhan dan SOAP',
      awal.anamnesa.includes('Batuk'), awal.anamnesa);
  cek('pemeriksaan rujukan memuat tanda vital',
      awal.pemeriksaan.includes('130/85'), awal.pemeriksaan);
  cek('terapi rujukan memuat obat dan tindakan',
      awal.terapi.includes('Paracetamol') && awal.terapi.includes('Nebulisasi'), awal.terapi);
  sama('masa berlaku rujukan bawaan 90 hari', awal.berlaku_sampai, '2026-12-02');

  const m = SuratCore.dokumen('SR', awal, KTX);
  const alamat = m.blok.find(b => b.t === 'alamat');
  cek('surat rujukan punya blok alamat tujuan', !!alamat);
  cek('alamat tujuan menyebut faskes', alamat && alamat.kepada === 'RSUD Prof. Kandou');

  /* Nomor kartu BPJS wajib ikut pada rujukan — tanpa itu rumah sakit
     tidak bisa memproses rujukannya sama sekali. */
  const identitas = m.blok.filter(b => b.t === 'identitas')
    .map(b => b.baris.map(x => x[0]).join('|')).join('|');
  cek('rujukan mencantumkan No. Kartu BPJS', identitas.includes('No. Kartu BPJS'), identitas);
  cek('rujukan mencantumkan NIK', identitas.includes('NIK'), identitas);

  cek('rujukan tanpa faskes tujuan ditolak',
      SuratCore.periksa('SR', { poli_tujuan: 'Bedah', diagnosa_teks: 'X',
                                anamnesa: 'y' }).length > 0);
  cek('rujukan tanpa anamnesa dan pemeriksaan diperingatkan',
      SuratCore.periksa('SR', { faskes_tujuan: 'RS A', poli_tujuan: 'Bedah',
                                diagnosa_teks: 'X' }).length > 0);
}

/* ------------------------------------------------------------------ */
/* 8. Keterangan sehat, kontrol, resume, dan surat bebas               */
/* ------------------------------------------------------------------ */
{
  const awal = SuratCore.nilaiAwal('SKBS', KTX);
  sama('tinggi badan diambil dari kajian awal', awal.tinggi_badan, 170);
  sama('tekanan darah dirangkai dari sistolik/diastolik', awal.tekanan_darah, '130/85');
  sama('buta warna bawaan: tidak diperiksa', awal.buta_warna, 'Tidak diperiksa');

  /* "Tidak diperiksa" tidak boleh ikut tercetak sebagai hasil — surat
     keterangan sehat yang menyebut hasil tes yang tidak pernah dikerjakan
     adalah keterangan palsu, sekecil apa pun. */
  const m = SuratCore.dokumen('SKBS', Object.assign({}, awal, { keperluan: 'Melamar pekerjaan' }), KTX);
  cek('buta warna yang tidak diperiksa tidak tercetak',
      !JSON.stringify(m.blok).includes('Tidak diperiksa'));

  cek('keterangan sehat tanpa satu pun angka pemeriksaan ditolak',
      SuratCore.periksa('SKBS', { keperluan: 'Kerja',
                                  kesimpulan: 'SEHAT — tidak ditemukan kelainan yang bermakna'
                                }).length > 0);

  const awalSK = SuratCore.nilaiAwal('SK', KTX);
  sama('tanggal kontrol diambil dari rencana dokter', awalSK.tanggal_kontrol, '2026-09-10');
  const mSK = SuratCore.dokumen('SK', awalSK, KTX);
  cek('surat kontrol menyebut nama hari',
      JSON.stringify(mSK.blok).includes('Kamis'), JSON.stringify(mSK.blok));

  const awalRM = SuratCore.nilaiAwal('RM', KTX);
  cek('resume medis memuat terapi', awalRM.terapi.includes('Paracetamol'));
  const mRM = SuratCore.dokumen('RM', awalRM, KTX);
  cek('resume medis diberi catatan kerahasiaan',
      mRM.blok.some(b => b.t === 'kaki' && /rahasia/i.test(b.teks)));

  const mSKL = SuratCore.dokumen('SKL',
    { judul_tambahan: 'Keterangan Pernah Berobat',
      isi: 'Paragraf pertama.\n\nParagraf kedua.', keperluan: 'Arsip pribadi' }, KTX);
  sama('surat bebas memakai judul tambahan', mSKL.judulTambahan, 'Keterangan Pernah Berobat');
  cek('isi bebas dipecah per paragraf',
      mSKL.blok.filter(b => b.t === 'paragraf' && /Paragraf/.test(b.teks)).length === 2);
  cek('surat bebas tanpa isi ditolak', SuratCore.periksa('SKL', {}).length > 0);
}

/* ------------------------------------------------------------------ */
/* 8b. Peringatan yang tidak menghalangi, tetapi perlu dilihat         */
/* ------------------------------------------------------------------ */
{
  /* Suhu 37,8 °C pada konteks contoh terisi otomatis ke formulir
     keterangan sehat. Surat yang menyatakan "sehat" sambil mencetak
     angka demam pada lembar yang sama membantah dirinya sendiri. */
  const awal = SuratCore.nilaiAwal('SKBS', KTX);
  const w = SuratCore.peringatan('SKBS', Object.assign({}, awal,
    { keperluan: 'Melamar pekerjaan' }), KTX);
  cek('kesimpulan sehat dengan suhu 37,8 °C diperingatkan',
      w.length === 1 && /suhu 37\.8/.test(w[0]), JSON.stringify(w));

  const wTd = SuratCore.peringatan('SKBS',
    { kesimpulan: 'SEHAT — tidak ditemukan kelainan yang bermakna',
      tekanan_darah: '160/95' }, KTX);
  cek('tekanan darah tinggi pada keterangan sehat diperingatkan',
      wTd.length === 1 && /160\/95/.test(wTd[0]), JSON.stringify(wTd));

  const wOk = SuratCore.peringatan('SKBS',
    { kesimpulan: 'SEHAT — tidak ditemukan kelainan yang bermakna',
      tekanan_darah: '120/80', suhu: 36.6, nadi: 78 }, KTX);
  cek('angka normal tidak memunculkan peringatan', wOk.length === 0, JSON.stringify(wOk));

  const wCatatan = SuratCore.peringatan('SKBS',
    { kesimpulan: 'SEHAT DENGAN CATATAN — lihat keterangan di bawah',
      tekanan_darah: '160/95' }, KTX);
  cek('kesimpulan "dengan catatan" tidak diperingatkan lagi',
      wCatatan.length === 0, JSON.stringify(wCatatan));

  /* Peringatan TIDAK boleh ikut menghalangi penyimpanan — keputusan
     medisnya tetap milik dokter. */
  cek('peringatan tidak membuat surat gagal validasi',
      SuratCore.periksa('SKBS', Object.assign({}, awal,
        { keperluan: 'Melamar pekerjaan' })).length === 0);

  /* Rujukan BPJS yang belum masuk PCare. */
  const wSr = SuratCore.peringatan('SR', SuratCore.nilaiAwal('SR', KTX), KTX);
  cek('rujukan BPJS tanpa nomor PCare diingatkan',
      wSr.some(x => /PCare/.test(x)), JSON.stringify(wSr));
  const wSrIsi = SuratCore.peringatan('SR',
    Object.assign(SuratCore.nilaiAwal('SR', KTX), { no_rujukan_pcare: '0001' }), KTX);
  cek('peringatan PCare hilang setelah nomornya diisi',
      !wSrIsi.some(x => /PCare/.test(x)), JSON.stringify(wSrIsi));

  /* Kontrol mundur ke belakang hampir selalu salah ketik. */
  const wSk = SuratCore.peringatan('SK', { tanggal_kontrol: '2026-08-20' }, KTX);
  cek('tanggal kontrol sebelum tanggal surat diperingatkan', wSk.length === 1,
      JSON.stringify(wSk));

  /* Istirahat panjang: bukan kesalahan, tapi perlu dilihat sekali lagi. */
  cek('istirahat 10 hari diperingatkan',
      SuratCore.peringatan('SKS', { lama: 10 }, KTX).length === 1);
  cek('istirahat 3 hari tidak diperingatkan',
      SuratCore.peringatan('SKS', { lama: 3 }, KTX).length === 0);

  /* Jenis tanpa aturan peringatan tidak boleh melempar galat. */
  cek('jenis tanpa aturan peringatan memulangkan daftar kosong',
      Array.isArray(SuratCore.peringatan('SKL', {}, KTX)));
}

/* ------------------------------------------------------------------ */
/* 9. Perihal untuk daftar riwayat                                     */
/* ------------------------------------------------------------------ */
sama('perihal surat sakit',
     SuratCore.perihal('SKS', { lama: 2, mulai: '2026-09-03' }),
     'Istirahat 2 hari mulai 3 September 2026');
sama('perihal rujukan',
     SuratCore.perihal('SR', { faskes_tujuan: 'RSUD Kandou', poli_tujuan: 'Bedah' }),
     'Rujuk ke RSUD Kandou (Bedah)');
sama('perihal kontrol',
     SuratCore.perihal('SK', { tanggal_kontrol: '2026-09-10', poli_kontrol: 'Poli Umum' }),
     'Kontrol 10 September 2026 di Poli Umum');

/* ------------------------------------------------------------------ */
/* 10. Penyajian: HTML dan PDF dari model yang sama                    */
/* ------------------------------------------------------------------ */
{
  const m = SuratCore.dokumen('SKS',
    { mulai: '2026-09-03', lama: 2, keperluan: 'Keperluan tempat bekerja' }, KTX);

  const html = SuratCetak.halamanHtml(m, { kop: 'data:image/jpeg;base64,AAAA', rasioKop: 6.7 });
  cek('halaman cetak memuat judul', html.includes('SURAT KETERANGAN SAKIT'));
  cek('halaman cetak memuat nomor', html.includes('07/SKS/YAKIM/IX/2026'));
  cek('halaman cetak memuat kop', html.includes('data:image/jpeg;base64,AAAA'));
  cek('halaman cetak memuat nama & SIP dokter',
      html.includes('dr. Arthur Mantiri') && html.includes('446/SIP/2024/0091'));
  cek('halaman cetak memberi ruang tanda tangan kosong', html.includes('class="ruang"'));
  cek('halaman cetak berukuran A4', html.includes('size: A4'));
  cek('blok tanda tangan dijaga tidak terbelah antar halaman',
      /\.ttd-bungkus[^}]*page-break-inside: avoid/.test(html));

  /* Kop bawaan sudah punya garis hijau sendiri; garis hitam tambahan
     hanya muncul kalau klinik memintanya. */
  cek('garis di bawah kop mati secara bawaan', !html.includes('class="kop-garis"'));
  const htmlGaris = SuratCetak.halamanHtml(m, { kop: 'data:image/jpeg;base64,AAAA', garisKop: true });
  cek('garis di bawah kop muncul bila dinyalakan', htmlGaris.includes('class="kop-garis"'));

  const doc = SuratCetak.docPdf(m, { kop: 'data:image/jpeg;base64,AAAA', rasioKop: 6.7 });
  sama('PDF berukuran A4', doc.pageSize, 'A4');
  cek('PDF memuat gambar kop', JSON.stringify(doc.content).includes('data:image/jpeg;base64,AAAA'));
  cek('PDF memuat nomor surat', JSON.stringify(doc.content).includes('07/SKS/YAKIM/IX/2026'));
  cek('PDF memuat kalimat inti yang sama dengan HTML',
      JSON.stringify(doc.content).includes('2 (dua) hari'));

  /* Nama berkas: garis miring pada nomor surat tidak boleh masuk ke nama
     berkas, di Windows maupun di Linux. */
  sama('nama berkas PDF tanpa garis miring',
       SuratCetak.namaBerkas(m), '07-SKS-YAKIM-IX-2026.pdf');
}

/* Data pasien tidak pernah dipercaya begitu saja saat dirangkai jadi
   HTML. Nama pasien datang dari isian bebas di layar pendaftaran. */
{
  const ktxJahat = JSON.parse(JSON.stringify(KTX));
  ktxJahat.pasien.nama = '<script>alert(1)</script>';
  const m = SuratCore.dokumen('SKL', { isi: 'Isi <b>surat</b> uji' }, ktxJahat);
  const html = SuratCetak.halamanHtml(m, {});
  cek('nama pasien di-escape', !html.includes('<script>'), 'HTML mentah bocor ke halaman cetak');
  cek('isi surat di-escape', !html.includes('<b>surat</b>'));
  cek('teks aslinya tetap terbaca', html.includes('&lt;script&gt;'));
}

/* ------------------------------------------------------------------ */
console.log(`${lulus} lulus, ${gagal} gagal.`);
process.exit(gagal ? 1 : 0);

/* Uji fungsi murni periksa_core.js — dijalankan dengan `node`, tanpa
   peramban dan tanpa database.

   ---------------------------------------------------------------------
   CONTOH DI SINI SAMA PERSIS DENGAN test/uji_periksa.sql

   Pasien, tanda vital, diagnosa, dan hasil yang diharapkan disalin dari
   berkas uji SQL itu. Bentuk payload PCare ditulis dua kali — sekali
   sebagai view v_pcare_kunjungan (yang berlaku saat pengiriman) dan
   sekali sebagai payloadPcare() (untuk pratinjau di layar dokter). Dua
   salinan hanya aman kalau diuji dengan contoh yang sama: kalau salah
   satunya diubah, salah satu uji GAGAL — bukan hasilnya yang berselisih
   diam-diam di klinik.

   BERKAS INI SENGAJA DIJALANKAN DI ZONA WAKTU BARAT. Seluruh tanggal di
   modul ini diurai dengan tangan, bukan lewat `new Date('YYYY-MM-DD')`.
   Menjalankan ujinya di America/Los_Angeles — zona terjauh dari WITA
   tempat klinik berada — membuat kelas kesalahan "meleset sehari" gagal
   keras, bukan lolos diam-diam karena kebetulan mesinnya di WITA. */
'use strict';
process.env.TZ = 'America/Los_Angeles';
const P = require('../js/periksa_core.js');

let lulus = 0;
function cek(nama, syarat, pesan) {
  if (!syarat) { console.error('GAGAL: ' + nama + (pesan ? ' — ' + pesan : '')); process.exit(1); }
  lulus++;
  console.log('  ok  ' + nama);
}

/* =====================================================================
   Bahan uji — sama dengan persiapan di test/uji_periksa.sql
   ===================================================================== */
const KUNJUNGAN = {
  id: 'kunj-uji', tanggal: '2099-03-09', cara_bayar: 'BPJS',
  waktu_selesai: '2099-03-09T10:15:00Z', pcare_no_kunjungan: null,
  keluhan_singkat: 'Batuk'
};
const PASIEN = { no_bpjs: '0001234567890', nik: '7371010101010001' };
const KAJIAN = {
  keluhan_utama: 'Batuk berdahak sejak 3 hari',
  sistolik: 130, diastolik: 85, nadi: 88, nafas: 20, suhu: 37.8,
  spo2: 97, berat_badan: 62.0, tinggi_badan: 165.0, imt: 22.77,
  lingkar_perut: 84.0, skala_nyeri: 3, kesadaran_kode: 'CM'
};
const DIAGNOSA = [
  { kode: 'J06.9', nama: 'ISPA',      jenis: 'PRIMER',   kasus: 'BARU' },
  { kode: 'R50.9', nama: 'Demam',     jenis: 'SEKUNDER', kasus: 'BARU' },
  { kode: 'R05',   nama: 'Batuk',     jenis: 'SEKUNDER', kasus: 'BARU' }
];

/* Sama dengan isian awal ref_sistem_fisik di sql/14_periksa_terstruktur.sql */
const SISTEM = [
  { kode: 'UMUM', nama: 'Keadaan umum', urutan: 1,
    normal_teks: 'Tampak sakit ringan, kesadaran compos mentis, gizi cukup' },
  { kode: 'THT', nama: 'Telinga, hidung, tenggorokan', urutan: 4,
    normal_teks: 'Liang telinga lapang, tidak ada sekret; hidung tidak ada sekret maupun deviasi septum; faring tidak hiperemis, tonsil T1-T1 tenang' },
  { kode: 'PARU', nama: 'Toraks — paru', urutan: 7,
    normal_teks: 'Gerak napas simetris, retraksi tidak ada, suara napas vesikuler, ronki tidak ada, wheezing tidak ada' },
  { kode: 'ABDOMEN', nama: 'Abdomen', urutan: 9,
    normal_teks: 'Datar, supel, bising usus normal, nyeri tekan tidak ada, hepar dan lien tidak teraba' },
  { kode: 'GENITAL', nama: 'Genitourinaria', urutan: 13,
    normal_teks: 'Tidak ada kelainan pada pemeriksaan luar' }
];

const VITAL = [
  { kode: 'sistolik',      nama: 'Tekanan darah sistolik',  satuan: 'mmHg',   satuan_ucum: 'mm[Hg]', kode_loinc: '8480-6',  urutan: 1 },
  { kode: 'diastolik',     nama: 'Tekanan darah diastolik', satuan: 'mmHg',   satuan_ucum: 'mm[Hg]', kode_loinc: '8462-4',  urutan: 2 },
  { kode: 'tekanan_darah', nama: 'Tekanan darah',           satuan: 'mmHg',   satuan_ucum: 'mm[Hg]', kode_loinc: '85354-9', urutan: 3 },
  { kode: 'nadi',          nama: 'Frekuensi nadi',          satuan: 'x/menit',satuan_ucum: '/min',   kode_loinc: '8867-4',  urutan: 4 },
  { kode: 'nafas',         nama: 'Frekuensi napas',         satuan: 'x/menit',satuan_ucum: '/min',   kode_loinc: '9279-1',  urutan: 5 },
  { kode: 'suhu',          nama: 'Suhu tubuh',              satuan: '°C',     satuan_ucum: 'Cel',    kode_loinc: '8310-5',  urutan: 6 },
  { kode: 'spo2',          nama: 'Saturasi oksigen',        satuan: '%',      satuan_ucum: '%',      kode_loinc: '2708-6',  urutan: 7 },
  { kode: 'berat_badan',   nama: 'Berat badan',             satuan: 'kg',     satuan_ucum: 'kg',     kode_loinc: '29463-7', urutan: 8 },
  { kode: 'tinggi_badan',  nama: 'Tinggi badan',            satuan: 'cm',     satuan_ucum: 'cm',     kode_loinc: '8302-2',  urutan: 9 },
  { kode: 'imt',           nama: 'Indeks massa tubuh',      satuan: 'kg/m²',  satuan_ucum: 'kg/m2',  kode_loinc: '39156-5', urutan: 10 },
  { kode: 'lingkar_perut', nama: 'Lingkar perut',           satuan: 'cm',     satuan_ucum: 'cm',     kode_loinc: '8280-0',  urutan: 11 },
  { kode: 'skala_nyeri',   nama: 'Skala nyeri',             satuan: '0-10',   satuan_ucum: '{score}',kode_loinc: '72514-3', urutan: 12 }
];


/* =====================================================================
   1. Tanggal — kelas kesalahan "meleset sehari"
   ===================================================================== */
cek('tanggal PCare berbentuk DD-MM-YYYY',
    P.tglPcare('2099-03-09') === '09-03-2099',
    'dapat ' + P.tglPcare('2099-03-09'));

/* Ini yang gagal keras kalau ada yang mengganti penguraian tangan dengan
   `new Date(iso)`: di zona barat, tanggal polos dibaca UTC lalu ditampilkan
   mundur sehari. Berkas ini dijalankan di America/Los_Angeles justru
   supaya kesalahan itu tidak bisa bersembunyi. */
cek('tanggal tidak bergeser di zona waktu barat',
    P.tglPcare('2099-01-01') === '01-01-2099' &&
    P.tglPcare('2099-12-31') === '31-12-2099');

cek('cap waktu ISO lengkap tetap terbaca tanggalnya',
    P.tglPcare('2099-03-09T10:15:00Z') === '09-03-2099');

cek('tanggal kosong tidak menjadi "undefined-NaN"',
    P.tglPcare(null) === '' && P.tglPcare('') === '');

/* Sama dengan uji SQL nomor 2 */
cek('suhu dikirim berkoma, bukan bertitik',
    P.suhuPcare(37.8) === '37,8', 'dapat ' + P.suhuPcare(37.8));
cek('suhu yang tidak diukur tidak dikarang jadi nol',
    P.suhuPcare(null) === null && P.suhuPcare('') === null);


/* =====================================================================
   2. Aturan pakai  ↔  signa1 / signa2
   ===================================================================== */
let s = P.uraiSigna('3 x sehari 1 tablet');
cek('"3 x sehari 1 tablet" terurai jadi 3 dan 1',
    s.frekuensi === 3 && s.dosis === 1 && s.terurai);

s = P.uraiSigna('3dd1');
cek('bentuk singkat resep 3dd1 terurai',
    s.frekuensi === 3 && s.dosis === 1 && s.terurai);

s = P.uraiSigna('2 kali sehari 1/2 tablet');
cek('setengah tablet terbaca 0,5 — bukan dibulatkan jadi 1',
    s.frekuensi === 2 && s.dosis === 0.5 && s.terurai);

s = P.uraiSigna('2x1/2');
cek('bentuk 2x1/2 juga terurai',
    s.frekuensi === 2 && s.dosis === 0.5, JSON.stringify(s));

/* Yang tidak bisa diurai TIDAK ditebak. Mengarang signa1 = 1 di sini
   berarti mengirim aturan pakai yang salah ke BPJS sementara layar dan
   kertas resep tetap benar — kesalahan yang tak akan pernah ketahuan. */
s = P.uraiSigna('Sesuai anjuran dokter');
cek('aturan pakai yang tidak berangka tidak ditebak',
    s.frekuensi === null && s.dosis === null && s.terurai === false);

cek('signa disusun kembali dari dua angka',
    P.susunSigna(3, 1, 'Tablet') === '3 x sehari 1 Tablet');
cek('setengah tablet ditulis 1/2, bukan 0.5',
    P.susunSigna(2, 0.5, 'Tablet') === '2 x sehari 1/2 Tablet');


/* =====================================================================
   3. Narasi SOAP disusun dari isian terstruktur
   ===================================================================== */
const ANAMNESIS = {
  keluhan_utama: 'Batuk berdahak sejak 3 hari',
  riwayat_penyakit_sekarang: {
    onset: '3 hari lalu', lokasi: 'dada', kualitas: 'berdahak putih',
    memperberat: 'udara dingin', penyerta: 'demam hilang timbul'
  },
  riwayat_penyakit_dahulu: 'Asma sejak kecil',
  riwayat_pengobatan: 'Salbutamol inhaler bila sesak'
};

const S = P.susunSubjective(ANAMNESIS);
cek('S memuat keluhan utama',        S.includes('Batuk berdahak sejak 3 hari'));
cek('S memuat butir anamnesis',      S.includes('sejak 3 hari lalu') && S.includes('sifat berdahak putih'));
cek('S memuat riwayat dahulu',       S.includes('Riwayat penyakit dahulu: Asma sejak kecil'));
cek('S tidak memuat butir kosong',   !S.includes('undefined') && !S.includes('null') && !S.includes(': .'));

/* anamnesa PCare lebih pendek dari S: tanpa riwayat dahulu & keluarga. */
const AN = P.susunAnamnesis(ANAMNESIS);
cek('anamnesa PCare tidak menyeret riwayat dahulu',
    AN.includes('Batuk berdahak') && !AN.includes('Asma sejak kecil'));

const OBJ_NORMAL = {
  keadaan_umum: 'Tampak sakit ringan',
  kesadaran_nama: 'Compos Mentis',
  pemeriksaan_fisik: {
    UMUM:    { status: 'NORMAL' },
    THT:     { status: 'NORMAL' },
    ABDOMEN: { status: 'NORMAL' },
    PARU:    { status: 'NORMAL' },
    GENITAL: { status: 'TIDAK_DIPERIKSA' }
  }
};
const O1 = P.susunObjective(OBJ_NORMAL, KAJIAN, SISTEM);
cek('O memuat tanda vital sebagai kalimat',
    O1.includes('TD 130/85 mmHg') && O1.includes('suhu 37.8 °C'));
/* Empat sistem normal tanpa satu pun temuan diringkas jadi satu kalimat.
   Menyalin lima kalimat baku "dalam batas normal" ke rekam medis membuat
   temuan yang penting tenggelam di antaranya. */
cek('sistem yang semuanya normal diringkas satu kalimat',
    O1.includes('dalam batas normal') && !O1.includes('Toraks — paru:'),
    O1);
cek('sistem yang tidak diperiksa tidak diakui normal',
    !O1.includes('Genitourinaria'));

const OBJ_ADA_TEMUAN = {
  keadaan_umum: 'Tampak sakit ringan',
  pemeriksaan_fisik: {
    UMUM: { status: 'NORMAL' },
    PARU: { status: 'ABNORMAL', temuan: 'Ronki basah halus basal kanan' }
  }
};
const O2 = P.susunObjective(OBJ_ADA_TEMUAN, KAJIAN, SISTEM);
cek('temuan abnormal ditulis lengkap dengan nama sistemnya',
    O2.includes('Toraks — paru: Ronki basah halus basal kanan'), O2);
/* Begitu ada satu yang abnormal, sistem normal diuraikan kalimat bakunya:
   "dalam batas normal" yang berdiri sendiri di sebelah temuan abnormal
   menyembunyikan apa saja yang sebenarnya sudah diperiksa. */
cek('bila ada temuan, sistem normal tetap diuraikan',
    O2.includes('Keadaan umum: Tampak sakit ringan'), O2);

const A = P.susunAssessment(DIAGNOSA, [{ kode: 'J18.9', nama: 'Pneumonia' }], null);
cek('A menyebut diagnosa kerja lebih dulu',
    A.startsWith('Diagnosa kerja: ISPA (J06.9)'), A);
cek('A memuat diagnosis banding',
    A.includes('Diagnosis banding: Pneumonia (J18.9)'));

const RESEP = [
  { nama_obat: 'Parasetamol 500 mg', jumlah: 10, satuan: 'Tablet',
    signa: '3 x sehari 1 tablet', frekuensi: 3, dosis: 1,
    kode_pcare: 'PCT500', obat_dpho: true },
  { nama_obat: 'Ambroksol 30 mg', jumlah: 10, satuan: 'Tablet',
    signa: '3 x sehari 1 tablet', frekuensi: 3, dosis: 1, obat_dpho: false }
];
const PLAN = P.susunPlan({
  terapi_non_obat: 'Kompres hangat, banyak minum',
  bmhp: 'Tidak Ada', edukasi: 'Istirahat cukup',
  tindak_lanjut: 'KONTROL', tanggal_kontrol: '2099-03-12',
  prognosa_nama: 'Bonam'
}, [{ kode: '93.94', nama: 'Nebulisasi' }], RESEP);
cek('P memuat terapi obat, tindakan, edukasi, dan rencana kontrol',
    PLAN.includes('Parasetamol 500 mg No. 10') &&
    PLAN.includes('Nebulisasi (93.94)') &&
    PLAN.includes('Edukasi: Istirahat cukup') &&
    PLAN.includes('Kontrol 2099-03-12'), PLAN);

const soap = P.susunSoap({
  anamnesis: ANAMNESIS, objektif: OBJ_ADA_TEMUAN, kajian: KAJIAN,
  sistemRef: SISTEM, diagnosa: DIAGNOSA, diagnosis_banding: [],
  rencana: { terapi_non_obat: 'Kompres hangat', tindak_lanjut: 'SELESAI' },
  tindakan: [], resep: RESEP
});
cek('susunSoap memulangkan keempat huruf sekaligus',
    !!(soap.subjective && soap.objective && soap.assessment && soap.plan));
cek('terapiObat ikut tersusun untuk PCare',
    soap.terapi_obat.includes('Parasetamol 500 mg No. 10'));


/* =====================================================================
   4. Payload PCare — bandingkan dengan test/uji_periksa.sql nomor 1
   ===================================================================== */
const PEMERIKSAAN = {
  keluhan_utama: 'Batuk berdahak sejak 3 hari',
  anamnesis: 'Batuk berdahak putih sejak 3 hari, demam hilang timbul.',
  kesadaran_kode: 'CM', status_pulang_kode: 'SEMBUH', prognosa_kode: 'BONAM',
  terapi_obat: 'Parasetamol 500 mg 3x1; Ambroksol 30 mg 3x1',
  terapi_non_obat: 'Kompres hangat, banyak minum', bmhp: 'Tidak Ada',
  tindak_lanjut: 'SELESAI'
};

const pl = P.payloadPcare({
  kunjungan: KUNJUNGAN, pasien: PASIEN, kajian: KAJIAN,
  pemeriksaan: PEMERIKSAAN, diagnosa: DIAGNOSA,
  kode_poli: '001', kode_dokter: '000123',
  kode_kesadaran: '01', kode_status_pulang: '3', kode_prognosa: '1'
});

/* Nilai-nilai berikut sama persis dengan yang di-assert uji_periksa.sql */
cek('payload: noKartu',      pl.noKartu === '0001234567890');
cek('payload: kdPoli',       pl.kdPoli === '001');
cek('payload: tglDaftar',    pl.tglDaftar === '09-03-2099', pl.tglDaftar);
cek('payload: tglPulang',    pl.tglPulang === '09-03-2099', pl.tglPulang);
cek('payload: sistole & diastole', pl.sistole === 130 && pl.diastole === 85);
cek('payload: heartRate dari nadi, respRate dari nafas',
    pl.heartRate === 88 && pl.respRate === 20);
cek('payload: beratBadan & lingkarPerut',
    pl.beratBadan === 62.0 && pl.lingkarPerut === 84.0);
cek('payload: kdDokter',     pl.kdDokter === '000123');
cek('payload: kdDiag1..3 mengikuti urutan primer dulu',
    pl.kdDiag1 === 'J06.9' && pl.kdDiag2 === 'R50.9' && pl.kdDiag3 === 'R05');
cek('payload: keluhan',      pl.keluhan === 'Batuk berdahak sejak 3 hari');
cek('payload: suhu berkoma', pl.suhu === '37,8');
cek('payload: terapiObat',   pl.terapiObat.startsWith('Parasetamol'));
cek('payload: bmhp',         pl.bmhp === 'Tidak Ada');
cek('payload: tanpa TACC terkirim -1', pl.kdTacc === '-1');
cek('payload: tanpa rujukan, rujukLanjut null — bukan objek kosong',
    pl.rujukLanjut === null);
cek('payload: tanpa alergi tercatat, ketiganya 00',
    pl.alergiMakan === '00' && pl.alergiUdara === '00' && pl.alergiObat === '00');

/* Field yang kosong tidak boleh menjadi string "Tidak Ada" yang keliru
   maupun undefined. PCare menolak field yang hilang. */
cek('payload memuat seluruh 30 field PCare',
    ['noKunjungan','noKartu','tglDaftar','kdPoli','keluhan','kdSadar','sistole',
     'diastole','beratBadan','tinggiBadan','respRate','heartRate','lingkarPerut',
     'suhu','kdStatusPulang','tglPulang','kdDokter','kdDiag1','kdDiag2','kdDiag3',
     'kdPoliRujukInternal','rujukLanjut','kdTacc','alasanTacc','anamnesa',
     'alergiMakan','alergiUdara','alergiObat','kdPrognosa','terapiObat',
     'terapiNonObat','bmhp'].every(k => k in pl),
    'field yang hilang: ' + ['noKunjungan','kdSadar','kdPrognosa','anamnesa']
      .filter(k => !(k in pl)).join(', '));

/* Rujukan lanjut — sama dengan uji SQL nomor 9 */
const plRujuk = P.payloadPcare({
  kunjungan: KUNJUNGAN, pasien: PASIEN, kajian: KAJIAN,
  pemeriksaan: Object.assign({}, PEMERIKSAAN, {
    tindak_lanjut: 'RUJUK_LANJUT', rujuk_ppk_kode: '0123R001',
    rujuk_tgl_estimasi: '2099-03-12', status_pulang_kode: 'RUJUK'
  }),
  diagnosa: DIAGNOSA, kode_poli: '001', kode_dokter: '000123',
  kode_subspesialis: 'PD1', kode_sarana: null
});
cek('rujukLanjut berbentuk objek bersarang',
    plRujuk.rujukLanjut && plRujuk.rujukLanjut.kdppk === '0123R001' &&
    plRujuk.rujukLanjut.subSpesialis.kdSubSpesialis1 === 'PD1');
cek('tglEstRujuk juga DD-MM-YYYY',
    plRujuk.rujukLanjut.tglEstRujuk === '12-03-2099');

/* Obat — sama dengan uji SQL nomor 14 & 15 */
const plObat = P.payloadPcareObat(RESEP, 'K-001');
cek('obat DPHO terkirim berkode, namanya diganti tanda hubung',
    plObat[0].obatDPHO === true && plObat[0].kdObat === 'PCT500' &&
    plObat[0].nmObatNonDPHO === '-');
cek('obat non-DPHO terkirim bernama, tanpa kode',
    plObat[1].obatDPHO === false && plObat[1].kdObat === null &&
    plObat[1].nmObatNonDPHO === 'Ambroksol 30 mg');
cek('signa1 & signa2 terkirim sebagai angka',
    plObat[0].signa1 === 3 && plObat[0].signa2 === 1 &&
    plObat[0].jmlObat === 10 && plObat[0].jmlPermintaan === 10);

/* Resep tanpa kolom frekuensi/dosis tetap terkirim: kalimatnya diurai. */
const plObat2 = P.payloadPcareObat(
  [{ nama_obat: 'Amoksisilin 500 mg', jumlah: 15, signa: '3dd1' }], 'K-001');
cek('resep lama tanpa kolom angka tetap terurai dari kalimatnya',
    plObat2[0].signa1 === 3 && plObat2[0].signa2 === 1);


/* =====================================================================
   5. Observasi SatuSehat — sama dengan uji SQL nomor 11-13
   ===================================================================== */
const obs = P.observasiSatuSehat(KAJIAN, OBJ_ADA_TEMUAN, VITAL, SISTEM);
const vital = obs.filter(o => o.kelompok === 'VITAL');
const fisik = obs.filter(o => o.kelompok === 'FISIK');

cek('11 tanda vital menjadi 11 Observation', vital.length === 11,
    'dapat ' + vital.length + ': ' + vital.map(v => v.kode_internal).join(','));
cek('panel tekanan darah tidak ikut sebagai nilai tunggal',
    !vital.some(v => v.kode_internal === 'tekanan_darah'));
cek('LOINC sistolik 8480-6',
    vital.find(v => v.kode_internal === 'sistolik').kode_loinc === '8480-6');
cek('suhu tetap angka di sisi SatuSehat',
    vital.find(v => v.kode_internal === 'suhu').nilai_angka === 37.8);

const tanpaSpo2 = P.observasiSatuSehat(
  Object.assign({}, KAJIAN, { spo2: null, lingkar_perut: null }),
  OBJ_ADA_TEMUAN, VITAL, SISTEM).filter(o => o.kelompok === 'VITAL');
cek('nilai yang tidak diukur tidak dikirim sebagai nol',
    tanpaSpo2.length === 9, 'dapat ' + tanpaSpo2.length);

cek('sistem normal mengirim kalimat bakunya, bukan kata "NORMAL"',
    fisik.find(f => f.kode_internal === 'UMUM').nilai_teks
      === 'Tampak sakit ringan, kesadaran compos mentis, gizi cukup');
cek('temuan abnormal terkirim apa adanya',
    fisik.find(f => f.kode_internal === 'PARU').nilai_teks
      === 'Ronki basah halus basal kanan');
cek('sistem yang tidak diperiksa tidak menjadi Observation',
    fisik.length === 2, 'dapat ' + fisik.length);


/* =====================================================================
   6. Kelengkapan — apa yang menolak simpan, apa yang cuma mengingatkan
   ===================================================================== */
const lengkap = P.periksaKelengkapan({
  kunjungan: KUNJUNGAN, kajian: KAJIAN, diagnosa: DIAGNOSA, resep: RESEP,
  pemeriksaan: Object.assign({}, PEMERIKSAAN, { pemeriksaan_fisik: { UMUM: { status: 'NORMAL' } } })
});
cek('pemeriksaan lengkap boleh dikunci', lengkap.boleh && lengkap.galat.length === 0,
    lengkap.galat.join(', '));

const kosong = P.periksaKelengkapan({
  kunjungan: KUNJUNGAN, kajian: {}, diagnosa: [], resep: [],
  pemeriksaan: { tindak_lanjut: 'SELESAI' }
});
cek('tanpa diagnosa dan keluhan, penguncian ditolak',
    !kosong.boleh &&
    kosong.galat.some(g => g.includes('diagnosa')) &&
    kosong.galat.some(g => g.includes('Keluhan')), kosong.galat.join(', '));

/* Kekurangan data BRIDGING tidak boleh menghalangi rekam medis. Sistem
   yang menolak menyimpan karena satu kolom PCare kosong akan segera
   dicari akalnya — dokter mengisi apa saja supaya tombolnya menyala. */
const tanpaPrognosa = P.periksaKelengkapan({
  kunjungan: KUNJUNGAN, kajian: KAJIAN, diagnosa: DIAGNOSA, resep: [],
  pemeriksaan: Object.assign({}, PEMERIKSAAN, {
    prognosa_kode: null, pemeriksaan_fisik: { UMUM: { status: 'NORMAL' } } })
});
cek('prognosa kosong hanya mengingatkan, tidak menolak',
    tanpaPrognosa.boleh &&
    tanpaPrognosa.peringatan.some(p => p.includes('Prognosa')));

const rujukTanpaTujuan = P.periksaKelengkapan({
  kunjungan: KUNJUNGAN, kajian: KAJIAN, diagnosa: DIAGNOSA, resep: [],
  pemeriksaan: Object.assign({}, PEMERIKSAAN, {
    tindak_lanjut: 'RUJUK_LANJUT', pemeriksaan_fisik: { UMUM: { status: 'NORMAL' } } })
});
cek('rujukan tanpa faskes tujuan ditolak, bukan diingatkan',
    !rujukTanpaTujuan.boleh &&
    rujukTanpaTujuan.galat.some(g => g.includes('faskes tujuan')));

const taccTanpaAlasan = P.periksaKelengkapan({
  kunjungan: KUNJUNGAN, kajian: KAJIAN, diagnosa: DIAGNOSA, resep: [],
  pemeriksaan: Object.assign({}, PEMERIKSAAN, {
    tacc_kode: 'C1', tacc_alasan: null,
    pemeriksaan_fisik: { UMUM: { status: 'NORMAL' } } })
});
cek('TACC tanpa alasan ditolak di layar, bukan menunggu ditolak BPJS',
    !taccTanpaAlasan.boleh && taccTanpaAlasan.galat.some(g => g.includes('TACC')));

const empatDiagnosa = P.periksaKelengkapan({
  kunjungan: KUNJUNGAN, kajian: KAJIAN, resep: [],
  diagnosa: DIAGNOSA.concat([{ kode: 'I10', nama: 'Hipertensi', jenis: 'SEKUNDER' }]),
  pemeriksaan: Object.assign({}, PEMERIKSAAN, { pemeriksaan_fisik: { UMUM: { status: 'NORMAL' } } })
});
cek('diagnosa keempat diberitahukan, dan disebut mana tiga yang terkirim',
    empatDiagnosa.boleh &&
    empatDiagnosa.peringatan.some(p => p.includes('J06.9, R50.9, R05')),
    empatDiagnosa.peringatan.join(' | '));

const signaBebas = P.periksaKelengkapan({
  kunjungan: KUNJUNGAN, kajian: KAJIAN, diagnosa: DIAGNOSA,
  resep: [{ nama_obat: 'Salep mata', jumlah: 1, signa: 'Oleskan tipis pada mata kanan' }],
  pemeriksaan: Object.assign({}, PEMERIKSAAN, { pemeriksaan_fisik: { UMUM: { status: 'NORMAL' } } })
});
cek('aturan pakai yang tidak berangka diberitahukan, bukan ditebak diam-diam',
    signaBebas.boleh &&
    signaBebas.peringatan.some(p => p.includes('Salep mata')));

/* Pasien umum tidak diganggu peringatan PCare: kliniknya juga melayani
   pasien bayar sendiri, dan bagi mereka lingkar perut memang tidak wajib. */
const pasienUmum = P.periksaKelengkapan({
  kunjungan: Object.assign({}, KUNJUNGAN, { cara_bayar: 'UMUM' }),
  kajian: { keluhan_utama: 'Nyeri lutut' }, diagnosa: DIAGNOSA, resep: [],
  pemeriksaan: Object.assign({}, PEMERIKSAAN, { pemeriksaan_fisik: { UMUM: { status: 'NORMAL' } } })
});
cek('pasien non-BPJS tidak diganggu peringatan lapangan PCare',
    !pasienUmum.peringatan.some(p => p.includes('PCare')),
    pasienUmum.peringatan.join(' | '));

console.log('\n' + lulus + ' pemeriksaan periksa_core LULUS');

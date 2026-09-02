/* =====================================================================
   DEMO — pengganti db.js untuk halaman demo.html
   Semua data ada di memori; tidak ada koneksi ke internet atau database.
   Perubahan hilang saat halaman dimuat ulang.
   File ini TIDAK dipakai oleh aplikasi sungguhan (app.html).
   ===================================================================== */
const DB = (() => {

  const uid = () => 'id-' + Math.random().toString(36).slice(2, 10);
  const hariIni = new Date().toISOString().slice(0, 10);
  const jamHariIni = (h, m) => new Date(`${hariIni}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`).toISOString();

  const FASKES = {
    id: 1, nama: 'Klinik Pratama Imanuel', jenis_faskes: 'Klinik Pratama',
    alamat: 'Jl. Diponegoro No. 45', kelurahan: 'Sekayu', kecamatan: 'Semarang Tengah',
    kabupaten: 'Kota Semarang', provinsi: 'Jawa Tengah', telepon: '(024) 3512345',
    email: 'klinikimanuel@contoh.id', penanggung_jawab: 'dr. Arthur Mantiri',
    kode_faskes_bpjs: '', kode_registrasi_kemenkes: '', satusehat_org_id: '',
    satusehat_location_id: '', no_izin: '', bridging_mulai_tanggal: null
  };

  const POLI = [
    { id: 'poli-1', kode: 'UMUM', nama: 'Poli Umum', jenis: 'UMUM', kode_pcare: '001', urutan: 1, aktif: true, satusehat_location_id: '' },
    { id: 'poli-2', kode: 'GIGI', nama: 'Poli Gigi', jenis: 'GIGI', kode_pcare: '002', urutan: 2, aktif: true, satusehat_location_id: '' },
    { id: 'poli-3', kode: 'KIA',  nama: 'Poli KIA / KB', jenis: 'KIA', kode_pcare: '003', urutan: 3, aktif: true, satusehat_location_id: '' }
  ];

  const PEGAWAI = [
    { id: 'peg-1', nama: 'dr. Arthur Mantiri', peran: 'dokter', no_sip: '446/SIP/2024/0091',
      jenis_dokter: 'UMUM', kode_dokter_pcare: '', satusehat_practitioner_id: '', aktif: true },
    { id: 'peg-5', nama: 'drg. Maya Saraswati', peran: 'dokter', no_sip: '446/SIP/2024/0117',
      jenis_dokter: 'GIGI', kode_dokter_pcare: '', satusehat_practitioner_id: '', aktif: true },
    { id: 'peg-2', nama: 'Ns. Sari Rahmawati', peran: 'perawat', aktif: true,
      no_sip: '', kode_dokter_pcare: '', satusehat_practitioner_id: '' },
    { id: 'peg-3', nama: 'Rina Puspita', peran: 'pendaftaran', aktif: true,
      no_sip: '', kode_dokter_pcare: '', satusehat_practitioner_id: '' },
    { id: 'peg-4', nama: 'apt. Dewi Lestari', peran: 'apoteker', aktif: true,
      no_sip: '', kode_dokter_pcare: '', satusehat_practitioner_id: '' }
  ];

  const ICD = [
    { kode: 'J06.9', nama_id: 'ISPA (Infeksi Saluran Napas Atas)', nama_en: 'Acute upper respiratory infection', sering_dipakai: true },
    { kode: 'I10',   nama_id: 'Hipertensi esensial (primer)', nama_en: 'Essential hypertension', sering_dipakai: true },
    { kode: 'E11.9', nama_id: 'Diabetes Melitus Tipe 2', nama_en: 'Type 2 diabetes mellitus', sering_dipakai: true },
    { kode: 'K30',   nama_id: 'Dispepsia', nama_en: 'Functional dyspepsia', sering_dipakai: true },
    { kode: 'M79.1', nama_id: 'Mialgia (nyeri otot)', nama_en: 'Myalgia', sering_dipakai: true },
    { kode: 'A09',   nama_id: 'Diare / Gastroenteritis akut', nama_en: 'Diarrhoea and gastroenteritis', sering_dipakai: true },
    { kode: 'R50.9', nama_id: 'Demam', nama_en: 'Fever, unspecified', sering_dipakai: true },
    { kode: 'J45.9', nama_id: 'Asma bronkial', nama_en: 'Asthma, unspecified', sering_dipakai: true },
    { kode: 'L23.9', nama_id: 'Dermatitis kontak alergi', nama_en: 'Allergic contact dermatitis', sering_dipakai: true },
    { kode: 'M54.5', nama_id: 'Nyeri punggung bawah (LBP)', nama_en: 'Low back pain', sering_dipakai: true },
    { kode: 'N39.0', nama_id: 'Infeksi Saluran Kemih (ISK)', nama_en: 'Urinary tract infection', sering_dipakai: true },
    { kode: 'M10.9', nama_id: 'Gout / Asam urat', nama_en: 'Gout, unspecified', sering_dipakai: true },
    { kode: 'E78.5', nama_id: 'Dislipidemia', nama_en: 'Hyperlipidaemia', sering_dipakai: true },
    { kode: 'K29.7', nama_id: 'Gastritis', nama_en: 'Gastritis, unspecified', sering_dipakai: true },
    { kode: 'H66.9', nama_id: 'Otitis media', nama_en: 'Otitis media, unspecified', sering_dipakai: false },
    { kode: 'B86',   nama_id: 'Skabies (kudis)', nama_en: 'Scabies', sering_dipakai: false },
    { kode: 'Z00.0', nama_id: 'Pemeriksaan kesehatan umum', nama_en: 'General medical examination', sering_dipakai: true }
  ];

  const OBAT = [
    { id: 'ob-1', nama: 'Paracetamol 500 mg', satuan: 'Tablet', bentuk_sediaan: 'Tablet', golongan: 'Bebas' },
    { id: 'ob-2', nama: 'Amoxicillin 500 mg', satuan: 'Tablet', bentuk_sediaan: 'Kaplet', golongan: 'Keras' },
    { id: 'ob-3', nama: 'Ambroxol 30 mg', satuan: 'Tablet', bentuk_sediaan: 'Tablet', golongan: 'Bebas Terbatas' },
    { id: 'ob-4', nama: 'Cetirizine 10 mg', satuan: 'Tablet', bentuk_sediaan: 'Tablet', golongan: 'Bebas Terbatas' },
    { id: 'ob-5', nama: 'Amlodipine 5 mg', satuan: 'Tablet', bentuk_sediaan: 'Tablet', golongan: 'Keras' },
    { id: 'ob-6', nama: 'Metformin 500 mg', satuan: 'Tablet', bentuk_sediaan: 'Tablet', golongan: 'Keras' },
    { id: 'ob-7', nama: 'Omeprazole 20 mg', satuan: 'Kapsul', bentuk_sediaan: 'Kapsul', golongan: 'Keras' },
    { id: 'ob-8', nama: 'Vitamin B Kompleks', satuan: 'Tablet', bentuk_sediaan: 'Tablet', golongan: 'Bebas' },
    { id: 'ob-9', nama: 'Asam Mefenamat 500 mg', satuan: 'Tablet', bentuk_sediaan: 'Kaplet', golongan: 'Keras' },
    { id: 'ob-10', nama: 'Oralit', satuan: 'Sachet', bentuk_sediaan: 'Serbuk', golongan: 'Bebas' }
  ];

  const SIGNA = [
    { id: 's1', kode: '1dd1', teks: '1 x sehari 1 tablet', frekuensi: 1, urutan: 1 },
    { id: 's2', kode: '2dd1', teks: '2 x sehari 1 tablet', frekuensi: 2, urutan: 2 },
    { id: 's3', kode: '3dd1', teks: '3 x sehari 1 tablet', frekuensi: 3, urutan: 3 },
    { id: 's4', kode: '3dd1prn', teks: '3 x sehari 1 tablet bila perlu', frekuensi: 3, urutan: 4 },
    { id: 's5', kode: 'ue', teks: 'Oleskan pada bagian yang sakit', urutan: 5 }
  ];

  const PASIEN = [
    { id: 'pas-1', no_rm: '000001', nik: '3374010101900001', no_bpjs: '0001234567890',
      nama: 'Budi Santoso', tempat_lahir: 'Semarang', tanggal_lahir: '1978-04-12',
      jenis_kelamin: 'L', gol_darah: 'O', agama: 'Islam', pekerjaan: 'Wiraswasta',
      status_kawin: 'Kawin', pendidikan: 'SMA/SMK',
      alamat: 'Jl. Merdeka No. 10', rt: '03', rw: '05', kelurahan: 'Sekayu',
      kecamatan: 'Semarang Tengah', kabupaten: 'Kota Semarang', provinsi: 'Jawa Tengah',
      no_hp: '081234567890', pj_nama: 'Sri Wahyuni', pj_hubungan: 'Istri', pj_no_hp: '081234567891',
      catatan_penting: 'Alergi berat Penisilin', aktif: true },
    { id: 'pas-2', no_rm: '000002', nik: '3374010202950002', no_bpjs: '0001234567891',
      nama: 'Siti Aminah', tempat_lahir: 'Kendal', tanggal_lahir: '1995-02-02',
      jenis_kelamin: 'P', gol_darah: 'A', agama: 'Islam', pekerjaan: 'Guru',
      status_kawin: 'Kawin', pendidikan: 'S1',
      alamat: 'Jl. Pandanaran No. 88', kelurahan: 'Mugassari', kecamatan: 'Semarang Selatan',
      kabupaten: 'Kota Semarang', provinsi: 'Jawa Tengah', no_hp: '081298765432', aktif: true },
    { id: 'pas-3', no_rm: '000003', nik: null, no_bpjs: '',
      nama: 'Ahmad Fauzi', tempat_lahir: 'Demak', tanggal_lahir: '1988-11-23',
      jenis_kelamin: 'L', gol_darah: 'B', agama: 'Islam', pekerjaan: 'Karyawan Swasta',
      status_kawin: 'Kawin', alamat: 'Jl. Gajahmada No. 12', kabupaten: 'Kota Semarang',
      provinsi: 'Jawa Tengah', no_hp: '085712345678', aktif: true },
    { id: 'pas-4', no_rm: '000004', nik: '3374011504200004', no_bpjs: '0001234567893',
      nama: 'Zahra Aulia', tempat_lahir: 'Semarang', tanggal_lahir: '2020-04-15',
      jenis_kelamin: 'P', agama: 'Islam', alamat: 'Jl. Melati No. 7',
      kabupaten: 'Kota Semarang', provinsi: 'Jawa Tengah', no_hp: '081377889900',
      pj_nama: 'Rina Kartika', pj_hubungan: 'Ibu', aktif: true },
    { id: 'pas-5', no_rm: '000005', nik: '3374012512550005', no_bpjs: '0001234567894',
      nama: 'Sutrisno Hadi', tempat_lahir: 'Solo', tanggal_lahir: '1955-12-25',
      jenis_kelamin: 'L', gol_darah: 'AB', agama: 'Kristen', pekerjaan: 'Pensiunan',
      status_kawin: 'Kawin', alamat: 'Jl. Sultan Agung No. 21', kabupaten: 'Kota Semarang',
      provinsi: 'Jawa Tengah', no_hp: '081556677889',
      catatan_penting: 'Riwayat stroke ringan 2023', aktif: true }
  ];


  /* ---------------- Referensi & data poli gigi ---------------- */
  const NAMA_TETAP = ['Insisivus sentral','Insisivus lateral','Kaninus','Premolar pertama',
                      'Premolar kedua','Molar pertama','Molar kedua','Molar ketiga'];
  const NAMA_SULUNG = ['Insisivus sentral sulung','Insisivus lateral sulung','Kaninus sulung',
                       'Molar pertama sulung','Molar kedua sulung'];
  const REF_GIGI = (() => {
    const out = [];
    for (let k = 1; k <= 8; k++) {
      const jenis = k <= 4 ? 'TETAP' : 'SULUNG';
      const batas = k <= 4 ? 8 : 5;
      const rahang = [1,2,5,6].includes(k) ? 'ATAS' : 'BAWAH';
      const sisi = [1,4,5,8].includes(k) ? 'KANAN' : 'KIRI';
      for (let p = 1; p <= batas; p++) {
        const nm = (jenis === 'TETAP' ? NAMA_TETAP : NAMA_SULUNG)[p - 1];
        out.push({ fdi: `${k}${p}`, nama: `${nm} ${rahang.toLowerCase()} ${sisi.toLowerCase()}`,
                   kuadran: k, rahang, sisi, jenis, posisi: p, kode_snomed: null });
      }
    }
    return out;
  })();

  const REF_KONDISI = [
    { kode:'sou', nama:'Sehat, tidak ada kelainan', kategori:'KONDISI',  per_bidang:true,  warna:'#FFFFFF', urutan:1 },
    { kode:'car', nama:'Karies',                    kategori:'KONDISI',  per_bidang:true,  warna:'#DC2626', urutan:2 },
    { kode:'cfr', eksklusif:false, nama:'Fraktur mahkota',           kategori:'KONDISI',  per_bidang:false, warna:'#EA580C', urutan:3 },
    { kode:'att', eksklusif:false, nama:'Atrisi / aus',              kategori:'KONDISI',  per_bidang:false, warna:'#D97706', urutan:4 },
    { kode:'ano', eksklusif:false, nama:'Anomali bentuk atau ukuran',kategori:'KONDISI',  per_bidang:false, warna:'#DB2777', urutan:5 },
    { kode:'nvt', eksklusif:false, nama:'Gigi non-vital',            kategori:'KONDISI',  per_bidang:false, warna:'#7C3AED', urutan:6 },
    { kode:'rrx', nama:'Sisa akar',                 kategori:'KONDISI',  per_bidang:false, warna:'#991B1B', urutan:7 },
    { kode:'mis', nama:'Gigi hilang (dicabut)',     kategori:'KONDISI',  per_bidang:false, warna:'#94A3B8', urutan:8 },
    { kode:'une', nama:'Belum erupsi',              kategori:'KONDISI',  per_bidang:false, warna:'#CBD5E1', urutan:9 },
    { kode:'pre', eksklusif:false, nama:'Erupsi sebagian',           kategori:'KONDISI',  per_bidang:false, warna:'#A5B4FC', urutan:10 },
    { kode:'amf', nama:'Tumpatan amalgam',          kategori:'TAMBALAN', per_bidang:true,  warna:'#1E293B', urutan:20 },
    { kode:'cof', nama:'Tumpatan komposit',         kategori:'TAMBALAN', per_bidang:true,  warna:'#2563EB', urutan:21 },
    { kode:'gif', nama:'Tumpatan glass ionomer',    kategori:'TAMBALAN', per_bidang:true,  warna:'#0EA5E9', urutan:22 },
    { kode:'fis', nama:'Fissure sealant',           kategori:'TAMBALAN', per_bidang:true,  warna:'#16A34A', urutan:23 },
    { kode:'rct', eksklusif:false, nama:'Perawatan saluran akar',    kategori:'PERAWATAN',per_bidang:false, warna:'#7C3AED', urutan:30 },
    { kode:'fmc', nama:'Mahkota logam penuh',       kategori:'MAHKOTA',  per_bidang:false, warna:'#64748B', urutan:40 },
    { kode:'poc', nama:'Mahkota porselen',          kategori:'MAHKOTA',  per_bidang:false, warna:'#A8A29E', urutan:41 },
    { kode:'ipx', nama:'Implan',                    kategori:'PROTESA',  per_bidang:false, warna:'#0F766E', urutan:50 },
    { kode:'pon', nama:'Pontik jembatan',           kategori:'PROTESA',  per_bidang:false, warna:'#64748B', urutan:52 },
    { kode:'prd', nama:'Gigi tiruan sebagian lepasan', kategori:'PROTESA', per_bidang:false, warna:'#6366F1', urutan:55 }
  ];

  const REF_BIDANG = [
    { kode:'O', nama:'Oklusal',    urutan:1 }, { kode:'M', nama:'Mesial', urutan:2 },
    { kode:'D', nama:'Distal',     urutan:3 }, { kode:'V', nama:'Vestibular', urutan:4 },
    { kode:'L', nama:'Lingual',    urutan:5 }
  ];

  const ICD9 = [
    { kode:'23.01', nama_id:'Pencabutan gigi sulung', kategori:'GIGI', sering_dipakai:true,  per_gigi:true },
    { kode:'23.09', nama_id:'Pencabutan gigi tetap',  kategori:'GIGI', sering_dipakai:true,  per_gigi:true },
    { kode:'23.11', nama_id:'Pencabutan sisa akar',   kategori:'GIGI', sering_dipakai:true,  per_gigi:true },
    { kode:'23.2',  nama_id:'Penambalan gigi',        kategori:'GIGI', sering_dipakai:true,  per_gigi:true },
    { kode:'23.70', nama_id:'Perawatan saluran akar', kategori:'GIGI', sering_dipakai:true,  per_gigi:true },
    { kode:'24.0',  nama_id:'Insisi gusi atau tulang alveolar', kategori:'GIGI', sering_dipakai:true, per_gigi:true },
    { kode:'96.54', nama_id:'Skeling dan pembersihan karang gigi', kategori:'GIGI', sering_dipakai:true, per_gigi:false },
    { kode:'89.31', nama_id:'Pemeriksaan gigi',       kategori:'GIGI', sering_dipakai:true,  per_gigi:false },
    { kode:'87.12', nama_id:'Rontgen gigi (periapikal)', kategori:'PENUNJANG', sering_dipakai:false, per_gigi:true },
    { kode:'86.59', nama_id:'Penjahitan luka (hecting)', kategori:'UMUM', sering_dipakai:true, per_gigi:false },
    { kode:'93.94', nama_id:'Nebulisasi',             kategori:'UMUM', sering_dipakai:true,  per_gigi:false },
    { kode:'96.52', nama_id:'Irigasi telinga (ekstraksi serumen)', kategori:'UMUM', sering_dipakai:true, per_gigi:false },
    { kode:'99.29', nama_id:'Injeksi obat lain',      kategori:'UMUM', sering_dipakai:true,  per_gigi:false }
  ];

  /* Odontogram contoh untuk Budi Santoso */
  const ODONTOGRAM = {
    'pas-1': {
      '16': { kondisi:null, bidang:{ O:'cof' }, catatan:null },
      '26': { kondisi:null, bidang:{ O:'amf', D:'amf' }, catatan:null },
      '36': { kondisi:null, bidang:{ O:'car', D:'car' }, catatan:'Nyeri saat kena dingin' },
      '37': { kondisi:null, bidang:{ O:'car' }, catatan:null },
      '46': { kondisi:'rct', bidang:{}, catatan:null },
      '18': { kondisi:'mis', bidang:{}, catatan:null },
      '28': { kondisi:'mis', bidang:{}, catatan:null },
      '48': { kondisi:'une', bidang:{}, catatan:'Impaksi, rencana rujuk bedah mulut' }
    },
    'pas-4': {
      '54': { kondisi:null, bidang:{ O:'car' }, catatan:null },
      '64': { kondisi:null, bidang:{ O:'car', V:'car' }, catatan:null },
      '75': { kondisi:'rrx', bidang:{}, catatan:null }
    }
  };
  const ODO_RIWAYAT = [];

  const PEMERIKSAAN_GIGI = [
    { kunjungan_id:'kunj-7', wajah:'Simetris', kelenjar_limfe:'Tidak teraba', tmj:'Normal',
      bibir:'Normal', mukosa_pipi:'Normal', gusi:'Hiperemis', lidah:'Normal',
      palatum:'Normal', dasar_mulut:'Normal', oklusi:'Normal bite',
      torus_palatinus:'Tidak ada', torus_mandibularis:'Tidak ada', supernumerary:false,
      kebersihan_mulut:'Sedang', ohis:2.1,
      d_decay:2, m_missing:2, f_filled:2, dmft:6, d_sulung:0, e_sulung:0, f_sulung:0, deft:0,
      catatan:null, dibuat_pada:jamHariIni(9, 20) }
  ];

  const TINDAKAN = [
    { id:'tin-1', kunjungan_id:'kunj-7', kode_icd9:'96.54',
      nama:'Skeling dan pembersihan karang gigi', fdi:null, jumlah:1, urutan:0 },
    { id:'tin-2', kunjungan_id:'kunj-7', kode_icd9:'23.2',
      nama:'Penambalan gigi', fdi:'36', jumlah:1, urutan:1 },
    { id:'tin-3', kunjungan_id:'kunj-9', kode_icd9:'89.01',
      nama:'Konsultasi dan evaluasi terbatas', fdi:null, jumlah:1, urutan:0 }
  ];


  /* ---------------- Rujukan berkode & master data ---------------- */
  const REF_KESADARAN = [
    { kode:'CM', nama:'Compos Mentis', keterangan:'Sadar penuh, orientasi baik', urutan:1 },
    { kode:'APATIS', nama:'Apatis', keterangan:'Acuh tak acuh terhadap sekitar', urutan:2 },
    { kode:'SOMNOLEN', nama:'Somnolen', keterangan:'Mengantuk, mudah dibangunkan', urutan:3 },
    { kode:'DELIRIUM', nama:'Delirium', keterangan:'Gelisah, disorientasi', urutan:4 },
    { kode:'SOPOR', nama:'Sopor', keterangan:'Hanya bereaksi terhadap rangsang kuat', urutan:5 },
    { kode:'SOPORO_KOMA', nama:'Soporo-koma', keterangan:'Reaksi sangat minimal', urutan:6 },
    { kode:'KOMA', nama:'Koma', keterangan:'Tidak ada reaksi', urutan:7 }
  ];
  const REF_STATUS_PULANG = [
    { kode:'SEMBUH', nama:'Sembuh', urutan:1 },
    { kode:'MEMBAIK', nama:'Membaik', urutan:2 },
    { kode:'BELUM_SEMBUH', nama:'Belum sembuh', urutan:3 },
    { kode:'RUJUK', nama:'Dirujuk', urutan:4 },
    { kode:'APS', nama:'Atas permintaan sendiri', urutan:5 },
    { kode:'MENINGGAL', nama:'Meninggal', urutan:6 }
  ];

  const ALERGI = [
    { id: 'al-1', pasien_id: 'pas-1', jenis: 'OBAT', nama: 'Penisilin',
      reaksi: 'Bengkak wajah dan sesak', tingkat: 'BERAT', dicatat_pada: '2024-03-11' },
    { id: 'al-2', pasien_id: 'pas-1', jenis: 'MAKANAN', nama: 'Udang',
      reaksi: 'Gatal seluruh badan', tingkat: 'SEDANG', dicatat_pada: '2024-03-11' }
  ];

  const KUNJUNGAN = [
    { id: 'kunj-1', no_kunjungan: hariIni.replace(/-/g,'') + '-0001', pasien_id: 'pas-1',
      tanggal: hariIni, poli_id: 'poli-1', dokter_id: 'peg-1', cara_bayar: 'BPJS',
      no_antrian: 1, jenis_kunjungan: 'LAMA', kunjungan_sakit: true, status: 'SELESAI',
      keluhan_singkat: 'Batuk dan pilek 3 hari', waktu_daftar: jamHariIni(7, 42),
      waktu_kajian: jamHariIni(8, 5), waktu_periksa: jamHariIni(8, 18), waktu_selesai: jamHariIni(8, 31),
      pcare_status: 'BELUM', satusehat_status: 'BELUM' },
    { id: 'kunj-2', no_kunjungan: hariIni.replace(/-/g,'') + '-0002', pasien_id: 'pas-5',
      tanggal: hariIni, poli_id: 'poli-1', dokter_id: 'peg-1', cara_bayar: 'BPJS',
      no_antrian: 2, jenis_kunjungan: 'LAMA', kunjungan_sakit: false, status: 'MENUNGGU_DOKTER',
      keluhan_singkat: 'Kontrol tekanan darah rutin', waktu_daftar: jamHariIni(8, 3),
      waktu_kajian: jamHariIni(8, 22), pcare_status: 'BELUM', satusehat_status: 'BELUM' },
    { id: 'kunj-3', no_kunjungan: hariIni.replace(/-/g,'') + '-0003', pasien_id: 'pas-2',
      tanggal: hariIni, poli_id: 'poli-1', dokter_id: 'peg-1', cara_bayar: 'BPJS',
      no_antrian: 3, jenis_kunjungan: 'BARU', kunjungan_sakit: true, status: 'MENUNGGU',
      keluhan_singkat: 'Nyeri ulu hati sejak semalam', waktu_daftar: jamHariIni(8, 25),
      pcare_status: 'BELUM', satusehat_status: 'BELUM' },
    { id: 'kunj-4', no_kunjungan: hariIni.replace(/-/g,'') + '-0004', pasien_id: 'pas-4',
      tanggal: hariIni, poli_id: 'poli-3', dokter_id: 'peg-1', cara_bayar: 'BPJS',
      no_antrian: 1, jenis_kunjungan: 'BARU', kunjungan_sakit: false, status: 'MENUNGGU',
      keluhan_singkat: 'Imunisasi lanjutan', waktu_daftar: jamHariIni(8, 40),
      pcare_status: 'BELUM', satusehat_status: 'BELUM' },
    { id: 'kunj-7', no_kunjungan: hariIni.replace(/-/g,'') + '-0005', pasien_id: 'pas-1',
      tanggal: hariIni, poli_id: 'poli-2', dokter_id: 'peg-5', cara_bayar: 'BPJS',
      no_antrian: 1, jenis_kunjungan: 'LAMA', kunjungan_sakit: true, status: 'MENUNGGU_DOKTER',
      keluhan_singkat: 'Gigi bawah kiri berlubang dan ngilu', waktu_daftar: jamHariIni(8, 55),
      waktu_kajian: jamHariIni(9, 10), pcare_status: 'BELUM', satusehat_status: 'BELUM' },
    { id: 'kunj-8', no_kunjungan: hariIni.replace(/-/g,'') + '-0006', pasien_id: 'pas-4',
      tanggal: hariIni, poli_id: 'poli-2', dokter_id: 'peg-5', cara_bayar: 'BPJS',
      no_antrian: 2, jenis_kunjungan: 'LAMA', kunjungan_sakit: true, status: 'MENUNGGU',
      keluhan_singkat: 'Gigi susu berlubang', waktu_daftar: jamHariIni(9, 5),
      pcare_status: 'BELUM', satusehat_status: 'BELUM' },
    /* Satu kunjungan UMUM. Tanpa ini seluruh data demo berpenjamin BPJS,
       dan halaman kasir hanya pernah memperlihatkan tagihan Rp 0 —
       setengah dari perilakunya tidak akan pernah terlihat. */
    { id: 'kunj-9', no_kunjungan: hariIni.replace(/-/g,'') + '-0007', pasien_id: 'pas-2',
      tanggal: hariIni, poli_id: 'poli-1', dokter_id: 'peg-1', cara_bayar: 'UMUM',
      no_antrian: 5, jenis_kunjungan: 'LAMA', kunjungan_sakit: true, status: 'SELESAI',
      keluhan_singkat: 'Nyeri ulu hati', waktu_daftar: jamHariIni(9, 20),
      waktu_kajian: jamHariIni(9, 35), waktu_periksa: jamHariIni(9, 48),
      waktu_selesai: jamHariIni(10, 2), pcare_status: 'TIDAK_PERLU', satusehat_status: 'BELUM' },
    { id: 'kunj-5', no_kunjungan: '20260812-0007', pasien_id: 'pas-1',
      tanggal: '2026-08-12', poli_id: 'poli-1', dokter_id: 'peg-1', cara_bayar: 'BPJS',
      no_antrian: 7, jenis_kunjungan: 'LAMA', kunjungan_sakit: true, status: 'SELESAI',
      keluhan_singkat: 'Nyeri lutut', waktu_daftar: '2026-08-12T01:10:00Z',
      waktu_selesai: '2026-08-12T02:05:00Z', pcare_status: 'BELUM', satusehat_status: 'BELUM' },
    { id: 'kunj-6', no_kunjungan: '20260728-0003', pasien_id: 'pas-5',
      tanggal: '2026-07-28', poli_id: 'poli-1', dokter_id: 'peg-1', cara_bayar: 'BPJS',
      no_antrian: 3, jenis_kunjungan: 'LAMA', kunjungan_sakit: false, status: 'SELESAI',
      keluhan_singkat: 'Kontrol rutin', waktu_daftar: '2026-07-28T01:30:00Z',
      waktu_selesai: '2026-07-28T02:00:00Z', pcare_status: 'BELUM', satusehat_status: 'BELUM' }
  ];

  const KAJIAN = [
    { kunjungan_id: 'kunj-1', keluhan_utama: 'Batuk berdahak dan pilek sejak 3 hari, demam naik turun',
      riwayat_penyakit_dahulu: 'Hipertensi terkontrol', riwayat_alergi: 'Penisilin',
      sistolik: 138, diastolik: 86, nadi: 88, nafas: 20, suhu: 37.8, spo2: 98,
      berat_badan: 72.5, tinggi_badan: 168, imt: 25.69, kesadaran: 'Compos Mentis', kesadaran_kode: 'CM',
      skala_nyeri: 2, risiko_jatuh: 'RENDAH', dibuat_pada: jamHariIni(8, 5) },
    { kunjungan_id: 'kunj-2', keluhan_utama: 'Tidak ada keluhan, kontrol tekanan darah rutin',
      riwayat_penyakit_dahulu: 'Hipertensi sejak 2018, riwayat stroke ringan 2023',
      sistolik: 152, diastolik: 94, nadi: 76, nafas: 18, suhu: 36.4, spo2: 97,
      berat_badan: 68, tinggi_badan: 165, imt: 24.98, kesadaran: 'Compos Mentis', kesadaran_kode: 'CM',
      skala_nyeri: 0, risiko_jatuh: 'SEDANG', dibuat_pada: jamHariIni(8, 22) }
  ];

  KAJIAN.push({ kunjungan_id: 'kunj-7',
    keluhan_utama: 'Gigi geraham bawah kiri berlubang, ngilu bila minum dingin sejak 2 minggu',
    sistolik: 126, diastolik: 80, nadi: 80, nafas: 18, suhu: 36.6, spo2: 98,
    berat_badan: 72.5, tinggi_badan: 168, imt: 25.69, kesadaran: 'Compos Mentis', kesadaran_kode: 'CM',
    skala_nyeri: 4, lokasi_nyeri: 'Gigi bawah kiri', risiko_jatuh: 'RENDAH',
    dibuat_pada: jamHariIni(9, 10) });

  const PEMERIKSAAN = [
    { kunjungan_id: 'kunj-1',
      subjective: 'Batuk berdahak warna putih sejak 3 hari, pilek, demam hilang timbul. Nafsu makan menurun. Tidak sesak.',
      objective: 'KU baik, compos mentis. Faring hiperemis, tonsil T1-T1 tenang. Rhonki (-), wheezing (-). Retraksi (-).',
      assessment: 'ISPA dengan demam. Tidak ada tanda pneumonia.',
      plan: 'Terapi simptomatik. Edukasi istirahat cukup, perbanyak minum. Kontrol bila demam menetap > 3 hari atau sesak.',
      tindak_lanjut: 'SELESAI', prognosa: 'Bonam', status_pulang: 'Sembuh', status_pulang_kode: 'SEMBUH',
      edukasi: 'Istirahat cukup, minum air hangat, hindari asap rokok. Segera kembali bila sesak atau demam tinggi menetap.',
      final: true, final_pada: jamHariIni(8, 31), dibuat_pada: jamHariIni(8, 18) },
    { kunjungan_id: 'kunj-5', subjective: 'Nyeri lutut kanan saat berjalan jauh',
      objective: 'Krepitasi lutut kanan (+), ROM terbatas ringan', assessment: 'Osteoartritis lutut',
      plan: 'Analgetik, fisioterapi ringan', tindak_lanjut: 'KONTROL', final: true,
      final_pada: '2026-08-12T02:05:00Z', dibuat_pada: '2026-08-12T01:40:00Z' }
  ];

  const DIAGNOSA = [
    { id: 'dx-1', kunjungan_id: 'kunj-1', kode_icd10: 'J06.9', nama: 'ISPA (Infeksi Saluran Napas Atas)', jenis: 'PRIMER', kasus: 'BARU', urutan: 0 },
    { id: 'dx-2', kunjungan_id: 'kunj-1', kode_icd10: 'R50.9', nama: 'Demam', jenis: 'SEKUNDER', kasus: 'BARU', urutan: 1 },
    { id: 'dx-3', kunjungan_id: 'kunj-5', kode_icd10: 'M17.9', nama: 'Osteoartritis lutut', jenis: 'PRIMER', kasus: 'BARU', urutan: 0 },
    { id: 'dx-4', kunjungan_id: 'kunj-6', kode_icd10: 'I10', nama: 'Hipertensi esensial (primer)', jenis: 'PRIMER', kasus: 'LAMA', urutan: 0 }
  ];

  const RESEP = [
    { id: 'rsp-1', kunjungan_id: 'kunj-1', no_resep: 'R260831001', status: 'DIBUAT',
      dibuat_pada: jamHariIni(8, 28), item: [
        { id: 'ri-1', resep_id: 'rsp-1', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
          jumlah: 10, satuan: 'Tablet', signa: '3 x sehari 1 tablet bila demam', urutan: 0 },
        { id: 'ri-2', resep_id: 'rsp-1', obat_id: 'ob-3', nama_obat: 'Ambroxol 30 mg',
          jumlah: 10, satuan: 'Tablet', signa: '3 x sehari 1 tablet', urutan: 1 },
        { id: 'ri-3', resep_id: 'rsp-1', obat_id: 'ob-4', nama_obat: 'Cetirizine 10 mg',
          jumlah: 5, satuan: 'Tablet', signa: '1 x sehari 1 tablet malam', urutan: 2 }
      ] }
  ];

  const ADDENDUM = [];
  const tunggu = (ms = 90) => new Promise(r => setTimeout(r, ms));
  const salin = (o) => JSON.parse(JSON.stringify(o));

  /* ---------------- API tiruan, bentuk sama dengan db.js ---------------- */
  const PERAN_DEMO = {
    dokter:      { ...PEGAWAI[0], email: 'dokter@klinikimanuel.id', poli: POLI[0] },
    'dokter gigi': { ...PEGAWAI.find(p => p.jenis_dokter === 'GIGI'),
                     email: 'drg@klinikimanuel.id', poli: POLI[1] },
    perawat:     { ...PEGAWAI.find(p => p.peran === 'perawat'), email: 'perawat@klinikimanuel.id' },
    pendaftaran: { ...PEGAWAI.find(p => p.peran === 'pendaftaran'), email: 'daftar@klinikimanuel.id' },
    apoteker:    { ...PEGAWAI.find(p => p.peran === 'apoteker'), email: 'apotek@klinikimanuel.id' },
    kasir:       { id: 'peg-6', nama: 'Yanti Kolondam', peran: 'kasir', aktif: true,
                   email: 'kasir@klinikimanuel.id' },
    admin:       { id: 'peg-0', nama: 'Admin Klinik', peran: 'admin', aktif: true,
                   email: 'admin@klinikimanuel.id' }
  };
  let PROFIL = PERAN_DEMO[localStorage.getItem('demo-peran') || 'dokter'] || PERAN_DEMO.dokter;

  function gantiPeranDemo(kunci) {
    if (!PERAN_DEMO[kunci]) return;
    try { localStorage.setItem('demo-peran', kunci); } catch (e) { /* abaikan */ }
    PROFIL = PERAN_DEMO[kunci];
    location.reload();
  }
  function peranDemoSekarang() {
    return Object.keys(PERAN_DEMO).find(k => PERAN_DEMO[k].id === PROFIL.id
      && PERAN_DEMO[k].peran === PROFIL.peran) || 'dokter';
  }

  async function saya() { await tunggu(40); return PROFIL; }
  async function sesi() { return { user: { id: PROFIL.id } }; }
  async function keluar() { alert('Ini halaman demo — tombol keluar dinonaktifkan.'); }
  async function masuk() { return { user: { id: PROFIL.id } }; }

  async function faskes() { await tunggu(30); return salin(FASKES); }
  async function simpanFaskes(p) { Object.assign(FASKES, p); return salin(FASKES); }

  async function daftarPoli() { await tunggu(30); return salin(POLI); }
  async function daftarDokter(jenis = null) {
    const d = PEGAWAI.filter(p => p.peran === 'dokter');
    return jenis ? d.filter(p => !p.jenis_dokter || p.jenis_dokter === jenis) : d;
  }
  async function daftarPegawai() { return salin(PEGAWAI); }
  async function daftarSigna() { return salin(SIGNA); }

  async function cariIcd(kata) {
    await tunggu(60);
    if (!kata || kata.length < 2) return ICD.filter(i => i.sering_dipakai);
    const k = kata.toLowerCase();
    return ICD.filter(i => i.kode.toLowerCase().includes(k) ||
      (i.nama_id || '').toLowerCase().includes(k) || (i.nama_en || '').toLowerCase().includes(k));
  }
  async function cariObat(kata) {
    await tunggu(60);
    if (!kata || kata.length < 2) return salin(OBAT);
    const k = kata.toLowerCase();
    return OBAT.filter(o => o.nama.toLowerCase().includes(k));
  }

  async function cariPasien(kata) {
    await tunggu(70);
    if (!kata || kata.trim().length < 2) return salin(PASIEN);
    const k = kata.toLowerCase();
    return PASIEN.filter(p => p.nama.toLowerCase().includes(k) ||
      p.no_rm.includes(k) || (p.nik || '').includes(k) || (p.no_bpjs || '').includes(k));
  }
  async function pasien(id) { await tunggu(40); return salin(PASIEN.find(p => p.id === id)); }
  async function simpanPasien(d, id) {
    await tunggu(120);
    if (id) { Object.assign(PASIEN.find(p => p.id === id), d); return salin(PASIEN.find(p => p.id === id)); }
    const baru = { ...d, id: uid(), no_rm: String(PASIEN.length + 1).padStart(6, '0'), aktif: true };
    PASIEN.push(baru); return salin(baru);
  }
  async function alergiPasien(id) { return ALERGI.filter(a => a.pasien_id === id); }
  async function tambahAlergi(r) { const b = { ...r, id: uid(), dicatat_pada: new Date().toISOString() }; ALERGI.push(b); return b; }
  async function hapusAlergi(id) { const i = ALERGI.findIndex(a => a.id === id); if (i >= 0) ALERGI.splice(i, 1); }
  async function catatAkses() { /* demo: tidak ada audit */ }

  const lengkapiKunjungan = (k) => ({
    ...k,
    pasien: salin(PASIEN.find(p => p.id === k.pasien_id)),
    poli: salin(POLI.find(p => p.id === k.poli_id)),
    dokter: salin(PEGAWAI.find(p => p.id === k.dokter_id))
  });

  async function antrianHariIni() {
    await tunggu(60);
    return KUNJUNGAN.filter(k => k.tanggal === hariIni).map(k => {
      const p = PASIEN.find(x => x.id === k.pasien_id);
      return {
        id: k.id, no_kunjungan: k.no_kunjungan, no_antrian: k.no_antrian, tanggal: k.tanggal,
        status: k.status, cara_bayar: k.cara_bayar, keluhan_singkat: k.keluhan_singkat,
        waktu_daftar: k.waktu_daftar, pasien_id: p.id, no_rm: p.no_rm, nama_pasien: p.nama,
        tanggal_lahir: p.tanggal_lahir, jenis_kelamin: p.jenis_kelamin, no_bpjs: p.no_bpjs,
        no_hp: p.no_hp, nama_poli: POLI.find(x => x.id === k.poli_id)?.nama,
        poli_id: k.poli_id, dokter_id: k.dokter_id,
        nama_dokter: PEGAWAI.find(x => x.id === k.dokter_id)?.nama,
        sudah_kajian: KAJIAN.some(x => x.kunjungan_id === k.id),
        sudah_periksa: PEMERIKSAAN.some(x => x.kunjungan_id === k.id)
      };
    }).sort((a, b) => a.no_antrian - b.no_antrian);
  }

  async function daftarKunjungan(f = {}) {
    await tunggu(60);
    let d = KUNJUNGAN.slice();
    if (f.pasien_id) d = d.filter(k => k.pasien_id === f.pasien_id);
    if (f.dari) d = d.filter(k => k.tanggal >= f.dari);
    if (f.sampai) d = d.filter(k => k.tanggal <= f.sampai);
    return d.map(k => {
      const p = PASIEN.find(x => x.id === k.pasien_id);
      const dg = DIAGNOSA.filter(x => x.kunjungan_id === k.id);
      return {
        id: k.id, no_kunjungan: k.no_kunjungan, tanggal: k.tanggal, status: k.status,
        cara_bayar: k.cara_bayar, pasien_id: p.id, no_rm: p.no_rm, nama_pasien: p.nama,
        nama_poli: POLI.find(x => x.id === k.poli_id)?.nama,
        nama_dokter: PEGAWAI.find(x => x.id === k.dokter_id)?.nama,
        daftar_diagnosa: dg.map(x => `${x.kode_icd10} - ${x.nama}`).join('; ') || null,
        icd_primer: dg.find(x => x.jenis === 'PRIMER')?.kode_icd10 || null,
        pcare_status: k.pcare_status, satusehat_status: k.satusehat_status
      };
    }).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }

  async function buatKunjungan(rec) {
    await tunggu(150);
    const sehari = KUNJUNGAN.filter(k => k.tanggal === hariIni);
    const sePoli = sehari.filter(k => k.poli_id === rec.poli_id);
    const baru = {
      ...rec, id: uid(), tanggal: hariIni,
      no_kunjungan: hariIni.replace(/-/g,'') + '-' + String(sehari.length + 1).padStart(4, '0'),
      no_antrian: sePoli.length + 1,
      jenis_kunjungan: KUNJUNGAN.some(k => k.pasien_id === rec.pasien_id) ? 'LAMA' : 'BARU',
      status: 'MENUNGGU', waktu_daftar: new Date().toISOString(),
      pcare_status: 'BELUM', satusehat_status: 'BELUM'
    };
    KUNJUNGAN.push(baru); return salin(baru);
  }
  async function kunjungan(id) { await tunggu(50); return lengkapiKunjungan(KUNJUNGAN.find(k => k.id === id)); }
  async function ubahKunjungan(id, patch) { Object.assign(KUNJUNGAN.find(k => k.id === id), patch); }

  async function kajian(id) { await tunggu(40); const d = KAJIAN.find(k => k.kunjungan_id === id); return d ? salin(d) : null; }
  async function simpanKajian(id, rec) {
    await tunggu(160);
    const ada = KAJIAN.find(k => k.kunjungan_id === id);
    const bb = Number(rec.berat_badan), tb = Number(rec.tinggi_badan);
    rec.imt = (bb > 0 && tb > 0) ? +(bb / Math.pow(tb / 100, 2)).toFixed(2) : null;
    if (ada) Object.assign(ada, rec);
    else KAJIAN.push({ ...rec, kunjungan_id: id, dibuat_pada: new Date().toISOString() });
    const k = KUNJUNGAN.find(x => x.id === id);
    if (k && ['MENUNGGU', 'KAJIAN_AWAL'].includes(k.status)) {
      k.status = 'MENUNGGU_DOKTER'; k.waktu_kajian = new Date().toISOString();
    }
    return rec;
  }

  async function pemeriksaan(id) { await tunggu(40); const d = PEMERIKSAAN.find(p => p.kunjungan_id === id); return d ? salin(d) : null; }
  async function simpanPemeriksaan(id, rec) {
    await tunggu(160);
    const ada = PEMERIKSAAN.find(p => p.kunjungan_id === id);
    if (ada) { if (ada.final) throw new Error('Rekam medis sudah difinalisasi.'); Object.assign(ada, rec); }
    else PEMERIKSAAN.push({ ...rec, kunjungan_id: id, final: false, dibuat_pada: new Date().toISOString() });
    const k = KUNJUNGAN.find(x => x.id === id);
    if (k && k.status !== 'SELESAI') { k.status = 'PEMERIKSAAN'; k.waktu_periksa = k.waktu_periksa || new Date().toISOString(); }
    return rec;
  }
  async function finalisasi(id) {
    await tunggu(120);
    const p = PEMERIKSAAN.find(x => x.kunjungan_id === id);
    if (p) { p.final = true; p.final_pada = new Date().toISOString(); }
    const k = KUNJUNGAN.find(x => x.id === id);
    if (k) { k.status = 'SELESAI'; k.waktu_selesai = new Date().toISOString(); }
    return p;
  }
  async function tambahAddendum(id, isi, alasan) {
    const a = { id: uid(), kunjungan_id: id, isi, alasan, dibuat_pada: new Date().toISOString(),
                penulis: { nama: PROFIL.nama } };
    ADDENDUM.push(a); return a;
  }
  async function daftarAddendum(id) { return ADDENDUM.filter(a => a.kunjungan_id === id); }

  async function diagnosa(id) { await tunggu(40); return DIAGNOSA.filter(d => d.kunjungan_id === id); }
  async function simpanDiagnosa(id, daftar) {
    await tunggu(120);
    for (let i = DIAGNOSA.length - 1; i >= 0; i--) if (DIAGNOSA[i].kunjungan_id === id) DIAGNOSA.splice(i, 1);
    daftar.forEach((d, i) => DIAGNOSA.push({
      id: uid(), kunjungan_id: id, kode_icd10: d.kode, nama: d.nama,
      jenis: d.jenis || (i === 0 ? 'PRIMER' : 'SEKUNDER'), kasus: d.kasus || 'BARU', urutan: i
    }));
    return DIAGNOSA.filter(d => d.kunjungan_id === id);
  }

  async function resep(id) { await tunggu(40); const r = RESEP.find(x => x.kunjungan_id === id); return r ? salin(r) : null; }
  async function simpanResep(id, item, catatan) {
    await tunggu(120);
    let r = RESEP.find(x => x.kunjungan_id === id);
    if (!r) { r = { id: uid(), kunjungan_id: id, no_resep: 'R' + Date.now().toString().slice(-6),
                    catatan, status: 'DIBUAT', dibuat_pada: new Date().toISOString(), item: [] };
              RESEP.push(r); }
    r.catatan = catatan;
    r.item = item.map((o, i) => ({ ...o, id: uid(), resep_id: r.id, urutan: i }));
    return salin(r);
  }


  /* ---------------- Poli gigi ---------------- */
  async function refGigi() { await tunggu(30); return salin(REF_GIGI); }
  async function refKondisiGigi() { await tunggu(30); return salin(REF_KONDISI); }
  async function refBidangGigi() { return salin(REF_BIDANG); }

  async function odontogram(pasienId) {
    await tunggu(50);
    return salin(ODONTOGRAM[pasienId] || {});
  }
  async function odontogramPadaKunjungan(pasienId) {
    return await odontogram(pasienId);
  }
  async function simpanOdontogram(pasienId, kunjunganId, baru) {
    await tunggu(140);
    const lama = ODONTOGRAM[pasienId] || {};
    Object.keys(baru).forEach(fdi => {
      const sebelum = lama[fdi];
      const sesudah = baru[fdi];
      const sama = JSON.stringify(sebelum || null) === JSON.stringify(sesudah);
      if (!sama) {
        ODO_RIWAYAT.push({ id: uid(), pasien_id: pasienId, fdi, kunjungan_id: kunjunganId,
          kondisi_lama: sebelum?.kondisi ?? null, bidang_lama: sebelum?.bidang ?? null,
          kondisi_baru: sesudah.kondisi ?? null, bidang_baru: sesudah.bidang ?? null,
          waktu: new Date().toISOString() });
      }
    });
    ODONTOGRAM[pasienId] = salin(baru);
    return { diperbarui: Object.keys(baru).length, dihapus: 0 };
  }
  async function riwayatOdontogram(pasienId) {
    return ODO_RIWAYAT.filter(r => r.pasien_id === pasienId)
      .sort((a, b) => b.waktu.localeCompare(a.waktu));
  }

  async function pemeriksaanGigi(kunjunganId) {
    await tunggu(40);
    const d = PEMERIKSAAN_GIGI.find(x => x.kunjungan_id === kunjunganId);
    return d ? salin(d) : null;
  }
  async function simpanPemeriksaanGigi(kunjunganId, rec) {
    await tunggu(140);
    const ada = PEMERIKSAAN_GIGI.find(x => x.kunjungan_id === kunjunganId);
    rec.dmft = (rec.d_decay || 0) + (rec.m_missing || 0) + (rec.f_filled || 0);
    rec.deft = (rec.d_sulung || 0) + (rec.e_sulung || 0) + (rec.f_sulung || 0);
    if (ada) Object.assign(ada, rec);
    else PEMERIKSAAN_GIGI.push({ ...rec, kunjungan_id: kunjunganId,
                                 dibuat_pada: new Date().toISOString() });
    return rec;
  }

  async function cariIcd9(kata, kategori = null) {
    await tunggu(60);
    let d = ICD9.slice();
    if (kategori) {
      const daftar = Array.isArray(kategori) ? kategori : [kategori];
      d = d.filter(t => daftar.includes(t.kategori));
    }
    if (!kata || kata.length < 2) return d.filter(t => t.sering_dipakai);
    const k = kata.toLowerCase();
    return d.filter(t => t.kode.includes(k) || t.nama_id.toLowerCase().includes(k));
  }
  async function tindakan(kunjunganId) {
    await tunggu(40);
    return TINDAKAN.filter(t => t.kunjungan_id === kunjunganId)
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0))
      .map(t => ({ ...t, ref: { per_gigi: !!ICD9.find(x => x.kode === t.kode_icd9)?.per_gigi } }));
  }
  async function simpanTindakan(kunjunganId, daftar) {
    await tunggu(120);
    for (let i = TINDAKAN.length - 1; i >= 0; i--)
      if (TINDAKAN[i].kunjungan_id === kunjunganId) TINDAKAN.splice(i, 1);
    daftar.forEach((t, i) => TINDAKAN.push({
      id: uid(), kunjungan_id: kunjunganId, kode_icd9: t.kode, nama: t.nama,
      fdi: t.fdi || null, jumlah: t.jumlah || 1, catatan: t.catatan || null, urutan: i
    }));
    return TINDAKAN.filter(t => t.kunjungan_id === kunjunganId);
  }

  async function rekamMedisLengkap(id) {
    const [k, ka, pm, dg, rs, ad, pg, td] = await Promise.all([
      kunjungan(id), kajian(id), pemeriksaan(id), diagnosa(id), resep(id), daftarAddendum(id),
      pemeriksaanGigi(id), tindakan(id)
    ]);
    return { kunjungan: k, kajian: ka, pemeriksaan: pm, diagnosa: dg, resep: rs,
             addendum: ad, gigi: pg, tindakan: td };
  }

  async function statistikHariIni() {
    await tunggu(50);
    const h = KUNJUNGAN.filter(k => k.tanggal === hariIni);
    return {
      kunjungan_hari_ini: h.length,
      selesai_hari_ini: h.filter(k => k.status === 'SELESAI').length,
      dalam_antrian: h.filter(k => k.status !== 'SELESAI').length,
      total_pasien: PASIEN.length
    };
  }
  async function diagnosaTeratas(dari, sampai, batas = 10) {
    await tunggu(60);
    const ids = KUNJUNGAN.filter(k => k.tanggal >= dari && k.tanggal <= sampai).map(k => k.id);
    const h = {};
    DIAGNOSA.filter(d => ids.includes(d.kunjungan_id)).forEach(d => {
      if (!h[d.kode_icd10]) h[d.kode_icd10] = { kode: d.kode_icd10, nama: d.nama, jml: 0 };
      h[d.kode_icd10].jml++;
    });
    return Object.values(h).sort((a, b) => b.jml - a.jml).slice(0, batas);
  }

  async function tindakanTeratas(dari, sampai, batas = 12) {
    await tunggu(60);
    const ids = KUNJUNGAN.filter(k => k.tanggal >= dari && k.tanggal <= sampai).map(k => k.id);
    const h = {};
    TINDAKAN.filter(t => ids.includes(t.kunjungan_id)).forEach(t => {
      if (!h[t.kode_icd9]) h[t.kode_icd9] = { kode: t.kode_icd9, nama: t.nama, jml: 0 };
      h[t.kode_icd9].jml++;
    });
    return Object.values(h).sort((a, b) => b.jml - a.jml).slice(0, batas);
  }


  /* ---------------- Rujukan berkode ---------------- */
  async function refKesadaran() { await tunggu(30); return salin(REF_KESADARAN); }
  async function refStatusPulang() { await tunggu(30); return salin(REF_STATUS_PULANG); }

  /* ---------------- Master data ---------------- */
  async function daftarObat(kata = '', ikutNonaktif = false) {
    await tunggu(70);
    let d = OBAT.filter(o => ikutNonaktif || o.aktif !== false);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim().toLowerCase();
      d = d.filter(o => (o.nama || '').toLowerCase().includes(k)
        || (o.kode_internal || '').toLowerCase().includes(k));
    }
    return salin(d.map(o => ({ aktif: true, formularium: false, harga: 0, ...o })));
  }
  async function simpanObat(rec, id = null) {
    await tunggu(120);
    if (id) {
      const o = OBAT.find(x => x.id === id);
      if (o) Object.assign(o, rec);
      return salin(o);
    }
    const baru = { id: uid(), aktif: true, ...rec };
    OBAT.push(baru);
    return salin(baru);
  }
  async function imporObat(baris) {
    await tunggu(240);
    baris.forEach(b => {
      const ada = b.kode_internal && OBAT.find(o => o.kode_internal === b.kode_internal);
      if (ada) Object.assign(ada, b);
      else OBAT.push({ id: uid(), ...b });
    });
    return { jumlah: baris.length };
  }

  async function daftarIcd10(kata = '', hanyaFavorit = false) {
    await tunggu(70);
    let d = ICD.map(x => ({ aktif: true, kategori: null, ...x }));
    if (hanyaFavorit) d = d.filter(x => x.sering_dipakai);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim().toLowerCase();
      d = d.filter(x => x.kode.toLowerCase().includes(k)
        || (x.nama_id || '').toLowerCase().includes(k)
        || (x.nama_en || '').toLowerCase().includes(k));
    }
    return salin(d);
  }
  async function simpanIcd10(rec, kode = null) {
    await tunggu(110);
    if (kode) {
      const d = ICD.find(x => x.kode === kode);
      if (d) Object.assign(d, rec);
      return salin(d);
    }
    ICD.push({ aktif: true, ...rec });
    return salin(rec);
  }

  async function daftarIcd9(kata = '', kategori = null) {
    await tunggu(70);
    let d = ICD9.map(x => ({ aktif: true, ...x }));
    if (kategori) d = d.filter(x => x.kategori === kategori);
    if (kata && kata.trim().length >= 2) {
      const k = kata.trim().toLowerCase();
      d = d.filter(x => x.kode.includes(k) || (x.nama_id || '').toLowerCase().includes(k));
    }
    return salin(d);
  }
  async function simpanIcd9(rec, kode = null) {
    await tunggu(110);
    if (kode) {
      const d = ICD9.find(x => x.kode === kode);
      if (d) Object.assign(d, rec);
      return salin(d);
    }
    ICD9.push({ aktif: true, ...rec });
    return salin(rec);
  }

  /* ---------------- Kesiapan data ---------------- */
  function hitungKekuranganPasien(p) {
    const kurang = [];
    if (!p.nik || !/^[0-9]{16}$/.test(p.nik)) kurang.push('NIK belum diisi atau bukan 16 angka');
    const adaBpjs = KUNJUNGAN.some(k => k.pasien_id === p.id && k.cara_bayar === 'BPJS');
    if (adaBpjs && (!p.no_bpjs || !/^[0-9]{13}$/.test(p.no_bpjs)))
      kurang.push('Nomor BPJS belum diisi atau bukan 13 angka');
    return kurang;
  }
  async function kesiapanPasien({ hanyaKurang = true, pasienId = null } = {}) {
    await tunggu(80);
    let d = PASIEN.filter(p => p.aktif !== false);
    if (pasienId) d = d.filter(p => p.id === pasienId);
    const hasil = d.map(p => {
      const kunj = KUNJUNGAN.filter(k => k.pasien_id === p.id);
      return {
        id: p.id, no_rm: p.no_rm, nama: p.nama, nik: p.nik, no_bpjs: p.no_bpjs,
        no_hp: p.no_hp, tanggal_lahir: p.tanggal_lahir,
        jml_kunjungan: kunj.length,
        kunjungan_terakhir: kunj.length
          ? kunj.map(k => k.tanggal).sort().slice(-1)[0] : null,
        kekurangan: hitungKekuranganPasien(p)
      };
    });
    return hanyaKurang ? hasil.filter(r => r.kekurangan.length) : hasil;
  }
  async function kesiapanKunjungan({ hanyaKurang = true } = {}) {
    await tunggu(80);
    const hasil = KUNJUNGAN.filter(k => k.status === 'SELESAI').map(k => {
      const p = PASIEN.find(x => x.id === k.pasien_id) || {};
      const po = POLI.find(x => x.id === k.poli_id) || {};
      const d = PEGAWAI.find(x => x.id === k.dokter_id);
      const kurang = [];
      if (!p.nik || !/^[0-9]{16}$/.test(p.nik)) kurang.push('NIK pasien belum benar');
      if (!k.dokter_id) kurang.push('Dokter pemeriksa belum ditentukan');
      else if (!d?.satusehat_practitioner_id) kurang.push('Nomor IHS dokter belum diisi');
      if (!po.satusehat_location_id) kurang.push('Location ID poli belum diisi');
      if (!DIAGNOSA.some(x => x.kunjungan_id === k.id)) kurang.push('Belum ada diagnosa ICD-10');
      if (k.cara_bayar === 'BPJS' && !d?.kode_dokter_pcare) kurang.push('Kode dokter PCare belum diisi');
      if (k.cara_bayar === 'BPJS' && !po.kode_pcare) kurang.push('Kode poli PCare belum diisi');
      return { id: k.id, no_kunjungan: k.no_kunjungan, tanggal: k.tanggal, status: k.status,
               cara_bayar: k.cara_bayar, pasien_id: p.id, no_rm: p.no_rm, nama_pasien: p.nama,
               nama_poli: po.nama, nama_dokter: d?.nama, kekurangan: kurang };
    });
    return hanyaKurang ? hasil.filter(r => r.kekurangan.length) : hasil;
  }
  async function ringkasanKesiapan() {
    const [p, k] = await Promise.all([
      kesiapanPasien({ hanyaKurang: false }), kesiapanKunjungan({ hanyaKurang: false })
    ]);
    return {
      pasien_total: p.length, pasien_kurang: p.filter(x => x.kekurangan.length).length,
      kunjungan_total: k.length, kunjungan_kurang: k.filter(x => x.kekurangan.length).length
    };
  }

  async function panggilBridging() { throw new Error('Bridging tidak tersedia di mode demo.'); }
  async function riwayatBridging() { return []; }
  const bolehTulis = () => true;

  /* Objek `sb` tiruan supaya halaman Pengaturan tidak error */
  const PESAN_DEMO = { message: 'Mode demo — perubahan tidak disimpan.' };
  const sb = { from: () => ({
    insert: async () => ({ error: PESAN_DEMO }),
    update: () => ({ eq: async () => ({ error: PESAN_DEMO }) })
  }) };

  /* ===================================================================
     APOTEK & KASIR — data contoh
     ------------------------------------------------------------------
     Mesin FEFO yang sebenarnya ada di database (08_apotek.sql). Yang di
     sini hanya tiruan secukupnya agar halaman demo bisa dijelajahi:
     alokasinya memakai ApotekCore.simulasiFefo, fungsi murni yang sama
     dengan yang dipakai pratinjau di aplikasi sungguhan.
     =================================================================== */

  // Harga jual per obat, dipakai kasir saat menagih obat yang diserahkan.
  const HARGA_JUAL = { 'ob-1': 1000, 'ob-2': 2500, 'ob-3': 1500, 'ob-4': 2000,
                       'ob-5': 3000, 'ob-6': 1500, 'ob-7': 3500, 'ob-8': 800 };
  OBAT.forEach(o => { o.harga = HARGA_JUAL[o.id] || 1000; o.aktif = true; });

  const geser = (h) => { const d = new Date(); d.setDate(d.getDate() + h);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const BATCH = [
    { id: 'bt-1', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg', satuan: 'Tablet',
      tgl_expired: geser(400), tgl_masuk: geser(-60), no_faktur: 'FK-2026/07/001',
      pbf: 'PT Kimia Farma', harga_beli: 600, stok_awal: 500, stok_sisa: 320,
      created_at: geser(-60) },
    /* Batch ini masuk BELAKANGAN tapi expired lebih dekat. Dengan FIFO ia
       akan mengendap sampai kadaluwarsa; dengan FEFO ia keluar duluan —
       inilah perbedaan yang membuat modulnya ditulis ulang. */
    { id: 'bt-2', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg', satuan: 'Tablet',
      tgl_expired: geser(25), tgl_masuk: geser(-10), no_faktur: 'FK-2026/08/014',
      pbf: 'PT Enseval', harga_beli: 650, stok_awal: 100, stok_sisa: 80,
      created_at: geser(-10) },
    { id: 'bt-3', obat_id: 'ob-2', nama_obat: 'Amoxicillin 500 mg', satuan: 'Tablet',
      tgl_expired: geser(300), tgl_masuk: geser(-45), no_faktur: 'FK-2026/07/002',
      pbf: 'PT Kimia Farma', harga_beli: 1400, stok_awal: 300, stok_sisa: 6,
      created_at: geser(-45) },
    { id: 'bt-4', obat_id: 'ob-3', nama_obat: 'Ambroxol 30 mg', satuan: 'Tablet',
      tgl_expired: geser(-12), tgl_masuk: geser(-380), no_faktur: 'FK-2025/08/031',
      pbf: 'PT Enseval', harga_beli: 900, stok_awal: 200, stok_sisa: 45,
      created_at: geser(-380) },
    { id: 'bt-5', obat_id: 'ob-4', nama_obat: 'Cetirizine 10 mg', satuan: 'Tablet',
      tgl_expired: geser(500), tgl_masuk: geser(-20), no_faktur: 'FK-2026/08/009',
      pbf: 'PT Anugrah Argon', harga_beli: 1100, stok_awal: 250, stok_sisa: 250,
      created_at: geser(-20) }
  ];

  const TRANSAKSI = [
    { id: 1, batch_id: 'bt-1', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
      satuan: 'Tablet', jenis: 'MASUK', kategori: 'Pembelian', jumlah: 500,
      harga_satuan: 600, total_nilai: 300000, tanggal: geser(-60),
      no_faktur: 'FK-2026/07/001', pbf: 'PT Kimia Farma', grup_id: 'g-1', dibatalkan: false },
    { id: 2, batch_id: 'bt-2', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
      satuan: 'Tablet', jenis: 'MASUK', kategori: 'Pembelian', jumlah: 100,
      harga_satuan: 650, total_nilai: 65000, tanggal: geser(-10),
      no_faktur: 'FK-2026/08/014', pbf: 'PT Enseval', grup_id: 'g-2', dibatalkan: false },
    { id: 3, batch_id: 'bt-2', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
      satuan: 'Tablet', jenis: 'KELUAR', kategori: 'Resep Pasien', jumlah: 20,
      harga_satuan: 650, total_nilai: 13000, tanggal: geser(-3),
      grup_id: 'g-3', dibatalkan: false, keterangan: 'R260828004' },
    { id: 4, batch_id: 'bt-3', obat_id: 'ob-2', nama_obat: 'Amoxicillin 500 mg',
      satuan: 'Tablet', jenis: 'KELUAR', kategori: 'Resep Pasien', jumlah: 294,
      harga_satuan: 1400, total_nilai: 411600, tanggal: geser(-5),
      grup_id: 'g-4', dibatalkan: false }
  ];

  let TAGIHAN = [], TAGIHAN_ITEM = [], PEMBAYARAN = [], urutTagihan = 0;

  const TARIF = [
    { id: 'tr-1', jenis: 'TINDAKAN', kode_icd9: '89.01', kode: '89.01',
      nama: 'Konsultasi dokter umum', tarif: 50000, otomatis: false, aktif: true,
      berlaku_mulai: geser(-400), keterangan: null },
    { id: 'tr-2', jenis: 'TINDAKAN', kode_icd9: '23.2', kode: '23.2',
      nama: 'Penambalan gigi', tarif: 150000, otomatis: false, aktif: true,
      berlaku_mulai: geser(-400), keterangan: null },
    { id: 'tr-4', jenis: 'TINDAKAN', kode_icd9: '96.54', kode: '96.54',
      nama: 'Skeling / pembersihan karang gigi', tarif: 200000, otomatis: false,
      aktif: true, berlaku_mulai: geser(-400), keterangan: null },
    { id: 'tr-3', jenis: 'LAYANAN', kode_icd9: null, kode: 'ADM',
      nama: 'Karcis / Administrasi', tarif: 15000, otomatis: false, aktif: true,
      berlaku_mulai: geser(-400),
      keterangan: 'Nyalakan "otomatis" bila klinik menarik biaya administrasi.' }
  ];

  let TEMPLATE = {};

  const kunciFefo = (a, b) =>
    String(a.tgl_expired).localeCompare(String(b.tgl_expired)) ||
    String(a.tgl_masuk).localeCompare(String(b.tgl_masuk));

  function batchLengkap(b) {
    const o = OBAT.find(x => x.id === b.obat_id) || {};
    const hariIni = UI.hariIni();
    return { ...b, nama_obat: o.nama || b.nama_obat, satuan: o.satuan,
             golongan: o.golongan, bentuk_sediaan: o.bentuk_sediaan,
             kekuatan: o.kekuatan, harga_jual: o.harga,
             nilai_beli: b.stok_sisa * b.harga_beli,
             kadaluwarsa: b.tgl_expired <= hariIni,
             segera_kadaluwarsa: b.tgl_expired > hariIni && b.tgl_expired <= geser(30),
             hari_ke_expired: Math.round(
               (new Date(b.tgl_expired) - new Date(hariIni)) / 864e5) };
  }

  async function apotekBatch() { await tunggu(50); return BATCH.map(batchLengkap); }
  async function batchObat(id) {
    await tunggu(30);
    return BATCH.filter(b => b.obat_id === id && b.stok_sisa > 0)
                .sort(kunciFefo).map(batchLengkap);
  }
  async function apotekStok() {
    await tunggu(40);
    return OBAT.map(o => {
      const bs = BATCH.filter(b => b.obat_id === o.id && b.stok_sisa > 0);
      const hariIni = UI.hariIni();
      return { obat_id: o.id, nama_obat: o.nama, satuan: o.satuan, golongan: o.golongan,
        bentuk_sediaan: o.bentuk_sediaan, kekuatan: o.kekuatan, harga_jual: o.harga,
        aktif: true,
        stok_total: bs.reduce((s, b) => s + b.stok_sisa, 0),
        nilai_total: bs.reduce((s, b) => s + b.stok_sisa * b.harga_beli, 0),
        jumlah_batch: bs.length,
        batch_kadaluwarsa: bs.filter(b => b.tgl_expired <= hariIni).length,
        batch_segera: bs.filter(b => b.tgl_expired > hariIni && b.tgl_expired <= geser(30)).length,
        stok_layak: bs.filter(b => b.tgl_expired > hariIni).reduce((s, b) => s + b.stok_sisa, 0),
        expired_terdekat: bs.length ? bs.slice().sort(kunciFefo)[0].tgl_expired : null };
    });
  }
  async function apotekTransaksi() { await tunggu(40); return salin(TRANSAKSI); }

  async function apotekMasuk(r) {
    await tunggu(120);
    const o = OBAT.find(x => x.id === r.obat_id);
    const ada = BATCH.find(b => b.obat_id === r.obat_id && b.tgl_expired === r.tgl_expired
      && (b.no_faktur || '') === (r.no_faktur || '')
      && String(b.pbf).toLowerCase() === String(r.pbf).toLowerCase()
      && Number(b.harga_beli) === Number(r.harga_beli));
    let batchId;
    if (ada) { ada.stok_awal += r.jumlah; ada.stok_sisa += r.jumlah; batchId = ada.id; }
    else {
      batchId = uid();
      BATCH.push({ id: batchId, obat_id: r.obat_id, nama_obat: o.nama, satuan: o.satuan,
        tgl_expired: r.tgl_expired, tgl_masuk: r.tgl_masuk || UI.hariIni(),
        no_faktur: r.no_faktur, pbf: r.pbf, harga_beli: Number(r.harga_beli) || 0,
        stok_awal: r.jumlah, stok_sisa: r.jumlah, keterangan: r.keterangan,
        created_at: new Date().toISOString() });
    }
    TRANSAKSI.unshift({ id: TRANSAKSI.length + 1, batch_id: batchId, obat_id: r.obat_id,
      nama_obat: o.nama, satuan: o.satuan, jenis: 'MASUK', kategori: 'Pembelian',
      jumlah: r.jumlah, harga_satuan: Number(r.harga_beli) || 0,
      total_nilai: r.jumlah * (Number(r.harga_beli) || 0),
      tanggal: r.tgl_masuk || UI.hariIni(), no_faktur: r.no_faktur, pbf: r.pbf,
      grup_id: uid(), dibatalkan: false, keterangan: r.keterangan });
    return { batch_id: batchId, digabung: !!ada };
  }

  async function apotekKeluar(r) {
    await tunggu(120);
    const o = OBAT.find(x => x.id === r.obat_id);
    let kandidat = BATCH.filter(b => b.obat_id === r.obat_id && b.stok_sisa > 0);
    if (r.batch_id) kandidat = kandidat.filter(b => b.id === r.batch_id);
    kandidat = ApotekCore.batchBolehKeluar(kandidat, r.kategori);
    const sim = ApotekCore.simulasiFefo(kandidat, r.jumlah);
    if (sim.kurang > 0) {
      throw new Error(`Stok ${o.nama} tidak cukup. Kurang ${sim.kurang} ${o.satuan}.`);
    }
    const grup = uid();
    sim.potongan.forEach(p => {
      const b = BATCH.find(x => x.id === p.batch.id);
      b.stok_sisa -= p.ambil;
      TRANSAKSI.unshift({ id: TRANSAKSI.length + 1, batch_id: b.id, obat_id: r.obat_id,
        nama_obat: o.nama, satuan: o.satuan, jenis: 'KELUAR', kategori: r.kategori,
        jumlah: p.ambil, harga_satuan: b.harga_beli, total_nilai: p.nilai,
        tanggal: r.tanggal || UI.hariIni(), kunjungan_id: r.kunjungan_id || null,
        resep_item_id: r.resep_item_id || null, grup_id: grup, dibatalkan: false,
        keterangan: r.keterangan });
    });
    return { grup_id: grup, total_nilai: sim.totalNilai,
             potongan: sim.potongan.map(p => ({ batch_id: p.batch.id,
               tgl_expired: p.batch.tgl_expired, jumlah: p.ambil, nilai: p.nilai })) };
  }

  async function apotekBatalkanGrup(grupId) {
    await tunggu(100);
    const baris = TRANSAKSI.filter(t => t.grup_id === grupId && !t.dibatalkan);
    if (!baris.length) throw new Error('Transaksi tidak ditemukan atau sudah dibatalkan.');
    baris.forEach(t => {
      const b = BATCH.find(x => x.id === t.batch_id);
      if (b) b.stok_sisa += (t.jenis === 'KELUAR' ? t.jumlah : -t.jumlah);
      t.dibatalkan = true;
      if (t.resep_item_id) {
        RESEP.forEach(r => (r.item || []).forEach(i => {
          if (i.id === t.resep_item_id) { i.jumlah_diserahkan = null;
            r.status = 'DIBUAT'; r.diserahkan_pada = null; r.diserahkan_sebagian = false; }
        }));
      }
    });
    return { dibatalkan: baris.length };
  }

  async function apotekSerahkanResep(resepId, item) {
    const r = RESEP.find(x => x.id === resepId);
    if (!r) throw new Error('Resep tidak ditemukan.');
    if (r.status === 'DISERAHKAN') throw new Error('Resep ini sudah diserahkan.');
    for (const it of item) {
      const ri = (r.item || []).find(x => x.id === it.resep_item_id);
      if (!ri) continue;
      await apotekKeluar({ obat_id: ri.obat_id, jumlah: it.jumlah, kategori: 'Resep Pasien',
        kunjungan_id: r.kunjungan_id, resep_item_id: ri.id, keterangan: r.no_resep });
      ri.jumlah_diserahkan = it.jumlah;
    }
    const semua = (r.item || []).filter(i => i.obat_id).length;
    r.status = 'DISERAHKAN';
    r.diserahkan_pada = new Date().toISOString();
    r.diserahkan_oleh = PROFIL.id;
    r.diserahkan_sebagian = item.length < semua;
    return { butir: item.length, dari: semua, sebagian: r.diserahkan_sebagian };
  }

  async function obatUntukPencocokan() {
    await tunggu(40);
    return OBAT.map(o => ({ id: o.id, kode_internal: o.kode_internal || null,
      nama: o.nama, nama_generik: o.nama_generik || null, satuan: o.satuan,
      bentuk_sediaan: o.bentuk_sediaan, kekuatan: o.kekuatan || null,
      harga: o.harga, aktif: o.aktif !== false }));
  }

  /* Meniru apotek_impor() termasuk sifat semua-atau-tidak-sama-sekali:
     perubahan ditumpuk di salinan sementara dan baru dipasang kalau
     seluruh baris lolos. Tanpa itu, demo akan berperilaku lebih longgar
     daripada aplikasi sungguhan — jenis ketidakcocokan yang membuat orang
     percaya pada perilaku yang tidak ada. */
  async function apotekImpor(baris, jenis) {
    await tunggu(200);
    if (!Array.isArray(baris) || !baris.length) throw new Error('Tidak ada baris untuk diimpor.');
    if (!['Pembelian', 'Saldo Awal'].includes(jenis)) {
      throw new Error(`Jenis impor "${jenis}" tidak dikenal.`);
    }

    const cadanganBatch = JSON.parse(JSON.stringify(BATCH));
    const cadanganTrx   = JSON.parse(JSON.stringify(TRANSAKSI));
    const jumlahObat    = OBAT.length;
    const ringkas = { jenis, baris: 0, batch_baru: 0, batch_digabung: 0,
                      obat_baru: 0, nama_obat_baru: [], total_nilai: 0 };
    try {
      for (let i = 0; i < baris.length; i++) {
        const b = baris[i];
        ringkas.baris = i + 1;
        try {
          let obatId = b.obat_id;
          if (!obatId) {
            const nb = b.obat_baru || {};
            const nama = String(nb.nama || '').trim();
            if (!nama) throw new Error('nama obat baru kosong.');
            let ada = OBAT.find(o =>
              (nb.kode_internal && o.kode_internal === nb.kode_internal) ||
              (!nb.kode_internal && o.nama.trim().toLowerCase() === nama.toLowerCase()));
            if (!ada) {
              ada = { id: uid(), kode_internal: nb.kode_internal || null, nama,
                      satuan: nb.satuan || 'Tablet', bentuk_sediaan: nb.satuan || 'Tablet',
                      harga: Number(nb.harga) || 0, aktif: true };
              OBAT.push(ada);
              ringkas.obat_baru++;
              ringkas.nama_obat_baru.push(nama);
            }
            obatId = ada.id;
          }
          if (!(Number(b.jumlah) > 0)) throw new Error('Jumlah masuk harus lebih dari nol.');
          if (!b.tgl_expired) throw new Error('Tanggal kadaluwarsa wajib diisi.');
          if (!String(b.pbf || '').trim()) throw new Error('Nama PBF / distributor wajib diisi.');

          const h = await apotekMasuk({
            obat_id: obatId, jumlah: Number(b.jumlah),
            harga_beli: Number(b.harga_beli) || 0, tgl_expired: b.tgl_expired,
            pbf: b.pbf, no_faktur: b.no_faktur, tgl_masuk: b.tgl_masuk,
            no_batch: b.no_batch, keterangan: b.keterangan
          });
          if (h.digabung) ringkas.batch_digabung++; else ringkas.batch_baru++;
          ringkas.total_nilai += Number(b.jumlah) * (Number(b.harga_beli) || 0);

          const t = TRANSAKSI.find(x => x.batch_id === h.batch_id && x.jenis === 'MASUK');
          if (t) t.kategori = jenis;
        } catch (e) {
          throw new Error(`Baris ${i + 1}: ${e.message}`);
        }
      }
    } catch (e) {
      BATCH.length = 0; cadanganBatch.forEach(x => BATCH.push(x));
      TRANSAKSI.length = 0; cadanganTrx.forEach(x => TRANSAKSI.push(x));
      OBAT.length = jumlahObat;
      throw e;
    }
    return ringkas;
  }

  async function simpanBatch(id, patch) {
    const b = BATCH.find(x => x.id === id);
    if (b) Object.assign(b, patch);
    return batchLengkap(b);
  }

  async function antreanFarmasi({ semua = false } = {}) {
    await tunggu(50);
    return RESEP.filter(r => semua || r.status !== 'DISERAHKAN').map(r => {
      const k = KUNJUNGAN.find(x => x.id === r.kunjungan_id) || {};
      const p = PASIEN.find(x => x.id === k.pasien_id) || {};
      const po = POLI.find(x => x.id === k.poli_id) || {};
      const d = PEGAWAI.find(x => x.id === k.dokter_id) || {};
      return { resep_id: r.id, no_resep: r.no_resep, status: r.status, catatan: r.catatan,
        dibuat_pada: r.dibuat_pada, diserahkan_pada: r.diserahkan_pada,
        diserahkan_sebagian: !!r.diserahkan_sebagian,
        kunjungan_id: k.id, no_kunjungan: k.no_kunjungan, no_antrian: k.no_antrian,
        tanggal: k.tanggal, cara_bayar: k.cara_bayar, status_kunjungan: k.status,
        pasien_id: p.id, no_rm: p.no_rm, nama_pasien: p.nama,
        tanggal_lahir: p.tanggal_lahir, jenis_kelamin: p.jenis_kelamin,
        nama_poli: po.nama, nama_dokter: d.nama,
        jumlah_item: (r.item || []).length,
        item_tanpa_master: (r.item || []).filter(i => !i.obat_id).length,
        daftar_obat: (r.item || []).map(i => i.nama_obat).join(', ') };
    });
  }

  async function resepUntukFarmasi(resepId) {
    await tunggu(60);
    const r = salin(RESEP.find(x => x.id === resepId));
    const k = KUNJUNGAN.find(x => x.id === r.kunjungan_id) || {};
    const p = PASIEN.find(x => x.id === k.pasien_id) || {};
    const po = POLI.find(x => x.id === k.poli_id) || {};
    r.kunjungan = { ...k, pasien: p, poli: po };
    const stok = await apotekStok();
    (r.item || []).forEach(i => {
      i.stok = stok.find(s => s.obat_id === i.obat_id) || null;
    });
    return r;
  }

  /* ------------------------------- KASIR ------------------------------- */

  function hitungTagihan(t) {
    const item = TAGIHAN_ITEM.filter(i => i.tagihan_id === t.id);
    t.subtotal = item.reduce((s, i) => s + i.total_baris, 0);
    t.total = item.filter(i => !i.ditanggung_penjamin).reduce((s, i) => s + i.total_baris, 0);
    t.amount_paid = PEMBAYARAN.filter(b => b.tagihan_id === t.id)
      .reduce((s, b) => s + Number(b.jumlah), 0);
    t.status_bayar = t.total <= 0.5 ? 'lunas'
      : t.amount_paid <= 0 ? 'belum_lunas'
      : t.amount_paid >= t.total - 0.5 ? 'lunas' : 'sebagian';
    return t;
  }

  function tagihanLengkap(t) {
    const k = KUNJUNGAN.find(x => x.id === t.kunjungan_id) || {};
    const p = PASIEN.find(x => x.id === t.pasien_id) || {};
    const po = POLI.find(x => x.id === k.poli_id) || {};
    const d = PEGAWAI.find(x => x.id === k.dokter_id) || {};
    return { ...hitungTagihan(t), sisa: Math.max(0, t.total - t.amount_paid),
      no_rm: p.no_rm, nama_pasien: p.nama, tanggal_lahir: p.tanggal_lahir, no_hp: p.no_hp,
      no_kunjungan: k.no_kunjungan, no_antrian: k.no_antrian,
      nama_poli: po.nama, nama_dokter: d.nama, nama_kasir: PROFIL.nama,
      jumlah_item: TAGIHAN_ITEM.filter(i => i.tagihan_id === t.id).length };
  }

  async function kasirMenunggu() {
    await tunggu(50);
    return KUNJUNGAN.filter(k => k.status !== 'BATAL'
        && !TAGIHAN.some(t => t.kunjungan_id === k.id))
      .map(k => {
        const p = PASIEN.find(x => x.id === k.pasien_id) || {};
        const po = POLI.find(x => x.id === k.poli_id) || {};
        const d = PEGAWAI.find(x => x.id === k.dokter_id) || {};
        return { kunjungan_id: k.id, no_kunjungan: k.no_kunjungan, no_antrian: k.no_antrian,
          tanggal: k.tanggal, cara_bayar: k.cara_bayar, status_kunjungan: k.status,
          pasien_id: p.id, no_rm: p.no_rm, nama_pasien: p.nama,
          tanggal_lahir: p.tanggal_lahir, jenis_kelamin: p.jenis_kelamin,
          nama_poli: po.nama, nama_dokter: d.nama,
          jumlah_tindakan: TINDAKAN.filter(t => t.kunjungan_id === k.id).length,
          jumlah_obat: TRANSAKSI.filter(t => t.kunjungan_id === k.id
            && t.jenis === 'KELUAR' && !t.dibatalkan).length,
          resep_belum_diserahkan: RESEP.some(r => r.kunjungan_id === k.id
            && r.status !== 'DISERAHKAN') };
      });
  }

  async function kasirDaftarTagihan() { await tunggu(50); return TAGIHAN.map(tagihanLengkap); }
  async function kasirTagihan(id) {
    const t = TAGIHAN.find(x => x.id === id);
    if (!t) throw new Error('Tagihan tidak ditemukan.');
    return tagihanLengkap(t);
  }
  async function kasirItem(id) {
    return salin(TAGIHAN_ITEM.filter(i => i.tagihan_id === id)
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0)));
  }
  async function kasirPembayaran(id) {
    return salin(PEMBAYARAN.filter(b => b.tagihan_id === id))
      .map(b => ({ ...b, petugas: { nama: PROFIL.nama } }));
  }
  async function kasirLengkap(id) {
    const [tagihan, item, bayar] = await Promise.all(
      [kasirTagihan(id), kasirItem(id), kasirPembayaran(id)]);
    return { tagihan, item, bayar };
  }

  async function kasirSusunDariKunjungan(kunjunganId) {
    await tunggu(140);
    const k = KUNJUNGAN.find(x => x.id === kunjunganId);
    const p = PASIEN.find(x => x.id === k.pasien_id) || {};
    const ditanggung = ['BPJS', 'GRATIS'].includes(k.cara_bayar);

    let t = TAGIHAN.find(x => x.kunjungan_id === kunjunganId);
    if (t) {
      if (PEMBAYARAN.some(b => b.tagihan_id === t.id))
        throw new Error(`Tagihan ${t.nomor} sudah dibayar, jadi tidak bisa disusun ulang.`);
      TAGIHAN_ITEM = TAGIHAN_ITEM.filter(i =>
        i.tagihan_id !== t.id || i.sumber === 'MANUAL');
      t.penjamin = k.cara_bayar;
    } else {
      t = { id: uid(), nomor: 'INV-2026-' + String(++urutTagihan).padStart(4, '0'),
            kunjungan_id: kunjunganId, pasien_id: k.pasien_id, nama_pembayar: p.nama,
            tanggal: k.tanggal, penjamin: k.cara_bayar, subtotal: 0, total: 0,
            amount_paid: 0, status_bayar: 'belum_lunas', catatan: null,
            dibuat_oleh: PROFIL.id, created_at: new Date().toISOString() };
      TAGIHAN.push(t);
    }

    let urut = 0;
    TARIF.filter(x => x.jenis === 'LAYANAN' && x.otomatis && x.aktif).forEach(x => {
      TAGIHAN_ITEM.push({ id: uid(), tagihan_id: t.id, sumber: 'LAYANAN', ref_id: x.id,
        ref_kode: x.kode, nama: x.nama, qty: 1, harga_satuan: x.tarif, diskon_pct: 0,
        total_baris: x.tarif, ditanggung_penjamin: ditanggung, urutan: ++urut });
    });
    TINDAKAN.filter(x => x.kunjungan_id === kunjunganId).forEach(x => {
      const tarif = TARIF.filter(y => y.kode_icd9 === x.kode_icd9 && y.aktif)
        .sort((a, b) => b.berlaku_mulai.localeCompare(a.berlaku_mulai))[0];
      const harga = tarif ? tarif.tarif : 0;
      const qty = Math.max(x.jumlah || 1, 1);
      TAGIHAN_ITEM.push({ id: uid(), tagihan_id: t.id, sumber: 'TINDAKAN', ref_id: x.id,
        ref_kode: x.kode_icd9, nama: x.nama + (x.fdi ? ` (gigi ${x.fdi})` : ''),
        qty, harga_satuan: harga, diskon_pct: 0, total_baris: qty * harga,
        ditanggung_penjamin: ditanggung, urutan: ++urut });
    });
    const perObat = {};
    TRANSAKSI.filter(x => x.kunjungan_id === kunjunganId && x.jenis === 'KELUAR'
      && x.kategori === 'Resep Pasien' && !x.dibatalkan)
      .forEach(x => { perObat[x.obat_id] = (perObat[x.obat_id] || 0) + x.jumlah; });
    Object.entries(perObat).forEach(([obatId, jml]) => {
      const o = OBAT.find(x => x.id === obatId) || {};
      TAGIHAN_ITEM.push({ id: uid(), tagihan_id: t.id, sumber: 'OBAT', ref_id: obatId,
        ref_kode: null, nama: `${o.nama} (${jml} ${o.satuan})`, qty: jml,
        harga_satuan: o.harga || 0, diskon_pct: 0, total_baris: jml * (o.harga || 0),
        ditanggung_penjamin: ditanggung, urutan: ++urut });
    });
    hitungTagihan(t);
    return t.id;
  }

  async function kasirCatatPembayaran(r) {
    await tunggu(120);
    const t = TAGIHAN.find(x => x.id === r.tagihan_id);
    hitungTagihan(t);
    const sisa = t.total - t.amount_paid;
    if (r.jumlah > sisa + 0.5) throw new Error(`Pembayaran melebihi sisa tagihan.`);
    if (r.uang_diterima && r.uang_diterima < r.jumlah - 0.5)
      throw new Error('Uang yang diterima kurang dari jumlah yang dibayarkan.');
    PEMBAYARAN.push({ id: uid(), tagihan_id: t.id, jumlah: Number(r.jumlah),
      tanggal: r.tanggal || UI.hariIni(), metode: r.metode || 'tunai',
      uang_diterima: r.uang_diterima || null, catatan: r.catatan,
      dibuat_oleh: PROFIL.id, created_at: new Date().toISOString() });
    hitungTagihan(t);
    return { status_bayar: t.status_bayar, dibayar: t.amount_paid,
             sisa: Math.max(0, t.total - t.amount_paid),
             kembalian: r.uang_diterima ? Math.max(0, r.uang_diterima - r.jumlah) : 0 };
  }

  async function kasirHapusPembayaran(id) {
    const b = PEMBAYARAN.find(x => x.id === id);
    PEMBAYARAN = PEMBAYARAN.filter(x => x.id !== id);
    const t = TAGIHAN.find(x => x.id === b.tagihan_id);
    hitungTagihan(t);
    return { status_bayar: t.status_bayar };
  }
  async function kasirHapusTagihan(id) {
    TAGIHAN = TAGIHAN.filter(t => t.id !== id);
    TAGIHAN_ITEM = TAGIHAN_ITEM.filter(i => i.tagihan_id !== id);
  }
  async function kasirBuatTagihanBebas(rec) {
    const t = { id: uid(), nomor: 'INV-2026-' + String(++urutTagihan).padStart(4, '0'),
      kunjungan_id: null, pasien_id: null, subtotal: 0, total: 0, amount_paid: 0,
      status_bayar: 'belum_lunas', dibuat_oleh: PROFIL.id,
      created_at: new Date().toISOString(), ...rec };
    TAGIHAN.push(t);
    return t;
  }
  async function kasirTambahItem(rec) {
    const t = TAGIHAN.find(x => x.id === rec.tagihan_id);
    if (PEMBAYARAN.some(b => b.tagihan_id === t.id))
      throw new Error('Tagihan ini sudah menerima pembayaran, jadi rinciannya tidak bisa diubah.');
    const i = { id: uid(), diskon_pct: 0, qty: 1, harga_satuan: 0,
      ditanggung_penjamin: false, urutan: 99, ...rec };
    i.total_baris = Math.round(i.qty * i.harga_satuan * (1 - (i.diskon_pct || 0) / 100));
    TAGIHAN_ITEM.push(i);
    hitungTagihan(t);
    return i;
  }
  async function kasirUbahItem(id, patch) {
    const i = TAGIHAN_ITEM.find(x => x.id === id);
    const t = TAGIHAN.find(x => x.id === i.tagihan_id);
    if (PEMBAYARAN.some(b => b.tagihan_id === t.id))
      throw new Error('Tagihan ini sudah menerima pembayaran, jadi rinciannya tidak bisa diubah.');
    Object.assign(i, patch);
    i.total_baris = Math.round(i.qty * i.harga_satuan * (1 - (i.diskon_pct || 0) / 100));
    hitungTagihan(t);
    return i;
  }
  async function kasirHapusItem(id) {
    const i = TAGIHAN_ITEM.find(x => x.id === id);
    const t = TAGIHAN.find(x => x.id === i.tagihan_id);
    if (PEMBAYARAN.some(b => b.tagihan_id === t.id))
      throw new Error('Tagihan ini sudah menerima pembayaran, jadi rinciannya tidak bisa diubah.');
    TAGIHAN_ITEM = TAGIHAN_ITEM.filter(x => x.id !== id);
    hitungTagihan(t);
  }
  async function daftarTarif() { await tunggu(30); return salin(TARIF); }
  async function simpanTarif(rec, id) {
    if (id) { Object.assign(TARIF.find(t => t.id === id), rec); }
    else { TARIF.push({ id: uid(), ...rec }); }
    return rec;
  }
  async function kasirRekap() { await tunggu(30); return salin(PEMBAYARAN); }

  async function templateInvoice() {
    TemplateInvoice.pakai(TEMPLATE);
    return { ok: true, konfigurasi: TemplateInvoice.get() };
  }
  async function simpanTemplateInvoice(k) {
    TEMPLATE = TemplateInvoice.bersihkan(k);
    TemplateInvoice.pakai(TEMPLATE);
    return TEMPLATE;
  }
  async function ambilSemua(f) { return []; }

  return { sb, masuk, keluar, sesi, saya, bolehTulis, faskes, simpanFaskes,
           daftarPoli, daftarDokter, daftarPegawai, cariIcd, cariObat, daftarSigna,
           cariPasien, pasien, simpanPasien, alergiPasien, tambahAlergi, hapusAlergi, catatAkses,
           antrianHariIni, daftarKunjungan, buatKunjungan, kunjungan, ubahKunjungan,
           kajian, simpanKajian, pemeriksaan, simpanPemeriksaan, finalisasi,
           tambahAddendum, daftarAddendum, diagnosa, simpanDiagnosa, resep, simpanResep,
           rekamMedisLengkap, statistikHariIni, diagnosaTeratas,
           refGigi, refKondisiGigi, refBidangGigi,
           odontogram, odontogramPadaKunjungan, simpanOdontogram, riwayatOdontogram,
           pemeriksaanGigi, simpanPemeriksaanGigi,
           cariIcd9, tindakan, simpanTindakan, tindakanTeratas,
           refKesadaran, refStatusPulang,
           daftarObat, simpanObat, imporObat,
           daftarIcd10, simpanIcd10, daftarIcd9, simpanIcd9,
           kesiapanPasien, kesiapanKunjungan, ringkasanKesiapan,
           panggilBridging, riwayatBridging, ambilSemua,
           apotekBatch, apotekStok, apotekTransaksi, apotekMasuk, apotekKeluar,
           apotekBatalkanGrup, apotekSerahkanResep, simpanBatch,
           apotekImpor, obatUntukPencocokan,
           antreanFarmasi, resepUntukFarmasi, batchObat,
           kasirMenunggu, kasirDaftarTagihan, kasirTagihan, kasirItem, kasirPembayaran,
           kasirLengkap, kasirSusunDariKunjungan, kasirCatatPembayaran,
           kasirHapusPembayaran, kasirHapusTagihan, kasirBuatTagihanBebas,
           kasirTambahItem, kasirUbahItem, kasirHapusItem,
           daftarTarif, simpanTarif, kasirRekap,
           templateInvoice, simpanTemplateInvoice,
           gantiPeranDemo, peranDemoSekarang, PERAN_DEMO };
})();

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
      catatan_penting: 'Riwayat stroke ringan 2023', aktif: true },
    /* Nama yang hanya beda satu huruf dari pas-1, dan sengaja diletakkan
       PALING BELAKANG. Bukan hiasan: inilah keadaan yang membuat migrasi
       portal berbahaya — dua orang berbeda yang di daftar terlihat sama,
       sementara catatan portal hanya menyimpan nama dan nomor BPJS.
       Halaman Migrasi Portal harus menampilkan keduanya dan menandai
       mana yang tebakan. Letaknya di akhir larik supaya pencarian
       "Budi" pada halaman lain tetap menemukan pas-1 lebih dulu. */
    { id: 'pas-6', no_rm: '000006', nik: '3374010303820006', no_bpjs: '0009999999999',
      nama: 'Budi Santosa', tempat_lahir: 'Ungaran', tanggal_lahir: '1982-03-03',
      jenis_kelamin: 'L', gol_darah: 'A', agama: 'Islam', pekerjaan: 'Buruh',
      status_kawin: 'Kawin', alamat: 'Jl. Kartini No. 3', kabupaten: 'Kota Semarang',
      provinsi: 'Jawa Tengah', no_hp: '081344556677', aktif: true }
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

  /* --- Rujukan pemeriksaan terstruktur (salinan isian awal sql/14) ---
     kode_pcare sengaja kosong, sama seperti di database sungguhan:
     nilainya milik BPJS dan baru bisa diambil setelah klinik punya
     kredensial. Demo memperlihatkan keadaan itu apa adanya supaya
     halaman "Pemetaan kode PCare" bisa diuji dalam keadaan sebenarnya. */
  const REF_PROGNOSA = [
    { kode:'BONAM', nama:'Bonam', keterangan:'Baik — diperkirakan sembuh sempurna', kode_pcare:null, urutan:1 },
    { kode:'DUBIA_BONAM', nama:'Dubia ad bonam', keterangan:'Ragu, cenderung membaik', kode_pcare:null, urutan:2 },
    { kode:'DUBIA', nama:'Dubia', keterangan:'Ragu — belum dapat ditentukan', kode_pcare:null, urutan:3 },
    { kode:'DUBIA_MALAM', nama:'Dubia ad malam', keterangan:'Ragu, cenderung memburuk', kode_pcare:null, urutan:4 },
    { kode:'MALAM', nama:'Malam', keterangan:'Buruk', kode_pcare:null, urutan:5 }
  ];
  const REF_TACC = [
    { kode:'TIDAK', nama:'Tanpa TACC', keterangan:'Rujukan biasa, atau pasien tidak dirujuk', kode_pcare:'-1', perlu_alasan:false, urutan:0 },
    { kode:'T',  nama:'Time',         keterangan:'Perjalanan penyakit melewati waktu yang wajar ditangani FKTP', kode_pcare:'0', perlu_alasan:true, urutan:1 },
    { kode:'A',  nama:'Age',          keterangan:'Umur pasien menjadi pertimbangan rujukan', kode_pcare:'1', perlu_alasan:true, urutan:2 },
    { kode:'C1', nama:'Complication', keterangan:'Ada komplikasi yang tidak dapat ditangani FKTP', kode_pcare:'2', perlu_alasan:true, urutan:3 },
    { kode:'C2', nama:'Comorbidity',  keterangan:'Ada penyakit penyerta yang memerlukan rujukan', kode_pcare:'3', perlu_alasan:true, urutan:4 }
  ];
  const REF_SUBSPESIALIS = [
    { kode:'PD', nama:'Penyakit Dalam', kode_pcare:null, urutan:1 },
    { kode:'ANAK', nama:'Anak', kode_pcare:null, urutan:2 },
    { kode:'BEDAH', nama:'Bedah Umum', kode_pcare:null, urutan:3 },
    { kode:'OBGYN', nama:'Kebidanan & Kandungan', kode_pcare:null, urutan:4 },
    { kode:'MATA', nama:'Mata', kode_pcare:null, urutan:5 },
    { kode:'THT', nama:'THT-KL', kode_pcare:null, urutan:6 },
    { kode:'SARAF', nama:'Saraf', kode_pcare:null, urutan:7 },
    { kode:'GIGI', nama:'Gigi & Mulut', kode_pcare:null, urutan:14 }
  ];
  const REF_SARANA = [
    { kode:'TANPA', nama:'Tanpa sarana khusus', kode_pcare:null, urutan:0 },
    { kode:'LAB', nama:'Laboratorium', kode_pcare:null, urutan:1 },
    { kode:'RAD', nama:'Radiologi', kode_pcare:null, urutan:2 },
    { kode:'USG', nama:'USG', kode_pcare:null, urutan:3 }
  ];
  const REF_PPK = [
    { kode:'0101R001', nama:'RSUD Kota (contoh)', jenis:'RS',
      alamat:'Jl. Contoh No. 1', sumber:'MANUAL', urutan:1 },
    { kode:'0101R002', nama:'RS Panti Waluyo (contoh)', jenis:'RS',
      alamat:'Jl. Contoh No. 2', sumber:'MANUAL', urutan:2 }
  ];
  const REF_ALERGI = [
    { id:'ra-m0', jenis:'MAKANAN', kode:'00', nama:'Tidak ada alergi makanan', kode_pcare:null, urutan:0 },
    { id:'ra-m1', jenis:'MAKANAN', kode:'LT', nama:'Makanan laut / seafood', kode_pcare:null, urutan:1 },
    { id:'ra-m2', jenis:'MAKANAN', kode:'TL', nama:'Telur', kode_pcare:null, urutan:2 },
    { id:'ra-m3', jenis:'MAKANAN', kode:'KC', nama:'Kacang-kacangan', kode_pcare:null, urutan:4 },
    { id:'ra-u0', jenis:'UDARA', kode:'00', nama:'Tidak ada alergi udara', kode_pcare:null, urutan:0 },
    { id:'ra-u1', jenis:'UDARA', kode:'DB', nama:'Debu', kode_pcare:null, urutan:1 },
    { id:'ra-u2', jenis:'UDARA', kode:'DG', nama:'Udara dingin', kode_pcare:null, urutan:2 },
    { id:'ra-o0', jenis:'OBAT', kode:'00', nama:'Tidak ada alergi obat', kode_pcare:null, urutan:0 },
    { id:'ra-o1', jenis:'OBAT', kode:'PN', nama:'Penisilin dan turunannya', kode_pcare:null, urutan:1 },
    { id:'ra-o2', jenis:'OBAT', kode:'SF', nama:'Sulfa', kode_pcare:null, urutan:2 },
    { id:'ra-o3', jenis:'OBAT', kode:'NS', nama:'Antinyeri golongan NSAID', kode_pcare:null, urutan:4 }
  ];
  const REF_VITAL = [
    { kode:'sistolik', nama:'Tekanan darah sistolik', satuan:'mmHg', satuan_ucum:'mm[Hg]', kode_loinc:'8480-6', urutan:1 },
    { kode:'diastolik', nama:'Tekanan darah diastolik', satuan:'mmHg', satuan_ucum:'mm[Hg]', kode_loinc:'8462-4', urutan:2 },
    { kode:'tekanan_darah', nama:'Tekanan darah', satuan:'mmHg', satuan_ucum:'mm[Hg]', kode_loinc:'85354-9', urutan:3 },
    { kode:'nadi', nama:'Frekuensi nadi', satuan:'x/menit', satuan_ucum:'/min', kode_loinc:'8867-4', urutan:4 },
    { kode:'nafas', nama:'Frekuensi napas', satuan:'x/menit', satuan_ucum:'/min', kode_loinc:'9279-1', urutan:5 },
    { kode:'suhu', nama:'Suhu tubuh', satuan:'°C', satuan_ucum:'Cel', kode_loinc:'8310-5', urutan:6 },
    { kode:'spo2', nama:'Saturasi oksigen', satuan:'%', satuan_ucum:'%', kode_loinc:'2708-6', urutan:7 },
    { kode:'berat_badan', nama:'Berat badan', satuan:'kg', satuan_ucum:'kg', kode_loinc:'29463-7', urutan:8 },
    { kode:'tinggi_badan', nama:'Tinggi badan', satuan:'cm', satuan_ucum:'cm', kode_loinc:'8302-2', urutan:9 },
    { kode:'imt', nama:'Indeks massa tubuh', satuan:'kg/m²', satuan_ucum:'kg/m2', kode_loinc:'39156-5', urutan:10 },
    { kode:'lingkar_perut', nama:'Lingkar perut', satuan:'cm', satuan_ucum:'cm', kode_loinc:'8280-0', urutan:11 },
    { kode:'skala_nyeri', nama:'Skala nyeri', satuan:'0-10', satuan_ucum:'{score}', kode_loinc:'72514-3', urutan:12 }
  ];
  const REF_SISTEM_FISIK = [
    { kode:'UMUM', nama:'Keadaan umum', urutan:1, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Tampak sakit ringan, kesadaran compos mentis, gizi cukup',
      temuan_lazim:['Tampak sakit sedang','Tampak sakit berat','Tampak pucat','Tampak sesak','Tampak lemas','Gizi kurang'] },
    { kode:'KEPALA', nama:'Kepala & wajah', urutan:2, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Normosefali, wajah simetris, tidak ada deformitas',
      temuan_lazim:['Nyeri tekan sinus','Wajah asimetris','Edema palpebra','Jejas / luka'] },
    { kode:'MATA', nama:'Mata', urutan:3, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Konjungtiva tidak anemis, sklera tidak ikterik, pupil isokor, refleks cahaya positif',
      temuan_lazim:['Konjungtiva anemis','Sklera ikterik','Pupil anisokor','Mata cekung','Injeksi konjungtiva','Sekret mata'] },
    { kode:'THT', nama:'Telinga, hidung, tenggorokan', urutan:4, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Liang telinga lapang, tidak ada sekret; hidung tidak ada sekret maupun deviasi septum; faring tidak hiperemis, tonsil T1-T1 tenang',
      temuan_lazim:['Faring hiperemis','Tonsil T2-T2','Tonsil T3-T3 dengan detritus','Sekret hidung serosa','Konka edema','Serumen obturans','Membran timpani suram','Nyeri tekan tragus'] },
    { kode:'MULUT', nama:'Mulut & gigi', urutan:5, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Mukosa mulut lembap, lidah tidak kotor, gigi geligi baik',
      temuan_lazim:['Mukosa kering','Lidah kotor','Stomatitis','Karies gigi','Gusi berdarah'] },
    { kode:'LEHER', nama:'Leher', urutan:6, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Tidak ada pembesaran kelenjar getah bening maupun tiroid, JVP tidak meningkat',
      temuan_lazim:['Pembesaran KGB leher','Pembesaran tiroid','JVP meningkat','Kaku kuduk'] },
    { kode:'PARU', nama:'Toraks — paru', urutan:7, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Gerak napas simetris, retraksi tidak ada, suara napas vesikuler, ronki tidak ada, wheezing tidak ada',
      temuan_lazim:['Ronki basah halus','Ronki basah kasar','Wheezing ekspirasi','Suara napas melemah','Retraksi interkostal','Gerak napas asimetris','Hipersonor','Redup basal'] },
    { kode:'JANTUNG', nama:'Toraks — jantung', urutan:8, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Bunyi jantung I dan II reguler, murmur tidak ada, gallop tidak ada',
      temuan_lazim:['Murmur sistolik','Gallop','Irama tidak teratur','Takikardia','Bradikardia','Batas jantung melebar'] },
    { kode:'ABDOMEN', nama:'Abdomen', urutan:9, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Datar, supel, bising usus normal, nyeri tekan tidak ada, hepar dan lien tidak teraba',
      temuan_lazim:['Nyeri tekan epigastrium','Nyeri tekan McBurney','Nyeri ketok CVA','Distensi','Bising usus meningkat','Bising usus menurun','Hepatomegali','Splenomegali','Defans muskuler','Asites'] },
    { kode:'EKSTREMITAS', nama:'Ekstremitas', urutan:10, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Akral hangat, capillary refill kurang dari 2 detik, edema tidak ada, gerak bebas',
      temuan_lazim:['Akral dingin','Edema tungkai','CRT lebih dari 2 detik','Nyeri sendi','Keterbatasan gerak','Deformitas','Krepitasi','Luka terbuka'] },
    { kode:'KULIT', nama:'Kulit', urutan:11, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Turgor baik, tidak ada ruam maupun lesi',
      temuan_lazim:['Turgor menurun','Ruam makulopapular','Vesikel','Ikterik','Pucat','Sianosis','Ptekie','Ulkus','Gatal / ekskoriasi'] },
    { kode:'NEURO', nama:'Neurologis', urutan:12, bawaan_periksa:true, poli_jenis:null, kode_loinc:null,
      normal_teks:'Kesadaran compos mentis, tidak ada defisit motorik maupun sensorik, refleks fisiologis normal, refleks patologis negatif',
      temuan_lazim:['Hemiparesis','Parese nervus kranialis','Refleks patologis positif','Rangsang meningeal positif','Tremor','Penurunan sensorik'] },
    /* Genitourinaria SENGAJA bawaan_periksa:false. Tombol "semua normal"
       tidak boleh menyatakan pemeriksaan yang tidak dilakukan. */
    { kode:'GENITAL', nama:'Genitourinaria', urutan:13, bawaan_periksa:false, poli_jenis:null, kode_loinc:null,
      normal_teks:'Tidak ada kelainan pada pemeriksaan luar',
      temuan_lazim:['Nyeri tekan suprapubik','Sekret uretra','Pembesaran skrotum','Fluor albus'] }
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
      keluhan_utama: 'Batuk berdahak sejak 3 hari',
      anamnesis: 'Batuk berdahak sejak 3 hari. Sejak 3 hari lalu, sifat berdahak warna putih, '
        + 'memperberat udara dingin dan malam hari, keluhan penyerta demam hilang timbul dan pilek.',
      riwayat_penyakit_sekarang: {
        onset: '3 hari lalu', kualitas: 'berdahak warna putih',
        memperberat: 'udara dingin dan malam hari',
        penyerta: 'demam hilang timbul dan pilek'
      },
      riwayat_penyakit_dahulu: 'Hipertensi terkontrol',
      riwayat_pengobatan: 'Amlodipin 5 mg 1x1',
      keadaan_umum: 'Tampak sakit ringan', kesadaran_kode: 'CM',
      pemeriksaan_fisik: {
        UMUM: { status: 'NORMAL', temuan: null },
        MATA: { status: 'NORMAL', temuan: null },
        THT:  { status: 'ABNORMAL', temuan: 'Faring hiperemis, tonsil T1-T1 tenang' },
        LEHER: { status: 'NORMAL', temuan: null },
        PARU: { status: 'NORMAL', temuan: null },
        JANTUNG: { status: 'NORMAL', temuan: null },
        ABDOMEN: { status: 'NORMAL', temuan: null },
        EKSTREMITAS: { status: 'NORMAL', temuan: null },
        KULIT: { status: 'NORMAL', temuan: null }
      },
      diagnosis_banding: [{ kode: 'J18.9', nama: 'Pneumonia' }],
      subjective: 'Batuk berdahak sejak 3 hari. Keluhan sejak 3 hari lalu, sifat berdahak warna putih, '
        + 'memperberat udara dingin dan malam hari, keluhan penyerta demam hilang timbul dan pilek. '
        + 'Riwayat penyakit dahulu: Hipertensi terkontrol. Obat yang sedang diminum: Amlodipin 5 mg 1x1.',
      objective: 'Tampak sakit ringan. Kesadaran Compos Mentis. TD 138/86 mmHg, nadi 88 x/menit, '
        + 'napas 20 x/menit, suhu 37.8 °C, SpO₂ 98 %, BB 72.5 kg, TB 168 cm, IMT 25.69. '
        + 'Keadaan umum: Tampak sakit ringan, kesadaran compos mentis, gizi cukup. '
        + 'Telinga, hidung, tenggorokan: Faring hiperemis, tonsil T1-T1 tenang.',
      assessment: 'Diagnosa kerja: ISPA (Infeksi Saluran Napas Atas) (J06.9). '
        + 'Diagnosa sekunder: Demam (R50.9). Diagnosis banding: Pneumonia (J18.9).',
      plan: 'Terapi obat: Parasetamol 500 mg No. 10 (3 x sehari 1 tablet). '
        + 'Terapi non-obat: Kompres hangat, perbanyak minum air hangat. '
        + 'Edukasi: Istirahat cukup, hindari asap rokok. Pasien dipulangkan. Prognosa Bonam.',
      terapi_obat: 'Parasetamol 500 mg No. 10 (3 x sehari 1 tablet)',
      terapi_non_obat: 'Kompres hangat, perbanyak minum air hangat', bmhp: null,
      tindak_lanjut: 'SELESAI', prognosa: 'Bonam', prognosa_kode: 'BONAM',
      status_pulang: 'Sembuh', status_pulang_kode: 'SEMBUH',
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
    /* antrean_id dicari balik dari tabel antrean, sama seperti kolomnya di
       database. Tanpa ini bilah panggilan di halaman pemeriksaan tidak
       pernah tergambar di demo — dan bug itu hanya kelihatan di klinik. */
    antrean_id: k.antrean_id ||
      (typeof ANTREAN !== 'undefined'
        ? (ANTREAN.find(a => a.kunjungan_id === k.id) || {}).id : null) || null,
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


  /* ===================== ANTREAN & LAYAR TUNGGU =====================
     Data antrean demo sengaja memuat DUA hal yang tidak akan pernah
     muncul kalau semua nomor lahir di loket:
       * pemesanan Mobile JKN yang pasiennya BELUM datang, dan
       * pemesanan dari peserta yang belum pernah berobat di sini —
         satu-satunya keadaan yang memaksa petugas mencocokkan sendiri.
     Keduanya adalah bagian yang paling mudah rusak tanpa disadari. */

  const PREFIX = { 'poli-1': 'A', 'poli-2': 'B', 'poli-3': 'C' };
  const nomorAntrean = (poliId, urut) =>
    `${PREFIX[poliId] || 'A'}-${String(urut).padStart(3, '0')}`;

  let seqPanggilan = 100;
  const PANGGILAN = [];

  const ANTREAN = KUNJUNGAN.filter(k => k.tanggal === hariIni).map((k, i) => ({
    id: 'ant-k' + (i + 1),
    tanggal: hariIni, poli_id: k.poli_id, no_urut: k.no_antrian,
    prefix: PREFIX[k.poli_id] || 'A', nomor: nomorAntrean(k.poli_id, k.no_antrian),
    kode_booking: 'ANT-' + hariIni.replace(/-/g, '') + '-K' + (i + 1),
    sumber: 'LOKET', tahap: k.status === 'SELESAI' ? 'SELESAI' : 'POLI',
    status: k.status === 'SELESAI' ? 'SELESAI' : 'MENUNGGU',
    pasien_id: k.pasien_id, kunjungan_id: k.id,
    no_kartu: null, nik: null, nama_snapshot: null,
    waktu_ambil: k.waktu_daftar, waktu_hadir: k.waktu_daftar,
    waktu_panggil: null, waktu_mulai_layan: null,
    waktu_selesai: k.waktu_selesai || null,
    jumlah_panggil: 0, tujuan_terakhir: null, alasan_batal: null, catatan: null
  }));

  /* Dua pemesanan Mobile JKN yang belum hadir. */
  ANTREAN.push({
    id: 'ant-o1', tanggal: hariIni, poli_id: 'poli-1', no_urut: 8, prefix: 'A',
    nomor: 'A-008', kode_booking: 'ANT-' + hariIni.replace(/-/g,'') + '-ONL001',
    sumber: 'ONLINE', tahap: 'LOKET', status: 'BELUM_HADIR',
    pasien_id: 'pas-3', kunjungan_id: null,
    no_kartu: '0001234567893', nik: '3374010101010003', nama_snapshot: null,
    waktu_ambil: jamHariIni(6, 12), waktu_hadir: null, waktu_panggil: null,
    waktu_mulai_layan: null, waktu_selesai: null,
    jumlah_panggil: 0, tujuan_terakhir: null, alasan_batal: null, catatan: null
  });
  ANTREAN.push({
    id: 'ant-o2', tanggal: hariIni, poli_id: 'poli-2', no_urut: 6, prefix: 'B',
    nomor: 'B-006', kode_booking: 'ANT-' + hariIni.replace(/-/g,'') + '-ONL002',
    sumber: 'ONLINE', tahap: 'LOKET', status: 'MENUNGGU',
    pasien_id: null, kunjungan_id: null,
    no_kartu: '0009988776655', nik: '3374020202020009',
    nama_snapshot: 'Bagas Nurcahyo',
    waktu_ambil: jamHariIni(6, 40), waktu_hadir: jamHariIni(8, 12), waktu_panggil: null,
    waktu_mulai_layan: null, waktu_selesai: null,
    jumlah_panggil: 0, tujuan_terakhir: null, alasan_batal: null,
    catatan: 'Data peserta dari Mobile JKN: Bagas Nurcahyo, L, 1994-02-02. Jl. Melati No. 7'
  });

  const JADWAL = [];
  POLI.forEach(p => {
    for (let hari = 1; hari <= 6; hari++) {
      JADWAL.push({ id: `jad-${p.id}-${hari}-1`, poli_id: p.id, hari, sesi: 1,
        jam_buka: '08:00', jam_tutup: '12:00', jam_tutup_online: '11:00',
        kuota: 40, kuota_online: 20, aktif: true });
      if (hari <= 5)
        JADWAL.push({ id: `jad-${p.id}-${hari}-2`, poli_id: p.id, hari, sesi: 2,
          jam_buka: '16:00', jam_tutup: '20:00', jam_tutup_online: '19:00',
          kuota: 30, kuota_online: 15, aktif: true });
    }
  });

  const LIBUR = [];

  let ANTREAN_SET = {
    konfigurasi: {
      judul_layar: 'Antrean Pasien',
      teks_berjalan: 'Selamat datang di Klinik Pratama Imanuel. Mohon menunggu nomor antrean Anda dipanggil.',
      keterangan_antrol: 'Harap datang 30 menit sebelum jam praktek.',
      suara_aktif: true, menit_per_pasien: 10, tampilkan_estimasi: true
    },
    token_layar: 'demo-token-layar-yang-panjang-sekali-0001'
  };

  const AKUN_ANTROL = [
    { username: 'bpjs-antrol', keterangan: 'Akun UAT BPJS', aktif: true,
      dibuat_pada: jamHariIni(7, 0), terakhir_dipakai: null, jumlah_dipakai: 0 }
  ];
  const LOG_ANTROL = [];

  const barisAntrean = (a) => {
    const p = PASIEN.find(x => x.id === a.pasien_id);
    const k = KUNJUNGAN.find(x => x.id === a.kunjungan_id);
    const dasar = new Date(a.waktu_hadir || a.waktu_ambil);
    return {
      ...a,
      nama_poli: POLI.find(x => x.id === a.poli_id)?.nama,
      kode_poli: POLI.find(x => x.id === a.poli_id)?.kode,
      jenis_poli: POLI.find(x => x.id === a.poli_id)?.jenis,
      nama_pasien: p ? p.nama : a.nama_snapshot,
      no_rm: p ? p.no_rm : null,
      tanggal_lahir: p ? p.tanggal_lahir : null,
      jenis_kelamin: p ? p.jenis_kelamin : null,
      no_kartu: (p && p.no_bpjs) || a.no_kartu,
      nik: (p && p.nik) || a.nik,
      cara_bayar: k ? k.cara_bayar : null,
      status_kunjungan: k ? k.status : null,
      dokter_id: k ? k.dokter_id : null,
      nama_dokter: k ? PEGAWAI.find(x => x.id === k.dokter_id)?.nama : null,
      sudah_checkin: !!a.kunjungan_id,
      sudah_kajian: k ? KAJIAN.some(x => x.kunjungan_id === k.id) : false,
      menit_menunggu: Math.max(0, Math.round((Date.now() - dasar.getTime()) / 60000))
    };
  };

  async function antreanHariIni() {
    await tunggu(50);
    return ANTREAN.filter(a => a.tanggal === hariIni).map(barisAntrean)
      .sort((a, b) => (a.nama_poli || '').localeCompare(b.nama_poli || '') || a.no_urut - b.no_urut);
  }

  async function antreanKuota() {
    await tunggu(40);
    const hari = new Date().getDay();
    return POLI.filter(p => p.aktif).map(p => {
      const sesi = JADWAL.filter(j => j.poli_id === p.id && j.hari === hari && j.aktif);
      const libur = LIBUR.some(l => l.tanggal === hariIni && (!l.poli_id || l.poli_id === p.id));
      const buka = sesi.length > 0 && !libur;
      const hidup = ANTREAN.filter(a => a.poli_id === p.id && a.tanggal === hariIni &&
        !['BATAL','TIDAK_HADIR'].includes(a.status));
      const kuota = buka ? sesi.reduce((s, j) => s + j.kuota, 0) : 0;
      const kuotaOnline = buka ? sesi.reduce((s, j) => s + j.kuota_online, 0) : 0;
      const online = hidup.filter(a => a.sumber === 'ONLINE').length;
      return {
        poli_id: p.id, nama_poli: p.nama, kode_poli: p.kode, kode_pcare: p.kode_pcare,
        prefix_antrean: PREFIX[p.id] || 'A', urutan: p.urutan, tanggal: hariIni, buka,
        jam_buka: buka ? sesi[0].jam_buka : null,
        jam_tutup: buka ? sesi[sesi.length - 1].jam_tutup : null,
        jam_tutup_online: buka ? sesi[sesi.length - 1].jam_tutup_online : null,
        kuota, kuota_online: kuotaOnline,
        terpakai: hidup.length, terpakai_online: online,
        sisa_kuota: Math.max(0, kuota - hidup.length),
        sisa_kuota_online: Math.max(0, kuotaOnline - online)
      };
    });
  }

  async function antreanAmbilLoket(rec) {
    await tunggu(80);
    const urut = Math.max(0, ...ANTREAN
      .filter(a => a.poli_id === rec.poli_id && a.tanggal === hariIni)
      .map(a => a.no_urut)) + 1;
    const baru = {
      id: uid(), tanggal: hariIni, poli_id: rec.poli_id, no_urut: urut,
      prefix: PREFIX[rec.poli_id] || 'A', nomor: nomorAntrean(rec.poli_id, urut),
      kode_booking: 'ANT-' + hariIni.replace(/-/g,'') + '-' + urut,
      sumber: rec.sumber || 'LOKET', tahap: rec.tahap || 'LOKET',
      status: rec.status || 'MENUNGGU',
      pasien_id: rec.pasien_id || null, kunjungan_id: null,
      no_kartu: rec.no_kartu || null, nik: rec.nik || null,
      nama_snapshot: rec.nama_snapshot || null,
      waktu_ambil: new Date().toISOString(), waktu_hadir: new Date().toISOString(),
      waktu_panggil: null, waktu_mulai_layan: null, waktu_selesai: null,
      jumlah_panggil: 0, tujuan_terakhir: null, alasan_batal: null, catatan: null
    };
    ANTREAN.push(baru);
    return baru;
  }

  async function antreanPanggil(id, tujuan = null) {
    await tunggu(60);
    const a = ANTREAN.find(x => x.id === id);
    if (!a) throw new Error('Nomor antrean tidak ditemukan.');
    if (['SELESAI','BATAL'].includes(a.status))
      throw new Error(`Nomor ${a.nomor} sudah ${a.status.toLowerCase()} dan tidak bisa dipanggil lagi.`);
    a.jumlah_panggil += 1;
    a.status = 'DIPANGGIL';
    a.waktu_panggil = new Date().toISOString();
    a.waktu_hadir = a.waktu_hadir || a.waktu_panggil;
    a.tujuan_terakhir = tujuan ||
      (a.tahap === 'LOKET' ? 'Loket Pendaftaran' : POLI.find(p => p.id === a.poli_id)?.nama);
    PANGGILAN.unshift({ id: ++seqPanggilan, antrean_id: a.id, tanggal: hariIni,
      tahap: a.tahap, tujuan: a.tujuan_terakhir, urutan: a.jumlah_panggil,
      waktu: a.waktu_panggil, oleh: PROFIL.id });
    return a;
  }

  async function antreanCheckin(id, opsi = {}) {
    await tunggu(90);
    const a = ANTREAN.find(x => x.id === id);
    if (!a) throw new Error('Nomor antrean tidak ditemukan.');
    if (a.kunjungan_id) return KUNJUNGAN.find(k => k.id === a.kunjungan_id);
    if (!opsi.pasien_id) throw new Error('Pilih dulu data pasiennya sebelum check-in.');
    const k = {
      id: uid(), no_kunjungan: hariIni.replace(/-/g,'') + '-' + String(KUNJUNGAN.length + 1).padStart(4,'0'),
      pasien_id: opsi.pasien_id, tanggal: hariIni, poli_id: a.poli_id,
      dokter_id: opsi.dokter_id || null, cara_bayar: opsi.cara_bayar || 'BPJS',
      no_antrian: a.no_urut, jenis_kunjungan: 'LAMA', kunjungan_sakit: true,
      status: 'MENUNGGU', keluhan_singkat: opsi.keluhan || null,
      waktu_daftar: new Date().toISOString(), antrean_id: a.id,
      pcare_status: 'BELUM', satusehat_status: 'BELUM'
    };
    KUNJUNGAN.push(k);
    a.pasien_id = opsi.pasien_id; a.kunjungan_id = k.id;
    a.tahap = 'POLI'; a.status = 'MENUNGGU';
    a.waktu_hadir = a.waktu_hadir || new Date().toISOString();
    return k;
  }

  async function antreanMulaiLayan(id) {
    await tunggu(50);
    const a = ANTREAN.find(x => x.id === id);
    if (!a || ['SELESAI','BATAL'].includes(a.status))
      throw new Error('Nomor antrean tidak bisa dilayani.');
    a.status = 'DILAYANI';
    a.waktu_mulai_layan = a.waktu_mulai_layan || new Date().toISOString();
    return a;
  }

  async function antreanLewat(id, alasan = null) {
    await tunggu(50);
    const a = ANTREAN.find(x => x.id === id);
    if (!a || ['SELESAI','BATAL'].includes(a.status))
      throw new Error('Nomor antrean tidak bisa dilewati.');
    a.status = 'TIDAK_HADIR';
    a.alasan_batal = alasan || 'Tidak hadir saat dipanggil';
    a.waktu_selesai = new Date().toISOString();
    return a;
  }

  async function antreanBatal(id, alasan = null) {
    await tunggu(50);
    const a = ANTREAN.find(x => x.id === id);
    if (!a) throw new Error('Nomor antrean tidak ditemukan.');
    if (a.kunjungan_id)
      throw new Error(`Nomor ${a.nomor} sudah menjadi kunjungan. Batalkan kunjungannya lebih dulu.`);
    a.status = 'BATAL'; a.alasan_batal = alasan;
    a.waktu_selesai = new Date().toISOString();
    return a;
  }

  async function antreanUbah(id, patch) {
    await tunggu(40);
    const a = ANTREAN.find(x => x.id === id);
    Object.assign(a, patch);
    return a;
  }

  async function antreanPanggilanHariIni(batas = 20) {
    await tunggu(40);
    return PANGGILAN.slice(0, batas).map(p => ({
      ...p, antrean: { nomor: ANTREAN.find(a => a.id === p.antrean_id)?.nomor,
                       poli_id: ANTREAN.find(a => a.id === p.antrean_id)?.poli_id }
    }));
  }

  async function poliJadwal() { await tunggu(40); return JADWAL.slice(); }
  async function simpanJadwal(rec, id = null) {
    await tunggu(60);
    if (id) { const j = JADWAL.find(x => x.id === id); Object.assign(j, rec); return j; }
    const ada = JADWAL.find(x => x.poli_id === rec.poli_id && x.hari === rec.hari && x.sesi === rec.sesi);
    if (ada) { Object.assign(ada, rec); return ada; }
    const baru = { id: uid(), ...rec };
    JADWAL.push(baru); return baru;
  }
  async function hapusJadwal(id) {
    await tunggu(40);
    const i = JADWAL.findIndex(x => x.id === id);
    if (i >= 0) JADWAL.splice(i, 1);
  }
  async function poliLibur() {
    await tunggu(40);
    return LIBUR.map(l => ({ ...l, poli: POLI.find(p => p.id === l.poli_id) || null }));
  }
  async function simpanLibur(rec) {
    await tunggu(50);
    if (LIBUR.some(l => l.tanggal === rec.tanggal && (l.poli_id || null) === (rec.poli_id || null)))
      throw new Error('duplicate key value violates unique constraint');
    const baru = { id: uid(), ...rec };
    LIBUR.push(baru); return baru;
  }
  async function hapusLibur(id) {
    await tunggu(40);
    const i = LIBUR.findIndex(x => x.id === id);
    if (i >= 0) LIBUR.splice(i, 1);
  }

  async function antreanPengaturan() { await tunggu(40); return JSON.parse(JSON.stringify(ANTREAN_SET)); }
  async function simpanAntreanPengaturan(konfigurasi) {
    await tunggu(60); ANTREAN_SET.konfigurasi = konfigurasi; return ANTREAN_SET;
  }
  async function antreanTokenBaru(token) {
    await tunggu(50); ANTREAN_SET.token_layar = token; return token;
  }

  /* Tiruan antrean_layar(). Menyusun bentuk jawaban yang SAMA PERSIS
     dengan fungsi database — termasuk kenyataan bahwa tidak ada satu pun
     nama pasien di dalamnya. Uji halaman layar membaca bentuk ini. */
  async function antreanLayar(token) {
    await tunggu(40);
    if (!token || token !== ANTREAN_SET.token_layar)
      return { galat: 'Token layar tidak dikenal.' };
    const jam = (t) => t ? new Date(t).toTimeString().slice(0, 5) : '';
    return {
      tanggal: hariIni,
      waktu: new Date().toISOString().slice(0, 19),
      klinik: FASKES.nama,
      judul: ANTREAN_SET.konfigurasi.judul_layar,
      teks_berjalan: ANTREAN_SET.konfigurasi.teks_berjalan,
      panggilan: PANGGILAN.slice(0, 8).map(p => {
        const a = ANTREAN.find(x => x.id === p.antrean_id);
        return { id: p.id, nomor: a?.nomor, tujuan: p.tujuan,
                 poli: POLI.find(x => x.id === a?.poli_id)?.nama,
                 waktu: jam(p.waktu), ulang: p.urutan };
      }),
      poli: POLI.filter(p => p.aktif).map(p => {
        const isi = ANTREAN.filter(a => a.poli_id === p.id && a.tanggal === hariIni);
        const terakhir = PANGGILAN.find(pg =>
          ANTREAN.find(a => a.id === pg.antrean_id)?.poli_id === p.id);
        return {
          nama: p.nama, prefix: PREFIX[p.id] || 'A',
          dipanggil: terakhir ? ANTREAN.find(a => a.id === terakhir.antrean_id)?.nomor : '',
          berikut: isi.filter(a => ['MENUNGGU','BELUM_HADIR'].includes(a.status))
                      .sort((a, b) => a.no_urut - b.no_urut).slice(0, 4).map(a => a.nomor),
          sisa: isi.filter(a => ['MENUNGGU','BELUM_HADIR','DIPANGGIL'].includes(a.status)).length,
          selesai: isi.filter(a => a.status === 'SELESAI').length
        };
      })
    };
  }

  async function antrolAkun() { await tunggu(40); return AKUN_ANTROL.slice(); }
  async function antrolAkunSimpan(username, sandi, keterangan = null) {
    await tunggu(60);
    if (!username || !username.trim()) throw new Error('Username tidak boleh kosong.');
    if ((sandi || '').length < 12) throw new Error('Sandi web service minimal 12 karakter.');
    const u = username.trim().toLowerCase();
    const ada = AKUN_ANTROL.find(a => a.username === u);
    if (ada) { ada.keterangan = keterangan || ada.keterangan; ada.aktif = true; return u; }
    AKUN_ANTROL.push({ username: u, keterangan, aktif: true,
      dibuat_pada: new Date().toISOString(), terakhir_dipakai: null, jumlah_dipakai: 0 });
    return u;
  }
  async function antrolAkunHapus(username) {
    await tunggu(40);
    const i = AKUN_ANTROL.findIndex(a => a.username === username);
    if (i >= 0) AKUN_ANTROL.splice(i, 1);
    return i >= 0;
  }
  async function antrolLog() { await tunggu(40); return LOG_ANTROL.slice(); }

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

  /* Rujukan pemeriksaan terstruktur. Isinya disalin dari isian awal
     sql/14_periksa_terstruktur.sql — kalau salah satunya diubah tanpa
     yang lain, test/uji_kolom_db.js yang menangkapnya. */
  async function refPrognosa()     { await tunggu(25); return salin(REF_PROGNOSA); }
  async function refTacc()         { await tunggu(25); return salin(REF_TACC); }
  async function refSubspesialis() { await tunggu(25); return salin(REF_SUBSPESIALIS); }
  async function refSarana()       { await tunggu(25); return salin(REF_SARANA); }
  async function refAlergi()       { await tunggu(25); return salin(REF_ALERGI); }
  async function refPpk()          { await tunggu(25); return salin(REF_PPK); }
  async function refVitalSemua()   { await tunggu(25); return salin(REF_VITAL); }

  async function refSistemFisik(poliJenis = null) {
    await tunggu(25);
    return salin(REF_SISTEM_FISIK.filter(s => !s.poli_jenis || s.poli_jenis === poliJenis));
  }

  async function alergiKode(pasienId) {
    await tunggu(25);
    const per = {};
    ALERGI.filter(a => a.pasien_id === pasienId && a.ref_alergi_id)
      .forEach(a => { if (!per[a.jenis]) per[a.jenis] = salin(a); });
    return per;
  }
  async function setAlergiKode(pasienId, jenis, refAlergiId, nama) {
    await tunggu(60);
    for (let i = ALERGI.length - 1; i >= 0; i--) {
      const a = ALERGI[i];
      if (a.pasien_id === pasienId && a.jenis === jenis && a.ref_alergi_id) ALERGI.splice(i, 1);
    }
    if (!refAlergiId) return null;
    const baris = { id: uid(), pasien_id: pasienId, jenis, nama: nama || jenis,
                    ref_alergi_id: refAlergiId, dicatat_pada: new Date().toISOString() };
    ALERGI.push(baris);
    return salin(baris);
  }

  /* Pratinjau payload PCare. Di aplikasi sungguhan ini dibaca dari view
     v_pcare_kunjungan; di demo disusun dari data memori dengan aturan
     yang sama supaya halamannya bisa diuji. */
  async function pcarePratinjau(kunjunganId) {
    await tunggu(80);
    const k = KUNJUNGAN.find(x => x.id === kunjunganId);
    if (!k || k.cara_bayar !== 'BPJS') return { kunjungan: null, obat: [], tindakan: [] };
    const p = PASIEN.find(x => x.id === k.pasien_id) || {};
    const ka = KAJIAN.find(x => x.kunjungan_id === kunjunganId) || {};
    const pm = PEMERIKSAAN.find(x => x.kunjungan_id === kunjunganId) || {};
    const dg = DIAGNOSA.filter(x => x.kunjungan_id === kunjunganId);
    const po = POLI.find(x => x.id === k.poli_id) || {};
    const dr = PEGAWAI.find(x => x.id === k.dokter_id) || {};
    const cari = (daftar, kode) => (daftar.find(x => x.kode === kode) || {}).kode_pcare || null;

    return {
      kunjungan: {
        noKunjungan: k.pcare_no_kunjungan || null,
        noKartu: p.no_bpjs || null,
        tglDaftar: PeriksaCore.tglPcare(k.tanggal),
        kdPoli: po.kode_pcare || null,
        keluhan: pm.keluhan_utama || ka.keluhan_utama || k.keluhan_singkat || 'Tidak Ada',
        kdSadar: cari(REF_KESADARAN, pm.kesadaran_kode || ka.kesadaran_kode),
        sistole: ka.sistolik ?? null, diastole: ka.diastolik ?? null,
        beratBadan: ka.berat_badan ?? null, tinggiBadan: ka.tinggi_badan ?? null,
        respRate: ka.nafas ?? null, heartRate: ka.nadi ?? null,
        lingkarPerut: ka.lingkar_perut ?? null,
        suhu: PeriksaCore.suhuPcare(ka.suhu),
        kdStatusPulang: cari(REF_STATUS_PULANG, pm.status_pulang_kode),
        tglPulang: PeriksaCore.tglPcare(k.waktu_selesai || k.tanggal),
        kdDokter: dr.kode_dokter_pcare || null,
        kdDiag1: dg[0] ? dg[0].kode_icd10 : null,
        kdDiag2: dg[1] ? dg[1].kode_icd10 : null,
        kdDiag3: dg[2] ? dg[2].kode_icd10 : null,
        kdPoliRujukInternal: null,
        rujukLanjut: pm.rujuk_ppk_kode ? {
          tglEstRujuk: PeriksaCore.tglPcare(pm.rujuk_tgl_estimasi || k.tanggal),
          kdppk: pm.rujuk_ppk_kode,
          subSpesialis: { kdSubSpesialis1: cari(REF_SUBSPESIALIS, pm.rujuk_subspesialis_kode),
                          kdSarana: cari(REF_SARANA, pm.rujuk_sarana_kode) },
          khusus: null
        } : null,
        kdTacc: cari(REF_TACC, pm.tacc_kode) || '-1',
        alasanTacc: pm.tacc_alasan || null,
        anamnesa: pm.anamnesis || pm.subjective || 'Tidak Ada',
        alergiMakan: '00', alergiUdara: '00', alergiObat: '00',
        kdPrognosa: cari(REF_PROGNOSA, pm.prognosa_kode),
        terapiObat: pm.terapi_obat || 'Tidak Ada',
        terapiNonObat: pm.terapi_non_obat || 'Tidak Ada',
        bmhp: pm.bmhp || 'Tidak Ada'
      },
      obat: PeriksaCore.payloadPcareObat(
        (RESEP.find(r => r.kunjungan_id === kunjunganId) || {}).item || [],
        k.pcare_no_kunjungan),
      tindakan: TINDAKAN.filter(t => t.kunjungan_id === kunjunganId).map(t => ({
        kdTindakanSK: 0, noKunjungan: k.pcare_no_kunjungan,
        kdTindakan: t.kode_pcare || null, biaya: 0,
        keterangan: t.catatan || null, hasil: '0'
      }))
    };
  }

  async function observasiSatuSehat(kunjunganId) {
    await tunggu(60);
    const ka = KAJIAN.find(x => x.kunjungan_id === kunjunganId);
    const pm = PEMERIKSAAN.find(x => x.kunjungan_id === kunjunganId);
    return PeriksaCore.observasiSatuSehat(ka, pm, REF_VITAL, REF_SISTEM_FISIK)
      .map(o => Object.assign({ kunjungan_id: kunjunganId }, o));
  }

  async function kesiapanKode() {
    await tunggu(40);
    const kurang = [];
    const tambah = (tabel, field, daftar, kolom = 'kode_pcare') =>
      daftar.filter(x => !x[kolom]).forEach(x =>
        kurang.push({ tabel, field_pcare: field, kode: x.kode, nama: x.nama }));
    tambah('ref_kesadaran', 'kdSadar', REF_KESADARAN);
    tambah('ref_status_pulang', 'kdStatusPulang', REF_STATUS_PULANG);
    tambah('ref_prognosa', 'kdPrognosa', REF_PROGNOSA);
    tambah('ref_subspesialis', 'kdSubSpesialis1', REF_SUBSPESIALIS);
    tambah('ref_sarana', 'kdSarana', REF_SARANA);
    tambah('ref_alergi', 'alergi', REF_ALERGI);
    tambah('ref_sistem_fisik', 'LOINC Observation', REF_SISTEM_FISIK, 'kode_loinc');
    return kurang;
  }

  async function simpanPpk(rec) {
    await tunggu(90);
    const ada = REF_PPK.find(p => p.kode === rec.kode);
    if (ada) Object.assign(ada, rec);
    else REF_PPK.push({ ...rec, urutan: REF_PPK.length + 1 });
    return salin(rec);
  }

  async function simpanPemetaanKode(daftar) {
    await tunggu(120);
    const TABEL = {
      ref_kesadaran: [REF_KESADARAN, 'kode_pcare'],
      ref_status_pulang: [REF_STATUS_PULANG, 'kode_pcare'],
      ref_prognosa: [REF_PROGNOSA, 'kode_pcare'],
      ref_subspesialis: [REF_SUBSPESIALIS, 'kode_pcare'],
      ref_sarana: [REF_SARANA, 'kode_pcare'],
      ref_alergi: [REF_ALERGI, 'kode_pcare'],
      ref_sistem_fisik: [REF_SISTEM_FISIK, 'kode_loinc']
    };
    daftar.forEach(it => {
      const t = TABEL[it.tabel];
      if (!t) throw new Error(`Tabel "${it.tabel}" tidak boleh diubah dari sini.`);
      const baris = t[0].find(x => x.kode === it.kode);
      if (baris) baris[t[1]] = it.nilai;
    });
    return daftar.length;
  }

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
      kolam: 'reguler', created_at: geser(-60) },
    /* Batch ini masuk BELAKANGAN tapi expired lebih dekat. Dengan FIFO ia
       akan mengendap sampai kadaluwarsa; dengan FEFO ia keluar duluan —
       inilah perbedaan yang membuat modulnya ditulis ulang. */
    { id: 'bt-2', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg', satuan: 'Tablet',
      tgl_expired: geser(25), tgl_masuk: geser(-10), no_faktur: 'FK-2026/08/014',
      pbf: 'PT Enseval', harga_beli: 650, stok_awal: 100, stok_sisa: 80,
      kolam: 'reguler', created_at: geser(-10) },
    { id: 'bt-3', obat_id: 'ob-2', nama_obat: 'Amoxicillin 500 mg', satuan: 'Tablet',
      tgl_expired: geser(300), tgl_masuk: geser(-45), no_faktur: 'FK-2026/07/002',
      pbf: 'PT Kimia Farma', harga_beli: 1400, stok_awal: 300, stok_sisa: 6,
      kolam: 'reguler', created_at: geser(-45) },
    { id: 'bt-4', obat_id: 'ob-3', nama_obat: 'Ambroxol 30 mg', satuan: 'Tablet',
      tgl_expired: geser(-12), tgl_masuk: geser(-380), no_faktur: 'FK-2025/08/031',
      pbf: 'PT Enseval', harga_beli: 900, stok_awal: 200, stok_sisa: 45,
      kolam: 'reguler', created_at: geser(-380) },
    { id: 'bt-5', obat_id: 'ob-4', nama_obat: 'Cetirizine 10 mg', satuan: 'Tablet',
      tgl_expired: geser(500), tgl_masuk: geser(-20), no_faktur: 'FK-2026/08/009',
      pbf: 'PT Anugrah Argon', harga_beli: 1100, stok_awal: 250, stok_sisa: 250,
      kolam: 'reguler', created_at: geser(-20) },
    /* Batch kolam KRONIS, obat yang sama dengan bt-1/bt-2, dibeli klinik
       sendiri lewat jalur pembelian program kronis. Dipasang di sini
       supaya tab Stok punya sesuatu untuk ditunjukkan pecahannya
       (reguler vs kronis) tanpa menunggu Tahap 2. */
    { id: 'bt-6', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg', satuan: 'Tablet',
      tgl_expired: geser(200), tgl_masuk: geser(-15), no_faktur: 'FK-2026/08/020',
      pbf: 'PT Kimia Farma', harga_beli: 600, stok_awal: 150, stok_sisa: 150,
      kolam: 'kronis', created_at: geser(-15) }
  ];

  const TRANSAKSI = [
    { id: 1, batch_id: 'bt-1', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
      satuan: 'Tablet', jenis: 'MASUK', kategori: 'Pembelian', jumlah: 500,
      harga_satuan: 600, total_nilai: 300000, tanggal: geser(-60), kolam: 'reguler',
      no_faktur: 'FK-2026/07/001', pbf: 'PT Kimia Farma', grup_id: 'g-1', dibatalkan: false },
    { id: 2, batch_id: 'bt-2', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
      satuan: 'Tablet', jenis: 'MASUK', kategori: 'Pembelian', jumlah: 100,
      harga_satuan: 650, total_nilai: 65000, tanggal: geser(-10), kolam: 'reguler',
      no_faktur: 'FK-2026/08/014', pbf: 'PT Enseval', grup_id: 'g-2', dibatalkan: false },
    { id: 3, batch_id: 'bt-2', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
      satuan: 'Tablet', jenis: 'KELUAR', kategori: 'Resep Pasien', jumlah: 20,
      harga_satuan: 650, total_nilai: 13000, tanggal: geser(-3), kolam: 'reguler',
      grup_id: 'g-3', dibatalkan: false, keterangan: 'R260828004' },
    { id: 4, batch_id: 'bt-3', obat_id: 'ob-2', nama_obat: 'Amoxicillin 500 mg',
      satuan: 'Tablet', jenis: 'KELUAR', kategori: 'Resep Pasien', jumlah: 294,
      harga_satuan: 1400, total_nilai: 411600, tanggal: geser(-5), kolam: 'reguler',
      grup_id: 'g-4', dibatalkan: false },
    { id: 5, batch_id: 'bt-6', obat_id: 'ob-1', nama_obat: 'Paracetamol 500 mg',
      satuan: 'Tablet', jenis: 'MASUK', kategori: 'Pembelian', jumlah: 150,
      harga_satuan: 600, total_nilai: 90000, tanggal: geser(-15), kolam: 'kronis',
      no_faktur: 'FK-2026/08/020', pbf: 'PT Kimia Farma', grup_id: 'g-5', dibatalkan: false }
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
    const kolam = r.kolam || 'reguler';
    const ada = BATCH.find(b => b.obat_id === r.obat_id && b.tgl_expired === r.tgl_expired
      && (b.no_faktur || '') === (r.no_faktur || '')
      && String(b.pbf).toLowerCase() === String(r.pbf).toLowerCase()
      && Number(b.harga_beli) === Number(r.harga_beli)
      && (b.kolam || 'reguler') === kolam);
    let batchId;
    if (ada) { ada.stok_awal += r.jumlah; ada.stok_sisa += r.jumlah; batchId = ada.id; }
    else {
      batchId = uid();
      BATCH.push({ id: batchId, obat_id: r.obat_id, nama_obat: o.nama, satuan: o.satuan,
        tgl_expired: r.tgl_expired, tgl_masuk: r.tgl_masuk || UI.hariIni(),
        no_faktur: r.no_faktur, pbf: r.pbf, harga_beli: Number(r.harga_beli) || 0,
        stok_awal: r.jumlah, stok_sisa: r.jumlah, keterangan: r.keterangan, kolam,
        created_at: new Date().toISOString() });
    }
    TRANSAKSI.unshift({ id: TRANSAKSI.length + 1, batch_id: batchId, obat_id: r.obat_id,
      nama_obat: o.nama, satuan: o.satuan, jenis: 'MASUK', kategori: 'Pembelian',
      jumlah: r.jumlah, harga_satuan: Number(r.harga_beli) || 0,
      total_nilai: r.jumlah * (Number(r.harga_beli) || 0), kolam,
      tanggal: r.tgl_masuk || UI.hariIni(), no_faktur: r.no_faktur, pbf: r.pbf,
      grup_id: uid(), dibatalkan: false, keterangan: r.keterangan });
    return { batch_id: batchId, digabung: !!ada, kolam };
  }

  /* `r.kolam` di sini PREFERENSI (lihat 17_apotek_kolam.sql) — bukan
     syarat. Kosong = FEFO polos seperti sebelum kolam ada. */
  async function apotekKeluar(r) {
    await tunggu(120);
    const o = OBAT.find(x => x.id === r.obat_id);
    let kandidat = BATCH.filter(b => b.obat_id === r.obat_id && b.stok_sisa > 0);
    if (r.batch_id) kandidat = kandidat.filter(b => b.id === r.batch_id);
    kandidat = ApotekCore.batchBolehKeluar(kandidat, r.kategori);
    const sim = ApotekCore.simulasiFefo(kandidat, r.jumlah, r.kolam || null);
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
        kolam: b.kolam || 'reguler',
        tanggal: r.tanggal || UI.hariIni(), kunjungan_id: r.kunjungan_id || null,
        resep_item_id: r.resep_item_id || null, grup_id: grup, dibatalkan: false,
        keterangan: r.keterangan });
    });
    return { grup_id: grup, total_nilai: sim.totalNilai,
             potongan: sim.potongan.map(p => ({ batch_id: p.batch.id,
               tgl_expired: p.batch.tgl_expired, kolam: p.batch.kolam || 'reguler',
               jumlah: p.ambil, nilai: p.nilai })) };
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
      /* Aplikasi sungguhan menanyakan kronis_kolam_resep_item() di sini
         (lihat 17_apotek_kolam.sql) dan mengutamakan kolam kronis untuk
         obat yang bagian dari terapi kronis aktif pasiennya. Data contoh
         belum punya pendaftaran kronis aktif (menyusul di Tahap 2), jadi
         sementara selalu 'reguler' — sama seperti pasien tanpa terapi
         kronis di database sungguhan. */
      await apotekKeluar({ obat_id: ri.obat_id, jumlah: it.jumlah, kategori: 'Resep Pasien',
        kunjungan_id: r.kunjungan_id, resep_item_id: ri.id, keterangan: r.no_resep,
        kolam: 'reguler' });
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
            no_batch: b.no_batch, keterangan: b.keterangan, kolam: b.kolam || 'reguler'
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

  /* ================= LAB & PENUNJANG (demo) =================
     Aturan penandaannya dipinjam langsung dari LabCore, bukan ditulis
     ulang di sini. Kalau demo memakai aturan sendiri, demo bisa terlihat
     benar sementara aplikasi sungguhannya salah. */
  const REF_LAB = [
    { id: 'lab-hb',  kode: 'HB',    nama: 'Hemoglobin',            kelompok: 'Hematologi',
      satuan: 'g/dL', jenis_nilai: 'ANGKA', desimal: 1, urutan: 10, aktif: true,
      rujukan: [
        { id: 'rj-hb-l', lab_id: 'lab-hb', jenis_kelamin: 'L', umur_min_bulan: 180,
          umur_max_bulan: null, batas_bawah: 13, batas_atas: 17, kritis_bawah: 7, kritis_atas: 20 },
        { id: 'rj-hb-p', lab_id: 'lab-hb', jenis_kelamin: 'P', umur_min_bulan: 180,
          umur_max_bulan: null, batas_bawah: 12, batas_atas: 15, kritis_bawah: 7, kritis_atas: 20 },
        { id: 'rj-hb-a', lab_id: 'lab-hb', jenis_kelamin: null, umur_min_bulan: 12,
          umur_max_bulan: 72, batas_bawah: 11.5, batas_atas: 13.5, kritis_bawah: 7, kritis_atas: 20 }
      ] },
    { id: 'lab-leu', kode: 'LEU',   nama: 'Leukosit',              kelompok: 'Hematologi',
      satuan: '/µL', jenis_nilai: 'ANGKA', desimal: 0, urutan: 20, aktif: true,
      rujukan: [{ id: 'rj-leu', lab_id: 'lab-leu', jenis_kelamin: null, umur_min_bulan: 180,
        umur_max_bulan: null, batas_bawah: 4000, batas_atas: 10000,
        kritis_bawah: 2000, kritis_atas: 30000 }] },
    { id: 'lab-tro', kode: 'TRO',   nama: 'Trombosit',             kelompok: 'Hematologi',
      satuan: '/µL', jenis_nilai: 'ANGKA', desimal: 0, urutan: 30, aktif: true,
      rujukan: [{ id: 'rj-tro', lab_id: 'lab-tro', jenis_kelamin: null, umur_min_bulan: 0,
        umur_max_bulan: null, batas_bawah: 150000, batas_atas: 400000,
        kritis_bawah: 50000, kritis_atas: 1000000 }] },
    { id: 'lab-gds', kode: 'GDS',   nama: 'Glukosa Darah Sewaktu', kelompok: 'Kimia Klinik',
      satuan: 'mg/dL', jenis_nilai: 'ANGKA', desimal: 0, urutan: 110, aktif: true,
      rujukan: [{ id: 'rj-gds', lab_id: 'lab-gds', jenis_kelamin: null, umur_min_bulan: 0,
        umur_max_bulan: null, batas_bawah: 70, batas_atas: 140,
        kritis_bawah: 45, kritis_atas: 450 }] },
    { id: 'lab-chol', kode: 'CHOL', nama: 'Kolesterol Total',      kelompok: 'Kimia Klinik',
      satuan: 'mg/dL', jenis_nilai: 'ANGKA', desimal: 0, urutan: 140, aktif: true,
      rujukan: [{ id: 'rj-chol', lab_id: 'lab-chol', jenis_kelamin: null, umur_min_bulan: 0,
        umur_max_bulan: null, batas_bawah: null, batas_atas: 200, teks: '< 200' }] },
    { id: 'lab-ua',  kode: 'UA',    nama: 'Asam Urat',             kelompok: 'Kimia Klinik',
      satuan: 'mg/dL', jenis_nilai: 'ANGKA', desimal: 1, urutan: 180, aktif: true,
      rujukan: [
        { id: 'rj-ua-l', lab_id: 'lab-ua', jenis_kelamin: 'L', umur_min_bulan: 0,
          umur_max_bulan: null, batas_bawah: 3.4, batas_atas: 7 },
        { id: 'rj-ua-p', lab_id: 'lab-ua', jenis_kelamin: 'P', umur_min_bulan: 0,
          umur_max_bulan: null, batas_bawah: 2.4, batas_atas: 6 }] },
    { id: 'lab-hbsag', kode: 'HBSAG', nama: 'HBsAg',               kelompok: 'Imunoserologi',
      satuan: null, jenis_nilai: 'PILIHAN', pilihan: ['Non Reaktif', 'Reaktif'],
      teks_normal: 'Non Reaktif', desimal: 0, urutan: 420, aktif: true, rujukan: [] },
    { id: 'lab-upro', kode: 'UPRO', nama: 'Urine - Protein',       kelompok: 'Urinalisis',
      satuan: null, jenis_nilai: 'PILIHAN', pilihan: ['Negatif', '+1', '+2', '+3', '+4'],
      teks_normal: 'Negatif', desimal: 0, urutan: 340, aktif: true, rujukan: [] }
  ];

  const REF_PAKET = [
    { id: 'pk-dr', kode: 'DR', nama: 'Darah Rutin', urutan: 10, aktif: true,
      item: [{ lab_id: 'lab-hb', urutan: 1 }, { lab_id: 'lab-leu', urutan: 2 },
             { lab_id: 'lab-tro', urutan: 3 }] },
    { id: 'pk-gd', kode: 'GD', nama: 'Gula Darah', urutan: 20, aktif: true,
      item: [{ lab_id: 'lab-gds', urutan: 1 }] },
    { id: 'pk-lip', kode: 'LIPID', nama: 'Profil Lipid', urutan: 30, aktif: true,
      item: [{ lab_id: 'lab-chol', urutan: 1 }] }
  ];

  let LAB_PERMINTAAN = [
    { id: 'lp-1', no_lab: 'LAB-2026-0001', pasien_id: 'pas-5', kunjungan_id: 'kunj-2',
      tanggal: hariIni, asal: 'INTERNAL', status: 'DIMINTA',
      catatan_klinis: 'Kontrol rutin hipertensi, cek gula dan kolesterol',
      diminta_oleh: 'peg-1', diminta_pada: jamHariIni(8, 30) },
    { id: 'lp-2', no_lab: 'LAB-2026-0002', pasien_id: 'pas-1', kunjungan_id: 'kunj-1',
      tanggal: hariIni, asal: 'INTERNAL', status: 'SELESAI',
      catatan_klinis: 'Curiga infeksi', diminta_oleh: 'peg-1',
      diminta_pada: jamHariIni(8, 20), selesai_oleh: 'peg-3', waktu_selesai: jamHariIni(9, 15) }
  ];

  let LAB_HASIL = [
    { id: 'lh-1', permintaan_id: 'lp-1', lab_id: 'lab-gds', nama: 'Glukosa Darah Sewaktu',
      satuan: 'mg/dL', nilai_angka: null, nilai_teks: null, tanda: 'BELUM',
      rujukan_teks: '70 - 140', rujukan_bawah: 70, rujukan_atas: 140, urutan: 1 },
    { id: 'lh-2', permintaan_id: 'lp-1', lab_id: 'lab-chol', nama: 'Kolesterol Total',
      satuan: 'mg/dL', nilai_angka: null, nilai_teks: null, tanda: 'BELUM',
      rujukan_teks: '< 200', rujukan_bawah: null, rujukan_atas: 200, urutan: 2 },
    { id: 'lh-3', permintaan_id: 'lp-2', lab_id: 'lab-hb', nama: 'Hemoglobin',
      satuan: 'g/dL', nilai_angka: 11.2, nilai_teks: null, tanda: 'RENDAH',
      rujukan_teks: '13.0 - 17.0', rujukan_bawah: 13, rujukan_atas: 17, urutan: 1 },
    { id: 'lh-4', permintaan_id: 'lp-2', lab_id: 'lab-leu', nama: 'Leukosit',
      satuan: '/µL', nilai_angka: 13400, nilai_teks: null, tanda: 'TINGGI',
      rujukan_teks: '4000.0 - 10000.0', rujukan_bawah: 4000, rujukan_atas: 10000, urutan: 2 },
    { id: 'lh-5', permintaan_id: 'lp-2', lab_id: 'lab-tro', nama: 'Trombosit',
      satuan: '/µL', nilai_angka: 232000, nilai_teks: null, tanda: 'NORMAL',
      rujukan_teks: '150000.0 - 400000.0', rujukan_bawah: 150000, rujukan_atas: 400000, urutan: 3 }
  ];

  let PENUNJANG = [
    { id: 'pn-1', pasien_id: 'pas-1', kunjungan_id: 'kunj-7', tanggal: hariIni,
      jenis: 'RO_PERIAPIKAL', judul: 'Periapikal regio 36-37', asal: 'INTERNAL',
      no_film: 'F-0142',
      temuan: 'Tampak area radiolusen pada mahkota gigi 36 mencapai kamar pulpa. '
            + 'Pelebaran ruang ligamen periodontal di apikal mesial.',
      kesan: 'Karies profunda gigi 36 dengan periodontitis apikalis kronis',
      saran: 'Perawatan saluran akar gigi 36',
      dibaca_oleh: 'peg-5', dibaca_pada: jamHariIni(9, 20), gigi: ['36', '37'] }
  ];

  let LAMPIRAN = [
    { id: 'lm-1', no_arsip: 'ARS-2026-0001', pasien_id: 'pas-1', kunjungan_id: 'kunj-7',
      jenis: 'FILM_RONTGEN', judul: 'Film periapikal gigi 36-37',
      tanggal_dokumen: hariIni, asal: 'Klinik Imanuel', no_dokumen: 'F-0142',
      lokasi_simpan: 'Lemari B, laci 2', bentuk: 'FISIK',
      berkas_path: null, dibuat_oleh: 'peg-5', dibuat_pada: jamHariIni(9, 25) }
  ];

  let urutLab = 2, urutArsip = 1;

  const labRef = (id) => REF_LAB.find(m => m.id === id) || {};

  /* Menandai satu baris hasil dengan aturan yang sama seperti trigger
     lab_hitung_tanda() di database. */
  function tandaiHasilDemo(h) {
    const m = labRef(h.lab_id);
    const p = PASIEN.find(x => x.id ===
      (LAB_PERMINTAAN.find(l => l.id === h.permintaan_id) || {}).pasien_id) || {};
    const ruj = LabCore.pilihRujukan(m.rujukan || [], p.jenis_kelamin,
      LabCore.umurBulan(p.tanggal_lahir));
    h.rujukan_bawah = ruj ? ruj.batas_bawah : null;
    h.rujukan_atas  = ruj ? ruj.batas_atas : null;
    h.rujukan_teks  = LabCore.teksRujukan(ruj, m);
    h.tanda = LabCore.tandai(m, ruj, h.nilai_angka, h.nilai_teks);
    return h;
  }

  const lampirRef = (h) => Object.assign({}, h, { ref: salin(labRef(h.lab_id)) });

  function ringkasPermintaan(lp) {
    const isi = LAB_HASIL.filter(h => h.permintaan_id === lp.id);
    const p = PASIEN.find(x => x.id === lp.pasien_id) || {};
    const k = KUNJUNGAN.find(x => x.id === lp.kunjungan_id);
    const po = k ? POLI.find(x => x.id === k.poli_id) : null;
    const d = PEGAWAI.find(x => x.id === lp.diminta_oleh);
    const r = LabCore.ringkasLembar(isi);
    return Object.assign(salin(lp), {
      no_rm: p.no_rm, nama_pasien: p.nama, jenis_kelamin: p.jenis_kelamin,
      tanggal_lahir: p.tanggal_lahir, no_kunjungan: k ? k.no_kunjungan : null,
      cara_bayar: k ? k.cara_bayar : null, nama_poli: po ? po.nama : null,
      nama_dokter: d ? d.nama : null,
      jml_pemeriksaan: r.total, jml_terisi: r.terisi,
      jml_kritis: r.kritis, jml_tak_normal: r.takNormal
    });
  }

  async function refLab(hanyaAktif = true) {
    await tunggu(30);
    return salin(REF_LAB.filter(m => !hanyaAktif || m.aktif));
  }
  async function refLabPaket() { await tunggu(20); return salin(REF_PAKET); }
  async function simpanRefLab(patch) {
    if (patch.id) { Object.assign(REF_LAB.find(m => m.id === patch.id), patch); return patch; }
    const baru = Object.assign({ id: uid(), rujukan: [] }, patch);
    REF_LAB.push(baru); return baru;
  }
  async function simpanRujukan(patch) {
    const m = REF_LAB.find(x => x.id === patch.lab_id);
    const baru = Object.assign({ id: uid() }, patch);
    m.rujukan = (m.rujukan || []).concat(baru);
    return baru;
  }
  async function hapusRujukan(id) {
    REF_LAB.forEach(m => { m.rujukan = (m.rujukan || []).filter(r => r.id !== id); });
  }

  async function labMinta(kunjunganId, labIds, catatan, asal, namaLabLuar) {
    const k = KUNJUNGAN.find(x => x.id === kunjunganId);
    const id = uid();
    LAB_PERMINTAAN.push({ id, no_lab: 'LAB-2026-' + String(++urutLab).padStart(4, '0'),
      pasien_id: k.pasien_id, kunjungan_id: kunjunganId, tanggal: k.tanggal,
      asal: asal || 'INTERNAL', nama_lab_luar: namaLabLuar || null,
      status: 'DIMINTA', catatan_klinis: catatan || null,
      diminta_oleh: PROFIL.id, diminta_pada: new Date().toISOString() });
    let urut = 0;
    REF_LAB.filter(m => labIds.includes(m.id)).forEach(m => {
      LAB_HASIL.push(tandaiHasilDemo({ id: uid(), permintaan_id: id, lab_id: m.id,
        nama: m.nama, satuan: m.satuan, nilai_angka: null, nilai_teks: null,
        tanda: 'BELUM', urutan: ++urut }));
    });
    return id;
  }
  async function labMintaLuar(r) {
    const id = uid();
    LAB_PERMINTAAN.push({ id, no_lab: 'LAB-2026-' + String(++urutLab).padStart(4, '0'),
      pasien_id: r.pasien_id, kunjungan_id: r.kunjungan_id || null,
      tanggal: r.tanggal || UI.hariIni(), asal: 'EKSTERNAL',
      nama_lab_luar: r.nama_lab, no_lembar_luar: r.no_lembar || null,
      status: 'DIKERJAKAN', diminta_oleh: PROFIL.id,
      diminta_pada: new Date().toISOString() });
    let urut = 0;
    REF_LAB.filter(m => r.lab_ids.includes(m.id)).forEach(m => {
      LAB_HASIL.push(tandaiHasilDemo({ id: uid(), permintaan_id: id, lab_id: m.id,
        nama: m.nama, satuan: m.satuan, nilai_angka: null, nilai_teks: null,
        tanda: 'BELUM', urutan: ++urut }));
    });
    return id;
  }
  async function labAntrean(dari, sampai, status) {
    await tunggu(40);
    const st = status ? (Array.isArray(status) ? status : [status]) : null;
    return LAB_PERMINTAAN
      .filter(lp => lp.tanggal >= dari && lp.tanggal <= sampai)
      .filter(lp => !st || st.includes(lp.status))
      .map(ringkasPermintaan)
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  }
  async function labPermintaan(id) {
    await tunggu(40);
    const lp = LAB_PERMINTAAN.find(x => x.id === id);
    const p = PASIEN.find(x => x.id === lp.pasien_id);
    const k = KUNJUNGAN.find(x => x.id === lp.kunjungan_id);
    const d = PEGAWAI.find(x => x.id === lp.diminta_oleh);
    const s = PEGAWAI.find(x => x.id === lp.selesai_oleh);
    return Object.assign(salin(lp), {
      pasien: salin(p), kunjungan: k ? salin(k) : null,
      peminta: d ? { nama: d.nama } : null, penutup: s ? { nama: s.nama } : null,
      hasil: LAB_HASIL.filter(h => h.permintaan_id === id)
        .sort((a, b) => (a.urutan || 0) - (b.urutan || 0)).map(lampirRef)
    });
  }
  async function labKunjungan(kunjunganId) {
    await tunggu(30);
    return LAB_PERMINTAAN.filter(lp => lp.kunjungan_id === kunjunganId && lp.status !== 'BATAL')
      .map(lp => Object.assign(salin(lp), {
        hasil: LAB_HASIL.filter(h => h.permintaan_id === lp.id).map(lampirRef)
      }));
  }
  async function labPasien(pasienId) {
    await tunggu(30);
    return LAB_PERMINTAAN.filter(lp => lp.pasien_id === pasienId && lp.status !== 'BATAL')
      .map(ringkasPermintaan);
  }
  async function simpanHasilLab(id, patch) {
    const h = LAB_HASIL.find(x => x.id === id);
    const lp = LAB_PERMINTAAN.find(x => x.id === h.permintaan_id);
    if (lp.status === 'SELESAI' && PROFIL.peran !== 'admin')
      throw new Error('Lembar hasil ini sudah selesai dan terkunci.');
    Object.assign(h, patch);
    tandaiHasilDemo(h);
    if (lp.status === 'DIMINTA') lp.status = 'DIKERJAKAN';
    return salin(h);
  }
  async function labSelesaikan(id) {
    const isi = LAB_HASIL.filter(h => h.permintaan_id === id);
    const kosong = isi.filter(h => h.nilai_angka === null && !h.nilai_teks).length;
    if (kosong) throw new Error(`Masih ada ${kosong} pemeriksaan yang belum diisi hasilnya.`);
    const lp = LAB_PERMINTAAN.find(x => x.id === id);
    lp.status = 'SELESAI'; lp.selesai_oleh = PROFIL.id;
    lp.waktu_selesai = new Date().toISOString();
  }
  async function labBukaKunci(id, alasan) {
    if (PROFIL.peran !== 'admin') throw new Error('Hanya admin yang boleh membuka kunci.');
    const lp = LAB_PERMINTAAN.find(x => x.id === id);
    lp.status = 'DIKERJAKAN';
    lp.catatan_klinis = (lp.catatan_klinis ? lp.catatan_klinis + '\n' : '') +
      '[Dibuka kembali] ' + alasan;
  }
  async function labBatalkan(id, alasan) {
    const lp = LAB_PERMINTAAN.find(x => x.id === id);
    lp.status = 'BATAL'; lp.alasan_batal = alasan;
  }
  async function labTren(pasienId, labId) {
    await tunggu(30);
    return LAB_HASIL
      .filter(h => h.lab_id === labId)
      .map(h => {
        const lp = LAB_PERMINTAAN.find(x => x.id === h.permintaan_id);
        return (lp && lp.pasien_id === pasienId && lp.status === 'SELESAI')
          ? Object.assign(salin(h), { tanggal: lp.tanggal, no_lab: lp.no_lab }) : null;
      })
      .filter(Boolean);
  }
  async function labBelumSelesai(kunjunganId) {
    return LAB_PERMINTAAN.filter(lp => lp.kunjungan_id === kunjunganId &&
      lp.asal === 'INTERNAL' && ['DIMINTA', 'DIKERJAKAN'].includes(lp.status)).length;
  }

  const lengkapiPenunjang = (b) => {
    const p = PASIEN.find(x => x.id === b.pasien_id) || {};
    const k = KUNJUNGAN.find(x => x.id === b.kunjungan_id);
    const d = PEGAWAI.find(x => x.id === b.dibaca_oleh);
    return Object.assign(salin(b), {
      no_rm: p.no_rm, nama_pasien: p.nama, no_kunjungan: k ? k.no_kunjungan : null,
      nama_pembaca: d ? d.nama : null,
      daftar_gigi: (b.gigi || []).join(', ') || null
    });
  };
  async function penunjangSimpan(p) {
    if (!p.kesan || !p.kesan.trim()) throw new Error('Kesan wajib diisi.');
    if (p.id) {
      const b = PENUNJANG.find(x => x.id === p.id);
      Object.assign(b, p, { gigi: p.gigi || [] });
      return b.id;
    }
    const baru = Object.assign({ id: uid(), dibaca_oleh: PROFIL.id,
      dibaca_pada: new Date().toISOString() }, p, { gigi: p.gigi || [] });
    PENUNJANG.push(baru);
    return baru.id;
  }
  async function penunjangPasien(pasienId) {
    await tunggu(30);
    return PENUNJANG.filter(b => b.pasien_id === pasienId).map(lengkapiPenunjang);
  }
  async function penunjangKunjungan(kunjunganId) {
    await tunggu(20);
    return PENUNJANG.filter(b => b.kunjungan_id === kunjunganId).map(lengkapiPenunjang);
  }
  async function gigiBerbacaan(pasienId) {
    const peta = {};
    PENUNJANG.filter(b => b.pasien_id === pasienId).forEach(b => {
      (b.gigi || []).forEach(g => {
        (peta[g] = peta[g] || []).push({ id: b.id, tanggal: b.tanggal,
                                         jenis: b.jenis, kesan: b.kesan });
      });
    });
    return peta;
  }
  async function hapusPenunjang(id) { PENUNJANG = PENUNJANG.filter(b => b.id !== id); }

  async function lampiranPasien(pasienId) {
    await tunggu(30);
    return LAMPIRAN.filter(l => l.pasien_id === pasienId).map(l => {
      const k = KUNJUNGAN.find(x => x.id === l.kunjungan_id);
      const d = PEGAWAI.find(x => x.id === l.dibuat_oleh);
      return Object.assign(salin(l), {
        kunjungan: k ? { no_kunjungan: k.no_kunjungan, tanggal: k.tanggal } : null,
        pencatat: d ? { nama: d.nama } : null });
    });
  }
  async function lampiranKunjungan(kunjunganId) {
    await tunggu(20);
    return salin(LAMPIRAN.filter(l => l.kunjungan_id === kunjunganId));
  }
  async function simpanLampiran(patch) {
    if (patch.id) {
      const l = LAMPIRAN.find(x => x.id === patch.id);
      Object.assign(l, patch); return salin(l);
    }
    const baru = Object.assign({ id: uid(),
      no_arsip: 'ARS-2026-' + String(++urutArsip).padStart(4, '0'),
      bentuk: 'FISIK', berkas_path: null, dibuat_oleh: PROFIL.id,
      dibuat_pada: new Date().toISOString() }, patch);
    LAMPIRAN.push(baru);
    return salin(baru);
  }
  async function hapusLampiran(id) { LAMPIRAN = LAMPIRAN.filter(l => l.id !== id); }

  /* ====================== SURAT KETERANGAN ====================== */
  const REF_JENIS_SURAT = [
    { kode: 'SKS',  nama: 'Surat Keterangan Sakit',
      judul_cetak: 'SURAT KETERANGAN SAKIT', perlu_kunjungan: true, urutan: 1, aktif: true },
    { kode: 'SR',   nama: 'Surat Rujukan',
      judul_cetak: 'SURAT RUJUKAN', perlu_kunjungan: true, urutan: 2, aktif: true },
    { kode: 'SK',   nama: 'Surat Kontrol',
      judul_cetak: 'SURAT KONTROL', perlu_kunjungan: true, urutan: 3, aktif: true },
    { kode: 'SKBS', nama: 'Surat Keterangan Berbadan Sehat',
      judul_cetak: 'SURAT KETERANGAN BERBADAN SEHAT', perlu_kunjungan: true, urutan: 4, aktif: true },
    { kode: 'RM',   nama: 'Resume Medis',
      judul_cetak: 'RESUME MEDIS', perlu_kunjungan: true, urutan: 5, aktif: true },
    { kode: 'SKL',  nama: 'Surat Keterangan',
      judul_cetak: 'SURAT KETERANGAN', perlu_kunjungan: false, urutan: 9, aktif: true }
  ];

  const SETELAN_SURAT = {
    kota: 'Manado',
    catatan_kaki: 'Keaslian surat ini dapat diperiksa dengan menyebutkan nomor surat ' +
                  'kepada Klinik Pratama Imanuel.',
    tampilkan_kop: true, garis_bawah_kop: false, kop_data_uri: null, kop_rasio: null
  };

  const ROMAWI_DEMO = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const noSuratDemo = (s) =>
    `${String(s.nomor_urut).padStart(2,'0')}/${s.jenis_kode}/YAKIM/` +
    `${ROMAWI_DEMO[s.bulan - 1]}/${s.tahun}`;

  const SURAT = [
    { id: 'srt-1', jenis_kode: 'SKS', nomor_urut: 12,
      bulan: Number(hariIni.slice(5, 7)), tahun: Number(hariIni.slice(0, 4)),
      tanggal_surat: hariIni, pasien_id: 'pas-1', kunjungan_id: 'kunj-1',
      perihal: 'Istirahat 2 hari', status: 'AKTIF', jml_cetak: 1,
      data: { mulai: hariIni, lama: 2, keperluan: 'Keperluan tempat bekerja',
              cantumkan_diagnosa: false, diagnosa_teks: 'ISPA', catatan: '' },
      dokter_id: 'peg-1', ttd_nama: 'dr. Arthur Mantiri',
      ttd_jabatan: 'Dokter Pemeriksa', ttd_sip: '446/SIP/2024/0091',
      dibuat_oleh: 'peg-1', dibuat_pada: new Date().toISOString() }
  ];

  function lengkapiSurat(s) {
    const p = PASIEN.find(x => x.id === s.pasien_id) || {};
    const k = KUNJUNGAN.find(x => x.id === s.kunjungan_id);
    const j = REF_JENIS_SURAT.find(x => x.kode === s.jenis_kode) || {};
    const pb = PEGAWAI.find(x => x.id === s.dibuat_oleh);
    return Object.assign(salin(s), {
      nomor_surat: noSuratDemo(s),
      jenis_nama: j.nama, judul_cetak: j.judul_cetak,
      no_rm: p.no_rm, nama_pasien: p.nama,
      jenis_kelamin: p.jenis_kelamin, tanggal_lahir: p.tanggal_lahir,
      no_kunjungan: k ? k.no_kunjungan : null,
      tanggal_kunjungan: k ? k.tanggal : null,
      cara_bayar: k ? k.cara_bayar : null,
      nama_poli: k ? (POLI.find(x => x.id === k.poli_id) || {}).nama : null,
      nama_pembuat: pb ? pb.nama : 'Demo'
    });
  }

  async function refJenisSurat() { await tunggu(20); return salin(REF_JENIS_SURAT); }
  async function suratPengaturan() { await tunggu(20); return salin(SETELAN_SURAT); }
  async function simpanSuratPengaturan(k) { Object.assign(SETELAN_SURAT, k); return salin(SETELAN_SURAT); }

  async function suratNomorBerikutnya(jenis, tahun) {
    await tunggu(20);
    const dipakai = SURAT.filter(s => s.jenis_kode === jenis && s.tahun === tahun)
      .map(s => s.nomor_urut);
    return dipakai.length ? Math.max.apply(null, dipakai) + 1 : 1;
  }
  async function suratNomorTerpakai(jenis, tahun, nomor) {
    await tunggu(20);
    const s = SURAT.find(x => x.jenis_kode === jenis && x.tahun === tahun
                              && x.nomor_urut === Number(nomor));
    return s ? noSuratDemo(s) + (s.status === 'BATAL' ? ' (dibatalkan)' : '') : null;
  }
  async function buatSurat(rec) {
    await tunggu(60);
    const bentrok = SURAT.find(x => x.jenis_kode === rec.jenis_kode
      && x.tahun === rec.tahun && x.nomor_urut === Number(rec.nomor_urut));
    if (bentrok) throw new Error('duplicate key value violates unique constraint "uq_surat_nomor"');
    const baru = Object.assign({ id: uid(), status: 'AKTIF', jml_cetak: 0,
      dibuat_oleh: PROFIL.id, dibuat_pada: new Date().toISOString() }, rec);
    baru.nomor_surat = noSuratDemo(baru);
    SURAT.push(baru);
    return salin(baru);
  }
  async function ubahSurat(id, patch) {
    await tunggu(50);
    const s = SURAT.find(x => x.id === id);
    if (!s) throw new Error('Surat tidak ditemukan.');
    Object.assign(s, patch);
    s.nomor_surat = noSuratDemo(s);
    return salin(s);
  }
  async function surat(id) {
    await tunggu(30);
    const s = SURAT.find(x => x.id === id);
    return s ? lengkapiSurat(s) : null;
  }
  async function daftarSurat(f = {}) {
    await tunggu(40);
    const kata = (f.kata || '').toLowerCase();
    return SURAT.map(lengkapiSurat).filter(s => {
      if (f.dari && s.tanggal_surat < f.dari) return false;
      if (f.sampai && s.tanggal_surat > f.sampai) return false;
      if (f.jenis && s.jenis_kode !== f.jenis) return false;
      if (f.status && s.status !== f.status) return false;
      if (f.pasien_id && s.pasien_id !== f.pasien_id) return false;
      if (kata) {
        const gabung = [s.nomor_surat, s.nama_pasien, s.perihal, s.no_rm]
          .filter(Boolean).join(' ').toLowerCase();
        if (!gabung.includes(kata)) return false;
      }
      return true;
    }).sort((a, b) => String(b.tanggal_surat).localeCompare(String(a.tanggal_surat)));
  }
  async function suratKunjungan(kunjunganId) {
    await tunggu(30);
    return SURAT.filter(s => s.kunjungan_id === kunjunganId).map(lengkapiSurat);
  }
  async function suratPasien(pasienId) {
    await tunggu(30);
    return SURAT.filter(s => s.pasien_id === pasienId).map(lengkapiSurat);
  }
  async function suratBatalkan(id, alasan) {
    await tunggu(50);
    const s = SURAT.find(x => x.id === id);
    if (!s) throw new Error('Surat tidak ditemukan.');
    if (!alasan) throw new Error('Alasan pembatalan wajib diisi.');
    s.status = 'BATAL'; s.alasan_batal = alasan;
    s.dibatalkan_oleh = PROFIL.id; s.dibatalkan_pada = new Date().toISOString();
    return lengkapiSurat(s);
  }
  async function suratCatatCetak(id) {
    const s = SURAT.find(x => x.id === id);
    if (s) { s.jml_cetak = (s.jml_cetak || 0) + 1; s.cetak_terakhir = new Date().toISOString(); }
  }

  async function ambilSemua(f) { return []; }

  /* ================= KRONIS: referensi & migrasi portal ================ */

  const REF_KRONIS = KronisCore.REF_BAWAAN.map((d, i) =>
    ({ ...d, pantau_obat: true, icd10_awal: [], urutan: i + 1, aktif: true }));

  /* Tiga keadaan yang harus bisa dilihat di demo, karena ketiganya yang
     benar-benar muncul saat migrasi sungguhan:
       1. nomor BPJS cocok persis      -> bisa ditempel otomatis
       2. tanpa nomor BPJS             -> hanya kemiripan nama yang menolong
       3. sudah tertempel              -> dan harus bisa dibatalkan lagi   */
  let IMPOR = [
    { id: 1, kunci: 'b:0001234567890', nama_pasien: 'Budi Santoso',
      no_bpjs: '0001234567890', no_telp: '081234567890',
      jml_obat: 11, jml_lab: 3, jml_kontrol: 1, punya_terapi: true,
      diagnosis_teks: 'Hipertensi, Diabetes Melitus',
      status: 'MENUNGGU', pasien_id: null, alasan: null, dicocokkan_pada: null },
    { id: 2, kunci: 'n:rina wijaya', nama_pasien: 'Rina Wijaya',
      no_bpjs: null, no_telp: '081211112222',
      jml_obat: 5, jml_lab: 1, jml_kontrol: 0, punya_terapi: true,
      diagnosis_teks: 'Asma',
      status: 'MENUNGGU', pasien_id: null, alasan: null, dicocokkan_pada: null },
    { id: 3, kunci: 'b:0001234567891', nama_pasien: 'Siti Aminah',
      no_bpjs: '0001234567891', no_telp: '081298765432',
      jml_obat: 8, jml_lab: 2, jml_kontrol: 0, punya_terapi: true,
      diagnosis_teks: 'HPT', status: 'COCOK', pasien_id: 'pas-2',
      alasan: null, dicocokkan_pada: new Date().toISOString() }
  ];

  const IMPOR_BARIS = {
    1: [
      { id: 11, sumber: 'KRONIS_TERAPI', sumber_id: '101', tanggal: null, dituang: false,
        isi: { id: 101, nama_pasien: 'Budi Santoso', no_bpjs: '0001234567890',
               diagnosis: 'Hipertensi, Diabetes Melitus',
               resep_tetap: 'Amlodipine 5 mg\nMetformin 500 mg',
               statin_obat: 'Simvastatin 20 mg' } },
      { id: 12, sumber: 'OBAT_KRONIS', sumber_id: '201', tanggal: '2026-08-05', dituang: false,
        isi: { id: 201, tanggal_ambil: '2026-08-05', resep_obat: 'Amlodipine 5 mg' } },
      { id: 13, sumber: 'LAB_RUTIN', sumber_id: '301', tanggal: '2026-06-02', dituang: false,
        isi: { id: 301, tanggal_lab: '2026-06-02', diagnosa: 'HPT+DM', lab_pemeriksa: 'Lab Prodia' } }
    ],
    2: [
      { id: 21, sumber: 'KRONIS_TERAPI', sumber_id: '102', tanggal: null, dituang: false,
        isi: { id: 102, nama_pasien: 'Rina Wijaya', diagnosis: 'Asma',
               resep_tetap: 'Salbutamol inhaler' } }
    ],
    3: [
      { id: 31, sumber: 'KRONIS_TERAPI', sumber_id: '103', tanggal: null, dituang: true,
        isi: { id: 103, nama_pasien: 'Siti Aminah', diagnosis: 'HPT',
               resep_tetap: 'Amlodipine 10 mg' } }
    ]
  };

  function lengkapiImpor(r) {
    return { ...r, pasien: r.pasien_id ? salin(PASIEN.find(p => p.id === r.pasien_id)) : null };
  }

  async function refKronisDiagnosa() { await tunggu(30); return salin(REF_KRONIS); }

  async function kronisImporRingkas() {
    await tunggu(40);
    const angka = (f) => IMPOR.filter(f).length;
    return {
      total: IMPOR.length,
      menunggu: angka(r => r.status === 'MENUNGGU'),
      cocok:    angka(r => r.status === 'COCOK'),
      abaikan:  angka(r => r.status === 'ABAIKAN'),
      baris_obat:    IMPOR.reduce((a, r) => a + r.jml_obat, 0),
      baris_lab:     IMPOR.reduce((a, r) => a + r.jml_lab, 0),
      baris_kontrol: IMPOR.reduce((a, r) => a + r.jml_kontrol, 0),
      menunggu_tanpa_bpjs: angka(r => r.status === 'MENUNGGU' && !r.no_bpjs)
    };
  }

  async function kronisImporDaftar(status = 'MENUNGGU', cari = '') {
    await tunggu(60);
    let d = IMPOR.filter(r => !status || r.status === status);
    if (cari) d = d.filter(r => r.nama_pasien.toLowerCase().includes(cari.toLowerCase()));
    return d.map(lengkapiImpor);
  }

  async function kronisImporBaris(imporId) {
    await tunggu(40); return salin(IMPOR_BARIS[imporId] || []);
  }

  /* Kembaran sederhana kronis_impor_usulan(): BPJS sama 100, nama sama 90,
     sisanya dinilai dari berapa banyak huruf awal yang sama. */
  async function kronisImporUsulan(imporId) {
    await tunggu(60);
    const t = IMPOR.find(r => r.id === imporId);
    if (!t) return [];
    const bpjs = String(t.no_bpjs || '').replace(/\D/g, '');
    const nama = t.nama_pasien.trim().toLowerCase();
    const dipakai = IMPOR.filter(r => r.id !== imporId && r.pasien_id).map(r => r.pasien_id);
    return PASIEN
      .filter(p => p.aktif !== false && !dipakai.includes(p.id))
      .map(p => {
        const pb = String(p.no_bpjs || '').replace(/\D/g, '');
        const pn = p.nama.trim().toLowerCase();
        let skor = 0, alasan = 'Nama mirip';
        if (bpjs && pb === bpjs) { skor = 100; alasan = 'Nomor BPJS sama'; }
        else if (pn === nama)    { skor = 90;  alasan = 'Nama sama persis'; }
        else {
          let sama = 0;
          while (sama < pn.length && sama < nama.length && pn[sama] === nama[sama]) sama++;
          skor = Math.round(sama / Math.max(pn.length, nama.length) * 80);
        }
        return { pasien_id: p.id, no_rm: p.no_rm, nama: p.nama,
                 tanggal_lahir: p.tanggal_lahir, jenis_kelamin: p.jenis_kelamin,
                 no_bpjs: p.no_bpjs, nik: p.nik, alamat: p.alamat, skor, alasan };
      })
      .filter(u => u.skor >= 25)
      .sort((a, b) => b.skor - a.skor)
      .slice(0, 8);
  }

  async function kronisImporTampung(sumber, baris) {
    await tunggu(120);
    return { sumber, masuk: (baris || []).length, dilewati: 0, orang_baru: 0 };
  }

  async function kronisImporCocokkan(imporId, pasienId) {
    await tunggu(120);
    const t = IMPOR.find(r => r.id === imporId);
    if (!t) throw new Error('Baris titipan tidak ditemukan.');
    if (t.status === 'COCOK') throw new Error('Baris ini sudah dicocokkan.');
    if (IMPOR.some(r => r.id !== imporId && r.pasien_id === pasienId)) {
      throw new Error('Pasien ini sudah jadi tujuan baris titipan lain. ' +
                      'Gabungkan dua barisnya dulu, jangan ditempel dua kali.');
    }
    t.status = 'COCOK'; t.pasien_id = pasienId; t.dicocokkan_pada = new Date().toISOString();
    (IMPOR_BARIS[imporId] || []).forEach(b => { b.dituang = true; });
    return { impor_id: imporId, pasien_id: pasienId, terapi: t.punya_terapi,
             ambil_obat: t.jml_obat, lab: t.jml_lab, kontrol: t.jml_kontrol };
  }

  async function kronisImporBatalCocok(imporId) {
    await tunggu(100);
    const t = IMPOR.find(r => r.id === imporId);
    if (!t || t.status !== 'COCOK') throw new Error('Baris ini belum dicocokkan.');
    const n = t.jml_obat + t.jml_lab + t.jml_kontrol;
    t.status = 'MENUNGGU'; t.pasien_id = null; t.dicocokkan_pada = null;
    (IMPOR_BARIS[imporId] || []).forEach(b => { b.dituang = false; });
    return { impor_id: imporId, riwayat_dicabut: n, terapi_dicabut: t.punya_terapi };
  }

  async function kronisImporAbaikan(imporId, alasan) {
    await tunggu(80);
    const t = IMPOR.find(r => r.id === imporId);
    if (!t) throw new Error('Baris titipan tidak ditemukan.');
    if (t.status === 'COCOK') throw new Error('Baris ini sudah dicocokkan. Batalkan dulu.');
    t.status = 'ABAIKAN'; t.alasan = alasan || null;
    return { impor_id: imporId, status: 'ABAIKAN' };
  }

  async function kronisImporOtomatis() {
    await tunggu(150);
    let ok = 0, sisa = 0;
    for (const t of IMPOR.filter(r => r.status === 'MENUNGGU')) {
      const bpjs = String(t.no_bpjs || '').replace(/\D/g, '');
      const cocok = bpjs
        ? PASIEN.filter(p => String(p.no_bpjs || '').replace(/\D/g, '') === bpjs) : [];
      if (cocok.length !== 1 || IMPOR.some(r => r.pasien_id === cocok[0].id)) { sisa++; continue; }
      await kronisImporCocokkan(t.id, cocok[0].id);
      ok++;
    }
    return { tertempel: ok, tersisa: sisa, pesan: [] };
  }

  async function kronisImporBersihkan(semua) {
    await tunggu(80);
    const sebelum = IMPOR.length;
    IMPOR = semua ? [] : IMPOR.filter(r => r.status === 'MENUNGGU');
    return { dihapus: sebelum - IMPOR.length };
  }

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
           refPrognosa, refTacc, refSubspesialis, refSarana, refAlergi, refPpk,
           refSistemFisik, refVital: refVitalSemua,
           alergiKode, setAlergiKode,
           pcarePratinjau, observasiSatuSehat, kesiapanKode, simpanPpk, simpanPemetaanKode,
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
           refLab, refLabPaket, simpanRefLab, simpanRujukan, hapusRujukan,
           labMinta, labMintaLuar, labAntrean, labPermintaan, labKunjungan, labPasien,
           simpanHasilLab, labSelesaikan, labBukaKunci, labBatalkan,
           labTren, labBelumSelesai,
           penunjangSimpan, penunjangPasien, penunjangKunjungan, gigiBerbacaan, hapusPenunjang,
           lampiranPasien, lampiranKunjungan, simpanLampiran, hapusLampiran,
           suratPengaturan, simpanSuratPengaturan, refJenisSurat,
           suratNomorBerikutnya, suratNomorTerpakai,
           buatSurat, ubahSurat, surat, daftarSurat, suratKunjungan, suratPasien,
           suratBatalkan, suratCatatCetak,
           antreanHariIni, antreanKuota, antreanAmbilLoket, antreanPanggil,
           antreanCheckin, antreanMulaiLayan, antreanLewat, antreanBatal, antreanUbah,
           antreanPanggilanHariIni,
           poliJadwal, simpanJadwal, hapusJadwal, poliLibur, simpanLibur, hapusLibur,
           antreanPengaturan, simpanAntreanPengaturan, antreanTokenBaru, antreanLayar,
           antrolAkun, antrolAkunSimpan, antrolAkunHapus, antrolLog,
           refKronisDiagnosa,
           kronisImporRingkas, kronisImporDaftar, kronisImporBaris, kronisImporUsulan,
           kronisImporTampung, kronisImporCocokkan, kronisImporBatalCocok,
           kronisImporAbaikan, kronisImporOtomatis, kronisImporBersihkan,
           gantiPeranDemo, peranDemoSekarang, PERAN_DEMO };
})();

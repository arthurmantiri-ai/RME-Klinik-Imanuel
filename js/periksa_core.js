/* =====================================================================
   PERIKSA CORE — menyusun narasi SOAP dari isian terstruktur, memecah
   aturan pakai menjadi angka, dan membentuk payload PCare (fungsi murni)

   Modul ini SENGAJA tidak menyentuh DOM dan tidak memanggil Supabase,
   sehingga bisa diuji di luar peramban: `node test/uji_periksa_core.js`.

   ---------------------------------------------------------------------
   KENAPA BENTUK PAYLOAD DITULIS DUA KALI

   Yang BERLAKU saat bridging nanti adalah view v_pcare_kunjungan di
   sql/14_periksa_terstruktur.sql. Itu satu-satunya yang dipercaya, karena
   pengiriman dijalankan Edge Function yang membaca database — bukan
   peramban.

   Yang di sini adalah kembarannya untuk PRATINJAU: dokter menekan "Lihat
   data yang akan dikirim" dan langsung melihat isinya, tanpa perjalanan
   ke server dan tanpa bridging harus sudah menyala. Itu juga yang membuat
   kekurangan data ketahuan hari ini, bukan pada hari kredensial datang.

   Dua salinan aturan berarti keduanya bisa berselisih diam-diam, dan di
   sini selisihnya berbahaya: layar berkata payload lengkap, database
   mengirim yang lain. Karena itu test/uji_periksa_core.js memakai contoh
   yang PERSIS SAMA dengan test/uji_periksa.sql — pasien, tanda vital,
   dan hasil yang sama persis. Kalau salah satunya diubah tanpa yang lain,
   salah satu uji GAGAL; bukan hasilnya yang berselisih diam-diam.
   ===================================================================== */
const PeriksaCore = (() => {
  'use strict';

  /* Status tiap sistem pada pemeriksaan fisik. Sengaja tiga, bukan dua:
     "tidak diperiksa" adalah keterangan medis tersendiri dan tidak boleh
     tercatat sebagai "normal". */
  const STATUS = {
    NORMAL:         { kode: 'NORMAL',         label: 'Dalam batas normal' },
    ABNORMAL:       { kode: 'ABNORMAL',       label: 'Ada temuan' },
    TIDAK_DIPERIKSA:{ kode: 'TIDAK_DIPERIKSA',label: 'Tidak diperiksa' }
  };

  /* Tujuh butir anamnesis (sacred seven). Urutan di sini adalah urutan
     yang dipakai menyusun kalimat riwayat penyakit sekarang. */
  const BUTIR_RPS = [
    ['onset',        'Sejak'],
    ['lokasi',       'Lokasi'],
    ['kualitas',     'Sifat'],
    ['kuantitas',    'Derajat'],
    ['kronologi',    'Perjalanan'],
    ['memperberat',  'Memperberat'],
    ['memperingan',  'Meringankan'],
    ['penyerta',     'Keluhan penyerta']
  ];

  const LABEL_LANJUT = {
    SELESAI:        'Pasien dipulangkan',
    KONTROL:        'Kontrol kembali',
    RUJUK_INTERNAL: 'Rujuk poli lain di klinik',
    RUJUK_LANJUT:   'Rujuk ke FKRTL',
    RUJUK_IGD:      'Rujuk ke IGD'
  };

  /* -------------------------------------------------------------------
     Bantuan kecil
     ----------------------------------------------------------------- */
  const rapi = (v) => (v === null || v === undefined) ? '' : String(v).trim();
  const ada  = (v) => rapi(v) !== '';

  /* Menggabungkan potongan kalimat dengan pemisah, membuang yang kosong. */
  function gabung(potongan, pemisah = '. ') {
    return potongan.map(rapi).filter(Boolean).join(pemisah);
  }

  /* Kalimat diakhiri titik hanya bila belum berakhiran tanda baca. */
  function titik(teks) {
    const t = rapi(teks);
    if (!t) return '';
    return /[.!?]$/.test(t) ? t : t + '.';
  }

  /* -------------------------------------------------------------------
     1. ATURAN PAKAI  ↔  signa1 / signa2

     PCare tidak menerima kalimat "3 x sehari 1 tablet"; yang diminta dua
     angka. Sebaliknya dokter tidak mau mengetik dua angka — ia mengetik
     kalimat, seperti selama ini. Jadi kalimatnya yang diurai.

     Yang tidak bisa diurai TIDAK ditebak. Mengarang signa1 = 1 untuk
     "sesuai anjuran dokter" berarti mengirim aturan pakai yang salah ke
     BPJS dengan tampilan yang tetap benar di layar; halaman resep yang
     menandainya, bukan modul ini yang menutupinya.
     ----------------------------------------------------------------- */
  /* "1/2" harus jadi 0,5 dan bukan 1. Dokter menulis setengah tablet
     sebagai pecahan, dan membulatkannya menjadi 1 berarti mengirim dosis
     dua kali lipat ke BPJS dengan kertas resep yang tetap benar. */
  function angkaDosis(teks) {
    const t = rapi(teks).replace(',', '.');
    if (!t) return null;
    if (t.includes('/')) {
      const [a, b] = t.split('/').map(Number);
      return (b && isFinite(a / b)) ? a / b : null;
    }
    const n = Number(t);
    return isFinite(n) ? n : null;
  }

  function uraiSigna(teks) {
    const t = rapi(teks).toLowerCase();
    if (!t) return { frekuensi: null, dosis: null, terurai: false };

    /* Satu pola untuk semua bentuk yang dipakai di resep:
         3dd1 · 3x1 · 2x1/2 · "3 x sehari 1 tablet" · "2 kali sehari 1/2 tablet"
       Bagian dosis sengaja memuat "/" supaya pecahan tidak terpotong
       menjadi angka pembilangnya saja. */
    const m = t.match(/(\d+)\s*(?:dd|x|kali)\s*(?:sehari|per\s*hari|\/\s*hari)?\s*(\d+(?:\s*[.,\/]\s*\d+)?)?/);
    if (!m) return { frekuensi: null, dosis: null, terurai: false };

    const frek = Number(m[1]);
    const dos = m[2] ? angkaDosis(m[2].replace(/\s+/g, '')) : null;
    return { frekuensi: frek, dosis: dos, terurai: dos !== null };
  }

  /* Kebalikannya: dua angka menjadi kalimat yang dibaca pasien. */
  function susunSigna(frekuensi, dosis, satuan) {
    const f = Number(frekuensi), d = Number(dosis);
    if (!f || !d) return '';
    const takar = d === 0.5 ? '1/2' : String(d);
    return `${f} x sehari ${takar} ${rapi(satuan) || 'tablet'}`.trim();
  }

  /* Ringkasan resep untuk PCare terapiObat. Bukan daftar obat mentah:
     yang dibaca petugas BPJS adalah nama, kekuatan, dan aturan pakainya. */
  function ringkasResep(daftar) {
    const isi = (daftar || []).filter(r => ada(r.nama_obat));
    if (!isi.length) return '';
    return isi.map(r => {
      const jml = ada(r.jumlah) ? ` No. ${r.jumlah}` : '';
      const sig = ada(r.signa) ? ` (${rapi(r.signa)})` : '';
      return `${rapi(r.nama_obat)}${jml}${sig}`;
    }).join('; ');
  }

  /* -------------------------------------------------------------------
     2. MENYUSUN NARASI SOAP DARI ISIAN TERSTRUKTUR

     Kolom subjective/objective/assessment/plan tetap ada dan tetap terisi.
     Yang berubah: isinya tidak lagi diketik dari nol, melainkan disusun
     dari field yang bisa dikirim ke PCare dan SatuSehat.

     Susunannya harus terbaca seperti tulisan dokter, bukan seperti dump
     formulir. Rekam medis dibaca manusia — dokter berikutnya, pengacara,
     surveior akreditasi — dan daftar "Onset: 3 hari | Lokasi: - | Sifat: -"
     bukan rekam medis yang bisa dipertanggungjawabkan.
     ----------------------------------------------------------------- */

  function susunSubjective(d) {
    d = d || {};
    const rps = d.riwayat_penyakit_sekarang || {};
    const butir = BUTIR_RPS
      .filter(([k]) => ada(rps[k]))
      .map(([k, label]) => `${label.toLowerCase()} ${rapi(rps[k])}`);

    return gabung([
      titik(d.keluhan_utama),
      butir.length ? titik('Keluhan ' + butir.join(', ')) : '',
      ada(d.riwayat_penyakit_dahulu) ? titik('Riwayat penyakit dahulu: ' + rapi(d.riwayat_penyakit_dahulu)) : '',
      ada(d.riwayat_keluarga)        ? titik('Riwayat keluarga: ' + rapi(d.riwayat_keluarga)) : '',
      ada(d.riwayat_pengobatan)      ? titik('Obat yang sedang diminum: ' + rapi(d.riwayat_pengobatan)) : '',
      ada(d.riwayat_alergi)          ? titik('Riwayat alergi: ' + rapi(d.riwayat_alergi)) : '',
      ada(d.riwayat_sosial)          ? titik('Riwayat sosial: ' + rapi(d.riwayat_sosial)) : ''
    ], ' ');
  }

  /* Anamnesis untuk PCare (field `anamnesa`) lebih pendek dari S:
     riwayat penyakit sekarang saja, tanpa riwayat dahulu dan keluarga. */
  function susunAnamnesis(d) {
    d = d || {};
    const rps = d.riwayat_penyakit_sekarang || {};
    const butir = BUTIR_RPS
      .filter(([k]) => ada(rps[k]))
      .map(([k, label]) => `${label.toLowerCase()} ${rapi(rps[k])}`);
    return gabung([
      titik(d.keluhan_utama),
      butir.length ? titik(butir.join(', ').replace(/^./, c => c.toUpperCase())) : ''
    ], ' ');
  }

  /* Kalimat tanda vital. Nilai yang tidak diukur tidak disebut — bukan
     ditulis "-", karena "-" di rekam medis terbaca sebagai "diperiksa,
     hasilnya tidak ada". */
  function kalimatVital(ka) {
    if (!ka) return '';
    const p = [];
    if (ka.sistolik && ka.diastolik) p.push(`TD ${ka.sistolik}/${ka.diastolik} mmHg`);
    if (ka.nadi)  p.push(`nadi ${ka.nadi} x/menit`);
    if (ka.nafas) p.push(`napas ${ka.nafas} x/menit`);
    if (ka.suhu !== null && ka.suhu !== undefined && ka.suhu !== '') p.push(`suhu ${ka.suhu} °C`);
    if (ka.spo2)  p.push(`SpO₂ ${ka.spo2} %`);
    if (ka.berat_badan)  p.push(`BB ${ka.berat_badan} kg`);
    if (ka.tinggi_badan) p.push(`TB ${ka.tinggi_badan} cm`);
    if (ka.imt) p.push(`IMT ${ka.imt}`);
    return p.length ? titik(p.join(', ')) : '';
  }

  /* Objective = keadaan umum + kesadaran + tanda vital + temuan per
     sistem. Sistem yang normal disebut sekali sebagai satu kalimat
     borongan, sistem yang abnormal disebut satu per satu — begitulah
     dokter menulis, dan begitu pula yang berguna dibaca. */
  function susunObjective(d, kajian, sistemRef) {
    d = d || {};
    const fisik = d.pemeriksaan_fisik || {};
    const ref = sistemRef || [];

    const normal = [], abnormal = [];
    ref.forEach(s => {
      const isi = fisik[s.kode];
      if (!isi || !isi.status) return;
      if (isi.status === 'NORMAL') normal.push(s);
      else if (isi.status === 'ABNORMAL') abnormal.push([s, rapi(isi.temuan)]);
    });

    const kalimatNormal = normal.length
      ? titik(normal.length >= 4 && !abnormal.length
          ? normal.map(s => s.nama.toLowerCase()).join(', ') + ' dalam batas normal'
          : normal.map(s => `${s.nama}: ${s.normal_teks}`).join('. '))
      : '';

    return gabung([
      ada(d.keadaan_umum) ? titik(d.keadaan_umum) : '',
      ada(d.kesadaran_nama) ? titik('Kesadaran ' + rapi(d.kesadaran_nama)) : '',
      kalimatVital(kajian),
      kalimatNormal,
      abnormal.map(([s, t]) => titik(`${s.nama}: ${t || 'ada temuan (belum diuraikan)'}`)).join(' ')
    ], ' ');
  }

  function susunAssessment(diagnosa, dxBanding, catatan) {
    const dx = (diagnosa || []).map((x, i) =>
      `${i === 0 ? 'Diagnosa kerja' : 'Diagnosa sekunder'}: ${rapi(x.nama)} (${rapi(x.kode)})`);
    const db = (dxBanding || []).filter(x => ada(x.nama));
    return gabung([
      dx.join('. ') ? titik(dx.join('. ')) : '',
      db.length ? titik('Diagnosis banding: '
        + db.map(x => `${rapi(x.nama)}${ada(x.kode) ? ' (' + rapi(x.kode) + ')' : ''}`).join(', ')) : '',
      ada(catatan) ? titik(catatan) : ''
    ], ' ');
  }

  function susunPlan(d, tindakan, resep) {
    d = d || {};
    const td = (tindakan || []).filter(t => ada(t.nama));
    const rs = ringkasResep(resep);

    let rujuk = '';
    if (d.tindak_lanjut === 'RUJUK_LANJUT' && ada(d.rujuk_nama_faskes)) {
      rujuk = `Rujuk ke ${rapi(d.rujuk_nama_faskes)}`
        + (ada(d.rujuk_nama_subspesialis) ? `, ${rapi(d.rujuk_nama_subspesialis)}` : '')
        + (ada(d.rujuk_alasan) ? ` — ${rapi(d.rujuk_alasan)}` : '');
    } else if (d.tindak_lanjut === 'RUJUK_INTERNAL' && ada(d.rujuk_nama_poli_internal)) {
      rujuk = `Rujuk internal ke ${rapi(d.rujuk_nama_poli_internal)}`;
    } else if (ada(LABEL_LANJUT[d.tindak_lanjut])) {
      rujuk = LABEL_LANJUT[d.tindak_lanjut];
    }

    return gabung([
      rs ? titik('Terapi obat: ' + rs) : '',
      ada(d.terapi_non_obat) ? titik('Terapi non-obat: ' + rapi(d.terapi_non_obat)) : '',
      td.length ? titik('Tindakan: ' + td.map(t =>
        `${rapi(t.nama)}${ada(t.kode) ? ' (' + rapi(t.kode) + ')' : ''}`).join(', ')) : '',
      ada(d.bmhp) ? titik('BMHP: ' + rapi(d.bmhp)) : '',
      ada(d.permintaan_penunjang) ? titik('Pemeriksaan penunjang: ' + rapi(d.permintaan_penunjang)) : '',
      ada(d.edukasi) ? titik('Edukasi: ' + rapi(d.edukasi)) : '',
      titik(rujuk),
      d.tindak_lanjut === 'KONTROL' && ada(d.tanggal_kontrol)
        ? titik('Kontrol ' + rapi(d.tanggal_kontrol)) : '',
      ada(d.prognosa_nama) ? titik('Prognosa ' + rapi(d.prognosa_nama)) : ''
    ], ' ');
  }

  /* Menyusun keempat huruf sekaligus. Dipanggil setiap kali dokter
     menyimpan, jadi kotak SOAP selalu mencerminkan isian terstruktur. */
  function susunSoap(bagian) {
    return {
      subjective: susunSubjective(bagian.anamnesis),
      objective:  susunObjective(bagian.objektif, bagian.kajian, bagian.sistemRef),
      assessment: susunAssessment(bagian.diagnosa, bagian.diagnosis_banding, bagian.catatan_penilaian),
      plan:       susunPlan(bagian.rencana, bagian.tindakan, bagian.resep),
      anamnesis:  susunAnamnesis(bagian.anamnesis),
      terapi_obat: ringkasResep(bagian.resep)
    };
  }

  /* -------------------------------------------------------------------
     3. PAYLOAD PCARE — kembaran v_pcare_kunjungan untuk pratinjau
     ----------------------------------------------------------------- */

  /* PCare memakai tanggal DD-MM-YYYY. Diurai dengan tangan, bukan lewat
     `new Date('YYYY-MM-DD')`: konstruktor itu membaca tanggal polos
     sebagai UTC, sehingga di zona timur tanggalnya bisa mundur sehari.
     Klinik ini di WITA (UTC+8) — persis kelas kesalahan itu. */
  function tglPcare(iso) {
    const t = rapi(iso).slice(0, 10);
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

  /* Suhu dikirim sebagai teks berkoma. PCare berbahasa Indonesia dan
     menerima "37,8"; titik desimal lolos tanpa galat lalu terbaca lain. */
  function suhuPcare(nilai) {
    if (nilai === null || nilai === undefined || nilai === '') return null;
    return String(nilai).replace('.', ',');
  }

  function payloadPcare(x) {
    const kj = x.kunjungan || {}, ps = x.pasien || {}, ka = x.kajian || {};
    const pm = x.pemeriksaan || {}, dg = x.diagnosa || [];

    const kdSadar = x.kode_kesadaran || null;
    const rujukLanjut = pm.rujuk_ppk_kode ? {
      tglEstRujuk: tglPcare(pm.rujuk_tgl_estimasi || kj.tanggal),
      kdppk: pm.rujuk_ppk_kode,
      subSpesialis: {
        kdSubSpesialis1: x.kode_subspesialis || null,
        kdSarana: x.kode_sarana || null
      },
      khusus: pm.rujuk_khusus_kode || null
    } : null;

    return {
      noKunjungan:  kj.pcare_no_kunjungan || null,
      noKartu:      ps.no_bpjs || null,
      tglDaftar:    tglPcare(kj.tanggal),
      kdPoli:       x.kode_poli || null,
      keluhan:      rapi(pm.keluhan_utama) || rapi(ka.keluhan_utama)
                      || rapi(kj.keluhan_singkat) || 'Tidak Ada',
      kdSadar:      kdSadar,
      sistole:      ka.sistolik ?? null,
      diastole:     ka.diastolik ?? null,
      beratBadan:   ka.berat_badan ?? null,
      tinggiBadan:  ka.tinggi_badan ?? null,
      respRate:     ka.nafas ?? null,
      heartRate:    ka.nadi ?? null,
      lingkarPerut: ka.lingkar_perut ?? null,
      suhu:         suhuPcare(ka.suhu),
      kdStatusPulang: x.kode_status_pulang || null,
      tglPulang:    tglPcare(kj.waktu_selesai || kj.tanggal),
      kdDokter:     x.kode_dokter || null,
      kdDiag1:      dg[0] ? dg[0].kode : null,
      kdDiag2:      dg[1] ? dg[1].kode : null,
      kdDiag3:      dg[2] ? dg[2].kode : null,
      kdPoliRujukInternal: x.kode_poli_internal || null,
      rujukLanjut:  rujukLanjut,
      kdTacc:       x.kode_tacc || '-1',
      alasanTacc:   rapi(pm.tacc_alasan) || null,
      anamnesa:     rapi(pm.anamnesis) || rapi(pm.subjective) || 'Tidak Ada',
      alergiMakan:  x.kode_alergi_makanan || '00',
      alergiUdara:  x.kode_alergi_udara   || '00',
      alergiObat:   x.kode_alergi_obat    || '00',
      kdPrognosa:   x.kode_prognosa || null,
      terapiObat:   rapi(pm.terapi_obat)     || 'Tidak Ada',
      terapiNonObat:rapi(pm.terapi_non_obat) || 'Tidak Ada',
      bmhp:         rapi(pm.bmhp)            || 'Tidak Ada'
    };
  }

  /* Obat  →  POST /obat/kunjungan, satu objek per butir resep. */
  function payloadPcareObat(resep, noKunjungan) {
    return (resep || []).map(r => {
      const s = (r.frekuensi && r.dosis)
        ? { frekuensi: r.frekuensi, dosis: r.dosis }
        : uraiSigna(r.signa);
      return {
        kdObatSK: 0,
        noKunjungan: noKunjungan || null,
        racikan: !!r.racikan_nama,
        kdRacikan: null,
        obatDPHO: !!r.obat_dpho,
        kdObat: r.obat_dpho ? (r.kode_pcare || null) : null,
        signa1: s.frekuensi || 1,
        signa2: s.dosis || 1,
        jmlObat: Number(r.jumlah) || 0,
        jmlPermintaan: Number(r.jumlah) || 0,
        nmObatNonDPHO: r.obat_dpho ? '-' : rapi(r.nama_obat)
      };
    });
  }

  /* -------------------------------------------------------------------
     4. OBSERVASI SATUSEHAT

     Satu tanda vital = satu Observation. Nilai kosong tidak dikirim:
     "tidak diukur" bukan nol, dan nol pada suhu atau tekanan darah
     adalah pernyataan medis yang keliru.
     ----------------------------------------------------------------- */
  function observasiSatuSehat(kajian, pemeriksaan, vitalRef, sistemRef) {
    const hasil = [];
    const ka = kajian || {};

    (vitalRef || []).forEach(v => {
      if (v.kode === 'tekanan_darah') return;     // panel, bukan nilai tunggal
      const nilai = ka[v.kode];
      if (nilai === null || nilai === undefined || nilai === '') return;
      hasil.push({
        kelompok: 'VITAL', kode_internal: v.kode, nama: v.nama,
        kode_loinc: v.kode_loinc || null,
        nilai_angka: Number(nilai), nilai_teks: null,
        satuan: v.satuan || null, satuan_ucum: v.satuan_ucum || null,
        urutan: v.urutan || 0
      });
    });

    const fisik = (pemeriksaan || {}).pemeriksaan_fisik || {};
    (sistemRef || []).forEach(s => {
      const isi = fisik[s.kode];
      if (!isi || (isi.status !== 'NORMAL' && isi.status !== 'ABNORMAL')) return;
      const teks = isi.status === 'NORMAL' ? s.normal_teks : rapi(isi.temuan);
      if (!teks) return;
      hasil.push({
        kelompok: 'FISIK', kode_internal: s.kode, nama: s.nama,
        kode_loinc: s.kode_loinc || null,
        nilai_angka: null, nilai_teks: teks,
        satuan: null, satuan_ucum: null,
        urutan: s.urutan || 0
      });
    });

    return hasil.sort((a, b) =>
      a.kelompok === b.kelompok ? (a.urutan - b.urutan) : (a.kelompok === 'VITAL' ? -1 : 1));
  }

  /* -------------------------------------------------------------------
     5. KELENGKAPAN SEBELUM REKAM MEDIS DIKUNCI

     Dibedakan dengan sengaja:
       galat      — rekam medis tidak sah tanpa ini; simpan ditolak.
       peringatan — data bridging kurang, tapi pelayanan tetap sah;
                    ditampilkan dan boleh dilewati.

     Sistem yang menolak menyimpan rekam medis karena satu kolom PCare
     kosong akan segera dicari akalnya — dokter akan mengisi apa saja
     supaya tombolnya menyala, dan data yang masuk jadi lebih buruk
     daripada kalau kolomnya dibiarkan kosong.
     ----------------------------------------------------------------- */
  function periksaKelengkapan(x) {
    const galat = [], peringatan = [];
    const pm = x.pemeriksaan || {}, ka = x.kajian || {}, dg = x.diagnosa || [];
    const bpjs = (x.kunjungan || {}).cara_bayar === 'BPJS';

    if (!ada(pm.keluhan_utama) && !ada(ka.keluhan_utama)) galat.push('Keluhan utama');
    if (!dg.length) galat.push('minimal satu diagnosa ICD-10');
    if (!ada(pm.objective) && !Object.keys(pm.pemeriksaan_fisik || {}).length)
      galat.push('pemeriksaan fisik (minimal keadaan umum)');
    if (!ada(pm.status_pulang_kode)) galat.push('keadaan pasien saat pulang');

    if (pm.tindak_lanjut === 'RUJUK_LANJUT' && !ada(pm.rujuk_ppk_kode))
      galat.push('faskes tujuan rujukan');
    if (pm.tindak_lanjut === 'RUJUK_INTERNAL' && !ada(pm.rujuk_poli_internal_id))
      galat.push('poli tujuan rujukan internal');
    if (pm.tindak_lanjut === 'KONTROL' && !ada(pm.tanggal_kontrol))
      galat.push('tanggal kontrol');
    if (ada(pm.tacc_kode) && pm.tacc_kode !== 'TIDAK' && !ada(pm.tacc_alasan))
      galat.push('alasan TACC');

    if (!ada(pm.prognosa_kode)) peringatan.push('Prognosa belum dipilih.');
    if (!ada(pm.kesadaran_kode) && !ada(ka.kesadaran_kode))
      peringatan.push('Tingkat kesadaran belum tercatat.');

    if (bpjs) {
      if (dg.length > 3)
        peringatan.push(`Ada ${dg.length} diagnosa; PCare hanya menerima tiga teratas `
          + `(${dg.slice(0, 3).map(d => d.kode).join(', ')}).`);
      if (!ka.sistolik || !ka.diastolik) peringatan.push('Tekanan darah belum diukur — diminta PCare.');
      if (!ka.nadi || !ka.nafas)         peringatan.push('Nadi atau frekuensi napas belum diukur — diminta PCare.');
      if (ka.suhu === null || ka.suhu === undefined || ka.suhu === '')
        peringatan.push('Suhu belum diukur — diminta PCare.');
      if (!ka.berat_badan || !ka.tinggi_badan)
        peringatan.push('Berat atau tinggi badan belum diukur — diminta PCare.');
      const tanpaSigna = (x.resep || []).filter(r =>
        !(r.frekuensi && r.dosis) && !uraiSigna(r.signa).terurai);
      if (tanpaSigna.length)
        peringatan.push('Aturan pakai belum bisa dibaca sebagai angka untuk: '
          + tanpaSigna.map(r => r.nama_obat).join(', ') + '.');
    }

    return { galat, peringatan, boleh: galat.length === 0 };
  }

  const API = {
    STATUS, BUTIR_RPS, LABEL_LANJUT,
    uraiSigna, susunSigna, ringkasResep,
    susunSubjective, susunAnamnesis, susunObjective, susunAssessment, susunPlan, susunSoap,
    kalimatVital, tglPcare, suhuPcare,
    payloadPcare, payloadPcareObat, observasiSatuSehat, periksaKelengkapan
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

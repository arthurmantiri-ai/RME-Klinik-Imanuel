/* =====================================================================
   PRA-DAFTAR CORE — pembacaan berkas CSV pra-pendaftaran pasien, dan
   penilaian kelengkapan tiap baris sebelum dikirim ke pasien_impor_massal
   di sisi klien (fungsi murni, tidak menyentuh DOM maupun Supabase).

   ---------------------------------------------------------------------
   KAPAN HALAMAN INI DIPAKAI

   HANYA kalau RME dipasang dari nol dan portal punya banyak orang yang
   perlu didaftarkan sekaligus (lihat sql/24_pasien_cari_mirip.sql untuk
   alasan lengkapnya). Untuk klinik yang sudah berjalan dengan pasien
   sedikit, tetap daftarkan satu per satu lewat Pendaftaran — di situ
   petugas berhadapan dengan pasiennya dan bisa menanyakan langsung hal
   yang datanya meragukan.

   ---------------------------------------------------------------------
   KENAPA PEMBACA CSV DIPINJAM DARI KronisCore, BUKAN DITULIS ULANG

   KronisCore.pecahCsv() sudah menangani tanda kutip, koma di dalam
   teks, dan ganti baris di dalam teks (lihat kronis_core.js). Menulis
   ulang pemecah CSV di sini hanya membuka peluang dua pembaca yang
   berselisih diam-diam pada berkas yang sama persis.
   ===================================================================== */
const PraDaftarCore = (() => {
  'use strict';

  const _K = (typeof module !== 'undefined' && module.exports)
    ? require('./kronis_core.js')
    : (typeof KronisCore !== 'undefined' ? KronisCore : null);

  /* ---------------------------------------------------------------- */
  /* 1. Pemetaan nama kolom berkas -> kolom baku                       */
  /* ---------------------------------------------------------------- */

  /* Staf mengisi berkas ini di Excel, bukan menulis kode — nama kolom
     yang sedikit berbeda (spasi, garis bawah, huruf besar) HARUS tetap
     terbaca. Yang tidak boleh ditebak adalah ISINYA, bukan judul
     kolomnya. */
  const ALIAS_KOLOM = {
    nama: ['nama', 'nama pasien', 'nama_pasien', 'nama lengkap'],
    nik: ['nik', 'no nik', 'no_nik'],
    no_bpjs: ['no_bpjs', 'no bpjs', 'bpjs', 'nomor bpjs', 'no. bpjs'],
    tanggal_lahir: ['tanggal_lahir', 'tanggal lahir', 'tgl_lahir', 'tgl lahir'],
    jenis_kelamin: ['jenis_kelamin', 'jenis kelamin', 'jk', 'gender'],
    alamat: ['alamat']
  };

  function petakanHeader(kepala) {
    const rapi = (s) => String(s || '').trim().toLowerCase();
    const peta = {};      // indeks kolom berkas -> nama baku
    const dikenal = new Set();
    kepala.forEach((h, i) => {
      const k = rapi(h);
      const baku = Object.keys(ALIAS_KOLOM).find(nm => ALIAS_KOLOM[nm].includes(k));
      if (baku) { peta[i] = baku; dikenal.add(baku); }
    });
    return { peta, dikenal };
  }

  /* ---------------------------------------------------------------- */
  /* 2. Normalisasi nilai satu kolom                                   */
  /* ---------------------------------------------------------------- */

  function normalisasiJK(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (['l', 'laki-laki', 'laki2', 'laki', 'pria', 'm', 'male'].includes(s)) return 'L';
    if (['p', 'perempuan', 'wanita', 'f', 'female'].includes(s)) return 'P';
    return null;
  }

  const lpad2 = (n) => String(n).padStart(2, '0');

  /* Terima tiga bentuk yang benar-benar muncul dari Excel Indonesia:
       2019-08-14   (ISO, dari sel bertipe Tanggal yang diekspor rapi)
       14/08/2019   (D/M/Y, format tanggal default Windows Indonesia)
       14-08-2019
     Ditolak (dikembalikan null) kalau bulan/tanggal di luar jangkauan,
     tahunnya jelas bukan tahun lahir manusia (< 1900), atau tanggalnya
     ada di masa depan — tanggal lahir masa depan pasti salah ketik,
     bukan kemungkinan medis. */
  function normalisasiTanggal(v, sekarang) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    let th, bl, tg;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { th = +m[1]; bl = +m[2]; tg = +m[3]; }
    else {
      m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (m) { tg = +m[1]; bl = +m[2]; th = +m[3]; }
    }
    if (!th) return null;
    if (bl < 1 || bl > 12 || tg < 1 || tg > 31) return null;
    if (th < 1900) return null;
    const iso = `${th}-${lpad2(bl)}-${lpad2(tg)}`;
    const d = new Date(iso + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return null;
    // Tolak tanggal yang "menggenapkan sendiri" (mis. 31 Februari jadi 3 Maret) —
    // itu tanda salah ketik, bukan tanggal yang benar-benar dimaksud.
    if (d.getUTCFullYear() !== th || d.getUTCMonth() + 1 !== bl || d.getUTCDate() !== tg) return null;
    const batas = sekarang instanceof Date ? sekarang : new Date();
    if (d.getTime() > batas.getTime()) return null;
    return iso;
  }

  function normalisasiNik(v) {
    const digit = String(v == null ? '' : v).replace(/\D/g, '');
    return digit.length === 16 ? digit : null;
  }

  /* ---------------------------------------------------------------- */
  /* 3. Pembaca berkas lengkap                                         */
  /* ---------------------------------------------------------------- */

  /* Mengubah teks CSV pra-daftar menjadi baris tervalidasi. Setiap
     baris punya dua kelas masalah:
       wajib      — menyumbat pengiriman baris ini (nama/tanggal lahir/
                    jenis kelamin kosong atau tidak terbaca)
       peringatan — tidak menyumbat, tapi kolomnya dikosongkan/diberi
                    tanda supaya dilihat manusia (mis. NIK bukan 16 digit) */
  function bacaBerkas(teks) {
    if (!_K) throw new Error('KronisCore tidak tersedia — muat kronis_core.js lebih dulu.');
    const tabel = _K.pecahCsv(teks).filter(r => r.some(c => String(c).trim() !== ''));
    if (!tabel.length) return { baris: [], dikenal: new Set(), kolomAsing: [] };

    const kepala = tabel[0];
    const { peta, dikenal } = petakanHeader(kepala);
    const isi = tabel.slice(1);
    const kolomAsing = kepala.filter((h, i) => h && peta[i] === undefined);

    const barisNamaKosong = new Set();     // kunci nama+tgl_lahir sudah muncul -> baris berikutnya duplikat
    const barisNik = new Set();

    const baris = isi.map((r, n) => {
      const o = {};
      Object.keys(peta).forEach(i => { o[peta[i]] = r[i] === undefined ? '' : r[i]; });

      const wajib = [];
      const peringatan = [];

      const nama = String(o.nama || '').trim();
      if (!nama) wajib.push('Nama kosong.');

      const tanggalLahir = normalisasiTanggal(o.tanggal_lahir);
      if (o.tanggal_lahir && !tanggalLahir) wajib.push('Tanggal lahir tidak terbaca.');
      else if (!o.tanggal_lahir) wajib.push('Tanggal lahir kosong.');

      const jenisKelamin = normalisasiJK(o.jenis_kelamin);
      if (o.jenis_kelamin && !jenisKelamin) wajib.push('Jenis kelamin tidak dikenali (isi L atau P).');
      else if (!o.jenis_kelamin) wajib.push('Jenis kelamin kosong.');

      let nik = null;
      if (String(o.nik || '').trim()) {
        nik = normalisasiNik(o.nik);
        if (!nik) peringatan.push('NIK bukan 16 digit — dikosongkan, isi manual nanti kalau perlu.');
      }

      const noBpjs = String(o.no_bpjs || '').trim() || null;
      const alamat = String(o.alamat || '').trim() || null;

      // Duplikat DI DALAM berkas yang sama: NIK sama, atau nama+tanggal
      // lahir sama persis. Ini bukan usulan — ini kemungkinan besar baris
      // yang tidak sengaja terkopi dua kali di Excel, dan wajib dicek
      // manusia sebelum dua "pasien" dengan identitas sama diterbitkan.
      if (nik && barisNik.has(nik)) wajib.push('NIK ini sudah muncul di baris lain pada berkas ini.');
      if (nik) barisNik.add(nik);
      const kunciNama = nama.toLowerCase() + '|' + (tanggalLahir || '');
      if (nama && tanggalLahir && barisNamaKosong.has(kunciNama)) {
        wajib.push('Nama + tanggal lahir ini sudah muncul di baris lain pada berkas ini.');
      }
      if (nama && tanggalLahir) barisNamaKosong.add(kunciNama);

      return {
        baris: n + 2,   // +1 header, +1 supaya sesuai nomor baris di Excel
        nama, nik, no_bpjs: noBpjs, alamat,
        tanggal_lahir: tanggalLahir, jenis_kelamin: jenisKelamin,
        wajib, peringatan,
        siap: wajib.length === 0
      };
    });

    return { baris, dikenal, kolomAsing };
  }

  /* ---------------------------------------------------------------- */
  /* 4. Ringkasan untuk kartu pratinjau                                */
  /* ---------------------------------------------------------------- */

  function ringkas(baris) {
    const list = baris || [];
    return {
      total: list.length,
      siap: list.filter(b => b.siap).length,
      tidakLengkap: list.filter(b => !b.siap).length,
      peringatan: list.filter(b => b.siap && b.peringatan.length).length
    };
  }

  const API = {
    ALIAS_KOLOM, petakanHeader,
    normalisasiJK, normalisasiTanggal, normalisasiNik,
    bacaBerkas, ringkas
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

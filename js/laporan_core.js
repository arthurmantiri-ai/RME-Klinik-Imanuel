/* =====================================================================
   LAPORAN CORE — Tahap 3. Seluruh isi berkas ini fungsi murni: tidak
   menyentuh DOM maupun Supabase. Masukannya baris mentah dari
   v_riwayat_kunjungan / v_laporan_rujukan / v_laporan_keuangan_tagihan /
   v_laporan_keuangan_pembayaran / diagnosa (lihat sql/19_laporan.sql dan
   js/db.js), keluarannya array/objek biasa siap gambar. js/pages/laporan.js
   yang menyambungkannya ke layar dan ke Chart.js.

   Kenapa fungsi murni, bukan langsung dihitung di pages/laporan.js:
   sama seperti kronis_pantau_core.js — supaya bisa diuji tuntas di Node
   (kasus batas kategori usia, ujung bulan, jam 00 vs jam kosong) tanpa
   database maupun peramban. Lihat test/uji_laporan_core.js.

   Kenapa jam kunjungan dibaca dari `jam_daftar` (bukan dihitung ulang di
   sini dari `waktu_daftar`): `timestamptz` dikirim PostgREST dalam
   timezone SESI SUPABASE (lazimnya UTC), sehingga `new Date(waktu_daftar)
   .getHours()` di peramban bisa diam-diam membaca jam yang salah — kelas
   kesalahan yang sama dengan `UI.hariIni()` dulu. `jam_daftar` sudah
   dihitung WITA di database (`sql/19_laporan.sql`, aturan yang sama
   dengan `tgl_klinik()`); berkas ini hanya mengelompokkannya.
   ===================================================================== */
const LaporanCore = (() => {
  'use strict';

  const NAMA_BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

  /* ------------------------------------------------------------------
     0. UTIL TANGGAL/BULAN — semua dari teks 'YYYY-MM-DD', tidak pernah
     lewat `new Date(iso)` (lihat catatan zona waktu di test/README.md).
     ------------------------------------------------------------------ */

  function uraiTanggal(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return { y: +m[1], bl: +m[2], hr: +m[3] };
  }

  /* Selisih hari (b - a), dihitung lewat Date.UTC supaya tidak
     terpengaruh zona waktu perangkat menjalankan kode ini. */
  function selisihHari(isoA, isoB) {
    const a = uraiTanggal(isoA), b = uraiTanggal(isoB);
    if (!a || !b) return null;
    const msA = Date.UTC(a.y, a.bl - 1, a.hr);
    const msB = Date.UTC(b.y, b.bl - 1, b.hr);
    return Math.round((msB - msA) / 86400000);
  }

  function kunciBulan(iso) {
    const t = uraiTanggal(iso);
    return t ? `${t.y}-${String(t.bl).padStart(2, '0')}` : null;
  }

  function labelBulanPendek(kunci) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(kunci || ''));
    if (!m) return kunci || '';
    const bln = NAMA_BULAN[(+m[2]) - 1] || '?';
    return `${bln} ${m[1].slice(2)}`;
  }

  /* Kunci bulan `delta` bulan dari `kunci` ('YYYY-MM'). delta boleh negatif. */
  function geserBulan(kunci, delta) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(kunci || ''));
    if (!m) return null;
    let y = +m[1], bl = +m[2] - 1 + delta;
    y += Math.floor(bl / 12);
    bl = ((bl % 12) + 12) % 12;
    return `${y}-${String(bl + 1).padStart(2, '0')}`;
  }

  /* `n` kunci bulan berurutan, tertua lebih dulu, berakhir di `acuanKunci`
     (bawaan: bulan berjalan dari `acuanIso`). */
  function daftarBulanMundur(n, acuanKunci) {
    const hasil = [];
    for (let i = n - 1; i >= 0; i--) hasil.push(geserBulan(acuanKunci, -i));
    return hasil;
  }

  /* ------------------------------------------------------------------
     1. REKAP KUNJUNGAN — harian & bulanan.
     baris: satu baris v_riwayat_kunjungan (atau subset kolomnya):
       { tanggal, jenis_poli, cara_bayar, jenis_kunjungan }
     ------------------------------------------------------------------ */

  function kunjunganKosong() {
    return { total: 0, umum: 0, gigi: 0, kia: 0, lainnya: 0,
             bpjs: 0, nonBpjs: 0, baru: 0, lama: 0 };
  }

  function tambahKunjungan(acc, baris) {
    acc.total++;
    const jp = (baris.jenis_poli || '').toUpperCase();
    if (jp === 'UMUM') acc.umum++;
    else if (jp === 'GIGI') acc.gigi++;
    else if (jp === 'KIA') acc.kia++;
    else acc.lainnya++;
    if (baris.cara_bayar === 'BPJS') acc.bpjs++; else acc.nonBpjs++;
    if (baris.jenis_kunjungan === 'BARU') acc.baru++;
    else if (baris.jenis_kunjungan === 'LAMA') acc.lama++;
    return acc;
  }

  /* Peta tanggal ('YYYY-MM-DD') -> rekap hari itu. */
  function rekapPerHari(rows) {
    const peta = new Map();
    (rows || []).forEach(r => {
      if (!r || !r.tanggal) return;
      if (!peta.has(r.tanggal)) peta.set(r.tanggal, kunjunganKosong());
      tambahKunjungan(peta.get(r.tanggal), r);
    });
    return peta;
  }

  /* Deret rekap untuk `daftarTanggal` (array 'YYYY-MM-DD'), 0 untuk
     tanggal yang tidak ada datanya — dipakai untuk grafik tren N hari. */
  function rekapTrenHarian(rows, daftarTanggal) {
    const peta = rekapPerHari(rows);
    return daftarTanggal.map(t => ({ tanggal: t, ...(peta.get(t) || kunjunganKosong()) }));
  }

  /* Deret rekap per bulan, sejajar dengan `monthKeys` ('YYYY-MM'). */
  function rekapPerBulan(rows, monthKeys) {
    const peta = new Map(monthKeys.map(k => [k, kunjunganKosong()]));
    (rows || []).forEach(r => {
      const k = kunciBulan(r && r.tanggal);
      if (k && peta.has(k)) tambahKunjungan(peta.get(k), r);
    });
    return monthKeys.map(k => ({ bulan: k, ...peta.get(k) }));
  }

  /* ------------------------------------------------------------------
     2. HEATMAP JAM KUNJUNGAN — dari `jam_daftar` (integer WITA 0-23,
     lihat catatan kepala berkas), untuk satu bulan/rentang sekaligus.
     ------------------------------------------------------------------ */

  function rekapJamKunjungan(rows, jamAwal = 6, jamAkhir = 21) {
    const ember = new Array(Math.max(0, jamAkhir - jamAwal)).fill(0);
    let luar = 0, tanpaJam = 0, total = 0;
    (rows || []).forEach(r => {
      if (!r) return;
      total++;
      const j = r.jam_daftar;
      // 0 adalah jam yang SAH (tengah malam) — jangan disamakan dengan
      // "tidak diketahui". Hanya null/undefined/NaN yang masuk tanpaJam.
      if (j === null || j === undefined || !Number.isFinite(Number(j))) { tanpaJam++; return; }
      const jn = Number(j);
      if (jn < jamAwal || jn >= jamAkhir) { luar++; return; }
      ember[jn - jamAwal]++;
    });
    return { ember, luar, tanpaJam, total, terhitung: total - luar - tanpaJam, jamAwal, jamAkhir };
  }

  /* ------------------------------------------------------------------
     3. REKAP PER DOKTER — satu baris per (dokter, jenis_poli).
     baris: { nama_dokter, jenis_poli }. Baris tanpa nama dokter SELALU
     di bawah, berapa pun jumlahnya (lihat alasan di ovRekapDokter milik
     dashboard portal lama — kolom identitas kosong tidak boleh
     tenggelam di tengah daftar seolah dokter sungguhan).
     ------------------------------------------------------------------ */

  function rekapDokter(rows) {
    const peta = new Map();
    (rows || []).forEach(r => {
      if (!r) return;
      const nama = String(r.nama_dokter || '').trim().replace(/\s+/g, ' ');
      const kosong = !nama;
      const label = kosong ? 'Tanpa nama dokter' : nama;
      const poli = r.jenis_poli || 'LAINNYA';
      const k = label + '|' + poli;
      if (!peta.has(k)) peta.set(k, { nama: label, jenisPoli: poli, jml: 0, kosong });
      peta.get(k).jml++;
    });
    return Array.from(peta.values())
      .sort((a, b) => (a.kosong - b.kosong) || (b.jml - a.jml) || a.nama.localeCompare(b.nama, 'id'));
  }

  /* ------------------------------------------------------------------
     4. RUJUKAN — baris v_laporan_rujukan. SQL memulangkan ketiga
     kemungkinan tujuan (poli internal / faskes+kode BPJS / teks lama)
     sebagai kolom terpisah; di sinilah salah satunya dipilih untuk
     ditampilkan sebagai "Tujuan", sesuai jenis_rujukan-nya.
     ------------------------------------------------------------------ */

  const LABEL_JENIS_RUJUKAN = {
    RUJUK_INTERNAL: 'Rujukan Internal',
    RUJUK_LANJUT:   'Rujukan Lanjut (BPJS)',
    RUJUK_IGD:      'Rujukan IGD'
  };

  function labelJenisRujukan(kode) {
    return LABEL_JENIS_RUJUKAN[kode] || (kode || '-');
  }

  /* Mengembalikan { teks, rinci } — `rinci` array baris tambahan
     (subspesialis/sarana/estimasi) untuk rujukan lanjut, kosong untuk
     yang lain. */
  function tujuanRujukan(baris) {
    const b = baris || {};
    if (b.jenis_rujukan === 'RUJUK_INTERNAL') {
      return { teks: b.tujuan_poli_internal || '(poli tujuan belum dipilih)', rinci: [] };
    }
    if (b.jenis_rujukan === 'RUJUK_LANJUT') {
      const teks = b.tujuan_faskes_kode
        ? `${b.tujuan_faskes_kode}${b.rujuk_ppk_kode ? ' (' + b.rujuk_ppk_kode + ')' : ''}`
        : (b.rujuk_ppk_kode ? `Kode ${b.rujuk_ppk_kode} (belum ada di daftar faskes)` : '(faskes tujuan belum dipilih)');
      const rinci = [];
      if (b.tujuan_subspesialis) rinci.push(b.tujuan_subspesialis);
      if (b.tujuan_sarana) rinci.push(b.tujuan_sarana);
      return { teks, rinci };
    }
    // RUJUK_IGD dan kemungkinan lain di masa depan: kolom teks lama.
    return { teks: b.tujuan_teks || '(tujuan belum dicatat)', rinci: b.spesialis_teks ? [b.spesialis_teks] : [] };
  }

  function rekapRujukanPerBulan(rows, monthKeys) {
    const peta = new Map(monthKeys.map(k => [k, 0]));
    (rows || []).forEach(r => {
      const k = kunciBulan(r && r.tanggal);
      if (k && peta.has(k)) peta.set(k, peta.get(k) + 1);
    });
    return monthKeys.map(k => ({ bulan: k, jumlah: peta.get(k) }));
  }

  /* ------------------------------------------------------------------
     5. KEUANGAN — dua definisi "pendapatan" yang TIDAK BOLEH dijumlahkan
     begitu saja (lihat catatan di sql/19_laporan.sql): nilai_layanan
     (termasuk yang ditanggung BPJS) vs uang_masuk (kas sungguhan).
     ------------------------------------------------------------------ */

  /* baris: v_laporan_keuangan_tagihan {tanggal, jenis_poli, penjamin,
     nilai_layanan, ditagih, sudah_dibayar, jumlah_tagihan} */
  function rekapNilaiLayananPerBulan(rows, monthKeys) {
    const peta = new Map(monthKeys.map(k => [k, { nilaiLayanan: 0, ditagih: 0, jumlahTagihan: 0 }]));
    (rows || []).forEach(r => {
      const k = kunciBulan(r && r.tanggal);
      if (!k || !peta.has(k)) return;
      const acc = peta.get(k);
      acc.nilaiLayanan += Number(r.nilai_layanan) || 0;
      acc.ditagih += Number(r.ditagih) || 0;
      acc.jumlahTagihan += Number(r.jumlah_tagihan) || 0;
    });
    return monthKeys.map(k => ({ bulan: k, ...peta.get(k) }));
  }

  /* baris: v_laporan_keuangan_pembayaran {tanggal, jenis_poli, penjamin,
     metode, uang_masuk, jumlah_transaksi}. `pisahPoli`: kalau true,
     jumlah dipecah per jenis_poli (dipakai kartu ringkasan Umum/Gigi). */
  function rekapUangMasukPerBulan(rows, monthKeys, pisahPoli = false) {
    const kosong = () => (pisahPoli ? { umum: 0, gigi: 0, kia: 0, lainnya: 0, total: 0 } : { total: 0 });
    const peta = new Map(monthKeys.map(k => [k, kosong()]));
    (rows || []).forEach(r => {
      const k = kunciBulan(r && r.tanggal);
      if (!k || !peta.has(k)) return;
      const acc = peta.get(k);
      const jml = Number(r.uang_masuk) || 0;
      acc.total += jml;
      if (pisahPoli) {
        const jp = (r.jenis_poli || '').toLowerCase();
        if (jp === 'umum') acc.umum += jml;
        else if (jp === 'gigi') acc.gigi += jml;
        else if (jp === 'kia') acc.kia += jml;
        else acc.lainnya += jml;
      }
    });
    return monthKeys.map(k => ({ bulan: k, ...peta.get(k) }));
  }

  /* ------------------------------------------------------------------
     6. PUSKESMAS — kategori usia standar SP2TP/LB1 dan rekap diagnosa.
     ------------------------------------------------------------------ */

  const KATEGORI_USIA = [
    '0-7 hari', '8-28 hari', '29 hari - 11 bulan', '1-4 tahun', '5-9 tahun',
    '10-14 tahun', '15-19 tahun', '20-44 tahun', '45-54 tahun',
    '55-59 tahun', '60-69 tahun', '≥70 tahun'
  ];

  /* Umur pada `tanggalAcuan` (biasanya tanggal kunjungan), dikelompokkan
     ke kategori usia SP2TP/LB1 baku. Null kalau data tanggal tidak sah
     atau tanggal_lahir sesudah tanggal_acuan (data cacat — jangan
     mengarang kategori untuk itu, lebih baik terlihat sebagai kosong). */
  function kategoriUsia(tanggalLahir, tanggalAcuan) {
    const hari = selisihHari(tanggalLahir, tanggalAcuan);
    if (hari === null || hari < 0) return null;
    if (hari <= 7) return KATEGORI_USIA[0];
    if (hari <= 28) return KATEGORI_USIA[1];
    if (hari < 365) return KATEGORI_USIA[2];
    // Dari sini dihitung dalam tahun. 365.25 dipakai supaya tahun kabisat
    // tidak menggeser seseorang ke kategori berikutnya beberapa hari
    // lebih awal — cukup akurat untuk rekap bulanan, bukan usia legal.
    const tahun = Math.floor(hari / 365.25);
    if (tahun <= 4) return KATEGORI_USIA[3];
    if (tahun <= 9) return KATEGORI_USIA[4];
    if (tahun <= 14) return KATEGORI_USIA[5];
    if (tahun <= 19) return KATEGORI_USIA[6];
    if (tahun <= 44) return KATEGORI_USIA[7];
    if (tahun <= 54) return KATEGORI_USIA[8];
    if (tahun <= 59) return KATEGORI_USIA[9];
    if (tahun <= 69) return KATEGORI_USIA[10];
    return KATEGORI_USIA[11];
  }

  /* baris: { kode_icd10, nama, tanggal (kunjungan), tanggal_lahir,
     jenis_kelamin } — satu baris per diagnosa (lihat DB.puskesmasDiagnosa).
     Keluaran: array {kode, nama, total, L, P, perKategori:{...}},
     diurutkan dari yang terbanyak. Baris dengan kategori usia tak
     terhitung (tanggal cacat) TETAP masuk `total`/L`/`P`, hanya tidak
     menambah satu pun kolom kategori — supaya total kasus tetap bisa
     direkonsiliasi dengan jumlah baris diagnosa asli. */
  function rekapPuskesmas(rows, tanggalAcuanBawaan) {
    const peta = new Map();
    (rows || []).forEach(r => {
      if (!r || !r.kode_icd10) return;
      if (!peta.has(r.kode_icd10)) {
        const perKategori = {};
        KATEGORI_USIA.forEach(k => { perKategori[k] = 0; });
        peta.set(r.kode_icd10, { kode: r.kode_icd10, nama: r.nama || r.kode_icd10,
                                  total: 0, L: 0, P: 0, perKategori });
      }
      const acc = peta.get(r.kode_icd10);
      acc.total++;
      if (r.jenis_kelamin === 'L') acc.L++;
      else if (r.jenis_kelamin === 'P') acc.P++;
      const acuan = r.tanggal || tanggalAcuanBawaan;
      const kat = kategoriUsia(r.tanggal_lahir, acuan);
      if (kat) acc.perKategori[kat]++;
    });
    return Array.from(peta.values()).sort((a, b) => b.total - a.total);
  }

  const API = {
    uraiTanggal, selisihHari, kunciBulan, labelBulanPendek, geserBulan, daftarBulanMundur,
    kunjunganKosong, rekapPerHari, rekapTrenHarian, rekapPerBulan,
    rekapJamKunjungan,
    rekapDokter,
    LABEL_JENIS_RUJUKAN, labelJenisRujukan, tujuanRujukan, rekapRujukanPerBulan,
    rekapNilaiLayananPerBulan, rekapUangMasukPerBulan,
    KATEGORI_USIA, kategoriUsia, rekapPuskesmas
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

/* =====================================================================
   ANTREAN — FUNGSI MURNI
   Tidak menyentuh DOM maupun Supabase, sehingga bisa diuji dengan
   `node test/uji_antrean_core.js`.

   Beberapa fungsi di sini SENGAJA menghitung ulang hal yang juga
   dihitung database — bentuk nomor antrean, kalimat panggilan, dan
   pemeriksaan nomor kartu. Itu bukan duplikasi yang terlupa: layar
   tunggu dan panel uji coba harus bisa menyusun kalimat tanpa menunggu
   jawaban server, sementara BPJS harus melihat nilai yang persis sama.

   Karena itu keduanya dijaga oleh CONTOH UJI YANG SAMA PERSIS —
   test/uji_antrean.sql dan test/uji_antrean_core.js memakai nomor,
   kartu, dan tanggal yang sama. Kalau salah satu diubah, ujinya yang
   gagal, bukan hasilnya yang diam-diam berselisih di klinik.
   ===================================================================== */
const AntreanCore = (() => {

  /* ---------------- Bentuk nomor antrean ------------------------------
     Pasangan kolom `nomor` di tabel antrean:
       prefix || '-' || lpad(no_urut, greatest(3, length(no_urut)), '0')

     padStart di JavaScript tidak memotong, lpad di PostgreSQL memotong.
     greatest(3, ...) di SQL ada supaya keduanya sama pada nomor 4 digit;
     di sini padStart(3) sudah cukup. Uji nomor 1000 di kedua berkas
     menjaga agar perbedaan itu tidak pernah menjadi selisih.            */
  function formatNomor(prefix, urut) {
    const n = Number(urut);
    if (!Number.isFinite(n) || n <= 0) return '';
    return `${String(prefix || 'A').toUpperCase()}-${String(Math.trunc(n)).padStart(3, '0')}`;
  }

  function pecahNomor(nomor) {
    const m = /^([A-Za-z]+)-(\d+)$/.exec(String(nomor || '').trim());
    if (!m) return null;
    return { prefix: m[1].toUpperCase(), urut: parseInt(m[2], 10) };
  }

  /* ---------------- Kalimat panggilan (untuk suara) -------------------
     Pembaca suara peramban membaca "A-014" sebagai "A minus nol satu
     empat" — angka nolnya ikut terbaca dan tanda hubungnya jadi "minus".
     Yang dikirim ke pembaca suara karena itu bukan nomornya, melainkan
     kalimat yang sudah dieja: "A, 14".                                  */
  function ejaNomor(nomor) {
    const p = pecahNomor(nomor);
    if (!p) return String(nomor || '');
    return `${p.prefix}, ${p.urut}`;
  }

  function teksPanggilan(nomor, tujuan, ulang = 1) {
    const eja = ejaNomor(nomor);
    const ke = tujuan ? `, silakan menuju ${tujuan}` : '';
    // Panggilan ulang diberi awalan supaya pasien yang tadi tidak dengar
    // tahu bahwa ini kesempatan kedua, bukan nomor yang berbeda.
    const awal = ulang > 1 ? 'Panggilan ulang. ' : '';
    return `${awal}Nomor antrean ${eja}${ke}.`;
  }

  /* ---------------- Pemeriksaan identitas -----------------------------
     Bentuknya sama persis dengan antrol_periksa_kartu() dan
     antrol_periksa_nik() di sql/15_antrean.sql, termasuk urutan
     pemeriksaannya: kosong dulu, lalu bukan angka, baru panjangnya.
     Urutan itu menentukan pesan mana yang dilihat petugas.              */
  function periksaKartu(noKartu) {
    const s = String(noKartu ?? '').trim();
    if (s === '')          return 'Nomor kartu tidak boleh kosong';
    if (!/^\d+$/.test(s))  return 'Format nomor kartu tidak sesuai';
    if (s.length !== 13)   return 'Nomor kartu harus 13 digit';
    return null;
  }

  function periksaNik(nik) {
    const s = String(nik ?? '').trim();
    if (s === '')          return 'NIK tidak boleh kosong';
    if (!/^\d+$/.test(s))  return 'Format NIK tidak sesuai';
    if (s.length !== 16)   return 'NIK harus 16 digit';
    return null;
  }

  function periksaTanggal(tgl) {
    const s = String(tgl ?? '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s))
      return 'Format tanggal tidak sesuai, format yang benar adalah yyyy-mm-dd';
    return null;
  }

  /* ---------------- Jadwal --------------------------------------------
     Jam dibandingkan sebagai teks 'HH:MM'. Itu sah karena format jamnya
     tetap dan berpadding nol — dan jauh lebih aman daripada membuat
     objek Date, yang akan menyeret zona waktu perangkat masuk ke dalam
     keputusan buka-tutup poli.                                          */
  const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  const jamPendek = (j) => String(j ?? '').slice(0, 5);

  function sedangBuka(jadwal, jamSekarang) {
    if (!jadwal || !jadwal.jam_buka) return false;
    const j = jamPendek(jamSekarang);
    return j >= jamPendek(jadwal.jam_buka) && j <= jamPendek(jadwal.jam_tutup);
  }

  /* 12 Sep 2026: pemeriksaan kuota online DIHAPUS dari sini — cermin dari
     penghapusan blok yang sama di public.antrol_ambil() (lihat
     sql/28_antrol_tanpa_kuota.sql). Klinik tidak membatasi jumlah pasien;
     fungsi ini sekarang hanya menolak berdasarkan jadwal/jam, bukan kuota. */
  function bolehDaftarOnline(jadwal, tanggal, hariIni, jamSekarang) {
    if (!jadwal || !jadwal.jam_buka) return { boleh: false, alasan: 'Poli tidak melayani hari itu' };
    if (tanggal < hariIni) return { boleh: false, alasan: 'Tanggal periksa tidak berlaku mundur' };
    if (tanggal === hariIni) {
      const batas = jamPendek(jadwal.jam_tutup_online || jadwal.jam_tutup);
      if (jamPendek(jamSekarang) > batas)
        return { boleh: false, alasan: `Pendaftaran online hari ini sudah ditutup pukul ${batas}` };
    }
    return { boleh: true, alasan: null };
  }

  /* ---------------- Estimasi waktu dilayani ---------------------------
     Kasar dengan sengaja: rata-rata menit per pasien dikali jumlah orang
     di depan. Angka yang lebih pintar (rata-rata bergerak dari waktu
     layan hari ini) terdengar meyakinkan tetapi meleset jauh pada pagi
     hari ketika sampelnya baru dua orang — dan pasien mengingat estimasi
     yang meleset lebih lama daripada estimasi yang kasar.               */
  function estimasiMenit(jumlahDiDepan, menitPerPasien = 10) {
    const n = Math.max(0, Number(jumlahDiDepan) || 0);
    return n * (Number(menitPerPasien) || 10);
  }

  function estimasiTeks(jumlahDiDepan, menitPerPasien = 10) {
    const m = estimasiMenit(jumlahDiDepan, menitPerPasien);
    if (m <= 0)  return 'Segera dipanggil';
    if (m < 60)  return `± ${m} menit lagi`;
    const jam = Math.floor(m / 60), sisa = m % 60;
    return sisa ? `± ${jam} jam ${sisa} menit lagi` : `± ${jam} jam lagi`;
  }

  /* ---------------- Lencana keadaan ----------------------------------- */
  const LABEL = {
    BELUM_HADIR: ['Belum hadir',  'b-menunggu'],
    MENUNGGU:    ['Menunggu',     'b-dokter'],
    DIPANGGIL:   ['Dipanggil',    'b-kajian'],
    DILAYANI:    ['Dilayani',     'b-periksa'],
    SELESAI:     ['Selesai',      'b-selesai'],
    TIDAK_HADIR: ['Tidak hadir',  'b-batal'],
    BATAL:       ['Batal',        'b-batal']
  };
  const labelStatus = (s) => LABEL[s] || [s, 'b-batal'];

  const LABEL_SUMBER = {
    LOKET:    'Loket',
    ONLINE:   'Mobile JKN',
    ANJUNGAN: 'Anjungan mandiri'
  };
  const labelSumber = (s) => LABEL_SUMBER[s] || s;

  /* Antrean mana yang masih hidup — dipakai penyaringan di banyak tempat,
     jadi definisinya ditulis sekali saja di sini. */
  const AKTIF = ['BELUM_HADIR', 'MENUNGGU', 'DIPANGGIL', 'DILAYANI'];
  const masihAktif = (a) => AKTIF.includes(a && a.status);

  /* ---------------- Token & tautan layar ------------------------------
     Sumber acak disuntikkan supaya bisa diuji. Di peramban yang dipakai
     crypto.getRandomValues, bukan Math.random: token inilah satu-satunya
     yang menjaga alamat layar tunggu.                                    */
  const HURUF = 'abcdefghijkmnopqrstuvwxyz23456789';   // tanpa l, 0, 1

  function acakToken(panjang = 40, acak = null) {
    const n = Math.max(24, panjang);
    let byte;
    if (acak) {
      byte = acak(n);
    } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      byte = crypto.getRandomValues(new Uint8Array(n));
    } else {
      byte = Array.from({ length: n }, () => Math.floor(Math.random() * 256));
    }
    let s = '';
    for (let i = 0; i < n; i++) s += HURUF[byte[i] % HURUF.length];
    return s;
  }

  function urlLayar(asal, token) {
    if (!token) return '';
    const dasar = String(asal || '').replace(/\/+$/, '').replace(/\/(app|index|demo)\.html.*$/, '');
    return `${dasar}/display.html?t=${encodeURIComponent(token)}`;
  }

  /* ---------------- Membaca jawaban Antrol ----------------------------
     Dipakai panel "Uji coba" di Pengaturan supaya petugas melihat hasil
     dalam bahasa manusia, bukan JSON.                                    */
  function bacaJawaban(json) {
    const meta = (json && json.metadata) || {};
    const kode = Number(meta.code ?? 0);
    const r = (json && json.response) || null;
    const ok = kode === 200 || kode === 202;
    let ringkas = meta.message || (ok ? 'Ok' : 'Gagal');
    if (ok && r) {
      const bagian = [];
      if (r.nomorantrean)   bagian.push(`Nomor ${r.nomorantrean}`);
      if (r.namapoli)       bagian.push(r.namapoli);
      if (r.totalantrean !== undefined) bagian.push(`${r.totalantrean} total`);
      if (r.sisaantrean !== undefined)  bagian.push(`${r.sisaantrean} menunggu`);
      if (r.antreanpanggil)  bagian.push(`sedang dipanggil ${r.antreanpanggil}`);
      if (bagian.length) ringkas = bagian.join(' · ');
    }
    return {
      ok, kode, ringkas,
      // 202 bukan kegagalan: nomornya terbit, hanya pesertanya belum
      // terdaftar sebagai pasien di klinik ini.
      pasienBaru: kode === 202,
      pesan: meta.message || ''
    };
  }

  return {
    formatNomor, pecahNomor, ejaNomor, teksPanggilan,
    periksaKartu, periksaNik, periksaTanggal,
    sedangBuka, bolehDaftarOnline, jamPendek, HARI,
    estimasiMenit, estimasiTeks,
    labelStatus, labelSumber, masihAktif, AKTIF,
    acakToken, urlLayar, bacaJawaban
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AntreanCore;

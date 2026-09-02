/* =====================================================================
   APOTEK CORE — mesin hitung kartu stok & pratinjau FEFO (fungsi murni)

   Menggantikan buku catatan manual "per obat per hari": berapa yang
   masuk, berapa yang keluar, sisa berapa.

   Modul ini SENGAJA tidak menyentuh DOM dan tidak memanggil Supabase.
   Masukannya hanya dua array yang sudah ada di halaman (transaksi &
   batch), keluarannya angka mentah. Dengan begitu perhitungannya bisa
   diuji di luar peramban — `node test/uji_apotek_core.js` — dan
   js/pages/apotek.js cukup menempelkan tampilan di atasnya.

   ---------------------------------------------------------------------
   CARA SALDO DIHITUNG — dibaca MUNDUR, bukan maju dari nol.

   Saldo akhir bulan diturunkan dari stok yang BENAR-BENAR ada sekarang
   (jumlah stok_sisa semua batch), dikoreksi dengan transaksi setelah
   bulan itu. Baru dari sana ditarik maju per hari. Akibatnya baris
   terakhir kartu bulan berjalan SELALU cocok dengan angka di tab
   "Stok Saat Ini".

   Kalau dihitung maju dari nol, koreksi batch lewat Edit Batch — yang
   mengubah stok tanpa menulis baris transaksi — membuat kartu dan tab
   stok berselisih diam-diam. Persis jenis salah hitung yang paling sulit
   dilacak, karena kedua angka sama-sama terlihat masuk akal.

   ---------------------------------------------------------------------
   PERBEDAAN DARI VERSI PORTAL

   Portal mencocokkan obat lewat nama teks dan harus menormalkan spasi
   serta kapital (kunciNama), karena impor Excel pernah menghasilkan
   "Amoxicillin 500mg" dan "amoxicillin 500 mg" sebagai dua kartu.
   RME punya master obat, jadi pencocokan memakai obat_id dan seluruh
   kelas kesalahan itu hilang.

   Yang kedua: baris yang dibatalkan (dibatalkan = true) tidak pernah
   ikut dihitung. Portal menghapus barisnya; di sini barisnya tinggal
   sebagai jejak audit, jadi penyaringnya harus di sini.
   ===================================================================== */
const ApotekCore = (() => {
  'use strict';

  const KATEGORI_KELUAR = [
    'Resep Pasien', 'Penjualan Bebas', 'Obat Expired', 'Obat Rusak',
    'Retur ke PBF', 'Penyesuaian Stok', 'Lainnya'
  ];

  /* Hanya kategori ini yang boleh mengambil dari batch kadaluwarsa.
     Harus sama dengan apotek_kategori_pemusnahan() di 08_apotek.sql;
     yang di sini hanya untuk menonaktifkan pilihan lebih awal di layar,
     penjaga sebenarnya ada di database. */
  const KATEGORI_PEMUSNAHAN = ['Obat Expired', 'Obat Rusak', 'Retur ke PBF'];

  const angka = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

  /* Tanggal SELALU dibandingkan sebagai string 'YYYY-MM-DD', tidak pernah
     lewat new Date(). Perbandingan lewat objek Date menggeser hari di WITA
     (UTC+8) dan menghasilkan kartu stok yang tanggalnya meleset satu hari
     — kesalahan yang hanya muncul untuk transaksi pagi, sehingga lolos
     dari pengujian yang dijalankan siang hari. */
  const tglTrx    = (t) => String((t && t.tanggal) || '').slice(0, 10);
  const bulanDari = (tgl) => String(tgl || '').slice(0, 7);

  /* Hari terakhir sebuah bulan 'YYYY-MM'. Day 0 bulan berikutnya = hari
     terakhir bulan ini; murni aritmetika kalender lokal. */
  function akhirBulan(bulan) {
    const th = parseInt(String(bulan).slice(0, 4), 10);
    const bl = parseInt(String(bulan).slice(5, 7), 10);
    const d = new Date(th, bl, 0);
    return bulan + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Tanggal hari ini menurut zona perangkat, BUKAN toISOString().
     toISOString() memulangkan UTC: di WITA sebelum pukul 08.00 ia
     mengembalikan tanggal KEMARIN, sehingga form obat masuk terisi
     tanggal salah untuk input pagi — tepat jam kiriman PBF datang. */
  function hariIniLokal(d) {
    const x = d || new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }
  const bulanIniLokal = (d) => hariIniLokal(d).slice(0, 7);

  const berlaku = (t) => t && !t.dibatalkan;

  /* ---------------------------------------------------------------------
     FEFO
     --------------------------------------------------------------------- */

  /* Urutan keluar: yang paling dekat kadaluwarsa lebih dulu. Tanggal masuk
     hanya pemutus seri.

     FIFO murni keliru untuk obat: batch yang masuk lebih dulu bisa saja
     expired-nya masih lama, sementara batch yang masuk belakangan justru
     sudah mau lewat. Dengan FIFO, batch yang mau lewat itu mengendap
     sampai benar-benar kadaluwarsa dan akhirnya dibuang. */
  function urutFefo(list) {
    return [...(list || [])].sort((a, b) =>
      String(a.tgl_expired).localeCompare(String(b.tgl_expired)) ||
      String(a.tgl_masuk).localeCompare(String(b.tgl_masuk)) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
      String(a.id).localeCompare(String(b.id))
    );
  }

  const sudahExpired = (b, hariIni) =>
    String(b.tgl_expired) <= (hariIni || hariIniLokal());

  /* Batch yang boleh dipakai untuk kategori tertentu. */
  function batchBolehKeluar(list, kategori, hariIni) {
    if (KATEGORI_PEMUSNAHAN.includes(kategori)) return list;
    const h = hariIni || hariIniLokal();
    return (list || []).filter(b => !sudahExpired(b, h));
  }

  /* Simulasi FEFO tanpa menyentuh database.
     Dipakai oleh pratinjau di form DAN oleh dialog konfirmasi, supaya
     angka yang dilihat sebelum menekan Simpan berasal dari perhitungan
     yang sama — bukan dua salinan logika yang bisa berbeda diam-diam.

     Ini HANYA pratinjau. Alokasi yang sebenarnya dikerjakan fungsi
     apotek_keluar() di database, yang mengunci barisnya lebih dulu. */
  function simulasiFefo(batches, jumlah) {
    let sisa = angka(jumlah), totalNilai = 0;
    const potongan = [];
    for (const b of urutFefo(batches)) {
      if (sisa <= 0) break;
      const ambil = Math.min(angka(b.stok_sisa), sisa);
      if (ambil <= 0) continue;
      const nilai = ambil * angka(b.harga_beli);
      potongan.push({ batch: b, ambil, nilai });
      totalNilai += nilai;
      sisa -= ambil;
    }
    return { potongan, totalNilai, kurang: sisa > 0 ? sisa : 0 };
  }

  /* ---------------------------------------------------------------------
     KARTU STOK
     --------------------------------------------------------------------- */

  function wadahKategori(daftar) {
    const o = {};
    daftar.forEach(k => { o[k] = { qty: 0, rp: 0 }; });
    return o;
  }
  const normalKategori = (kat, daftar) => daftar.includes(kat) ? kat : 'Lainnya';
  const selBaru = (daftar) => ({
    masukQty: 0, masukRp: 0, keluarQty: 0, keluarRp: 0, perKat: wadahKategori(daftar)
  });

  function agregatKe(sel, t, daftarKat) {
    const qty = angka(t.jumlah);
    const rp  = angka(t.total_nilai);
    if (t.jenis === 'MASUK') {
      sel.masukQty += qty; sel.masukRp += rp;
    } else {
      sel.keluarQty += qty; sel.keluarRp += rp;
      const k = normalKategori(t.kategori, daftarKat);
      sel.perKat[k].qty += qty;
      sel.perKat[k].rp  += rp;
    }
  }

  /* Stok yang ada SEKARANG untuk satu obat = jumlah stok_sisa seluruh
     batch-nya, TERMASUK batch kadaluwarsa. Barangnya memang masih ada di
     rak; yang dibatasi cuma boleh-tidaknya keluar. */
  function stokSekarang(batch, obatId) {
    return (batch || []).reduce((s, b) =>
      b.obat_id === obatId ? s + angka(b.stok_sisa) : s, 0);
  }

  /* Selisih (masuk − keluar) untuk semua transaksi obat ini yang
     tanggalnya LEBIH BARU dari batas. Inilah yang memundurkan stok
     sekarang ke saldo di tanggal mana pun. */
  function deltaSetelah(trxObat, batasTgl) {
    return trxObat.reduce((s, t) => {
      if (tglTrx(t) <= batasTgl) return s;
      return s + (t.jenis === 'MASUK' ? angka(t.jumlah) : -angka(t.jumlah));
    }, 0);
  }

  /* MODE 1 — kartu stok satu obat, sebulan penuh.
     Menjawab: "Amoxicillin tanggal 31 Agustus keluar berapa?" */
  function kartuObat(opsi) {
    const trx   = (opsi.transaksi || []).filter(berlaku);
    const batch = opsi.batch || [];
    const obatId = opsi.obatId;
    const bulan  = opsi.bulan;
    const daftarKat = opsi.kategoriKeluar || KATEGORI_KELUAR;

    const trxObat = trx.filter(t => t.obat_id === obatId);
    const hbs      = akhirBulan(bulan);
    const stokKini = stokSekarang(batch, obatId);

    // Mundurkan stok sekarang ke titik akhir bulan yang diminta.
    const saldoAkhir = stokKini - deltaSetelah(trxObat, hbs);

    const dalamBulan = trxObat.filter(t => bulanDari(tglTrx(t)) === bulan);

    const perHari = {};
    dalamBulan.forEach(t => {
      const d = tglTrx(t);
      if (!perHari[d]) perHari[d] = selBaru(daftarKat);
      agregatKe(perHari[d], t, daftarKat);
    });

    const hari = Object.keys(perHari).sort();
    let totalMasuk = 0, totalKeluar = 0;
    hari.forEach(d => { totalMasuk += perHari[d].masukQty; totalKeluar += perHari[d].keluarQty; });

    // Saldo awal = saldo akhir dikurangi seluruh gerakan bulan ini.
    const saldoAwal = saldoAkhir - (totalMasuk - totalKeluar);

    let jalan = saldoAwal;
    const baris = hari.map(d => {
      const s = perHari[d];
      jalan += s.masukQty - s.keluarQty;
      return {
        tanggal: d,
        masukQty: s.masukQty, masukRp: s.masukRp,
        keluarQty: s.keluarQty, keluarRp: s.keluarRp,
        perKat: s.perKat,
        saldo: jalan
      };
    });

    const total = selBaru(daftarKat);
    dalamBulan.forEach(t => agregatKe(total, t, daftarKat));

    const contoh = trxObat[0]
      || batch.filter(b => b.obat_id === obatId)[0]
      || {};

    return {
      obatId,
      nama:   contoh.nama_obat || opsi.nama || '',
      satuan: contoh.satuan || '',
      bulan,
      saldoAwal, saldoAkhir,
      stokSekarang: stokKini,
      baris, total
    };
  }

  /* MODE 2 — rekap satu hari, semua obat.
     Menjawab: "Tanggal 31 Agustus, obat apa saja yang bergerak?" */
  function rekapHarian(opsi) {
    const trx   = (opsi.transaksi || []).filter(berlaku);
    const batch = opsi.batch || [];
    const tanggal = String(opsi.tanggal || '').slice(0, 10);
    const daftarKat = opsi.kategoriKeluar || KATEGORI_KELUAR;

    const hariIni = trx.filter(t => tglTrx(t) === tanggal);

    const perObat = {};
    hariIni.forEach(t => {
      const k = t.obat_id;
      if (!perObat[k]) {
        perObat[k] = selBaru(daftarKat);
        perObat[k].obatId = k;
        perObat[k].nama   = t.nama_obat;
        perObat[k].satuan = t.satuan || '';
      }
      agregatKe(perObat[k], t, daftarKat);
    });

    // Saldo akhir hari per obat, lagi-lagi ditarik mundur dari stok kini.
    const setelah = {};
    trx.forEach(t => {
      if (tglTrx(t) <= tanggal) return;
      if (!perObat[t.obat_id]) return;   // obat yang tidak bergerak hari itu tidak ditampilkan
      setelah[t.obat_id] = (setelah[t.obat_id] || 0) +
        (t.jenis === 'MASUK' ? angka(t.jumlah) : -angka(t.jumlah));
    });

    const baris = Object.keys(perObat).map(k => {
      const s = perObat[k];
      s.saldo = stokSekarang(batch, k) - (setelah[k] || 0);
      return s;
    }).sort((a, b) => String(a.nama).localeCompare(String(b.nama)));

    const total = selBaru(daftarKat);
    hariIni.forEach(t => agregatKe(total, t, daftarKat));

    return { tanggal, baris, total, jumlahObat: baris.length };
  }

  /* Daftar obat untuk pemilih kartu stok. Gabungan batch + riwayat: obat
     yang batch-nya sudah habis dan hilang dari tab Stok tetap harus bisa
     dibuka kartunya — justru itu yang paling sering dicari saat
     mencocokkan catatan lama. */
  function daftarObat(batch, transaksi) {
    const peta = {};
    (batch || []).forEach(b => {
      if (b && b.obat_id) peta[b.obat_id] = b.nama_obat || peta[b.obat_id] || '';
    });
    (transaksi || []).forEach(t => {
      if (t && t.obat_id && !peta[t.obat_id]) peta[t.obat_id] = t.nama_obat || '';
    });
    return Object.keys(peta)
      .map(id => ({ obat_id: id, nama: peta[id] }))
      .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
  }

  /* ---------------------------------------------------------------------
     RINGKASAN & LAPORAN BULANAN
     --------------------------------------------------------------------- */

  function ringkasStok(batchList) {
    const hariIni = hariIniLokal();
    const h30 = new Date(); h30.setDate(h30.getDate() + 30);
    const batas30 = hariIniLokal(h30);

    const aktif = (batchList || []).filter(b => angka(b.stok_sisa) > 0);
    return {
      nilaiAset:  aktif.reduce((s, b) => s + angka(b.stok_sisa) * angka(b.harga_beli), 0),
      jumlahBatch: aktif.length,
      jenisObat:  new Set(aktif.map(b => b.obat_id)).size,
      menipis:    aktif.filter(b => angka(b.stok_sisa) < 10).length,
      kadaluwarsa: aktif.filter(b => String(b.tgl_expired) <= hariIni).length,
      segera:     aktif.filter(b => String(b.tgl_expired) > hariIni
                                 && String(b.tgl_expired) <= batas30).length
    };
  }

  /* Pemasukan berkategori 'Saldo Awal' dihitung TERPISAH dari pembelian.
     Memuat persediaan yang sudah ada di rak ke dalam sistem bukan belanja
     bulan itu; kalau digabung, laporan bulan pertama menunjukkan
     pembelian ratusan juta dan tidak bisa dipakai untuk apa pun —
     termasuk membandingkannya dengan bulan-bulan berikutnya. */
  const KATEGORI_SALDO_AWAL = 'Saldo Awal';

  function laporanBulan(transaksi, bulan, kategoriKeluar) {
    const daftarKat = kategoriKeluar || KATEGORI_KELUAR;
    const trx = (transaksi || []).filter(t =>
      berlaku(t) && bulanDari(tglTrx(t)) === bulan);

    const total = selBaru(daftarKat);
    const perObat = {};
    let saldoAwalRp = 0, saldoAwalQty = 0;

    trx.forEach(t => {
      if (t.jenis === 'MASUK' && t.kategori === KATEGORI_SALDO_AWAL) {
        saldoAwalRp  += angka(t.total_nilai);
        saldoAwalQty += angka(t.jumlah);
      } else {
        agregatKe(total, t, daftarKat);
      }
      const k = t.obat_id;
      if (!perObat[k]) {
        perObat[k] = selBaru(daftarKat);
        perObat[k].obatId = k;
        perObat[k].nama = t.nama_obat;
        perObat[k].satuan = t.satuan || '';
        perObat[k].saldoAwalQty = 0;
      }
      if (t.jenis === 'MASUK' && t.kategori === KATEGORI_SALDO_AWAL) {
        perObat[k].saldoAwalQty += angka(t.jumlah);
      } else {
        agregatKe(perObat[k], t, daftarKat);
      }
    });

    return {
      bulan,
      pembelianRp:  total.masukRp,
      pembelianQty: total.masukQty,
      saldoAwalRp, saldoAwalQty,
      keluarRp:     total.keluarRp,
      keluarQty:    total.keluarQty,
      selisihRp:    total.masukRp - total.keluarRp,
      perKategori:  total.perKat,
      perObat: Object.values(perObat)
        .sort((a, b) => b.keluarRp - a.keluarRp || String(a.nama).localeCompare(String(b.nama))),
      jumlahTransaksi: trx.length
    };
  }

  const API = {
    KATEGORI_KELUAR, KATEGORI_PEMUSNAHAN, KATEGORI_SALDO_AWAL,
    hariIniLokal, bulanIniLokal, akhirBulan,
    urutFefo, sudahExpired, batchBolehKeluar, simulasiFefo,
    stokSekarang, kartuObat, rekapHarian, daftarObat,
    ringkasStok, laporanBulan
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  return API;
})();

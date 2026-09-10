/* ============================================================================
 *  invoice_template.js — TEMPLATE TAMPILAN INVOICE (PDF + struk thermal)
 *  Klinik Imanuel
 * ----------------------------------------------------------------------------
 *  Dipakai bersama oleh:
 *      js/pages/kasir.js       — membaca template saat mencetak PDF & struk
 *      js/pages/pengaturan.js  — mengubah dan menyimpan template
 *
 *  PERBEDAAN DARI VERSI PORTAL
 *  Portal menyimpan lewat RPC ki_simpan_template_invoice(sandi, konfigurasi)
 *  karena anon key-nya tidak punya izin tulis dan satu-satunya penjaga
 *  adalah sandi bersama. RME punya login per pengguna, jadi penjaganya
 *  adalah RLS: hanya yang punya hak akses `master_data` yang boleh menulis
 *  sys_template_invoice (bawaannya cuma master — bisa diatur lewat
 *  Pengaturan -> Hak Akses, lihat sql/09_kasir.sql). Tidak ada lagi sandi
 *  kedua yang harus diketik.
 *
 *  BENTUK
 *  Satu objek bersarang: { versi, identitas, pdf, struk }. Nilai BAWAAN di
 *  berkas ini menyalin persis apa yang dulu tertulis langsung di generate.html
 *  dan struk_core.js. Isi dari database ditumpuk di atasnya lewat gabung(),
 *  jadi kunci yang belum ada di database tidak pernah menghasilkan undefined.
 *
 *  Itu juga yang membuat penambahan pengaturan baru nanti tidak butuh migrasi
 *  SQL: cukup tambahkan kuncinya di BAWAAN, halaman lama tetap jalan.
 *
 *  MENULIS
 *  Tidak pernah lewat UPDATE langsung. anon key tidak punya izin tulis ke
 *  sys_template_invoice sama sekali. Satu-satunya jalan adalah RPC
 *  ki_simpan_template_invoice(sandi, konfigurasi) yang memeriksa kata sandi
 *  Pengaturan Sistem di dalam database.
 *
 *  Berkas ini tidak menyentuh document maupun navigator, jadi seluruh
 *  fungsi murninya bisa diuji dengan `node test_invoice_template.js`.
 * ==========================================================================*/
(function (global) {
    'use strict';

    /* ── Nilai bawaan ──────────────────────────────────────────────────────
       JANGAN diubah untuk "memperbaiki" tampilan. Ini cadangan kalau tabel
       template belum ada atau gagal dibaca; hasilnya harus sama persis dengan
       invoice yang keluar sebelum fitur pengaturan ini ada. Perubahan
       tampilan dilakukan lewat halaman Pengaturan Invoice. */
    var BAWAAN = {
        versi: 1,

        identitas: {
            nama:    'Klinik Imanuel',
            alamat:  'Kompleks marina plaza, blok E no 4, wenang, kota manado, Sulawesi Utara',
            telepon: '0811-4340-0454',
            email:   'klinikimanuel@gmail.com',
            visi:    'Mewujudnyatakan Kristus dalam pelayanan kesehatan',
            logoUrl: 'logo klinik imanuel.png'
        },

        pdf: {
            judulBelumLunas:    'INVOICE',
            judulLunas:         'KWITANSI',
            /* Kunjungan BPJS tidak menagih apa pun. Menyebut lembarnya
               "KWITANSI" menyesatkan — tidak ada uang yang diterima —
               dan "INVOICE" lebih menyesatkan lagi. */
            judulPenjamin:      'BUKTI PELAYANAN',
            warnaAksen:         '#d81b06',
            warnaTotal:         '#1a8f0a',
            tampilLogo:         true,
            tampilVisi:         true,
            tampilEmail:        true,
            tampilKolomDiskon:  true,
            tampilWaktuDibuat:  true,
            tampilRiwayatBayar: true,
            /* Tambahan RME */
            tampilNomorRm:      true,
            tampilPenjamin:     true,
            tampilPetugas:      true,
            tampilPoliDokter:   true,
            capLunas:           'LUNAS',
            capSebagian:        'BAYAR SEBAGIAN',
            capBelumLunas:      'BELUM LUNAS',
            catatanKaki:        'Terima kasih atas kepercayaan Anda.',
            catatanBaku:        '',
            tandaTangan: {
                aktif:   false,
                kota:    'Manado',
                jabatan: 'Penanggung Jawab Klinik',
                nama:    ''
            }
        },

        struk: {
            lebarBaku:           58,
            judulBelumLunas:     'INVOICE',
            judulLunas:          'KWITANSI',
            tampilAlamat:        true,
            tampilTelepon:       true,
            tampilNamaPelanggan: true,
            tampilRincianBayar:  true,
            tampilStempel:       true,
            tampilWaktuCetak:    true,
            /* Tambahan RME — harus cocok dengan TPL_BAWAAN di struk_core.js */
            tampilNomorRm:       true,
            tampilPenjamin:      true,
            tampilPetugas:       true,
            capLunas:            '*** LUNAS ***',
            capSebagian:         '** BAYAR SEBAGIAN **',
            capBelumLunas:       '** BELUM LUNAS **',
            barisKepala:         [],
            catatanKaki:         'Terima kasih atas kepercayaan Anda',
            barisKaki:           [],
            barisKosongAkhir:    4,
            potongKertas:        true
        }
    };

    var NAMA_TABEL = 'sys_template_invoice';

    /* ── Utilitas murni ────────────────────────────────────────────────── */

    function objekBiasa(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function salinDalam(v) {
        if (Array.isArray(v)) return v.map(salinDalam);
        if (objekBiasa(v)) {
            var o = {};
            for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = salinDalam(v[k]);
            return o;
        }
        return v;
    }

    /* Menumpuk `atas` di atas `bawah`. Objek digabung per kunci; array dan
     * nilai tunggal MENGGANTI, tidak digabung. null / undefined di `atas`
     * diabaikan, sehingga kunci yang kosong di database tetap memakai bawaan
     * alih-alih mengosongkan tampilan invoice. */
    function gabung(bawah, atas) {
        var hasil = salinDalam(bawah);
        if (!objekBiasa(atas)) return hasil;
        for (var k in atas) {
            if (!Object.prototype.hasOwnProperty.call(atas, k)) continue;
            var nilai = atas[k];
            if (nilai === null || nilai === undefined) continue;
            hasil[k] = (objekBiasa(nilai) && objekBiasa(hasil[k]))
                ? gabung(hasil[k], nilai)
                : salinDalam(nilai);
        }
        return hasil;
    }

    /* ── Pembersih nilai ───────────────────────────────────────────────────
       Dijalankan sebelum menyimpan DAN sesudah membaca. Alasannya: baris di
       database bisa saja ditulis lewat SQL Editor secara manual, dan satu
       warna yang salah ketik cukup untuk membuat pdfmake melempar galat di
       tengah pembuatan PDF — kegagalan yang muncul jauh dari penyebabnya. */
    var POLA_WARNA = /^#[0-9a-fA-F]{6}$/;

    function teks(v, bawaan, maks) {
        if (typeof v !== 'string') return bawaan;
        var t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
        /* Kosong → pakai bawaan. Untuk kolom yang memang boleh dikosongkan
           (visi, catatan kaki, nama penanda tangan) bawaannya sudah '' di
           bersihkan(), jadi satu aturan ini melayani kedua kebutuhan:
           nama klinik tidak bisa hilang, visi tetap bisa dihapus. */
        if (!t) return bawaan;
        if (maks && t.length > maks) t = t.slice(0, maks);
        return t;
    }
    function warna(v, bawaan) {
        return (typeof v === 'string' && POLA_WARNA.test(v.trim())) ? v.trim().toLowerCase() : bawaan;
    }
    function ya(v, bawaan) {
        return typeof v === 'boolean' ? v : bawaan;
    }
    function angka(v, bawaan, min, maks) {
        var n = Number(v);
        if (!isFinite(n)) return bawaan;
        n = Math.round(n);
        if (n < min) n = min;
        if (n > maks) n = maks;
        return n;
    }
    function daftarTeks(v, maksBaris, maksPanjang) {
        if (!Array.isArray(v)) return [];
        var keluar = [];
        for (var i = 0; i < v.length && keluar.length < maksBaris; i++) {
            var t = teks(v[i], '', maksPanjang);
            if (t) keluar.push(t);
        }
        return keluar;
    }

    function bersihkan(k) {
        var g = gabung(BAWAAN, k);
        var b = BAWAAN;

        return {
            versi: 1,
            identitas: {
                nama:    teks(g.identitas.nama,    b.identitas.nama,    80),
                alamat:  teks(g.identitas.alamat,  b.identitas.alamat,  200),
                telepon: teks(g.identitas.telepon, b.identitas.telepon, 40),
                email:   teks(g.identitas.email,   b.identitas.email,   80),
                /* Visi boleh dikosongkan — itu pilihan tampilan yang sah,
                   jadi di sini bawaannya '' dan bukan nilai BAWAAN. */
                visi:    teks(g.identitas.visi,    '',                  160),
                logoUrl: teks(g.identitas.logoUrl, b.identitas.logoUrl, 200)
            },
            pdf: {
                judulBelumLunas:    teks(g.pdf.judulBelumLunas, b.pdf.judulBelumLunas, 24),
                judulLunas:         teks(g.pdf.judulLunas,      b.pdf.judulLunas,      24),
                judulPenjamin:      teks(g.pdf.judulPenjamin,   b.pdf.judulPenjamin,   24),
                warnaAksen:         warna(g.pdf.warnaAksen,     b.pdf.warnaAksen),
                warnaTotal:         warna(g.pdf.warnaTotal,     b.pdf.warnaTotal),
                tampilLogo:         ya(g.pdf.tampilLogo,         b.pdf.tampilLogo),
                tampilVisi:         ya(g.pdf.tampilVisi,         b.pdf.tampilVisi),
                tampilEmail:        ya(g.pdf.tampilEmail,        b.pdf.tampilEmail),
                tampilKolomDiskon:  ya(g.pdf.tampilKolomDiskon,  b.pdf.tampilKolomDiskon),
                tampilWaktuDibuat:  ya(g.pdf.tampilWaktuDibuat,  b.pdf.tampilWaktuDibuat),
                tampilRiwayatBayar: ya(g.pdf.tampilRiwayatBayar, b.pdf.tampilRiwayatBayar),
                tampilNomorRm:      ya(g.pdf.tampilNomorRm,     b.pdf.tampilNomorRm),
                tampilPenjamin:     ya(g.pdf.tampilPenjamin,    b.pdf.tampilPenjamin),
                tampilPetugas:      ya(g.pdf.tampilPetugas,     b.pdf.tampilPetugas),
                tampilPoliDokter:   ya(g.pdf.tampilPoliDokter,  b.pdf.tampilPoliDokter),
                capLunas:           teks(g.pdf.capLunas,      b.pdf.capLunas,      24),
                capSebagian:        teks(g.pdf.capSebagian,   b.pdf.capSebagian,   24),
                capBelumLunas:      teks(g.pdf.capBelumLunas, b.pdf.capBelumLunas, 24),
                catatanKaki:        teks(g.pdf.catatanKaki,   '',  160),
                catatanBaku:        teks(g.pdf.catatanBaku,   '',  200),
                tandaTangan: {
                    aktif:   ya(g.pdf.tandaTangan.aktif, false),
                    kota:    teks(g.pdf.tandaTangan.kota,    b.pdf.tandaTangan.kota,    60),
                    jabatan: teks(g.pdf.tandaTangan.jabatan, b.pdf.tandaTangan.jabatan, 60),
                    nama:    teks(g.pdf.tandaTangan.nama,    '',                        60)
                }
            },
            struk: {
                /* Hanya 58 dan 80 yang punya jumlah kolom di StrukCore.KOLOM.
                   Nilai lain akan diam-diam jatuh ke 58 dan membuat struk
                   80mm tercetak setengah lebar. */
                lebarBaku:           (Number(g.struk.lebarBaku) === 80) ? 80 : 58,
                judulBelumLunas:     teks(g.struk.judulBelumLunas, b.struk.judulBelumLunas, 24),
                judulLunas:          teks(g.struk.judulLunas,      b.struk.judulLunas,      24),
                tampilAlamat:        ya(g.struk.tampilAlamat,        b.struk.tampilAlamat),
                tampilTelepon:       ya(g.struk.tampilTelepon,       b.struk.tampilTelepon),
                tampilNamaPelanggan: ya(g.struk.tampilNamaPelanggan, b.struk.tampilNamaPelanggan),
                tampilRincianBayar:  ya(g.struk.tampilRincianBayar,  b.struk.tampilRincianBayar),
                tampilStempel:       ya(g.struk.tampilStempel,       b.struk.tampilStempel),
                tampilWaktuCetak:    ya(g.struk.tampilWaktuCetak,    b.struk.tampilWaktuCetak),
                tampilNomorRm:       ya(g.struk.tampilNomorRm,       b.struk.tampilNomorRm),
                tampilPenjamin:      ya(g.struk.tampilPenjamin,      b.struk.tampilPenjamin),
                tampilPetugas:       ya(g.struk.tampilPetugas,       b.struk.tampilPetugas),
                capLunas:            teks(g.struk.capLunas,      b.struk.capLunas,      32),
                capSebagian:         teks(g.struk.capSebagian,   b.struk.capSebagian,   32),
                capBelumLunas:       teks(g.struk.capBelumLunas, b.struk.capBelumLunas, 32),
                barisKepala:         daftarTeks(g.struk.barisKepala, 4, 48),
                catatanKaki:         teks(g.struk.catatanKaki, '', 120),
                barisKaki:           daftarTeks(g.struk.barisKaki, 4, 48),
                barisKosongAkhir:    angka(g.struk.barisKosongAkhir, b.struk.barisKosongAkhir, 0, 10),
                potongKertas:        ya(g.struk.potongKertas, b.struk.potongKertas)
            }
        };
    }

    /* ── Keadaan aktif ─────────────────────────────────────────────────── */

    var AKTIF   = bersihkan({});
    var SUDAH   = false;    // sudah pernah berhasil dibaca dari database?
    var TERAKHIR = null;    // diubah_pada dari baris terakhir yang dibaca

    function get()      { return AKTIF; }
    function bawaan()   { return salinDalam(BAWAAN); }
    function dariDb()   { return SUDAH; }
    function diubahPada(){ return TERAKHIR; }

    function pakai(konfigurasi) {
        AKTIF = bersihkan(konfigurasi);
        return AKTIF;
    }

    /* ── Baca dari database ────────────────────────────────────────────────
       SENGAJA tidak melempar. Template gagal dibaca bukan alasan untuk
       menggagalkan pembuatan invoice — halaman harus tetap bisa dipakai
       dengan nilai bawaan. Kegagalannya dicatat ke console dan dilaporkan
       lewat nilai kembalian. */
    function muat(db) {
        if (!db || !db.from) {
            return Promise.resolve({ ok: false, alasan: 'Klien Supabase belum siap.' });
        }
        return db.from(NAMA_TABEL).select('konfigurasi, diubah_pada').eq('id', 1).maybeSingle()
            .then(function (r) {
                if (r.error) throw r.error;
                if (!r.data) {
                    return { ok: false, alasan: 'Baris template belum ada — memakai nilai bawaan.' };
                }
                pakai(r.data.konfigurasi || {});
                SUDAH = true;
                TERAKHIR = r.data.diubah_pada || null;
                return { ok: true, konfigurasi: AKTIF };
            })
            .catch(function (e) {
                var pesan = (e && e.message) || String(e);
                /* Tabel belum ada = migrasi belum dijalankan. Ini kekeliruan
                   urutan deploy yang paling sering terjadi; disebut terang. */
                if (/schema cache|does not exist|PGRST(202|205)/i.test(pesan) ||
                    pesan.indexOf(NAMA_TABEL) !== -1) {
                    pesan = 'Tabel ' + NAMA_TABEL + ' belum ada. Jalankan '
                          + 'sql/09_kasir.sql di SQL Editor Supabase.';
                }
                console.warn('[invoice_template] ' + pesan);
                return { ok: false, alasan: pesan };
            });
    }

    /* ── Simpan ke database ────────────────────────────────────────────────
       Berbeda dari muat(): di sini kegagalan HARUS terlihat. Menyimpan yang
       diam-diam gagal jauh lebih berbahaya daripada membaca yang gagal. */
    function simpan(db, konfigurasi) {
        var bersih = bersihkan(konfigurasi);
        return db.from(NAMA_TABEL)
            .update({ konfigurasi: bersih }).eq('id', 1).select('diubah_pada').single()
            .then(function (r) {
                if (r.error) {
                    var m = r.error.message || String(r.error);
                    if (/could not find|does not exist|schema cache|PGRST20[25]/i.test(m)) {
                        throw new Error('Tabel ' + NAMA_TABEL + ' belum ada di database. '
                                      + 'Jalankan sql/09_kasir.sql lebih dulu.');
                    }
                    throw new Error(m);
                }
                /* PostgREST memulangkan 0 baris — bukan galat — ketika RLS
                   menolak UPDATE. Tanpa pemeriksaan ini, pengguna yang tidak
                   punya hak akses `master_data` akan melihat "tersimpan"
                   padahal tidak ada yang berubah: kegagalan diam yang baru
                   ketahuan berhari-hari kemudian saat invoice masih memakai
                   tampilan lama. */
                if (!r.data) {
                    throw new Error('Perubahan ditolak database. Anda tidak punya izin '
                                  + 'mengubah template invoice.');
                }
                pakai(bersih);
                SUDAH = true;
                TERAKHIR = r.data.diubah_pada || null;
                return bersih;
            });
    }

    /* ── Ekspor ────────────────────────────────────────────────────────── */

    var API = {
        BAWAAN: BAWAAN,
        NAMA_TABEL: NAMA_TABEL,
        salinDalam: salinDalam,
        gabung: gabung,
        bersihkan: bersihkan,
        bawaan: bawaan,
        get: get,
        pakai: pakai,
        dariDb: dariDb,
        diubahPada: diubahPada,
        muat: muat,
        simpan: simpan
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else global.TemplateInvoice = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);

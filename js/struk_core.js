/* ============================================================================
 *  struk_core.js — MESIN STRUK THERMAL (fungsi murni, tanpa DOM)
 *
 *  Tanggung jawab tunggal: mengubah data invoice menjadi susunan baris struk,
 *  lalu merender susunan itu ke tiga bentuk keluaran:
 *
 *      susunStruk(data)  ->  array baris  (bentuk perantara)
 *                              |
 *          +-------------------+-------------------+
 *          |                   |                   |
 *      keTeks()            keEscPos()           keHtml()
 *      (pratinjau)         (Bluetooth/USB)      (dialog cetak / iOS)
 *
 *  Tidak menyentuh Supabase, tidak menyentuh document, tidak menyentuh
 *  navigator. Semua transport ada di struk_printer.js. Pemisahan ini yang
 *  membuat berkas ini bisa diuji penuh dengan `node test_struk_core.js`.
 *
 *  Lebar kertas: 58mm = 32 kolom, 80mm = 48 kolom (Font A, 12x24 dot).
 * ==========================================================================*/
(function (global) {
    'use strict';

    /* ── Konstanta ─────────────────────────────────────────────────────── */

    var KOLOM = { 58: 32, 80: 48 };

    var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    var LABEL_METODE = {
        tunai: 'Tunai', transfer: 'Transfer', qris: 'QRIS',
        debit: 'Debit', asuransi: 'Asuransi', lainnya: 'Lainnya',
        campuran: 'Campuran'
    };

    /* Perintah ESC/POS. Angka desimal supaya mudah dibaca ulang. */
    var ESC = 27, GS = 29, LF = 10;

    /* ── Utilitas teks ─────────────────────────────────────────────────── */

    /* Printer thermal murah memakai code page CP437 dan mengacak byte di atas
     * 0x7F. Semua teks diturunkan ke ASCII lebih dulu supaya tidak muncul
     * karakter sampah di tengah nama pasien atau nama obat. */
    var PETA_TRANSLIT = {
        'á':'a','à':'a','â':'a','ä':'a','ã':'a','å':'a','ā':'a',
        'é':'e','è':'e','ê':'e','ë':'e','ē':'e',
        'í':'i','ì':'i','î':'i','ï':'i','ī':'i',
        'ó':'o','ò':'o','ô':'o','ö':'o','õ':'o','ō':'o',
        'ú':'u','ù':'u','û':'u','ü':'u','ū':'u',
        'ñ':'n','ç':'c','ß':'ss',
        '\u2018':"'", '\u2019':"'", '\u201C':'"', '\u201D':'"',
        '\u2013':'-', '\u2014':'-', '\u2026':'...',
        '\u00A0':' ', '\u00B7':'.', '\u2022':'*', '\u00D7':'x',
        '\u00B0':' ', '\u20AC':'EUR', '\u00A3':'GBP'
    };

    function translit(s) {
        var t = String(s == null ? '' : s);
        var keluar = '';
        for (var i = 0; i < t.length; i++) {
            var c = t[i];
            var kecil = c.toLowerCase();
            if (PETA_TRANSLIT[c] !== undefined) {
                keluar += PETA_TRANSLIT[c];
            } else if (PETA_TRANSLIT[kecil] !== undefined) {
                var g = PETA_TRANSLIT[kecil];
                keluar += (c === kecil) ? g : g.toUpperCase();
            } else if (c.charCodeAt(0) < 32) {
                keluar += (c === '\n' || c === '\t') ? ' ' : '';
            } else if (c.charCodeAt(0) < 127) {
                keluar += c;
            } else {
                keluar += '?';
            }
        }
        return keluar;
    }

    /* Pemisah ribuan gaya Indonesia, dibulatkan ke rupiah penuh.
     * Ditulis manual, bukan toLocaleString, supaya hasilnya identik di
     * browser dan di Node tanpa ICU lengkap. */
    function fmtNum(n) {
        var angka = Number(n);
        if (!isFinite(angka)) angka = 0;
        var negatif = angka < 0;
        var bulat = String(Math.round(Math.abs(angka)));
        var hasil = '';
        for (var i = 0; i < bulat.length; i++) {
            if (i > 0 && (bulat.length - i) % 3 === 0) hasil += '.';
            hasil += bulat[i];
        }
        return (negatif ? '-' : '') + hasil;
    }

    /* '2026-08-24' -> '24 Agu 2026'. Sengaja mengurai string, bukan
     * new Date(), supaya tidak ada pergeseran hari di WITA (UTC+8). */
    function fmtTgl(iso) {
        var s = String(iso == null ? '' : iso).slice(0, 10);
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (!m) return s;
        var bln = parseInt(m[2], 10) - 1;
        if (bln < 0 || bln > 11) return s;
        return parseInt(m[3], 10) + ' ' + BULAN[bln] + ' ' + m[1];
    }

    function potong(s, n) {
        var t = String(s == null ? '' : s);
        return t.length <= n ? t : t.slice(0, n);
    }

    function padKanan(s, n) {
        var t = potong(s, n);
        while (t.length < n) t += ' ';
        return t;
    }

    function padKiri(s, n) {
        var t = potong(s, n);
        while (t.length < n) t = ' ' + t;
        return t;
    }

    function tengah(s, n) {
        var t = potong(s, n);
        var sisa = n - t.length;
        var kiri = Math.floor(sisa / 2);
        var hasil = '';
        for (var i = 0; i < kiri; i++) hasil += ' ';
        return hasil + t;   // spasi kanan tidak perlu, printer sudah rata kiri
    }

    /* Pembungkus kata. Kata yang lebih panjang dari lebar kolom dipotong
     * paksa supaya tidak menghasilkan baris kosong tak berujung. */
    function bungkus(s, n) {
        var teks = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
        if (n < 1) return [''];
        if (!teks) return [''];
        var kata = teks.split(' ');
        var baris = [];
        var kini = '';
        for (var i = 0; i < kata.length; i++) {
            var k = kata[i];
            while (k.length > n) {
                if (kini) { baris.push(kini); kini = ''; }
                baris.push(k.slice(0, n));
                k = k.slice(n);
            }
            if (!kini) {
                kini = k;
            } else if (kini.length + 1 + k.length <= n) {
                kini += ' ' + k;
            } else {
                baris.push(kini);
                kini = k;
            }
        }
        if (kini) baris.push(kini);
        return baris.length ? baris : [''];
    }

    /* Kiri rata kiri, kanan rata kanan, dalam satu baris selebar `n`.
     * Kalau kiri terlalu panjang, ia dibungkus dan nilai kanan menempel di
     * baris terakhir. Mengembalikan array baris. */
    function duaKolom(kiri, kanan, n, indent) {
        var kn = potong(String(kanan == null ? '' : kanan), n);
        var lebarKiri = n - kn.length - 1;
        if (lebarKiri < 1) return [padKiri(kn, n)];

        var pecah = bungkus(kiri, lebarKiri);
        var hasil = [];
        for (var i = 0; i < pecah.length - 1; i++) hasil.push(pecah[i]);
        var akhir = pecah[pecah.length - 1];
        hasil.push(padKanan(akhir, n - kn.length) + kn);

        if (indent) {
            for (var j = 1; j < hasil.length; j++) hasil[j] = ' ' + hasil[j];
        }
        return hasil;
    }

    function garis(ch, n) {
        var s = '';
        for (var i = 0; i < n; i++) s += ch;
        return s;
    }

    /* ── Perhitungan ───────────────────────────────────────────────────── */

    function bersihAngka(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    function ringkasItem(items) {
        var daftar = Array.isArray(items) ? items : [];
        var kotor = 0, bersih = 0;
        for (var i = 0; i < daftar.length; i++) {
            var it = daftar[i] || {};
            kotor  += bersihAngka(it.unit_price) * bersihAngka(it.quantity);
            bersih += bersihAngka(it.line_total);
        }
        return {
            subtotal: kotor,
            diskon:   kotor - bersih,
            total:    bersih
        };
    }

    function ringkasBayar(inv, payments) {
        var faktur  = inv || {};
        var daftar  = Array.isArray(payments) ? payments : [];
        var total   = bersihAngka(faktur.total);
        var dibayar = 0;

        if (daftar.length) {
            for (var i = 0; i < daftar.length; i++) {
                dibayar += bersihAngka((daftar[i] || {}).amount);
            }
        } else {
            dibayar = bersihAngka(faktur.amount_paid);
        }

        /* CADANGAN — inilah yang dulu membuat kwitansi lunas tetap mencetak
         * "BELUM LUNAS" di stempel bawahnya.
         *
         * Invoice yang ditandai lunas SEBELUM tabel invoice_payments ada
         * tidak punya baris pembayaran, dan amount_paid-nya kosong. Judul
         * dulu diambil dari payment_status (jadi tercetak KWITANSI) sementara
         * stempel dihitung dari nominal (jadi tercetak BELUM LUNAS). Satu
         * lembar struk menyatakan dua hal yang bertentangan.
         *
         * Di sini payment_status dipakai sebagai sumber terakhir kalau tidak
         * ada nominal sama sekali yang bisa dihitung. Bukan menebak: kolom itu
         * dijaga trigger database dan merupakan pernyataan resmi sistem soal
         * status invoice tersebut. */
        if (dibayar <= 0 && total > 0 && faktur.payment_status === 'lunas') {
            dibayar = total;
        }

        var sisa = total - dibayar;
        var status;
        /* Tagihan bernilai nol sudah selesai, bukan belum dibayar.
         * Di RME ini keadaan sehari-hari: kunjungan BPJS dibayar kapitasi,
         * jadi seluruh barisnya ditanggung penjamin dan total pasiennya 0.
         * Tanpa cabang ini, setiap lembar bukti pelayanan BPJS tercetak
         * berstempel "BELUM LUNAS" — pasien mengira masih punya utang.
         * Cerminan persis kasir_sync_bayar() di 09_kasir.sql. */
        if (total <= 0.5)              status = 'lunas';
        else if (dibayar <= 0)         status = 'belum_lunas';
        else if (sisa <= 0.5)          status = 'lunas';
        else                           status = 'sebagian';

        return {
            total:   total,
            dibayar: dibayar,
            sisa:    sisa > 0 ? sisa : 0,
            status:  status
        };
    }

    /* ── Template tata letak ───────────────────────────────────────────────
     * Nilai di bawah menyalin perilaku struk sebelum halaman Pengaturan
     * Invoice ada. Kalau susunStruk() dipanggil tanpa `tpl`, hasilnya harus
     * sama persis dengan struk yang tercetak kemarin.
     *
     * Sengaja diulang di sini alih-alih mengimpor invoice_template.js:
     * berkas ini wajib tetap bisa dijalankan sendiri di Node untuk pengujian,
     * tanpa dependensi apa pun. */
    var TPL_BAWAAN = {
        judulBelumLunas:     'INVOICE',
        judulLunas:          'KWITANSI',
        tampilAlamat:        true,
        tampilTelepon:       true,
        tampilNamaPelanggan: true,
        tampilRincianBayar:  true,
        tampilStempel:       true,
        tampilWaktuCetak:    true,
        /* Tambahan RME. Bawaannya false supaya struk yang dicetak portal
           tidak berubah bentuk hanya karena berkas ini diperbarui: kunci
           yang tidak dikenal pemanggil lama tetap menghasilkan struk yang
           sama persis dengan sebelumnya. */
        tampilNomorRm:       false,
        tampilPenjamin:      false,
        tampilPetugas:       false,
        capLunas:            '*** LUNAS ***',
        capSebagian:         '** BAYAR SEBAGIAN **',
        capBelumLunas:       '** BELUM LUNAS **',
        barisKepala:         [],
        catatanKaki:         '',
        barisKaki:           []
    };

    function tplStruk(t) {
        var hasil = {};
        for (var k in TPL_BAWAAN) {
            if (Object.prototype.hasOwnProperty.call(TPL_BAWAAN, k)) hasil[k] = TPL_BAWAAN[k];
        }
        if (t && typeof t === 'object') {
            for (var j in t) {
                if (!Object.prototype.hasOwnProperty.call(t, j)) continue;
                if (t[j] === null || t[j] === undefined) continue;
                hasil[j] = t[j];
            }
        }
        return hasil;
    }

    /* ── Penyusun struk ────────────────────────────────────────────────── */
    /*
     *  Bentuk baris:
     *    { k:'ln', t:'teks', a:'l'|'c'|'r', b:true, s:0|1|2 }
     *        s = 0 normal, 1 tinggi ganda, 2 lebar+tinggi ganda
     *    { k:'hr', ch:'-' }
     *    { k:'sp' }                       baris kosong
     */
    function ln(t, opsi) {
        var o = opsi || {};
        return { k: 'ln', t: String(t == null ? '' : t),
                 a: o.a || 'l', b: !!o.b, s: o.s || 0 };
    }
    function hr(ch) { return { k: 'hr', ch: ch || '-' }; }
    function sp()   { return { k: 'sp' }; }

    function susunStruk(data) {
        var d       = data || {};
        var bisnis  = d.bisnis || {};
        var inv     = d.inv || {};
        var items   = Array.isArray(d.items) ? d.items : [];
        var bayar   = Array.isArray(d.payments) ? d.payments : [];
        var opsi    = d.opsi || {};
        var t       = tplStruk(d.tpl);

        var lebar   = KOLOM[opsi.lebarMm] || KOLOM[58];
        var out     = [];

        /* ── SATU SUMBER STATUS ────────────────────────────────────────────
         * Dihitung di sini, sebelum baris mana pun dicetak, lalu dipakai oleh
         * judul di kepala DAN stempel di kaki. Selama keduanya membaca `rb`
         * yang sama, mustahil struk menyatakan KWITANSI di atas dan
         * BELUM LUNAS di bawah — dulu itu mungkin karena judul membaca
         * payment_status sementara stempel menghitung sendiri. */
        var r           = ringkasItem(items);
        var totalTampil = (inv.total != null) ? bersihAngka(inv.total) : r.total;
        var rb          = ringkasBayar({
            total:          totalTampil,
            amount_paid:    inv.amount_paid,
            payment_status: inv.payment_status
        }, bayar);

        /* ── Kepala ── */
        if (bisnis.nama) {
            out.push(ln(translit(bisnis.nama), { a: 'c', b: true, s: 1 }));
        }
        if (bisnis.alamat && t.tampilAlamat !== false) {
            bungkus(translit(bisnis.alamat), lebar).forEach(function (b) {
                out.push(ln(b, { a: 'c' }));
            });
        }
        if (bisnis.telp && t.tampilTelepon !== false) {
            out.push(ln('Telp ' + translit(bisnis.telp), { a: 'c' }));
        }
        if (Array.isArray(t.barisKepala)) {
            t.barisKepala.forEach(function (baris) {
                if (!baris) return;
                bungkus(translit(baris), lebar).forEach(function (b) {
                    out.push(ln(b, { a: 'c' }));
                });
            });
        }

        out.push(hr('='));

        var judul = opsi.judul
                 || (rb.status === 'lunas' ? t.judulLunas : t.judulBelumLunas);
        out.push(ln(translit(judul), { a: 'c', b: true }));
        out.push(hr('='));

        /* ── Identitas invoice ── */
        var lebarLabel = 6;
        function baris2(label, nilai) {
            var isi = bungkus(translit(nilai), lebar - lebarLabel - 2);
            out.push(ln(padKanan(label, lebarLabel) + ': ' + isi[0]));
            for (var i = 1; i < isi.length; i++) {
                out.push(ln(garis(' ', lebarLabel + 2) + isi[i]));
            }
        }
        if (inv.invoice_number) baris2('No',   inv.invoice_number);
        baris2('Tgl',  fmtTgl(inv.invoice_date));
        if (inv.customer_name && t.tampilNamaPelanggan !== false) {
            baris2('Nama', inv.customer_name);
        }
        /* Dua baris khusus RME. Nomor rekam medis membuat struk bisa
           dicocokkan kembali dengan berkas pasien, dan penjamin menjelaskan
           kenapa sebuah struk bernilai Rp 0 — tanpa itu struk kunjungan BPJS
           terlihat seperti kesalahan sistem. */
        if (inv.no_rm && t.tampilNomorRm) baris2('No RM', inv.no_rm);
        if (inv.penjamin && t.tampilPenjamin) baris2('Bayar', inv.penjamin);

        out.push(hr('-'));

        /* ── Rincian item ──
         * Nama obat/tindakan sering panjang, jadi dipakai dua baris:
         *   baris 1 : nama (boleh membungkus)
         *   baris 2 : qty x harga [disc]        ............  subtotal baris
         */
        for (var i = 0; i < items.length; i++) {
            var it   = items[i] || {};
            var qty  = bersihAngka(it.quantity);
            var hrg  = bersihAngka(it.unit_price);
            var disc = bersihAngka(it.discount_pct);
            var net  = bersihAngka(it.line_total);

            bungkus(translit(it.item_name || '(tanpa nama)'), lebar).forEach(function (b) {
                out.push(ln(b));
            });

            /* Indentasi dua spasi supaya baris kuantitas terbaca bersarang di
             * bawah nama item. Tidak lewat duaKolom() karena bungkus() memangkas
             * spasi awal — di sini indentasi itu justru yang dipertahankan. */
            var kanan = fmtNum(net);
            var kiri  = '  ' + fmtNum(qty) + ' x ' + fmtNum(hrg)
                      + (disc > 0 ? ' -' + fmtNum(disc) + '%' : '');

            if (kiri.length + 1 + kanan.length <= lebar) {
                out.push(ln(padKanan(kiri, lebar - kanan.length) + kanan));
            } else {
                /* Kertas 58mm dengan angka besar: pecah jadi dua baris
                 * ketimbang memotong nominal. */
                out.push(ln(potong(kiri, lebar)));
                out.push(ln(padKiri(kanan, lebar)));
            }
        }

        out.push(hr('-'));

        /* ── Ringkasan nilai ──
         * `r` dan `totalTampil` sudah dihitung di atas. Angka di database
         * adalah kebenaran, bukan hasil hitung ulang dari baris item. */
        if (r.diskon > 0.5) {
            duaKolom('Subtotal', fmtNum(r.subtotal), lebar).forEach(function (b) { out.push(ln(b)); });
            duaKolom('Diskon',  '-' + fmtNum(r.diskon), lebar).forEach(function (b) { out.push(ln(b)); });
        }
        duaKolom('TOTAL', fmtNum(totalTampil), lebar).forEach(function (b) {
            out.push(ln(b, { b: true }));
        });

        /* ── Pembayaran ── */
        var tampilBayar = (opsi.tampilkanPembayaran !== false)
                       && (t.tampilRincianBayar !== false);

        if (tampilBayar && (bayar.length || rb.dibayar > 0)) {
            out.push(hr('-'));

            /* Baris menjorok: kiri rata kiri, kanan rata kanan, spasi awal
             * dipertahankan. Tidak lewat duaKolom() karena bungkus() di
             * dalamnya memangkas spasi depan — sama alasannya dengan baris
             * kuantitas di rincian item. */
            function barisJorok(kiri, kanan, tebal) {
                if (kiri.length + 1 + kanan.length <= lebar) {
                    out.push(ln(padKanan(kiri, lebar - kanan.length) + kanan, { b: !!tebal }));
                } else {
                    out.push(ln(potong(kiri, lebar), { b: !!tebal }));
                    out.push(ln(padKiri(kanan, lebar), { b: !!tebal }));
                }
            }

            if (bayar.length) {
                for (var j = 0; j < bayar.length; j++) {
                    var p   = bayar[j] || {};
                    var lbl = LABEL_METODE[p.method] || translit(p.method || 'Bayar');
                    var tgl = fmtTgl(p.paid_at);
                    duaKolom(lbl + (tgl ? ' ' + tgl : ''), fmtNum(p.amount), lebar)
                        .forEach(function (b) { out.push(ln(b)); });

                    /* Uang tunai yang diserahkan dan kembaliannya.
                     * cash_received menyimpan uang yang diterima, BUKAN yang
                     * ditagihkan ke invoice — amount tetap jumlah yang menutup
                     * tagihan. Kembalian tidak pernah disimpan, selalu dihitung
                     * di sini, supaya tidak ada angka turunan yang bisa
                     * bertentangan dengan sumbernya. */
                    var diterima = bersihAngka(p.cash_received);
                    var kembali  = diterima - bersihAngka(p.amount);
                    if (diterima > 0 && kembali > 0.5) {
                        barisJorok('  Uang diterima', fmtNum(diterima), false);
                        barisJorok('  Kembali',       fmtNum(kembali),  true);
                    }
                }
                if (bayar.length > 1) {
                    duaKolom('Total Bayar', fmtNum(rb.dibayar), lebar)
                        .forEach(function (b) { out.push(ln(b, { b: true })); });
                }
            } else {
                duaKolom('Dibayar', fmtNum(rb.dibayar), lebar)
                    .forEach(function (b) { out.push(ln(b)); });
            }

            duaKolom(rb.sisa > 0.5 ? 'SISA TAGIHAN' : 'Sisa',
                     fmtNum(rb.sisa), lebar)
                .forEach(function (b) { out.push(ln(b, { b: rb.sisa > 0.5 })); });
        }

        /* ── Stempel status ──
         * Membaca `rb` yang sama dengan judul di atas. */
        if (t.tampilStempel !== false) {
            out.push(hr('='));
            var stempel = rb.status === 'lunas'    ? t.capLunas
                        : rb.status === 'sebagian' ? t.capSebagian
                        :                            t.capBelumLunas;
            out.push(ln(stempel, { a: 'c', b: true }));
            out.push(hr('='));
        }

        /* ── Catatan & kaki ── */
        if (inv.notes) {
            out.push(sp());
            out.push(ln('Catatan:'));
            bungkus(translit(inv.notes), lebar).forEach(function (b) { out.push(ln(b)); });
        }

        out.push(sp());
        var kaki = t.catatanKaki || bisnis.catatanKaki || 'Terima kasih atas kepercayaan Anda';
        bungkus(translit(kaki), lebar).forEach(function (b) {
            out.push(ln(b, { a: 'c' }));
        });

        if (Array.isArray(t.barisKaki)) {
            t.barisKaki.forEach(function (baris) {
                if (!baris) return;
                bungkus(translit(baris), lebar).forEach(function (b) {
                    out.push(ln(b, { a: 'c' }));
                });
            });
        }

        /* Nama kasir di kaki struk. Di portal tidak ada karena semua orang
           memakai satu sandi bersama; di RME setiap orang masuk dengan
           akunnya sendiri, jadi struk bisa menyebut siapa yang menerima
           uangnya — yang justru paling dibutuhkan saat tutup kas tidak cocok. */
        if (opsi.petugas && t.tampilPetugas) {
            out.push(ln('Kasir: ' + translit(opsi.petugas), { a: 'c' }));
        }

        if (opsi.dicetakPada && t.tampilWaktuCetak !== false) {
            out.push(ln(translit(opsi.dicetakPada), { a: 'c' }));
        }

        return out;
    }

    /* ── Renderer 1: teks polos (pratinjau di layar) ────────────────────── */

    function keTeks(baris, lebarMm) {
        var lebar = KOLOM[lebarMm] || KOLOM[58];
        var out = [];
        (baris || []).forEach(function (b) {
            if (b.k === 'hr')      out.push(garis(b.ch, lebar));
            else if (b.k === 'sp') out.push('');
            else if (b.a === 'c')  out.push(tengah(b.t, lebar));
            else if (b.a === 'r')  out.push(padKiri(b.t, lebar));
            else                   out.push(potong(b.t, lebar));
        });
        return out.join('\n');
    }

    /* ── Renderer 2: ESC/POS (Bluetooth & USB) ──────────────────────────── */

    function keEscPos(baris, opsi) {
        var o      = opsi || {};
        var lebar  = KOLOM[o.lebarMm] || KOLOM[58];
        var buf    = [];

        function push() {
            for (var i = 0; i < arguments.length; i++) buf.push(arguments[i]);
        }
        function tulis(s) {
            var t = translit(s);
            for (var i = 0; i < t.length; i++) {
                var c = t.charCodeAt(i);
                buf.push(c > 127 ? 63 : c);   // 63 = '?'
            }
        }

        push(ESC, 64);          // ESC @  — reset printer
        push(ESC, 116, 0);      // ESC t 0 — code page CP437

        (baris || []).forEach(function (b) {
            if (b.k === 'hr') {
                push(ESC, 97, 0); push(ESC, 69, 0); push(GS, 33, 0);
                tulis(garis(b.ch, lebar));
                push(LF);
                return;
            }
            if (b.k === 'sp') { push(LF); return; }

            /* Rata: ESC a n  (0 kiri, 1 tengah, 2 kanan).
             * Teks tengah dikirim tanpa padding manual supaya printer yang
             * mengabaikan ESC a tetap menghasilkan baris rata kiri yang rapi
             * ketimbang baris dengan spasi menggantung. */
            push(ESC, 97, b.a === 'c' ? 1 : b.a === 'r' ? 2 : 0);
            push(ESC, 69, b.b ? 1 : 0);                        // ESC E — tebal

            /* GS ! n — n = (lebarGanda-1)<<4 | (tinggiGanda-1) */
            var ukuran = b.s === 2 ? 0x11 : b.s === 1 ? 0x01 : 0x00;
            push(GS, 33, ukuran);

            /* Ukuran ganda memakan dua kali lebar kolom. */
            var maks = (b.s === 2) ? Math.floor(lebar / 2) : lebar;
            tulis(potong(b.t, maks));
            push(LF);
        });

        /* Kembali ke keadaan normal, dorong kertas, potong bila ada pemotong. */
        push(ESC, 69, 0);
        push(GS, 33, 0);
        push(ESC, 97, 0);
        push(ESC, 100, o.barisKosongAkhir == null ? 4 : o.barisKosongAkhir);  // ESC d n
        if (o.potongKertas !== false) push(GS, 86, 66, 0);                     // GS V B 0

        return new Uint8Array(buf);
    }

    /* ── Renderer 3: HTML (dialog cetak — satu-satunya jalur di iOS) ─────── */

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function keHtml(baris, opsi) {
        var o      = opsi || {};
        var mm     = (o.lebarMm === 80) ? 80 : 58;
        var lebar  = KOLOM[mm];
        /* Acuannya lebar CETAK, bukan lebar kertas. Kepala cetak 58mm hanya
         * menjangkau 48mm (384 dot @ 203dpi) dan yang 80mm hanya 72mm
         * (576 dot). Sisa kertas di kiri-kanan mustahil dicetak, jadi memakai
         * lebar kertas membuat sisi kanan struk terpotong tanpa peringatan. */
        var cetakMm = (mm === 80) ? 72 : 48;
        var tepiMm  = (mm - cetakMm) / 2;
        /* Courier New: satu karakter = 0.60 em, jadi
         *     ukuran_huruf = lebar_karakter / 0.60 = lebar_karakter x 1.667.
         * Dipakai 1.63 supaya tersisa ~2% dan baris tidak pernah membungkus
         * gara-gara pembulatan sub-piksel. */
        var fontPt = (cetakMm / lebar) * 1.63;

        var isi = (baris || []).map(function (b) {
            if (b.k === 'hr') return '<div class="l">' + escHtml(garis(b.ch, lebar)) + '</div>';
            if (b.k === 'sp') return '<div class="l">&nbsp;</div>';
            var kelas = 'l' + (b.a === 'c' ? ' c' : b.a === 'r' ? ' r' : '')
                            + (b.b ? ' b' : '') + (b.s ? ' s' + b.s : '');
            return '<div class="' + kelas + '">' + (escHtml(b.t) || '&nbsp;') + '</div>';
        }).join('\n');

        return '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>' + escHtml(o.judul || 'Struk') + '</title><style>' +
            '@page{size:' + mm + 'mm auto;margin:0}' +
            'html,body{margin:0;padding:0;background:#fff}' +
            'body{width:' + mm + 'mm;padding:3mm ' + tepiMm + 'mm 8mm;box-sizing:border-box;' +
              'font-family:"Courier New",Courier,monospace;' +
              'font-size:' + fontPt.toFixed(2) + 'mm;line-height:1.35;color:#000}' +
            '.l{white-space:pre;letter-spacing:0}' +
            '.c{text-align:center}.r{text-align:right}.b{font-weight:700}' +
            '.s1{font-size:1.35em;font-weight:700}' +
            '.s2{font-size:1.35em;font-weight:700;letter-spacing:.05em}' +
            '@media print{html,body{width:' + mm + 'mm}}' +
            '</style></head><body>' + isi + '</body></html>';
    }

    /* ── Ekspor ────────────────────────────────────────────────────────── */

    var API = {
        KOLOM: KOLOM,
        translit: translit,
        fmtNum: fmtNum,
        fmtTgl: fmtTgl,
        potong: potong,
        padKanan: padKanan,
        padKiri: padKiri,
        tengah: tengah,
        bungkus: bungkus,
        duaKolom: duaKolom,
        garis: garis,
        ringkasItem: ringkasItem,
        ringkasBayar: ringkasBayar,
        tplStruk: tplStruk,
        susunStruk: susunStruk,
        keTeks: keTeks,
        keEscPos: keEscPos,
        keHtml: keHtml
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else global.StrukCore = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);

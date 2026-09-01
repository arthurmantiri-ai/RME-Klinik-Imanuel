/* ============================================================================
 *  struk_printer.js — TRANSPORT PRINTER THERMAL
 *
 *  Tiga jalur, dipilih sesuai kemampuan perangkat:
 *
 *    1. Bluetooth (Web Bluetooth)  — Chrome/Edge Android & desktop.
 *    2. USB OTG   (WebUSB)         — Chrome/Edge Android & desktop.
 *    3. Dialog cetak HTML          — SEMUA perangkat, termasuk iPhone/iPad.
 *
 *  CATATAN JUJUR SOAL iOS
 *  ----------------------
 *  Safari (dan semua browser di iOS, karena semuanya wajib memakai WebKit)
 *  tidak mendukung Web Bluetooth maupun WebUSB, dan tim WebKit menyatakan
 *  menolak jenis API akses perangkat semacam ini. Jadi di iPhone/iPad HANYA
 *  jalur ke-3 yang tersedia. dukungan() mengembalikan fakta ini supaya UI bisa
 *  menyembunyikan tombol yang mustahil, bukan menampilkannya lalu gagal.
 *
 *  Semua penyusunan byte ada di struk_core.js. Berkas ini hanya mengurus
 *  koneksi, izin, potongan pengiriman, dan kegagalan.
 * ==========================================================================*/
(function (global) {
    'use strict';

    var KUNCI_SIMPAN = 'ki_printer_pref_v1';

    /* Service GATT yang dipakai printer thermal 58/80mm di pasaran. Chrome
     * hanya mengizinkan akses ke service yang didaftarkan di optionalServices,
     * jadi daftar ini harus lengkap sebelum requestDevice dipanggil. */
    var SERVIS_BLE = [
        '000018f0-0000-1000-8000-00805f9b34fb',  // paling umum (char 2af1)
        '0000ff00-0000-1000-8000-00805f9b34fb',  // char ff02
        '0000ffe0-0000-1000-8000-00805f9b34fb',  // modul HM-10
        '0000ae30-0000-1000-8000-00805f9b34fb',  // sebagian merek Tiongkok
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // ISSC / Microchip transparent UART
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',  // beberapa model portabel
        '0000fee7-0000-1000-8000-00805f9b34fb'
    ];

    var st = {
        modeAktif:  null,   // 'ble' | 'usb' | 'cetak'
        bleDevice:  null,
        bleChar:    null,
        usbDevice:  null,
        usbEndpoint: null,
        usbInterface: null
    };

    /* ── Utilitas ──────────────────────────────────────────────────────── */

    function tidur(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    function adalahIOS() {
        var ua = navigator.userAgent || '';
        // iPadOS 13+ menyamar sebagai Macintosh; dibedakan lewat layar sentuh.
        return /iPad|iPhone|iPod/.test(ua) ||
               (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    }

    function dukungan() {
        var ios = adalahIOS();
        return {
            ble:   !ios && typeof navigator !== 'undefined' && !!navigator.bluetooth,
            usb:   !ios && typeof navigator !== 'undefined' && !!navigator.usb,
            cetak: true,
            ios:   ios,
            /* Web Bluetooth & WebUSB hanya jalan di secure context. Netlify
             * sudah HTTPS, tapi pengembangan lokal lewat http:// akan gagal
             * dengan pesan yang membingungkan kalau tidak dijelaskan. */
            secureContext: (typeof isSecureContext === 'undefined') ? true : isSecureContext
        };
    }

    function bacaPref() {
        try { return JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || '{}') || {}; }
        catch (e) { return {}; }
    }

    function simpanPref(obj) {
        try {
            var lama = bacaPref();
            var baru = {};
            for (var k in lama) if (Object.prototype.hasOwnProperty.call(lama, k)) baru[k] = lama[k];
            for (var j in obj)  if (Object.prototype.hasOwnProperty.call(obj, j))  baru[j] = obj[j];
            localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(baru));
        } catch (e) { /* mode privat / kuota penuh — bukan alasan gagal cetak */ }
    }

    function lebarTersimpan() {
        var p = bacaPref();
        return (p.lebarMm === 80) ? 80 : 58;
    }

    /* ── Jalur 1: BLUETOOTH ────────────────────────────────────────────── */

    function pesanBleRamah(err) {
        var m = String((err && (err.message || err.name)) || err);
        if (/User cancelled|chooser was cancelled/i.test(m))
            return 'Pemilihan printer dibatalkan.';
        if (/globally disabled|Bluetooth adapter not available|turned off/i.test(m))
            return 'Bluetooth mati. Nyalakan Bluetooth di HP, lalu coba lagi.';
        if (/secure context|https/i.test(m))
            return 'Bluetooth hanya bisa dipakai lewat HTTPS. Buka situs versi https://.';
        if (/GATT operation failed|Connection Error|disconnected/i.test(m))
            return 'Koneksi ke printer terputus. Matikan lalu nyalakan printer, kemudian sambungkan ulang.';
        return m;
    }

    /* Menelusuri seluruh service milik perangkat dan mengambil characteristic
     * pertama yang bisa ditulisi. Lebih tahan banting daripada menghafal satu
     * pasang UUID, karena tiap merek memakai pasangan yang berbeda. */
    async function cariCharTulis(server) {
        var servis = await server.getPrimaryServices();
        for (var i = 0; i < servis.length; i++) {
            var chars;
            try { chars = await servis[i].getCharacteristics(); }
            catch (e) { continue; }
            for (var j = 0; j < chars.length; j++) {
                var p = chars[j].properties;
                if (p && (p.write || p.writeWithoutResponse)) return chars[j];
            }
        }
        return null;
    }

    async function sambungBleKe(device) {
        var server = await device.gatt.connect();
        var ch = await cariCharTulis(server);
        if (!ch) {
            try { device.gatt.disconnect(); } catch (e) {}
            throw new Error(
                'Printer tersambung tetapi tidak punya jalur tulis yang dikenali. ' +
                'Kemungkinan besar perangkat yang dipilih bukan printer, atau memakai ' +
                'service khusus yang belum terdaftar.');
        }

        device.addEventListener('gattserverdisconnected', function () {
            if (st.bleDevice === device) { st.bleChar = null; }
        });

        st.bleDevice = device;
        st.bleChar   = ch;
        st.modeAktif = 'ble';
        simpanPref({ mode: 'ble', bleNama: device.name || '' });
        return device;
    }

    async function pilihBluetooth() {
        var d = dukungan();
        if (!d.ble) {
            throw new Error(d.ios
                ? 'iPhone dan iPad tidak mendukung Bluetooth dari browser. Gunakan tombol Cetak (dialog printer).'
                : 'Browser ini tidak mendukung Web Bluetooth. Pakai Chrome atau Edge.');
        }
        if (!d.secureContext) throw new Error('Halaman harus dibuka lewat HTTPS.');

        try {
            var device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: SERVIS_BLE
            });
            return await sambungBleKe(device);
        } catch (err) {
            throw new Error(pesanBleRamah(err));
        }
    }

    /* Menyambung ulang tanpa dialog, memakai izin yang sudah pernah diberikan.
     * getDevices() belum ada di semua versi Chrome, jadi kegagalan di sini
     * bukan error — cukup kembalikan false dan biarkan pengguna memilih manual. */
    async function sambungUlangBle() {
        if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
        try {
            var pref = bacaPref();
            var list = await navigator.bluetooth.getDevices();
            if (!list || !list.length) return false;

            var target = null;
            for (var i = 0; i < list.length; i++) {
                if (pref.bleNama && list[i].name === pref.bleNama) { target = list[i]; break; }
            }
            if (!target) target = list[0];

            await sambungBleKe(target);
            return true;
        } catch (e) { return false; }
    }

    async function kirimBle(bytes, opsi) {
        if (!st.bleChar || !st.bleDevice || !st.bleDevice.gatt.connected) {
            if (st.bleDevice) {
                try { await sambungBleKe(st.bleDevice); }
                catch (e) { throw new Error(pesanBleRamah(e)); }
            } else {
                throw new Error('Printer Bluetooth belum dipilih.');
            }
        }

        var o        = opsi || {};
        /* BLE mengirim potongan kecil. Terlalu besar atau terlalu cepat membuat
         * printer murah membuang sebagian data tanpa memberi tahu — hasilnya
         * struk terpotong di tengah. 180 byte / 20 ms konservatif dan aman. */
        var potongan = o.potonganByte || 180;
        var jeda     = (o.jedaMs == null) ? 20 : o.jedaMs;
        var pakaiTanpaBalasan = !!(st.bleChar.properties &&
                                   st.bleChar.properties.writeWithoutResponse);

        for (var i = 0; i < bytes.length; i += potongan) {
            var bagian = bytes.slice(i, i + potongan);
            if (pakaiTanpaBalasan && st.bleChar.writeValueWithoutResponse) {
                await st.bleChar.writeValueWithoutResponse(bagian);
            } else if (st.bleChar.writeValueWithResponse) {
                await st.bleChar.writeValueWithResponse(bagian);
            } else {
                await st.bleChar.writeValue(bagian);
            }
            if (jeda) await tidur(jeda);
            if (typeof o.onKemajuan === 'function') {
                o.onKemajuan(Math.min(i + potongan, bytes.length), bytes.length);
            }
        }
    }

    /* ── Jalur 2: USB ──────────────────────────────────────────────────── */

    function cariEndpointKeluar(device) {
        var konf = device.configuration;
        if (!konf) return null;
        var kandidat = null;

        for (var i = 0; i < konf.interfaces.length; i++) {
            var itf = konf.interfaces[i];
            for (var a = 0; a < itf.alternates.length; a++) {
                var alt = itf.alternates[a];
                for (var e = 0; e < alt.endpoints.length; e++) {
                    var ep = alt.endpoints[e];
                    if (ep.direction !== 'out' || ep.type !== 'bulk') continue;
                    var hasil = {
                        interfaceNumber: itf.interfaceNumber,
                        alternateSetting: alt.alternateSetting,
                        endpointNumber: ep.endpointNumber
                    };
                    /* Kelas 7 = Printer. Diutamakan; selain itu disimpan
                     * sebagai cadangan karena banyak printer memakai kelas
                     * vendor-specific (0xFF). */
                    if (alt.interfaceClass === 7) return hasil;
                    if (!kandidat) kandidat = hasil;
                }
            }
        }
        return kandidat;
    }

    async function siapkanUsb(device) {
        if (!device.opened) await device.open();
        if (!device.configuration) await device.selectConfiguration(1);

        var titik = cariEndpointKeluar(device);
        if (!titik) {
            try { await device.close(); } catch (e) {}
            throw new Error('Perangkat USB ini tidak punya jalur cetak (bulk out). ' +
                            'Pastikan yang dipilih memang printer.');
        }

        try {
            await device.claimInterface(titik.interfaceNumber);
        } catch (e) {
            try { await device.close(); } catch (e2) {}
            throw new Error(
                'Sistem operasi masih memegang printer ini, jadi browser tidak bisa memakainya. ' +
                'Di Windows: pasang driver WinUSB lewat Zadig. Di Android biasanya tidak perlu apa-apa — ' +
                'cabut lalu pasang ulang kabel OTG.');
        }

        if (titik.alternateSetting) {
            try { await device.selectAlternateInterface(titik.interfaceNumber, titik.alternateSetting); }
            catch (e) { /* banyak printer hanya punya alternate 0 */ }
        }

        st.usbDevice    = device;
        st.usbEndpoint  = titik.endpointNumber;
        st.usbInterface = titik.interfaceNumber;
        st.modeAktif    = 'usb';
        simpanPref({
            mode: 'usb',
            usbVendor:  device.vendorId,
            usbProduk:  device.productId,
            usbSerial:  device.serialNumber || ''
        });
        return device;
    }

    async function pilihUsb(tampilkanSemua) {
        var d = dukungan();
        if (!d.usb) {
            throw new Error(d.ios
                ? 'iPhone dan iPad tidak mendukung USB dari browser. Gunakan tombol Cetak (dialog printer).'
                : 'Browser ini tidak mendukung WebUSB. Pakai Chrome atau Edge.');
        }
        if (!d.secureContext) throw new Error('Halaman harus dibuka lewat HTTPS.');

        var device = await navigator.usb.requestDevice({
            filters: tampilkanSemua ? [] : [{ classCode: 7 }]
        });
        return await siapkanUsb(device);
    }

    async function sambungUlangUsb() {
        if (!navigator.usb || !navigator.usb.getDevices) return false;
        try {
            var pref = bacaPref();
            var list = await navigator.usb.getDevices();
            if (!list || !list.length) return false;

            var target = null;
            for (var i = 0; i < list.length; i++) {
                if (list[i].vendorId === pref.usbVendor &&
                    list[i].productId === pref.usbProduk) { target = list[i]; break; }
            }
            if (!target) target = list[0];

            await siapkanUsb(target);
            return true;
        } catch (e) { return false; }
    }

    async function kirimUsb(bytes, opsi) {
        if (!st.usbDevice) throw new Error('Printer USB belum dipilih.');
        var o = opsi || {};
        var potongan = o.potonganByte || 4096;

        for (var i = 0; i < bytes.length; i += potongan) {
            var hasil = await st.usbDevice.transferOut(
                st.usbEndpoint, bytes.slice(i, i + potongan));
            if (hasil && hasil.status !== 'ok') {
                throw new Error('Printer menolak data (status: ' + hasil.status + ').');
            }
            if (typeof o.onKemajuan === 'function') {
                o.onKemajuan(Math.min(i + potongan, bytes.length), bytes.length);
            }
        }
    }

    /* ── Jalur 3: DIALOG CETAK HTML ────────────────────────────────────── */
    /*
     *  Harus dipanggil dari dalam penanganan ketukan pengguna. Kalau ada
     *  `await` ke jaringan sebelum ini, iOS dan pemblokir pop-up akan
     *  menolaknya. Pola yang benar: ambil data dulu, tampilkan pratinjau,
     *  baru pengguna menekan "Cetak".
     */
    function cetakHtml(html) {
        return new Promise(function (selesai, gagal) {
            var bingkai = document.createElement('iframe');
            bingkai.setAttribute('aria-hidden', 'true');
            /* PENTING — jangan pakai width/height 0 atau visibility:hidden.
             * Iframe tanpa kotak layout tidak dirender, sehingga window.print()
             * menghasilkan halaman kosong: yang keluar hanya header dan footer
             * bawaan Chrome (tanggal, judul halaman induk, URL, nomor halaman).
             * Sembunyikan dengan menggeser keluar layar, bukan meniadakannya. */
            bingkai.style.cssText =
                'position:fixed;left:-10000px;top:0;width:100mm;height:400mm;' +
                'border:0;background:#fff';

            var sudah = false;
            var jamPengaman = null;

            function bersihkan() {
                if (sudah) return;
                sudah = true;
                if (jamPengaman) { clearTimeout(jamPengaman); jamPengaman = null; }
                setTimeout(function () {
                    if (bingkai.parentNode) bingkai.parentNode.removeChild(bingkai);
                }, 2000);
            }

            bingkai.onload = function () {
                var w = null;
                try { w = bingkai.contentWindow; } catch (e) { w = null; }
                if (!w) {
                    bersihkan();
                    gagal(new Error('Gagal menyiapkan halaman cetak.'));
                    return;
                }

                /* Di sebagian peramban print() tidak memblokir. Menghapus iframe
                 * terlalu cepat membuat pratinjau jadi kosong, jadi pembersihan
                 * dipicu oleh afterprint dengan pengaman waktu. */
                try { w.addEventListener('afterprint', bersihkan); } catch (e) {}

                function mulai() {
                    try {
                        jamPengaman = setTimeout(bersihkan, 60000);
                        w.focus();
                        w.print();
                        selesai(true);
                    } catch (e) {
                        bersihkan();
                        gagal(new Error('Dialog cetak tidak bisa dibuka: ' + (e.message || e)));
                    }
                }

                /* srcdoc memicu onload sebelum tata letak dan font selesai.
                 * Dua putaran rAF plus jeda pendek memastikan isi sudah siap
                 * sebelum dialog cetak dibuka. */
                if (w.requestAnimationFrame) {
                    w.requestAnimationFrame(function () {
                        w.requestAnimationFrame(function () { setTimeout(mulai, 60); });
                    });
                } else {
                    setTimeout(mulai, 150);
                }
            };
            bingkai.onerror = function () {
                bersihkan();
                gagal(new Error('Gagal menyiapkan halaman cetak.'));
            };

            document.body.appendChild(bingkai);
            bingkai.srcdoc = html;
        });
    }

    /* Cadangan bila iframe diblokir: buka tab baru. Wajib dari gestur pengguna. */
    function cetakJendelaBaru(html) {
        var w = window.open('', '_blank');
        if (!w) throw new Error('Pop-up diblokir. Izinkan pop-up untuk situs ini, lalu coba lagi.');
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 350);
        return true;
    }

    /* ── Antarmuka utama ───────────────────────────────────────────────── */

    /*  cetak(bytes, { htmlCadangan, ... })
     *  Mengirim lewat jalur yang aktif. Kalau tidak ada printer tersambung dan
     *  htmlCadangan tersedia, langsung jatuh ke dialog cetak.
     */
    async function cetak(bytes, opsi) {
        var o = opsi || {};

        if (st.modeAktif === 'ble' && st.bleDevice) {
            await kirimBle(bytes, o);
            return { jalur: 'ble' };
        }
        if (st.modeAktif === 'usb' && st.usbDevice) {
            await kirimUsb(bytes, o);
            return { jalur: 'usb' };
        }
        if (o.htmlCadangan) {
            await cetakHtml(o.htmlCadangan);
            return { jalur: 'cetak' };
        }
        throw new Error('Belum ada printer yang dipilih.');
    }

    function status() {
        var terhubung =
            (st.modeAktif === 'ble' && st.bleDevice && st.bleDevice.gatt && st.bleDevice.gatt.connected) ||
            (st.modeAktif === 'usb' && !!st.usbDevice);
        return {
            mode: st.modeAktif,
            terhubung: !!terhubung,
            nama: st.modeAktif === 'ble'
                    ? ((st.bleDevice && st.bleDevice.name) || 'Printer Bluetooth')
                : st.modeAktif === 'usb'
                    ? ((st.usbDevice && st.usbDevice.productName) || 'Printer USB')
                : null,
            lebarMm: lebarTersimpan()
        };
    }

    async function putus() {
        try { if (st.bleDevice && st.bleDevice.gatt.connected) st.bleDevice.gatt.disconnect(); } catch (e) {}
        try {
            if (st.usbDevice) {
                if (st.usbInterface != null) await st.usbDevice.releaseInterface(st.usbInterface);
                await st.usbDevice.close();
            }
        } catch (e) {}
        st.modeAktif = null; st.bleDevice = null; st.bleChar = null;
        st.usbDevice = null; st.usbEndpoint = null; st.usbInterface = null;
        simpanPref({ mode: null });
    }

    /* Dipanggil sekali saat halaman dimuat. Tidak pernah melempar error —
     * gagal menyambung ulang bukan keadaan gawat, cuma berarti pengguna
     * perlu satu ketukan tambahan. */
    async function sambungUlangOtomatis() {
        var pref = bacaPref();
        if (pref.mode === 'ble') return await sambungUlangBle();
        if (pref.mode === 'usb') return await sambungUlangUsb();
        return false;
    }

    global.StrukPrinter = {
        dukungan: dukungan,
        status: status,
        pilihBluetooth: pilihBluetooth,
        pilihUsb: pilihUsb,
        cetak: cetak,
        cetakHtml: cetakHtml,
        cetakJendelaBaru: cetakJendelaBaru,
        putus: putus,
        sambungUlangOtomatis: sambungUlangOtomatis,
        lebarTersimpan: lebarTersimpan,
        setLebar: function (mm) { simpanPref({ lebarMm: (mm === 80 ? 80 : 58) }); },
        bacaPref: bacaPref
    };

})(typeof window !== 'undefined' ? window : this);

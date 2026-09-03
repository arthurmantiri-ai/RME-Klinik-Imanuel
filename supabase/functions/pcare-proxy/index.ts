/* =====================================================================
 *  EDGE FUNCTION: pcare-proxy
 *  ---------------------------------------------------------------------
 *  Jembatan aman antara aplikasi RME dan Webservice PCare BPJS Kesehatan.
 *
 *  Mengapa lewat sini, bukan langsung dari browser?
 *   1. Kredensial BPJS tidak boleh sampai ke perangkat pengguna.
 *   2. PCare memblokir permintaan lintas-asal (CORS) dari browser.
 *   3. Respons PCare terenkripsi + terkompresi; pembongkarannya di server.
 *
 *  Secret yang harus diisi (Dashboard Supabase → Edge Functions → Secrets):
 *    PCARE_BASE_URL     https://apijkn.bpjs-kesehatan.go.id/pcare-rest
 *                       (uji coba: https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev)
 *    PCARE_CONS_ID      dari BPJS
 *    PCARE_SECRET_KEY   dari BPJS
 *    PCARE_USER_KEY     dari BPJS
 *    PCARE_USERNAME     akun PCare klinik
 *    PCARE_PASSWORD     kata sandi akun PCare
 *    PCARE_KD_APLIKASI  kode aplikasi (biasanya "095")
 *
 *  CATATAN PENTING: skema tanda tangan & enkripsi di bawah mengikuti pola
 *  Webservice PCare yang berlaku umum. Setelah kredensial diterima,
 *  cocokkan sekali lagi dengan dokumen TrustMark resmi dari BPJS — bila
 *  ada perbedaan, cukup sesuaikan fungsi buatTandaTangan() dan bongkar().
 * ===================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import LZString from 'https://esm.sh/lz-string@1.5.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/* ---------------------------------------------------------------------
 *  Tanda tangan: HMAC-SHA256 atas "consId&timestamp", hasilnya base64
 * ------------------------------------------------------------------- */
async function buatTandaTangan(consId: string, secretKey: string, timestamp: string) {
  const kunci = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const tanda = await crypto.subtle.sign(
    'HMAC', kunci, new TextEncoder().encode(`${consId}&${timestamp}`)
  );
  return btoa(String.fromCharCode(...new Uint8Array(tanda)));
}

/* ---------------------------------------------------------------------
 *  Bongkar respons: AES-256-CBC lalu LZ-String
 *  Kunci   = SHA-256(consId + secretKey + timestamp)
 *  IV      = 16 byte pertama dari kunci
 * ------------------------------------------------------------------- */
async function bongkar(terenkripsi: string, consId: string, secretKey: string, timestamp: string) {
  const bahanKunci = new TextEncoder().encode(consId + secretKey + timestamp);
  const hash = await crypto.subtle.digest('SHA-256', bahanKunci);
  const kunciBytes = new Uint8Array(hash);
  const iv = kunciBytes.slice(0, 16);

  const kunci = await crypto.subtle.importKey(
    'raw', kunciBytes, { name: 'AES-CBC' }, false, ['decrypt']
  );
  const data = Uint8Array.from(atob(terenkripsi), (c) => c.charCodeAt(0));
  const polos = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, kunci, data);
  const teks = new TextDecoder().decode(polos);

  // Hasil dekripsi masih terkompresi LZ-String
  const hasil = LZString.decompressFromEncodedURIComponent(teks);
  return hasil ?? teks;
}

/* ---------------------------------------------------------------------
 *  Panggil satu endpoint PCare
 * ------------------------------------------------------------------- */
async function panggilPcare(jalur: string, metode = 'GET', badan: unknown = null) {
  const baseUrl  = Deno.env.get('PCARE_BASE_URL') ?? '';
  const consId   = Deno.env.get('PCARE_CONS_ID') ?? '';
  const secret   = Deno.env.get('PCARE_SECRET_KEY') ?? '';
  const userKey  = Deno.env.get('PCARE_USER_KEY') ?? '';
  const username = Deno.env.get('PCARE_USERNAME') ?? '';
  const password = Deno.env.get('PCARE_PASSWORD') ?? '';
  const kdApl    = Deno.env.get('PCARE_KD_APLIKASI') ?? '095';

  if (!baseUrl || !consId || !secret || !userKey) {
    throw new Error('Kredensial PCare belum lengkap. Isi Secret di Edge Function terlebih dahulu.');
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await buatTandaTangan(consId, secret, timestamp);
  const auth = btoa(`${username}:${password}:${kdApl}`);

  const respons = await fetch(`${baseUrl}${jalur}`, {
    method: metode,
    headers: {
      'X-cons-id': consId,
      'X-timestamp': timestamp,
      'X-signature': signature,
      'X-authorization': `Basic ${auth}`,
      'user_key': userKey,
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json'
    },
    body: badan ? JSON.stringify(badan) : undefined
  });

  const mentah = await respons.text();
  let hasil: Record<string, unknown>;
  try { hasil = JSON.parse(mentah); }
  catch { throw new Error(`Respons PCare tidak dapat dibaca (HTTP ${respons.status}): ${mentah.slice(0, 200)}`); }

  // Bagian `response` datang dalam bentuk terenkripsi
  if (typeof hasil.response === 'string' && hasil.response.length > 0) {
    try {
      hasil.response = JSON.parse(await bongkar(hasil.response, consId, secret, timestamp));
    } catch (e) {
      hasil.catatan_bongkar = `Gagal membongkar respons: ${(e as Error).message}`;
    }
  }
  return { http: respons.status, data: hasil };
}

/* ---------------------------------------------------------------------
 *  Daftar operasi yang boleh dipanggil dari aplikasi.
 *  Sengaja memakai daftar putih agar aplikasi tidak bisa memanggil
 *  endpoint sembarangan.
 * ------------------------------------------------------------------- */
const OPERASI: Record<string, (p: Record<string, string>) => [string, string, unknown]> = {
  // Cek status kepesertaan berdasarkan nomor kartu BPJS
  'peserta.cari':      (p) => [`/peserta/${p.noKartu}`, 'GET', null],
  // Cek berdasarkan NIK
  'peserta.nik':       (p) => [`/peserta/nik/${p.nik}`, 'GET', null],
  /* ---------------------------------------------------------------
     Referensi.

     Jalur-jalur di bawah inilah asal nilai kolom `kode_pcare` pada
     tabel ref_kesadaran, ref_status_pulang, ref_prognosa,
     ref_subspesialis, ref_sarana, ref_alergi, dan ref_ppk. Kolom itu
     SENGAJA dibiarkan kosong di sql/14_periksa_terstruktur.sql: kodenya
     milik BPJS, dan menebaknya tidak menimbulkan galat apa pun — klaim
     tetap terkirim, tetap diterima, hanya isinya keliru.

     Daftar ini ditulis sekarang, selagi strukturnya masih segar, supaya
     pada hari kredensial datang yang perlu dikerjakan hanya menekan
     "Ambil dari PCare" di Pengaturan → Rujukan & Kode PCare.
     ------------------------------------------------------------- */
  'ref.poli':          () => ['/poli/fktp/0/100', 'GET', null],
  'ref.dokter':        () => ['/dokter/0/100', 'GET', null],
  'ref.diagnosa':      (p) => [`/diagnosa/${encodeURIComponent(p.kata)}/0/25`, 'GET', null],
  'ref.obat':          (p) => [`/obat/${encodeURIComponent(p.kata)}/0/25`, 'GET', null],
  'ref.kesadaran':     () => ['/kesadaran', 'GET', null],
  'ref.statuspulang':  () => ['/statuspulang', 'GET', null],
  'ref.prognosa':      () => ['/prognosa', 'GET', null],
  'ref.alergi':        (p) => [`/alergi/${encodeURIComponent(p.jenis)}`, 'GET', null],
  'ref.spesialis':     () => ['/spesialis', 'GET', null],
  'ref.subspesialis':  (p) => [`/spesialis/${encodeURIComponent(p.kdSpesialis)}/subspesialis`, 'GET', null],
  'ref.sarana':        () => ['/sarana', 'GET', null],
  'ref.faskes':        (p) => [`/faskes/${encodeURIComponent(p.kata)}/${p.jenis ?? '2'}`, 'GET', null],
  'ref.tindakan':      (p) => [`/tindakan/${encodeURIComponent(p.kata)}/0/25`, 'GET', null],
  // Pendaftaran kunjungan
  'kunjungan.daftar':  (p) => ['/pendaftaran', 'POST', p.payload],
  'kunjungan.ubah':    (p) => ['/pendaftaran', 'PUT', p.payload],
  'kunjungan.hapus':   (p) => [`/pendaftaran/peserta/${p.noKartu}/tglDaftar/${p.tglDaftar}/noUrut/${p.noUrut}`, 'DELETE', null],
  // Pelayanan (kunjungan sakit)
  'pelayanan.kirim':   (p) => ['/kunjungan', 'POST', p.payload],
  'pelayanan.ubah':    (p) => ['/kunjungan', 'PUT', p.payload],
  /* Obat dan tindakan dikirim TERPISAH setelah pelayanan tercatat dan
     PCare memulangkan noKunjungan — bukan sebagai bagian payload
     kunjungan. Bentuk barisnya sudah disiapkan view v_pcare_obat dan
     v_pcare_tindakan. */
  'obat.kirim':        (p) => ['/obat/kunjungan', 'POST', p.payload],
  'obat.hapus':        (p) => [`/obat/kunjungan/${p.kdObatSK}`, 'DELETE', null],
  'tindakan.kirim':    (p) => ['/tindakan', 'POST', p.payload],
  'tindakan.hapus':    (p) => [`/tindakan/${p.kdTindakanSK}`, 'DELETE', null]
};

/* ------------------------------- Server ------------------------------ */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const jawab = (badan: unknown, status = 200) =>
    new Response(JSON.stringify(badan), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  try {
    // Hanya pengguna yang sudah login di RME yang boleh memakai jembatan ini
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return jawab({ error: 'Tidak diizinkan' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jawab({ error: 'Sesi tidak valid' }, 401);

    const badan = await req.json();
    const { operasi, params = {}, kunjungan_id = null } = badan;

    const pembuat = OPERASI[operasi];
    if (!pembuat) return jawab({ error: `Operasi "${operasi}" tidak dikenal` }, 400);

    const [jalur, metode, muatan] = pembuat(params);
    const hasil = await panggilPcare(jalur, metode, muatan);

    // Catat ke bridging_log memakai service_role agar tidak terhalang RLS
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    // PCare menandai keberhasilan lewat metaData.code (200 atau 1)
    const kode = String((hasil.data as any)?.metaData?.code ?? hasil.http);
    const sukses = hasil.http < 400 && ['1', '200'].includes(kode);

    await admin.from('bridging_log').insert({
      sistem: 'PCARE',
      operasi,
      kunjungan_id,
      request: { operasi, params: { ...params, payload: undefined } },
      response: hasil.data,
      http_status: hasil.http,
      sukses,
      pesan_error: sukses ? null : JSON.stringify((hasil.data as any)?.metaData ?? hasil.data).slice(0, 500),
      dijalankan_oleh: user.id
    });

    return jawab({ sukses, http: hasil.http, data: hasil.data });

  } catch (e) {
    return jawab({ sukses: false, error: (e as Error).message }, 500);
  }
});

/* =====================================================================
 *  EDGE FUNCTION: antrol
 *  ---------------------------------------------------------------------
 *  Web service ANTREAN FKTP — pintu masuk dari aplikasi Mobile JKN.
 *
 *  ARAHNYA TERBALIK DARI pcare-proxy. Bacalah baris ini dua kali sebelum
 *  menyunting apa pun di bawah:
 *
 *      pcare-proxy   RME  ──panggil──▶  server BPJS
 *      antrol        BPJS ──panggil──▶  server KITA   ← berkas ini
 *
 *  Karena itu fungsi ini adalah SATU-SATUNYA bagian RME yang boleh
 *  dijalankan tanpa login Supabase. Ia harus dipasang dengan verifikasi
 *  JWT DIMATIKAN, kalau tidak BPJS akan selalu menerima 401:
 *
 *      supabase functions deploy antrol --no-verify-jwt
 *
 *  Yang menjaga pintunya bukan JWT melainkan header x-username dan
 *  x-password yang klinik serahkan ke BPJS saat UAT, dicocokkan dengan
 *  tabel antrol_akun (hash + salt, tidak pernah disimpan telanjang).
 *
 *  YANG SENGAJA TIDAK ADA DI BERKAS INI
 *  ------------------------------------
 *  Tidak ada satu pun aturan bisnis. Tidak ada pemeriksaan kuota, jadwal,
 *  format nomor kartu, atau duplikat. Semuanya hidup sebagai fungsi SQL
 *  (antrol_ambil, antrol_status, ...) yang diuji langsung oleh
 *  test/uji_antrean.sql. Alasannya sederhana: aturan yang ditulis di sini
 *  hanya bisa diuji dengan menjalankan Deno, yang berarti tidak akan
 *  pernah diuji — dan pintu ini menghadap internet terbuka.
 *
 *  Berkas ini hanya melakukan empat hal: memeriksa akun, menerjemahkan
 *  URL menjadi pemanggilan fungsi, mencatat log, dan mengubah jsonb
 *  jawaban menjadi HTTP.
 *
 *  ENDPOINT (sesuai "Daftar Web Service Integrasi Sistem Antrean" FKTP)
 *  --------------------------------------------------------------------
 *   GET  /auth
 *   GET  /antrean/status/{kodepoli}/{tanggal}
 *   POST /antrean                    { nomorkartu, nik, kodepoli, tanggalperiksa }
 *   GET  /antrean/sisapeserta/{nomorkartu}/{kodepoli}/{tanggal}
 *   POST /peserta                    { nomorkartu, nik, nama, ... }
 *   PUT  /antrean/batal              { nomorkartu, kodepoli, tanggalperiksa }
 *
 *  Alamat yang diserahkan ke BPJS adalah BASE URL fungsi ini:
 *      https://<ref>.supabase.co/functions/v1/antrol
 *  sehingga status antrean menjadi
 *      https://<ref>.supabase.co/functions/v1/antrol/antrean/status/001/2026-09-05
 *
 *  Secret yang harus diisi (Dashboard Supabase → Edge Functions → Secrets):
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (biasanya sudah otomatis)
 *      ANTROL_JWT_SECRET   kunci penanda token; isi teks acak panjang
 * ===================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-username, x-password, x-token, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
};

const db = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

/* ---------------------------------------------------------------------
 *  Jawaban baku.
 *
 *  "metadata" HURUF KECIL SEMUA. Spesifikasi PCare memakai "metaData"
 *  dengan D besar, dan mencampuradukkannya adalah kesalahan yang paling
 *  mudah dibuat di proyek yang memakai keduanya. Salah satu huruf di
 *  sini membuat Mobile JKN membaca seluruh jawaban kita sebagai gagal —
 *  tanpa galat apa pun yang terlihat dari sisi klinik.
 * ------------------------------------------------------------------- */
const gagal = (pesan: string, kode = 201) => ({ metadata: { message: pesan, code: kode } });

function jawab(badan: Record<string, unknown>, status?: number) {
  const kode = Number((badan?.metadata as Record<string, unknown>)?.code ?? 200);
  // BPJS membaca kode di metadata; status HTTP dibuat mengikutinya supaya
  // perkakas jaringan (dan log Supabase) menunjukkan hal yang sama.
  const http = status ?? (kode === 200 || kode === 202 ? 200 : kode === 201 ? 201 : 500);
  return new Response(JSON.stringify(badan), {
    status: http,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/* ---------------------------------------------------------------------
 *  Token: JWT sederhana bertanda HMAC-SHA256, berlaku 12 jam.
 *  Spesifikasi hanya menuliskan "contoh generate token dapat menggunakan
 *  [jwt]", jadi bentuknya bebas — yang penting kita bisa memeriksanya
 *  sendiri tanpa menyimpan apa pun.
 * ------------------------------------------------------------------- */
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const teksB64url = (s: string) => b64url(new TextEncoder().encode(s));

async function hmac(pesan: string) {
  const rahasia = Deno.env.get('ANTROL_JWT_SECRET') ??
                  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const kunci = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(rahasia),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', kunci, new TextEncoder().encode(pesan))));
}

async function buatToken(username: string) {
  const kepala = teksB64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const isi = teksB64url(JSON.stringify({
    sub: username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 12 * 3600
  }));
  return `${kepala}.${isi}.${await hmac(`${kepala}.${isi}`)}`;
}

async function periksaToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const bagian = token.split('.');
  if (bagian.length !== 3) return null;
  if (await hmac(`${bagian[0]}.${bagian[1]}`) !== bagian[2]) return null;
  try {
    const isi = JSON.parse(atob(bagian[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof isi.exp !== 'number' || isi.exp < Math.floor(Date.now() / 1000)) return null;
    return String(isi.sub ?? '');
  } catch { return null; }
}

/* ------------------------------- Server ------------------------------ */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  // Jalur di belakang nama fungsi: /functions/v1/antrol/antrean/status/001/2026-09-05
  const jalur = url.pathname
    .replace(/^\/functions\/v1/, '')
    .replace(/^\/antrol/, '')
    .split('/').filter(Boolean).map(decodeURIComponent);

  const username = req.headers.get('x-username') ?? '';
  const sandi    = req.headers.get('x-password') ?? '';
  const token    = req.headers.get('x-token');
  const supabase = db();

  let badan: Record<string, unknown> = {};
  let hasil: Record<string, unknown> = gagal('Jalur tidak dikenal', 404);
  let httpPaksa: number | undefined;

  try {
    if (req.method === 'POST' || req.method === 'PUT') {
      try { badan = await req.json(); } catch { badan = {}; }
    }

    /* ---------------- GET /auth ---------------- */
    if (jalur[0] === 'auth') {
      const { data, error } = await supabase.rpc('antrol_auth', {
        p_username: username, p_sandi: sandi
      });
      if (error) throw error;
      const kode = Number((data as Record<string, Record<string, unknown>>)?.metadata?.code ?? 201);
      hasil = kode === 200
        ? { response: { token: await buatToken(username.toLowerCase().trim()) },
            metadata: { message: 'Ok', code: 200 } }
        : data as Record<string, unknown>;

    } else {
      /* Semua jalur lain wajib membawa token yang masih berlaku.
         Diperiksa SEBELUM menyentuh database supaya permintaan tanpa
         token tidak bisa dipakai memeriksa keberadaan poli atau peserta. */
      const pemilik = await periksaToken(token);
      if (!pemilik) {
        hasil = gagal('Token tidak valid atau sudah kedaluwarsa');
        httpPaksa = 401;

      } else if (jalur[0] === 'antrean' && jalur[1] === 'status' && req.method === 'GET') {
        const { data, error } = await supabase.rpc('antrol_status', {
          p_kode_poli: jalur[2] ?? '', p_tanggal: jalur[3] ?? ''
        });
        if (error) throw error;
        hasil = data as Record<string, unknown>;

      } else if (jalur[0] === 'antrean' && jalur[1] === 'sisapeserta' && req.method === 'GET') {
        const { data, error } = await supabase.rpc('antrol_sisa_peserta', {
          p_no_kartu: jalur[2] ?? '', p_kode_poli: jalur[3] ?? '', p_tanggal: jalur[4] ?? ''
        });
        if (error) throw error;
        hasil = data as Record<string, unknown>;

      } else if (jalur[0] === 'antrean' && jalur[1] === 'batal' && req.method === 'PUT') {
        const { data, error } = await supabase.rpc('antrol_batal', {
          p_no_kartu: String(badan.nomorkartu ?? ''),
          p_kode_poli: String(badan.kodepoli ?? ''),
          p_tanggal:   String(badan.tanggalperiksa ?? '')
        });
        if (error) throw error;
        hasil = data as Record<string, unknown>;

      } else if (jalur[0] === 'antrean' && jalur.length === 1 && req.method === 'POST') {
        const { data, error } = await supabase.rpc('antrol_ambil', {
          p_no_kartu:  String(badan.nomorkartu ?? ''),
          p_nik:       String(badan.nik ?? ''),
          p_kode_poli: String(badan.kodepoli ?? ''),
          p_tanggal:   String(badan.tanggalperiksa ?? '')
        });
        if (error) throw error;
        hasil = data as Record<string, unknown>;

      } else if (jalur[0] === 'peserta' && req.method === 'POST') {
        const { data, error } = await supabase.rpc('antrol_peserta_baru', { p_data: badan });
        if (error) throw error;
        hasil = data as Record<string, unknown>;
      }
    }

  } catch (e) {
    // Pesan galat internal tidak pernah dikirim keluar apa adanya: ia bisa
    // memuat nama tabel, nama kolom, bahkan potongan data. Yang berangkat
    // ke BPJS satu kalimat; rinciannya masuk antrol_log untuk kita sendiri.
    console.error('antrol', e);
    hasil = gagal('Terjadi kesalahan pada sistem faskes. Silakan coba beberapa saat lagi.', 500);
    httpPaksa = 500;
    badan = { ...badan, _galat: String((e as Error).message ?? e) };
  }

  /* Catat setiap permintaan. Inilah yang dibuka saat UAT bersama BPJS
     ketika mereka mengatakan "kami kirim, faskes tidak jawab". */
  const kode = Number((hasil?.metadata as Record<string, unknown>)?.code ?? 0);
  try {
    await supabase.from('antrol_log').insert({
      jalur: '/' + jalur.join('/'),
      metode: req.method,
      username: username || null,
      // Nomor kartu dan NIK memang ikut tersimpan: log inilah bukti isi
      // permintaan saat terjadi selisih data dengan BPJS. Tabelnya hanya
      // bisa dibaca admin dan pendaftaran (lihat 15_antrean.sql).
      request: { ...badan, _jalur: jalur },
      response: hasil,
      http_status: httpPaksa ?? kode,
      sukses: kode === 200 || kode === 202,
      ip: req.headers.get('x-forwarded-for')
    });
  } catch (e) { console.error('antrol_log', e); }

  return jawab(hasil, httpPaksa);
});

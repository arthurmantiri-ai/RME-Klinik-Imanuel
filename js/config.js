/* =====================================================================
   KONFIGURASI — SATU-SATUNYA FILE YANG PERLU ANDA SUNTING
   ---------------------------------------------------------------------
   Ambil dua nilai di bawah dari dasbor Supabase Anda:
     Project Settings  →  Data API  →  Project URL
     Project Settings  →  API Keys  →  anon / public key
   Kunci `anon` memang aman ditaruh di sini: seluruh pembatasan akses
   dijalankan oleh Row Level Security di database, bukan oleh browser.
   ===================================================================== */

const CONFIG = {
  SUPABASE_URL: 'https://mvszcxjlcdutjidfoccu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12c3pjeGpsY2R1dGppZGZvY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNTkzOTksImV4cCI6MjEwMzczNTM5OX0.N6M7vl-pqOD1oTcV2qMSzTMA9pOP3EHR-oDTckhRXUU',

  // Identitas yang tampil di aplikasi (bisa juga diambil dari tabel `faskes`)
  NAMA_KLINIK: 'Klinik Pratama Imanuel',
  SINGKATAN: 'KI',

  // Nyalakan setelah kredensial bridging tersedia dan Edge Function terpasang
  BRIDGING: {
    PCARE_AKTIF: false,
    SATUSEHAT_AKTIF: false
  },

  // Ambang tanda vital untuk menandai nilai tidak normal (dewasa)
  AMBANG_VITAL: {
    sistolik:  { min: 90,  max: 139 },
    diastolik: { min: 60,  max: 89  },
    nadi:      { min: 60,  max: 100 },
    nafas:     { min: 12,  max: 20  },
    suhu:      { min: 36.0, max: 37.5 },
    spo2:      { min: 95,  max: 100 }
  }
};

/* =====================================================================
 *  EDGE FUNCTION: satusehat-proxy
 *  ---------------------------------------------------------------------
 *  Mengirim data kunjungan rawat jalan ke Platform SATUSEHAT (FHIR R4).
 *
 *  Urutan sumber daya untuk satu kunjungan rawat jalan:
 *    1. Patient      → cari nomor IHS pasien berdasarkan NIK
 *    2. Encounter    → buat kunjungan (status: arrived → in-progress → finished)
 *    3. Condition    → diagnosa ICD-10
 *    4. Observation  → tanda vital (kode LOINC)
 *    5. Medication + MedicationRequest → resep
 *    6. Encounter (update) → status finished + diagnosis
 *
 *  Secret yang harus diisi (Dashboard Supabase → Edge Functions → Secrets):
 *    SATUSEHAT_BASE_URL    https://api-satusehat.kemkes.go.id/fhir-r4/v1
 *                          (uji coba: https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1)
 *    SATUSEHAT_AUTH_URL    https://api-satusehat.kemkes.go.id/oauth2/v1
 *                          (uji coba: https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1)
 *    SATUSEHAT_CLIENT_ID
 *    SATUSEHAT_CLIENT_SECRET
 *    SATUSEHAT_ORG_ID      Organization IHS ID klinik
 *
 *  Semua waktu dikirim dalam UTC+00:00. WIB = UTC+7, jadi dikurangi 7 jam.
 * ===================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SYS = {
  nik:        'https://fhir.kemkes.go.id/id/nik',
  encounter:  (org: string) => `http://sys-ids.kemkes.go.id/encounter/${org}`,
  condition:  'http://hl7.org/fhir/sid/icd-10',
  loinc:      'http://loinc.org',
  kfa:        'http://sys-ids.kemkes.go.id/kfa',
  actCode:    'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  partType:   'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
  diagRole:   'http://terminology.hl7.org/CodeSystem/diagnosis-role',
  obsCat:     'http://terminology.hl7.org/CodeSystem/observation-category',
  snomed:     'http://snomed.info/sct',
  loincSys:   'http://loinc.org',
  kemkesTerm: 'http://terminology.kemkes.go.id/CodeSystem/clinical-term',
  // Sistem kode tindakan. ICD-9-CM adalah yang dipakai untuk klaim di Indonesia.
  // Bila SatuSehat menolaknya untuk Procedure.code, ganti baris ini sesuai
  // terminologi yang diminta pada dokumentasi (KPTL atau SNOMED CT) — hanya
  // baris ini yang perlu diubah.
  prosedur:   'http://hl7.org/fhir/sid/icd-9-cm'
};

/* Kode komponen odontogram, mengikuti Lampiran Terminologi Gigi SatuSehat */
const ODONTO = {
  bidang:            { sistem: 'http://loinc.org', kode: '32889-8', nama: 'Tooth surface' },
  kondisi:           { sistem: 'http://snomed.info/sct', kode: '278544002', nama: 'Tooth finding' },
  material:          { sistem: 'http://snomed.info/sct', kode: '432680005', nama: 'Restoration material' },
  protesa:           { sistem: 'http://snomed.info/sct', kode: '256509009', nama: 'Prosthesis material' }
};

/* Kode LOINC untuk tanda vital yang kita kumpulkan di kajian awal */
const LOINC_VITAL: Record<string, { kode: string; nama: string; satuan: string; unit: string }> = {
  sistolik:    { kode: '8480-6',  nama: 'Systolic blood pressure',  satuan: 'mm[Hg]', unit: 'mmHg' },
  diastolik:   { kode: '8462-4',  nama: 'Diastolic blood pressure', satuan: 'mm[Hg]', unit: 'mmHg' },
  nadi:        { kode: '8867-4',  nama: 'Heart rate',               satuan: '/min',   unit: 'x/menit' },
  nafas:       { kode: '9279-1',  nama: 'Respiratory rate',         satuan: '/min',   unit: 'x/menit' },
  suhu:        { kode: '8310-5',  nama: 'Body temperature',         satuan: 'Cel',    unit: '°C' },
  spo2:        { kode: '2708-6',  nama: 'Oxygen saturation',        satuan: '%',      unit: '%' },
  berat_badan: { kode: '29463-7', nama: 'Body weight',              satuan: 'kg',     unit: 'kg' },
  tinggi_badan:{ kode: '8302-2',  nama: 'Body height',              satuan: 'cm',     unit: 'cm' }
};

/* --------------------------- Token OAuth2 --------------------------- */
let cacheToken: { nilai: string; kedaluwarsa: number } | null = null;

async function ambilToken(): Promise<string> {
  if (cacheToken && Date.now() < cacheToken.kedaluwarsa - 60_000) return cacheToken.nilai;

  const authUrl = Deno.env.get('SATUSEHAT_AUTH_URL') ?? '';
  const id      = Deno.env.get('SATUSEHAT_CLIENT_ID') ?? '';
  const secret  = Deno.env.get('SATUSEHAT_CLIENT_SECRET') ?? '';
  if (!authUrl || !id || !secret) {
    throw new Error('Kredensial SatuSehat belum lengkap. Isi Secret di Edge Function terlebih dahulu.');
  }

  const r = await fetch(`${authUrl}/accesstoken?grant_type=client_credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret })
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) {
    throw new Error(`Gagal mendapatkan token SatuSehat: ${JSON.stringify(j).slice(0, 200)}`);
  }
  cacheToken = {
    nilai: j.access_token,
    kedaluwarsa: Date.now() + (Number(j.expires_in ?? 3500) * 1000)
  };
  return cacheToken.nilai;
}

async function fhir(jalur: string, metode = 'GET', badan: unknown = null) {
  const base = Deno.env.get('SATUSEHAT_BASE_URL') ?? '';
  const token = await ambilToken();
  const r = await fetch(`${base}${jalur}`, {
    method: metode,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: badan ? JSON.stringify(badan) : undefined
  });
  const teks = await r.text();
  let data: unknown;
  try { data = JSON.parse(teks); } catch { data = { raw: teks }; }
  return { http: r.status, ok: r.ok, data };
}

/* Waktu lokal → ISO UTC (SatuSehat menolak zona waktu selain UTC) */
const utc = (t: string | Date | null | undefined) =>
  t ? new Date(t).toISOString().replace(/\.\d{3}Z$/, '+00:00') : new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');

/* --------------------- Pembentuk sumber daya FHIR -------------------- */

function bentukEncounter(k: any, orgId: string, locationId: string, practitionerId: string,
                         patientIhs: string, diagnosa: Array<{ id: string; nama: string; jenis: string }> = []) {
  const riwayat: unknown[] = [];
  if (k.waktu_daftar) riwayat.push({ status: 'arrived', period: { start: utc(k.waktu_daftar), end: utc(k.waktu_periksa ?? k.waktu_daftar) } });
  if (k.waktu_periksa) riwayat.push({ status: 'in-progress', period: { start: utc(k.waktu_periksa), end: utc(k.waktu_selesai ?? k.waktu_periksa) } });
  if (k.waktu_selesai) riwayat.push({ status: 'finished', period: { start: utc(k.waktu_selesai), end: utc(k.waktu_selesai) } });

  return {
    resourceType: 'Encounter',
    identifier: [{
      system: SYS.encounter(orgId),
      value: k.no_kunjungan
    }],
    status: k.waktu_selesai ? 'finished' : (k.waktu_periksa ? 'in-progress' : 'arrived'),
    class: { system: SYS.actCode, code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patientIhs}`, display: k.pasien?.nama },
    participant: practitionerId ? [{
      type: [{ coding: [{ system: SYS.partType, code: 'ATND', display: 'attender' }] }],
      individual: { reference: `Practitioner/${practitionerId}`, display: k.dokter?.nama }
    }] : [],
    period: {
      start: utc(k.waktu_daftar),
      ...(k.waktu_selesai ? { end: utc(k.waktu_selesai) } : {})
    },
    location: locationId ? [{
      location: { reference: `Location/${locationId}`, display: k.poli?.nama }
    }] : [],
    statusHistory: riwayat,
    // Encounter.diagnosis wajib diisi; baru bisa dibuat setelah Condition terkirim
    ...(diagnosa.length ? {
      diagnosis: diagnosa.map((d, i) => ({
        condition: { reference: `Condition/${d.id}`, display: d.nama },
        use: { coding: [{
          system: SYS.diagRole,
          code: d.jenis === 'PRIMER' ? 'DD' : 'AD',
          display: d.jenis === 'PRIMER' ? 'Discharge diagnosis' : 'Admission diagnosis'
        }] },
        rank: i + 1
      }))
    } : {}),
    serviceProvider: { reference: `Organization/${orgId}` }
  };
}

function bentukCondition(d: any, encounterId: string, patientIhs: string, namaPasien: string) {
  return {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
      code: 'active', display: 'Active' }] },
    category: [{ coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/condition-category',
      code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
    code: { coding: [{ system: SYS.condition, code: d.kode_icd10, display: d.nama }] },
    subject: { reference: `Patient/${patientIhs}`, display: namaPasien },
    encounter: { reference: `Encounter/${encounterId}` }
  };
}

function bentukObservation(kunci: string, nilai: number, encounterId: string,
                           patientIhs: string, namaPasien: string, waktu: string) {
  const v = LOINC_VITAL[kunci];
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ system: SYS.obsCat, code: 'vital-signs', display: 'Vital Signs' }] }],
    code: { coding: [{ system: SYS.loinc, code: v.kode, display: v.nama }] },
    subject: { reference: `Patient/${patientIhs}`, display: namaPasien },
    encounter: { reference: `Encounter/${encounterId}` },
    effectiveDateTime: utc(waktu),
    issued: utc(waktu),
    valueQuantity: {
      value: nilai, unit: v.unit,
      system: 'http://unitsofmeasure.org', code: v.satuan
    }
  };
}

/* Satu temuan odontogram = satu Observation.
   Temuan pada bidang tertentu membawa komponen bidang; temuan pada seluruh gigi tidak. */
function bentukObservationGigi(opsi: {
  gigi: { fdi: string; nama: string; kode_snomed: string | null };
  kondisi: { kode: string; nama: string; kode_snomed: string | null; komponen: string | null };
  bidang?: { kode: string; nama: string; kode_snomed: string | null } | null;
  encounterId: string; patientIhs: string; namaPasien: string; waktu: string;
}) {
  const { gigi, kondisi, bidang, encounterId, patientIhs, namaPasien, waktu } = opsi;

  const komponen: unknown[] = [];

  if (bidang) {
    komponen.push({
      code: { coding: [{ system: ODONTO.bidang.sistem, code: ODONTO.bidang.kode,
                         display: ODONTO.bidang.nama }] },
      valueCodeableConcept: {
        coding: bidang.kode_snomed
          ? [{ system: SYS.snomed, code: bidang.kode_snomed, display: bidang.nama }] : [],
        text: bidang.nama
      }
    });
  }

  /* Kondisi ditempatkan pada komponen yang sesuai jenisnya:
     temuan klinis, bahan tambalan, atau bahan protesa. */
  const jenis = kondisi.komponen === 'material' ? ODONTO.material
              : kondisi.komponen === 'protesa'  ? ODONTO.protesa
              : ODONTO.kondisi;
  const sistemNilai = kondisi.kode_snomed && kondisi.kode_snomed.startsWith('OV')
    ? SYS.kemkesTerm : SYS.snomed;

  komponen.push({
    code: { coding: [{ system: jenis.sistem, code: jenis.kode, display: jenis.nama }] },
    valueCodeableConcept: {
      coding: kondisi.kode_snomed
        ? [{ system: sistemNilai, code: kondisi.kode_snomed, display: kondisi.nama }] : [],
      text: kondisi.nama
    }
  });

  return {
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ system: SYS.obsCat, code: 'exam', display: 'Exam' }] }],
    code: {
      coding: [{ system: SYS.snomed, code: '278544002', display: 'Tooth finding' }],
      text: 'Odontogram'
    },
    subject: { reference: `Patient/${patientIhs}`, display: namaPasien },
    encounter: { reference: `Encounter/${encounterId}` },
    effectiveDateTime: utc(waktu),
    issued: utc(waktu),
    /* Nomor gigi FDI. Bila kode SNOMED gigi belum diisi di ref_gigi, nomornya
       tetap terkirim sebagai teks supaya datanya tidak hilang. */
    bodySite: {
      coding: gigi.kode_snomed
        ? [{ system: SYS.snomed, code: gigi.kode_snomed, display: gigi.nama }] : [],
      text: `Gigi ${gigi.fdi} (FDI) — ${gigi.nama}`
    },
    component: komponen
  };
}

/* Tindakan medis */
function bentukProcedure(t: any, encounterId: string, patientIhs: string,
                         namaPasien: string, practitionerId: string,
                         gigi: { fdi: string; nama: string; kode_snomed: string | null } | null,
                         waktu: string) {
  return {
    resourceType: 'Procedure',
    status: 'completed',
    category: {
      coding: [{ system: SYS.snomed, code: '387713003', display: 'Surgical procedure' }]
    },
    code: {
      coding: [{ system: SYS.prosedur, code: t.kode_icd9, display: t.nama }],
      text: t.nama
    },
    subject: { reference: `Patient/${patientIhs}`, display: namaPasien },
    encounter: { reference: `Encounter/${encounterId}` },
    performedDateTime: utc(waktu),
    ...(practitionerId ? {
      performer: [{ actor: { reference: `Practitioner/${practitionerId}` } }]
    } : {}),
    ...(gigi ? {
      bodySite: [{
        coding: gigi.kode_snomed
          ? [{ system: SYS.snomed, code: gigi.kode_snomed, display: gigi.nama }] : [],
        text: `Gigi ${gigi.fdi} (FDI) — ${gigi.nama}`
      }]
    } : {})
  };
}

function bentukMedicationRequest(item: any, encounterId: string, patientIhs: string,
                                 namaPasien: string, practitionerId: string, waktu: string) {
  return {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    category: [{ coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category',
      code: 'outpatient', display: 'Outpatient' }] }],
    medicationCodeableConcept: {
      coding: item.kode_kfa
        ? [{ system: SYS.kfa, code: item.kode_kfa, display: item.nama_obat }]
        : [{ display: item.nama_obat }],
      text: item.nama_obat
    },
    subject: { reference: `Patient/${patientIhs}`, display: namaPasien },
    encounter: { reference: `Encounter/${encounterId}` },
    authoredOn: utc(waktu),
    ...(practitionerId ? { requester: { reference: `Practitioner/${practitionerId}` } } : {}),
    dosageInstruction: [{
      text: item.signa,
      ...(item.frekuensi ? {
        timing: { repeat: { frequency: item.frekuensi, period: 1, periodUnit: 'd' } }
      } : {}),
      route: { coding: [{
        system: 'http://www.whocc.no/atc',
        code: 'O', display: item.rute ?? 'Oral' }] }
    }],
    dispenseRequest: {
      quantity: { value: Number(item.jumlah), unit: item.satuan }
    }
  };
}

/* ------------------------------- Server ------------------------------ */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const jawab = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let kunjunganId: string | null = null;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return jawab({ error: 'Tidak diizinkan' }, 401);

    const klien = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await klien.auth.getUser();
    if (!user) return jawab({ error: 'Sesi tidak valid' }, 401);

    // Badan permintaan hanya boleh dibaca satu kali
    const badan = await req.json();
    const { operasi, kunjungan_id, nik } = badan;
    kunjunganId = kunjungan_id ?? null;

    /* --------- Operasi 1: cari nomor IHS pasien berdasarkan NIK --------- */
    if (operasi === 'patient.cari') {
      if (!nik) return jawab({ sukses: false, error: 'NIK wajib diisi.' }, 400);
      const r = await fhir(`/Patient?identifier=${encodeURIComponent(SYS.nik + '|' + nik)}`);
      const entri = (r.data as any)?.entry?.[0]?.resource;
      return jawab({ sukses: r.ok && !!entri, ihs: entri?.id ?? null, data: r.data });
    }

    /* --------- Operasi 2: kirim seluruh kunjungan --------- */
    if (operasi !== 'kunjungan.kirim') return jawab({ error: `Operasi "${operasi}" tidak dikenal` }, 400);

    const orgId = Deno.env.get('SATUSEHAT_ORG_ID') ?? '';
    if (!orgId) throw new Error('SATUSEHAT_ORG_ID belum diisi.');

    // Ambil seluruh isi rekam medis dengan service_role (lolos RLS)
    const { data: k, error: e1 } = await admin.from('kunjungan')
      .select('*, pasien:pasien_id(*), poli:poli_id(*), dokter:dokter_id(*)')
      .eq('id', kunjungan_id).single();
    if (e1 || !k) throw new Error('Kunjungan tidak ditemukan.');

    const [{ data: ka }, { data: dg }, { data: rs }, { data: td }] = await Promise.all([
      admin.from('kajian_awal').select('*').eq('kunjungan_id', kunjungan_id).maybeSingle(),
      admin.from('diagnosa').select('*').eq('kunjungan_id', kunjungan_id),
      admin.from('resep').select('*, item:resep_item(*)').eq('kunjungan_id', kunjungan_id).maybeSingle(),
      admin.from('tindakan').select('*').eq('kunjungan_id', kunjungan_id).order('urutan')
    ]);

    const poliGigi = k.poli?.jenis === 'GIGI';

    const hasil: Record<string, unknown> = {};
    const namaPasien = k.pasien.nama;

    /* 1. Nomor IHS pasien */
    let patientIhs = k.pasien.satusehat_patient_id;
    if (!patientIhs) {
      if (!k.pasien.nik) throw new Error('Pasien belum punya NIK. NIK wajib untuk mencari nomor IHS di SatuSehat.');
      const cari = await fhir(`/Patient?identifier=${encodeURIComponent(SYS.nik + '|' + k.pasien.nik)}`);
      patientIhs = (cari.data as any)?.entry?.[0]?.resource?.id;
      if (!patientIhs) throw new Error('Pasien tidak ditemukan di SatuSehat berdasarkan NIK. Periksa kembali NIK-nya.');
      await admin.from('pasien').update({
        satusehat_patient_id: patientIhs,
        satusehat_sinkron_pada: new Date().toISOString()
      }).eq('id', k.pasien_id);
    }
    hasil.patient = patientIhs;

    /* 2. Encounter */
    const locationId = k.poli?.satusehat_location_id
      ?? (await admin.from('faskes').select('satusehat_location_id').eq('id', 1).single()).data?.satusehat_location_id
      ?? '';
    const practitionerId = k.dokter?.satusehat_practitioner_id ?? '';

    let encounterId = k.satusehat_encounter_id;
    const badanEnc = bentukEncounter(k, orgId, locationId, practitionerId, patientIhs);

    if (!encounterId) {
      const r = await fhir('/Encounter', 'POST', badanEnc);
      if (!r.ok) throw new Error(`Encounter gagal (HTTP ${r.http}): ${JSON.stringify(r.data).slice(0, 300)}`);
      encounterId = (r.data as any).id;
      await admin.from('kunjungan').update({ satusehat_encounter_id: encounterId }).eq('id', kunjungan_id);
    } else {
      await fhir(`/Encounter/${encounterId}`, 'PUT', { ...badanEnc, id: encounterId });
    }
    hasil.encounter = encounterId;

    /* 3. Condition (diagnosa) */
    hasil.condition = [];
    const rujukanDiagnosa: Array<{ id: string; nama: string; jenis: string }> = [];
    for (const d of (dg ?? [])) {
      const r = await fhir('/Condition', 'POST',
        bentukCondition(d, encounterId, patientIhs, namaPasien));
      if (r.ok && (r.data as any).id) {
        rujukanDiagnosa.push({ id: (r.data as any).id, nama: d.nama, jenis: d.jenis });
        (hasil.condition as unknown[]).push((r.data as any).id);
      } else {
        (hasil.condition as unknown[]).push({ gagal: r.data });
      }
    }
    // Urutkan: diagnosa primer selalu di peringkat pertama
    rujukanDiagnosa.sort((a, b) => (a.jenis === 'PRIMER' ? -1 : 1) - (b.jenis === 'PRIMER' ? -1 : 1));

    /* 4. Observation (tanda vital) */
    hasil.observation = [];
    if (ka) {
      for (const kunci of Object.keys(LOINC_VITAL)) {
        const nilai = (ka as Record<string, unknown>)[kunci];
        if (nilai === null || nilai === undefined) continue;
        const r = await fhir('/Observation', 'POST',
          bentukObservation(kunci, Number(nilai), encounterId, patientIhs, namaPasien, ka.dibuat_pada));
        (hasil.observation as unknown[]).push(r.ok ? (r.data as any).id : { gagal: r.data });
      }
    }

    /* 5. MedicationRequest (resep) */
    hasil.medicationRequest = [];
    for (const it of (rs?.item ?? [])) {
      const r = await fhir('/MedicationRequest', 'POST',
        bentukMedicationRequest(it, encounterId, patientIhs, namaPasien, practitionerId, rs!.dibuat_pada));
      (hasil.medicationRequest as unknown[]).push(r.ok ? (r.data as any).id : { gagal: r.data });
    }

    /* 5b. Tindakan → Procedure */
    hasil.procedure = [];
    for (const t of (td ?? [])) {
      let gigi = null;
      if (t.fdi) {
        const { data: g } = await admin.from('ref_gigi')
          .select('fdi,nama,kode_snomed').eq('fdi', t.fdi).maybeSingle();
        gigi = g ?? null;
      }
      const r = await fhir('/Procedure', 'POST',
        bentukProcedure(t, encounterId, patientIhs, namaPasien, practitionerId, gigi,
                        t.dilakukan_pada ?? k.waktu_periksa ?? k.waktu_daftar));
      (hasil.procedure as unknown[]).push(r.ok ? (r.data as any).id : { gagal: r.data });
    }

    /* 5c. Odontogram → Observation per temuan (hanya untuk kunjungan poli gigi) */
    hasil.odontogram = [];
    if (poliGigi) {
      const [{ data: odo }, { data: gigiRef }, { data: kondisiRef }, { data: bidangRef }] =
        await Promise.all([
          admin.from('odontogram').select('*').eq('pasien_id', k.pasien_id)
               .eq('kunjungan_id', kunjungan_id),          // hanya yang dicatat kunjungan ini
          admin.from('ref_gigi').select('fdi,nama,kode_snomed'),
          admin.from('ref_kondisi_gigi').select('kode,nama,kode_snomed,komponen'),
          admin.from('ref_bidang_gigi').select('kode,nama,kode_snomed')
        ]);

      const petaGigi: Record<string, any> = {};
      (gigiRef ?? []).forEach((g: any) => { petaGigi[g.fdi] = g; });
      const petaKondisi: Record<string, any> = {};
      (kondisiRef ?? []).forEach((c: any) => { petaKondisi[c.kode] = c; });
      const petaBidang: Record<string, any> = {};
      (bidangRef ?? []).forEach((b: any) => { petaBidang[b.kode] = b; });

      const waktuGigi = k.waktu_periksa ?? k.waktu_daftar;

      for (const baris of (odo ?? [])) {
        const gigi = petaGigi[baris.fdi];
        if (!gigi) continue;
        const temuan: Array<[any, any]> = [];

        if (baris.kondisi && petaKondisi[baris.kondisi]) {
          temuan.push([petaKondisi[baris.kondisi], null]);
        }
        Object.entries(baris.bidang ?? {}).forEach(([kodeBidang, kodeKondisi]) => {
          const c = petaKondisi[kodeKondisi as string];
          if (c) temuan.push([c, petaBidang[kodeBidang] ?? null]);
        });

        for (const [kondisi, bidang] of temuan) {
          const r = await fhir('/Observation', 'POST', bentukObservationGigi({
            gigi, kondisi, bidang, encounterId, patientIhs, namaPasien, waktu: waktuGigi
          }));
          (hasil.odontogram as unknown[]).push(
            r.ok ? { fdi: baris.fdi, id: (r.data as any).id } : { fdi: baris.fdi, gagal: r.data });
        }
      }
    }

    /* 6. Perbarui Encounter dengan diagnosis (field wajib SatuSehat) */
    if (rujukanDiagnosa.length) {
      const encFinal = bentukEncounter(k, orgId, locationId, practitionerId, patientIhs, rujukanDiagnosa);
      const rEnc = await fhir(`/Encounter/${encounterId}`, 'PUT', { ...encFinal, id: encounterId });
      hasil.encounterDiperbarui = rEnc.ok;
      if (!rEnc.ok) hasil.encounterPesan = JSON.stringify(rEnc.data).slice(0, 300);
    }

    /* 7. Tandai berhasil */
    await admin.from('kunjungan').update({
      satusehat_status: 'TERKIRIM',
      satusehat_pesan: null,
      satusehat_sinkron_pada: new Date().toISOString()
    }).eq('id', kunjungan_id);

    await admin.from('bridging_log').insert({
      sistem: 'SATUSEHAT', operasi: 'kunjungan.kirim', kunjungan_id,
      pasien_id: k.pasien_id, response: hasil, http_status: 200,
      sukses: true, dijalankan_oleh: user.id
    });

    return jawab({ sukses: true, hasil });

  } catch (e) {
    const pesan = (e as Error).message;
    if (kunjunganId) {
      await admin.from('kunjungan').update({
        satusehat_status: 'GAGAL', satusehat_pesan: pesan.slice(0, 400)
      }).eq('id', kunjunganId);
      await admin.from('bridging_log').insert({
        sistem: 'SATUSEHAT', operasi: 'kunjungan.kirim', kunjungan_id: kunjunganId,
        sukses: false, pesan_error: pesan.slice(0, 500)
      });
    }
    return jawab({ sukses: false, error: pesan }, 500);
  }
});

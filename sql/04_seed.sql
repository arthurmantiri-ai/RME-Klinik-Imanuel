-- =====================================================================
--  RME KLINIK IMANUEL - DATA AWAL (SEED)
--  Jalankan SETELAH 03_audit.sql
--  Isi: profil klinik, poli, aturan pakai, ICD-10 tersering di FKTP,
--       dan daftar obat generik Fornas tingkat pertama.
--  Silakan sunting nama/alamat klinik sesuai data resmi Anda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFIL KLINIK  (WAJIB DISUNTING)
-- ---------------------------------------------------------------------
insert into faskes (id, nama, jenis_faskes, alamat, kabupaten, provinsi, telepon)
values (1, 'Klinik Pratama Imanuel', 'Klinik Pratama', 'Isi alamat klinik', '-', '-', '-')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. POLI
-- ---------------------------------------------------------------------
insert into poli (kode, nama, kode_pcare, urutan) values
  ('UMUM', 'Poli Umum',  '001', 1),
  ('GIGI', 'Poli Gigi',  '002', 2),
  ('KIA',  'Poli KIA / KB', '003', 3)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 3. ATURAN PAKAI (SIGNA)
-- ---------------------------------------------------------------------
insert into signa (kode, teks, frekuensi, dosis, urutan) values
  ('1dd1',   '1 x sehari 1 tablet',      1, 1,   1),
  ('2dd1',   '2 x sehari 1 tablet',      2, 1,   2),
  ('3dd1',   '3 x sehari 1 tablet',      3, 1,   3),
  ('3dd1/2', '3 x sehari 1/2 tablet',    3, 0.5, 4),
  ('4dd1',   '4 x sehari 1 tablet',      4, 1,   5),
  ('2dd1cth','2 x sehari 1 sendok teh',  2, 1,   6),
  ('3dd1cth','3 x sehari 1 sendok teh',  3, 1,   7),
  ('1dd1prn','1 x sehari bila perlu',    1, 1,   8),
  ('3dd1prn','3 x sehari bila perlu',    3, 1,   9),
  ('ue',     'Oleskan pada bagian yang sakit', null, null, 10)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 4. ICD-10 — diagnosis tersering di klinik pratama Indonesia
--    Kolom sering_dipakai = true akan muncul sebagai tombol cepat di form dokter.
-- ---------------------------------------------------------------------
insert into icd10 (kode, nama_en, nama_id, kategori, sering_dipakai) values
-- Saluran napas
('J00',   'Acute nasopharyngitis (common cold)', 'Selesma / Common cold', 'Saluran Napas', true),
('J01.9', 'Acute sinusitis, unspecified', 'Sinusitis akut', 'Saluran Napas', false),
('J02.9', 'Acute pharyngitis, unspecified', 'Faringitis akut', 'Saluran Napas', true),
('J03.9', 'Acute tonsillitis, unspecified', 'Tonsilitis akut', 'Saluran Napas', true),
('J04.0', 'Acute laryngitis', 'Laringitis akut', 'Saluran Napas', false),
('J06.9', 'Acute upper respiratory infection, unspecified', 'ISPA (Infeksi Saluran Napas Atas)', 'Saluran Napas', true),
('J11.1', 'Influenza with other respiratory manifestations', 'Influenza', 'Saluran Napas', true),
('J18.9', 'Pneumonia, unspecified', 'Pneumonia', 'Saluran Napas', false),
('J20.9', 'Acute bronchitis, unspecified', 'Bronkitis akut', 'Saluran Napas', true),
('J30.4', 'Allergic rhinitis, unspecified', 'Rinitis alergi', 'Saluran Napas', true),
('J31.0', 'Chronic rhinitis', 'Rinitis kronik', 'Saluran Napas', false),
('J35.0', 'Chronic tonsillitis', 'Tonsilitis kronik', 'Saluran Napas', false),
('J42',   'Unspecified chronic bronchitis', 'Bronkitis kronik', 'Saluran Napas', false),
('J44.9', 'COPD, unspecified', 'PPOK', 'Saluran Napas', false),
('J45.9', 'Asthma, unspecified', 'Asma bronkial', 'Saluran Napas', true),
('R05',   'Cough', 'Batuk', 'Saluran Napas', true),
-- Kardiovaskular
('I10',   'Essential (primary) hypertension', 'Hipertensi esensial (primer)', 'Kardiovaskular', true),
('I11.9', 'Hypertensive heart disease without heart failure', 'Penyakit jantung hipertensi', 'Kardiovaskular', false),
('I15.9', 'Secondary hypertension, unspecified', 'Hipertensi sekunder', 'Kardiovaskular', false),
('I20.9', 'Angina pectoris, unspecified', 'Angina pektoris', 'Kardiovaskular', false),
('I50.9', 'Heart failure, unspecified', 'Gagal jantung', 'Kardiovaskular', false),
('I83.9', 'Varicose veins of lower extremities', 'Varises tungkai', 'Kardiovaskular', false),
('I95.9', 'Hypotension, unspecified', 'Hipotensi', 'Kardiovaskular', false),
('R00.0', 'Tachycardia, unspecified', 'Takikardia', 'Kardiovaskular', false),
-- Endokrin & metabolik
('E11.9', 'Type 2 diabetes mellitus without complications', 'Diabetes Melitus Tipe 2', 'Endokrin & Metabolik', true),
('E11.6', 'Type 2 diabetes mellitus with other specified complications', 'DM Tipe 2 dengan komplikasi', 'Endokrin & Metabolik', false),
('E10.9', 'Type 1 diabetes mellitus without complications', 'Diabetes Melitus Tipe 1', 'Endokrin & Metabolik', false),
('E03.9', 'Hypothyroidism, unspecified', 'Hipotiroid', 'Endokrin & Metabolik', false),
('E05.9', 'Thyrotoxicosis, unspecified', 'Hipertiroid', 'Endokrin & Metabolik', false),
('E44.1', 'Mild protein-energy malnutrition', 'Gizi kurang', 'Endokrin & Metabolik', false),
('E66.9', 'Obesity, unspecified', 'Obesitas', 'Endokrin & Metabolik', true),
('E78.5', 'Hyperlipidaemia, unspecified', 'Dislipidemia / Hiperlipidemia', 'Endokrin & Metabolik', true),
('E86',   'Volume depletion', 'Dehidrasi', 'Endokrin & Metabolik', false),
('E87.6', 'Hypokalaemia', 'Hipokalemia', 'Endokrin & Metabolik', false),
('R73.9', 'Hyperglycaemia, unspecified', 'Hiperglikemia', 'Endokrin & Metabolik', false),
('E16.2', 'Hypoglycaemia, unspecified', 'Hipoglikemia', 'Endokrin & Metabolik', false),
-- Pencernaan
('A09',   'Diarrhoea and gastroenteritis of presumed infectious origin', 'Diare / Gastroenteritis akut', 'Pencernaan', true),
('K21.0', 'Gastro-oesophageal reflux disease with oesophagitis', 'GERD', 'Pencernaan', true),
('K29.7', 'Gastritis, unspecified', 'Gastritis', 'Pencernaan', true),
('K30',   'Functional dyspepsia', 'Dispepsia', 'Pencernaan', true),
('K59.0', 'Constipation', 'Konstipasi / Sembelit', 'Pencernaan', true),
('K52.9', 'Noninfective gastroenteritis and colitis, unspecified', 'Gastroenteritis non-infeksi', 'Pencernaan', false),
('K64.9', 'Haemorrhoids, unspecified', 'Hemoroid', 'Pencernaan', true),
('K11.5', 'Sialolithiasis', 'Batu kelenjar liur', 'Pencernaan', false),
('B82.9', 'Intestinal parasitism, unspecified', 'Kecacingan', 'Pencernaan', false),
('K02.9', 'Dental caries, unspecified', 'Karies gigi', 'Gigi & Mulut', true),
('K04.0', 'Pulpitis', 'Pulpitis', 'Gigi & Mulut', true),
('K04.7', 'Periapical abscess without sinus', 'Abses periapikal', 'Gigi & Mulut', false),
('K05.1', 'Chronic gingivitis', 'Gingivitis kronis', 'Gigi & Mulut', false),
('K08.1', 'Loss of teeth due to accident, extraction', 'Kehilangan gigi', 'Gigi & Mulut', false),
('K12.0', 'Recurrent oral aphthae', 'Stomatitis aftosa (sariawan)', 'Gigi & Mulut', true),
-- Infeksi & tropis
('A01.0', 'Typhoid fever', 'Demam tifoid', 'Infeksi', true),
('A15.0', 'Tuberculosis of lung, confirmed', 'TB Paru terkonfirmasi', 'Infeksi', false),
('A16.2', 'Tuberculosis of lung, without mention of confirmation', 'TB Paru klinis', 'Infeksi', false),
('A90',   'Dengue fever', 'Demam Dengue', 'Infeksi', true),
('A91',   'Dengue haemorrhagic fever', 'Demam Berdarah Dengue', 'Infeksi', true),
('B05.9', 'Measles without complication', 'Campak', 'Infeksi', false),
('B01.9', 'Varicella without complication', 'Cacar air (Varisela)', 'Infeksi', false),
('B02.9', 'Zoster without complication', 'Herpes zoster', 'Infeksi', false),
('B00.1', 'Herpesviral vesicular dermatitis', 'Herpes simpleks', 'Infeksi', false),
('B34.9', 'Viral infection, unspecified', 'Infeksi virus', 'Infeksi', true),
('B54',   'Unspecified malaria', 'Malaria', 'Infeksi', false),
('U07.1', 'COVID-19, virus identified', 'COVID-19', 'Infeksi', false),
('R50.9', 'Fever, unspecified', 'Demam', 'Infeksi', true),
-- Kulit
('L01.0', 'Impetigo', 'Impetigo', 'Kulit', false),
('L02.9', 'Cutaneous abscess, furuncle and carbuncle', 'Abses kulit / Bisul', 'Kulit', true),
('L03.9', 'Cellulitis, unspecified', 'Selulitis', 'Kulit', false),
('L20.9', 'Atopic dermatitis, unspecified', 'Dermatitis atopik', 'Kulit', true),
('L21.9', 'Seborrhoeic dermatitis, unspecified', 'Dermatitis seboroik', 'Kulit', false),
('L23.9', 'Allergic contact dermatitis, unspecified cause', 'Dermatitis kontak alergi', 'Kulit', true),
('L24.9', 'Irritant contact dermatitis, unspecified cause', 'Dermatitis kontak iritan', 'Kulit', false),
('L29.9', 'Pruritus, unspecified', 'Gatal / Pruritus', 'Kulit', true),
('L30.9', 'Dermatitis, unspecified', 'Dermatitis', 'Kulit', true),
('L50.9', 'Urticaria, unspecified', 'Urtikaria / Biduran', 'Kulit', true),
('L70.0', 'Acne vulgaris', 'Akne vulgaris (jerawat)', 'Kulit', false),
('L98.9', 'Disorder of skin, unspecified', 'Kelainan kulit lainnya', 'Kulit', false),
('B35.4', 'Tinea corporis', 'Tinea korporis (kurap badan)', 'Kulit', true),
('B35.6', 'Tinea cruris', 'Tinea kruris', 'Kulit', false),
('B35.3', 'Tinea pedis', 'Tinea pedis (kutu air)', 'Kulit', false),
('B36.0', 'Pityriasis versicolor', 'Panu (Pitiriasis versikolor)', 'Kulit', true),
('B37.2', 'Candidiasis of skin and nail', 'Kandidiasis kulit', 'Kulit', false),
('B86',   'Scabies', 'Skabies (kudis)', 'Kulit', true),
('T78.4', 'Allergy, unspecified', 'Reaksi alergi', 'Kulit', true),
-- Muskuloskeletal
('M06.9', 'Rheumatoid arthritis, unspecified', 'Artritis reumatoid', 'Muskuloskeletal', false),
('M10.9', 'Gout, unspecified', 'Gout / Asam urat', 'Muskuloskeletal', true),
('M13.9', 'Arthritis, unspecified', 'Artritis', 'Muskuloskeletal', false),
('M15.9', 'Polyosteoarthritis, unspecified', 'Osteoartritis multipel', 'Muskuloskeletal', false),
('M17.9', 'Gonarthrosis, unspecified', 'Osteoartritis lutut', 'Muskuloskeletal', true),
('M25.5', 'Pain in joint', 'Nyeri sendi', 'Muskuloskeletal', true),
('M54.2', 'Cervicalgia', 'Nyeri leher', 'Muskuloskeletal', true),
('M54.5', 'Low back pain', 'Nyeri punggung bawah (LBP)', 'Muskuloskeletal', true),
('M62.6', 'Muscle strain', 'Strain otot', 'Muskuloskeletal', false),
('M79.1', 'Myalgia', 'Mialgia (nyeri otot)', 'Muskuloskeletal', true),
('M77.9', 'Enthesopathy, unspecified', 'Entesopati', 'Muskuloskeletal', false),
('M81.9', 'Osteoporosis, unspecified', 'Osteoporosis', 'Muskuloskeletal', false),
-- Saraf & jiwa
('G43.9', 'Migraine, unspecified', 'Migren', 'Saraf', true),
('G44.2', 'Tension-type headache', 'Nyeri kepala tegang (TTH)', 'Saraf', true),
('G51.0', 'Bell palsy', 'Bell''s palsy', 'Saraf', false),
('G56.0', 'Carpal tunnel syndrome', 'Sindrom terowongan karpal', 'Saraf', false),
('G62.9', 'Polyneuropathy, unspecified', 'Polineuropati', 'Saraf', false),
('R42',   'Dizziness and giddiness', 'Pusing / Vertigo', 'Saraf', true),
('H81.1', 'Benign paroxysmal vertigo', 'Vertigo posisi paroksismal jinak', 'Saraf', true),
('R51',   'Headache', 'Nyeri kepala', 'Saraf', true),
('F41.9', 'Anxiety disorder, unspecified', 'Gangguan cemas', 'Jiwa', false),
('F32.9', 'Depressive episode, unspecified', 'Episode depresi', 'Jiwa', false),
('F51.0', 'Nonorganic insomnia', 'Insomnia non-organik', 'Jiwa', false),
('F45.9', 'Somatoform disorder, unspecified', 'Gangguan somatoform', 'Jiwa', false),
-- Mata & THT
('H10.9', 'Conjunctivitis, unspecified', 'Konjungtivitis', 'Mata', true),
('H00.0', 'Hordeolum', 'Hordeolum (bintitan)', 'Mata', false),
('H16.9', 'Keratitis, unspecified', 'Keratitis', 'Mata', false),
('H25.9', 'Senile cataract, unspecified', 'Katarak senilis', 'Mata', false),
('H52.4', 'Presbyopia', 'Presbiopia', 'Mata', false),
('H52.1', 'Myopia', 'Miopia', 'Mata', false),
('H57.1', 'Ocular pain', 'Nyeri mata', 'Mata', false),
('H60.9', 'Otitis externa, unspecified', 'Otitis eksterna', 'THT', true),
('H61.2', 'Impacted cerumen', 'Serumen prop', 'THT', true),
('H65.9', 'Nonsuppurative otitis media, unspecified', 'Otitis media non-supuratif', 'THT', false),
('H66.9', 'Otitis media, unspecified', 'Otitis media', 'THT', true),
('H92.0', 'Otalgia', 'Nyeri telinga', 'THT', false),
('R04.0', 'Epistaxis', 'Mimisan (epistaksis)', 'THT', false),
-- Ginjal & saluran kemih
('N39.0', 'Urinary tract infection, site not specified', 'Infeksi Saluran Kemih (ISK)', 'Urogenital', true),
('N30.9', 'Cystitis, unspecified', 'Sistitis', 'Urogenital', false),
('N20.0', 'Calculus of kidney', 'Batu ginjal', 'Urogenital', false),
('N18.9', 'Chronic kidney disease, unspecified', 'Penyakit Ginjal Kronik', 'Urogenital', false),
('N40',   'Benign prostatic hyperplasia', 'Pembesaran prostat jinak (BPH)', 'Urogenital', false),
('N76.0', 'Acute vaginitis', 'Vaginitis akut', 'Urogenital', false),
('N92.0', 'Excessive and frequent menstruation', 'Menoragia', 'Urogenital', false),
('N94.6', 'Dysmenorrhoea, unspecified', 'Dismenore', 'Urogenital', true),
('N91.2', 'Amenorrhoea, unspecified', 'Amenore', 'Urogenital', false),
-- Kehamilan & KIA
('Z34.9', 'Supervision of normal pregnancy, unspecified', 'Pemeriksaan kehamilan normal (ANC)', 'KIA', true),
('Z35.9', 'Supervision of high-risk pregnancy, unspecified', 'Kehamilan risiko tinggi', 'KIA', false),
('O21.0', 'Mild hyperemesis gravidarum', 'Hiperemesis gravidarum ringan', 'KIA', false),
('Z30.4', 'Surveillance of contraceptive drugs', 'Pelayanan KB - kontrasepsi hormonal', 'KIA', true),
('Z30.0', 'General counselling and advice on contraception', 'Konseling KB', 'KIA', false),
('Z39.2', 'Routine postpartum follow-up', 'Kontrol nifas', 'KIA', false),
('D50.9', 'Iron deficiency anaemia, unspecified', 'Anemia defisiensi besi', 'Darah', true),
('D64.9', 'Anaemia, unspecified', 'Anemia', 'Darah', false),
-- Pemeriksaan & lain-lain
('Z00.0', 'General medical examination', 'Pemeriksaan kesehatan umum', 'Pemeriksaan', true),
('Z00.1', 'Routine child health examination', 'Pemeriksaan kesehatan anak rutin', 'Pemeriksaan', false),
('Z01.7', 'Laboratory examination', 'Pemeriksaan laboratorium', 'Pemeriksaan', false),
('Z02.0', 'Examination for admission to educational institution', 'Surat keterangan sehat (sekolah)', 'Pemeriksaan', true),
('Z02.1', 'Pre-employment examination', 'Surat keterangan sehat (kerja)', 'Pemeriksaan', true),
('Z23',   'Encounter for immunization', 'Imunisasi', 'Pemeriksaan', true),
('Z71.3', 'Dietary counselling and surveillance', 'Konseling gizi', 'Pemeriksaan', false),
('Z76.0', 'Encounter for issue of repeat prescription', 'Kontrol / resep ulang obat rutin', 'Pemeriksaan', true),
('Z09.9', 'Follow-up examination after unspecified treatment', 'Kontrol pasca pengobatan', 'Pemeriksaan', true),
-- Cedera
('S00.9', 'Superficial injury of head, part unspecified', 'Luka lecet kepala', 'Cedera', false),
('S61.9', 'Open wound of wrist and hand, part unspecified', 'Luka terbuka tangan', 'Cedera', false),
('T14.0', 'Superficial injury of unspecified body region', 'Luka lecet / Vulnus excoriatum', 'Cedera', true),
('T14.1', 'Open wound of unspecified body region', 'Luka terbuka / Vulnus laceratum', 'Cedera', true),
('S93.4', 'Sprain and strain of ankle', 'Terkilir pergelangan kaki', 'Cedera', false),
('T30.0', 'Burn of unspecified body region, unspecified degree', 'Luka bakar', 'Cedera', false),
('W57',   'Bitten or stung by nonvenomous insect', 'Gigitan serangga', 'Cedera', false),
('T63.4', 'Venom of other arthropods', 'Sengatan/racun artropoda', 'Cedera', false),
-- Gejala umum
('R11',   'Nausea and vomiting', 'Mual dan muntah', 'Gejala Umum', true),
('R10.4', 'Other and unspecified abdominal pain', 'Nyeri perut', 'Gejala Umum', true),
('R53',   'Malaise and fatigue', 'Lemas / Kelelahan', 'Gejala Umum', true),
('R63.0', 'Anorexia', 'Nafsu makan menurun', 'Gejala Umum', false),
('R06.0', 'Dyspnoea', 'Sesak napas', 'Gejala Umum', false),
('R07.4', 'Chest pain, unspecified', 'Nyeri dada', 'Gejala Umum', false),
('R60.0', 'Localized oedema', 'Bengkak lokal', 'Gejala Umum', false),
('R21',   'Rash and other nonspecific skin eruption', 'Ruam kulit', 'Gejala Umum', false)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 5. OBAT — generik yang umum tersedia di klinik pratama (Fornas FKTP)
--    Kolom kode_kfa diisi belakangan dari Kamus Farmasi & Alkes SatuSehat.
-- ---------------------------------------------------------------------
insert into obat (kode_internal, nama, nama_generik, bentuk_sediaan, kekuatan, satuan, golongan, formularium) values
  ('OB001','Paracetamol 500 mg','Paracetamol','Tablet','500 mg','Tablet','Bebas', true),
  ('OB002','Paracetamol Sirup 120 mg/5 mL','Paracetamol','Sirup','120 mg/5 mL','Botol','Bebas', true),
  ('OB003','Amoxicillin 500 mg','Amoxicillin','Kaplet','500 mg','Tablet','Keras', true),
  ('OB004','Amoxicillin Sirup Kering 125 mg/5 mL','Amoxicillin','Sirup kering','125 mg/5 mL','Botol','Keras', true),
  ('OB005','Cefadroxil 500 mg','Cefadroxil','Kapsul','500 mg','Kapsul','Keras', true),
  ('OB006','Ciprofloxacin 500 mg','Ciprofloxacin','Tablet','500 mg','Tablet','Keras', true),
  ('OB007','Cotrimoxazole 480 mg','Sulfametoksazol-Trimetoprim','Tablet','480 mg','Tablet','Keras', true),
  ('OB008','Metronidazole 500 mg','Metronidazole','Tablet','500 mg','Tablet','Keras', true),
  ('OB009','Eritromisin 500 mg','Eritromisin','Tablet','500 mg','Tablet','Keras', true),
  ('OB010','Ibuprofen 400 mg','Ibuprofen','Tablet','400 mg','Tablet','Keras', true),
  ('OB011','Natrium Diklofenak 50 mg','Natrium Diklofenak','Tablet','50 mg','Tablet','Keras', true),
  ('OB012','Asam Mefenamat 500 mg','Asam Mefenamat','Kaplet','500 mg','Tablet','Keras', true),
  ('OB013','Meloxicam 7,5 mg','Meloxicam','Tablet','7,5 mg','Tablet','Keras', true),
  ('OB014','Dexamethasone 0,5 mg','Dexamethasone','Tablet','0,5 mg','Tablet','Keras', true),
  ('OB015','Methylprednisolone 4 mg','Methylprednisolone','Tablet','4 mg','Tablet','Keras', true),
  ('OB016','Chlorpheniramine Maleate 4 mg','CTM','Tablet','4 mg','Tablet','Bebas Terbatas', true),
  ('OB017','Cetirizine 10 mg','Cetirizine','Tablet','10 mg','Tablet','Bebas Terbatas', true),
  ('OB018','Loratadine 10 mg','Loratadine','Tablet','10 mg','Tablet','Bebas Terbatas', true),
  ('OB019','Ambroxol 30 mg','Ambroxol','Tablet','30 mg','Tablet','Bebas Terbatas', true),
  ('OB020','Gliseril Guaiakolat 100 mg','Guaifenesin','Tablet','100 mg','Tablet','Bebas', true),
  ('OB021','OBH Sirup','Obat Batuk Hitam','Sirup','-','Botol','Bebas', true),
  ('OB022','Salbutamol 2 mg','Salbutamol','Tablet','2 mg','Tablet','Keras', true),
  ('OB023','Antasida DOEN','Antasida','Tablet kunyah','-','Tablet','Bebas', true),
  ('OB024','Ranitidine 150 mg','Ranitidine','Tablet','150 mg','Tablet','Keras', false),
  ('OB025','Omeprazole 20 mg','Omeprazole','Kapsul','20 mg','Kapsul','Keras', true),
  ('OB026','Lansoprazole 30 mg','Lansoprazole','Kapsul','30 mg','Kapsul','Keras', true),
  ('OB027','Domperidone 10 mg','Domperidone','Tablet','10 mg','Tablet','Keras', true),
  ('OB028','Attapulgite 600 mg','Attapulgite','Tablet','600 mg','Tablet','Bebas', true),
  ('OB029','Oralit','Oralit','Serbuk','-','Sachet','Bebas', true),
  ('OB030','Zinc 20 mg','Zinc Sulfat','Tablet dispersibel','20 mg','Tablet','Bebas', true),
  ('OB031','Amlodipine 5 mg','Amlodipine','Tablet','5 mg','Tablet','Keras', true),
  ('OB032','Amlodipine 10 mg','Amlodipine','Tablet','10 mg','Tablet','Keras', true),
  ('OB033','Captopril 25 mg','Captopril','Tablet','25 mg','Tablet','Keras', true),
  ('OB034','Lisinopril 10 mg','Lisinopril','Tablet','10 mg','Tablet','Keras', true),
  ('OB035','Candesartan 8 mg','Candesartan','Tablet','8 mg','Tablet','Keras', true),
  ('OB036','Bisoprolol 5 mg','Bisoprolol','Tablet','5 mg','Tablet','Keras', true),
  ('OB037','Hydrochlorothiazide 25 mg','HCT','Tablet','25 mg','Tablet','Keras', true),
  ('OB038','Furosemide 40 mg','Furosemide','Tablet','40 mg','Tablet','Keras', true),
  ('OB039','Simvastatin 20 mg','Simvastatin','Tablet','20 mg','Tablet','Keras', true),
  ('OB040','Atorvastatin 20 mg','Atorvastatin','Tablet','20 mg','Tablet','Keras', true),
  ('OB041','Metformin 500 mg','Metformin','Tablet','500 mg','Tablet','Keras', true),
  ('OB042','Glimepiride 2 mg','Glimepiride','Tablet','2 mg','Tablet','Keras', true),
  ('OB043','Glibenclamide 5 mg','Glibenclamide','Tablet','5 mg','Tablet','Keras', true),
  ('OB044','Allopurinol 100 mg','Allopurinol','Tablet','100 mg','Tablet','Keras', true),
  ('OB045','Colchicine 0,5 mg','Colchicine','Tablet','0,5 mg','Tablet','Keras', true),
  ('OB046','Vitamin B Kompleks','Vitamin B Kompleks','Tablet','-','Tablet','Bebas', true),
  ('OB047','Vitamin B1 50 mg','Thiamine','Tablet','50 mg','Tablet','Bebas', true),
  ('OB048','Vitamin B6 10 mg','Pyridoxine','Tablet','10 mg','Tablet','Bebas', true),
  ('OB049','Vitamin B12 50 mcg','Cyanocobalamin','Tablet','50 mcg','Tablet','Bebas', true),
  ('OB050','Vitamin C 50 mg','Asam Askorbat','Tablet','50 mg','Tablet','Bebas', true),
  ('OB051','Tablet Tambah Darah (Fe + Asam Folat)','Ferrous Fumarate','Tablet','60 mg','Tablet','Bebas', true),
  ('OB052','Asam Folat 1 mg','Asam Folat','Tablet','1 mg','Tablet','Bebas', true),
  ('OB053','Kalsium Laktat 500 mg','Kalsium Laktat','Tablet','500 mg','Tablet','Bebas', true),
  ('OB054','Albendazole 400 mg','Albendazole','Tablet','400 mg','Tablet','Bebas Terbatas', true),
  ('OB055','Griseofulvin 125 mg','Griseofulvin','Tablet','125 mg','Tablet','Keras', true),
  ('OB056','Ketoconazole Krim 2%','Ketoconazole','Krim','2%','Tube','Keras', true),
  ('OB057','Miconazole Krim 2%','Miconazole','Krim','2%','Tube','Bebas Terbatas', true),
  ('OB058','Hidrokortison Krim 2,5%','Hidrokortison','Krim','2,5%','Tube','Keras', true),
  ('OB059','Betamethasone Krim 0,1%','Betamethasone','Krim','0,1%','Tube','Keras', true),
  ('OB060','Gentamicin Salep 0,1%','Gentamicin','Salep','0,1%','Tube','Keras', true),
  ('OB061','Salep 2-4 (Asam Salisilat-Sulfur)','Asam Salisilat-Sulfur','Salep','-','Pot','Bebas', true),
  ('OB062','Permethrin Krim 5%','Permethrin','Krim','5%','Tube','Keras', true),
  ('OB063','Kloramfenikol Tetes Mata 0,5%','Kloramfenikol','Tetes mata','0,5%','Botol','Keras', true),
  ('OB064','Kloramfenikol Tetes Telinga 3%','Kloramfenikol','Tetes telinga','3%','Botol','Keras', true),
  ('OB065','Povidone Iodine 10%','Povidone Iodine','Larutan','10%','Botol','Bebas', true),
  ('OB066','Betahistine Mesylate 6 mg','Betahistine','Tablet','6 mg','Tablet','Keras', true),
  ('OB067','Dimenhydrinate 50 mg','Dimenhydrinate','Tablet','50 mg','Tablet','Bebas Terbatas', true),
  ('OB068','Hyoscine-N-butylbromide 10 mg','Hyoscine','Tablet','10 mg','Tablet','Keras', true),
  ('OB069','Bisacodyl 5 mg','Bisacodyl','Tablet salut','5 mg','Tablet','Bebas Terbatas', true),
  ('OB070','Lactulose Sirup','Lactulose','Sirup','-','Botol','Keras', true)
on conflict (kode_internal) do nothing;

-- ---------------------------------------------------------------------
-- 6. Konfigurasi bridging (belum aktif — kredensial disimpan di Edge Function)
-- ---------------------------------------------------------------------
insert into bridging_config (sistem, aktif, mode, base_url) values
  ('PCARE',     false, 'SANDBOX', 'https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev'),
  ('SATUSEHAT', false, 'SANDBOX', 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1')
on conflict (sistem) do nothing;

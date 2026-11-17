/**
 * Seed kategori/subkategori SADEWA ke Firestore (sumber kebenaran runtime).
 *
 * SEMUA data default (nama, slug, template laporan, config sheet/drive, gambar 1-10)
 * DI-HARDCODE DI SCRIPT INI SAJA — app membaca dari Firestore, bukan hardcode.
 *
 * Pakai:
 *   npx tsx scripts/seed-categories.mts
 * butuh FIREBASE_SERVICE_ACCOUNT di env/.env (nilai tidak dicetak ke log).
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

try {
  const envText = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
} catch {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} belum diisi.`);
  return value;
}

const raw = required('FIREBASE_SERVICE_ACCOUNT');
let serviceAccount: Record<string, unknown>;
try { serviceAccount = JSON.parse(raw) as Record<string, unknown>; }
catch { throw new Error('FIREBASE_SERVICE_ACCOUNT harus berupa JSON valid.'); }

const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount as any) });
const db = getFirestore(app);

// ── DATA DEFAULT (hardcode di sini, ditembak ke Firestore) ──────────────────
const TPL_KEBAKARAN = `Kepada,Yth. Kepala Satuan Polisi Pamong Praja Kabupaten Ponorogo di - *PONOROGO* .

*Mohon ijin Melaporkan Hasil Pelaksanaan Kegiatan,* • Pemadaman Kebakaran ( [OBJEK KEBAKARAN] )

*HARI DAN TANGGAL PELAKSANAAN :*• [Hari], [Tanggal] [Bulan] [Tahun].

*LAPORAN MASUK :* • [HH.MM] Wib.
*WAKTU BERANGKAT :*• [HH.MM] Wib.
*TIBA DILOKASI :*• [HH.MM] Wib.
*MULAI KEGIATAN :*  • [HH.MM] Wib.
*SELESAI KEGIATAN :*• [HH.MM] Wib.
*TIBA KEMBALI DI MAKO :*• [HH.MM] Wib.

*LOKASI :*• [Alamat lengkap lokasi].
GPS [Lintang]⁰S, [Bujur]⁰E

*JARAK TEMPUH PERJALANAN :* • [Jarak] Km
*ESTIMASI WAKTU PERJALANAN :*• [Durasi] Menit
*PEMBERI INFORMASI ( PELAPOR / PEMOHON ) :*• [Nama]
*PEMILIK :*• [Nama / Umum]
*JUMLAH PENGHUNI RUMAH YANG TERDAMPAK :* • [Jumlah / -]
*LUAS AREA:*• [Luas]
*KORBAN :*• [Nihil / Keterangan]
*KENDALA :*• [Nihil / Keterangan]

*PENYEBAB:*• [Penyebab]
*Kronologi* [Uraian kronologi]
*PERKIRAAN KERUGIAN:*• [Kerugian]
*PERKIRAAN HARTA BENDA YANG TERSELAMATKAN:*• [Harta benda]
*Areal yang terbakar*: • [Luas]

*TINDAKAN* [Uraian tindakan]
 *RINCIAN KEGIATAN :*• Menindak lanjuti laporan, Regu [A/B/C/D/E] Satpol PP Ponorogo melaksanakan pemadaman [uraian].

*JUMLAH UNIT KENDARAKAN YANG DIGUNAKAN :* [Jumlah] unit
• [Kendaraan dan nomor]
*PERSONIL YANG TERLIBAT :*• Personil Regu [A/B/C/D/E] Satpol PP.
• [Personil lainnya]

Pelaksanaan kegiatan tersebut sampai dengan selesai berjalan aman dan lancar.
*DOKUMENTASI TERLAMPIR*

Demikian yang dapat kami laporkan untuk menjadikan periksa, dan apabila ada perkembangan informasi dilapangan dapat dilaporkan kembali.

*YANG MELAPORKAN :*_ *[NAMA PELAPOR]*_Komandan Regu [A/B/C/D/E] Satpol PP Ponorogo.
 *TEMBUSAN*1. Dir Pol PP Kemendagri.2. Kasatpol PP Prov. Jatim.`;

const TPL_ODNK = `Kepada,Yth. Kepala Satuan Polisi Pamong Praja Kabupaten Ponorogo di - *PONOROGO* .

*Mohon ijin Melaporkan Hasil Pelaksanaan Kegiatan Sebagai Berikut :* *OBJEK :*• [Jenis kejadian/objek non-kebakaran]

*HARI DAN TANGGAL PELAKSANAAN :*• [Hari], [Tanggal] [Bulan] [Tahun].

*LAPORAN MASUK :* • [HH.MM] Wib.
*WAKTU BERANGKAT :*• [HH.MM] Wib.
*TIBA DILOKASI :*• [HH.MM] Wib.
*MULAI KEGIATAN :*  • [HH.MM] Wib.
*SELESAI KEGIATAN :*• [HH.MM] Wib.
*TIBA KEMBALI DI MAKO :*• [HH.MM] Wib.

*LOKASI :*• [Alamat lengkap lokasi].
GPS [Lintang]⁰S, [Bujur]⁰E

*JARAK TEMPUH PERJALANAN :* • [Jarak] Km
*ESTIMASI WAKTU PERJALANAN :*• [Durasi] Menit
*PELAPOR / PEMOHON :*• [Nama]
*PEMILIK :*• [Nama / Umum]
*JUMLAH PENGHUNI :*• [Jumlah / -]
*KORBAN :*• [Nihil / Keterangan]

*PENYEBAB:*• [Penyebab / -]
*Kronologi* [Uraian kronologi]

*RINCIAN KEGIATAN :*• Menindak lanjuti laporan, Regu [A/B/C/D/E] Satpol PP Ponorogo melaksanakan [evakuasi/rescue/penanganan].
*TINDAKAN* [Uraian tindakan]

*JUMLAH UNIT KENDARAKAN YANG DIGUNAKAN :* [Jumlah] unit
• [Kendaraan dan nomor]
*KENDALA :*• [Nihil / Keterangan]
*PERSONIL YANG TERLIBAT :*• Personil Regu [A/B/C/D/E] Satpol PP.
• [Personil lainnya]

Pelaksanaan kegiatan tersebut sampai dengan selesai berjalan aman dan lancar.
*DOKUMENTASI TERLAMPIR*

Demikian yang dapat kami laporkan untuk menjadikan periksa, dan apabila ada perkembangan informasi dilapangan dapat dilaporkan kembali.

*YANG MELAPORKAN :*_ *[NAMA PELAPOR]*_Komandan Regu [A/B/C/D/E] Satpol PP Ponorogo.
 *TEMBUSAN*1. Dir Pol PP Kemendagri.2. Kasatpol PP Prov. Jatim.`;

const TPL_GENERIC = (name: string) => `LAPORAN ${name}

Hari/Tanggal: 
Waktu: 
Lokasi: 
Kronologi: 
Tindakan: 
Pelapor/Petugas: 
Keterangan: `;

const FIELDS = [
  { key: 'tanggal', label: 'Hari/Tanggal', aliases: ['HARI DAN TANGGAL', 'TANGGAL', 'HARI/TANGGAL'], required: true },
  { key: 'waktu', label: 'Waktu', aliases: ['WAKTU', 'JAM'], type: 'time' },
  { key: 'lokasi', label: 'Lokasi', aliases: ['LOKASI', 'ALAMAT'], required: true, type: 'multiline' },
  { key: 'kronologi', label: 'Kronologi', aliases: ['KRONOLOGI'], type: 'multiline' },
  { key: 'tindakan', label: 'Tindakan', aliases: ['TINDAKAN', 'PENANGANAN'], type: 'multiline' },
  { key: 'pelapor', label: 'Pelapor/Petugas', aliases: ['PELAPOR', 'PETUGAS', 'YANG MELAPORKAN'] },
  { key: 'keterangan', label: 'Keterangan', aliases: ['KETERANGAN', 'KENDALA'], type: 'multiline' },
];
const fmt = (template: string) => ({ template, fields: FIELDS, version: 1 });

const CATEGORIES = [
  { slug: 'damkar', name: 'DAMKAR', description: 'Laporan Pemadam Kebakaran & Penyelamatan', tone: 'orange', order: 1, active: true, image: '1', config: { driveFolder: 'DAMKAR' } },
  { slug: 'tibum', name: 'TIBUM', description: 'Laporan Ketertiban Umum', tone: 'blue', order: 2, active: true, image: '3', config: { driveFolder: 'TIBUM' } },
] as const;

const SUBCATEGORIES = [
  { categorySlug: 'damkar', name: 'Kebakaran', slug: 'kebakaran', description: 'Laporan pemadaman dan penanganan kebakaran', order: 1, active: true, image: '1', format: fmt(TPL_KEBAKARAN), config: { driveFolder: 'KEBAKARAN', reportSheet: 'KEBAKARAN', photoSheet: 'DOKUMENTASI KEBAKARAN', narrativeSheet: 'NARASI KEBAKARAN' } },
  { categorySlug: 'damkar', name: 'ODNK (Non-Kebakaran)', slug: 'odnk', description: 'Laporan evakuasi, rescue, dan kejadian non-kebakaran', order: 2, active: true, image: '2', format: fmt(TPL_ODNK), config: { driveFolder: 'ODNK', reportSheet: 'ODNK', photoSheet: 'DOKUMENTASI ODNK', narrativeSheet: 'NARASI ODNK' } },
  { categorySlug: 'tibum', name: 'Piket Mako', slug: 'piket-mako', description: 'Laporan piket mako', order: 1, active: true, image: '4', format: fmt(TPL_GENERIC('PIKET MAKO')), config: { driveFolder: 'PIKET_MAKO', reportSheet: 'PIKET MAKO', photoSheet: 'DOKUMENTASI PIKET MAKO', narrativeSheet: 'NARASI PIKET MAKO' } },
  { categorySlug: 'tibum', name: 'Penggunaan Kendaraan', slug: 'penggunaan-kendaraan', description: 'Laporan penggunaan kendaraan', order: 2, active: true, image: '5', format: fmt(TPL_GENERIC('PENGGUNAAN KENDARAAN')), config: { driveFolder: 'PENGGUNAAN_KENDARAAN', reportSheet: 'PENGGUNAAN KENDARAAN', photoSheet: 'DOKUMENTASI PENGGUNAAN KENDARAAN', narrativeSheet: 'NARASI PENGGUNAAN KENDARAAN' } },
] as const;

async function upsertBySlug(col: string, slug: string, data: Record<string, unknown>) {
  const q = await db.collection(col).where('slug', '==', slug).limit(1).get();
  const payload = { ...data, slug, updatedAt: FieldValue.serverTimestamp() };
  if (q.empty) {
    await db.collection(col).add({ ...payload, createdAt: FieldValue.serverTimestamp() });
    console.log(`+ ${col}/${slug} (created)`);
  } else {
    await q.docs[0].ref.set(payload, { merge: true });
    console.log(`~ ${col}/${slug} (updated)`);
  }
  const snap = await db.collection(col).where('slug', '==', slug).limit(1).get();
  return snap.docs[0].id;
}

const catIds = new Map<string, string>();
for (const c of CATEGORIES) catIds.set(c.slug, await upsertBySlug('report_categories', c.slug, { ...c }));
for (const s of SUBCATEGORIES) {
  const categoryId = catIds.get(s.categorySlug);
  if (!categoryId) throw new Error(`Kategori induk '${s.categorySlug}' tidak ditemukan.`);
  const { categorySlug: _omit, ...rest } = s as any;
  await upsertBySlug('report_subcategories', s.slug, { ...rest, categoryId });
}

console.log('Seed kategori/subkategori selesai (Firestore = sumber kebenaran).');
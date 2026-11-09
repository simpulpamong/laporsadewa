import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore as _getFirestore } from 'firebase-admin/firestore';

function ensureApp() {
  if (getApps().length) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT tidak dikonfigurasi.');
  let json = String(raw).trim();
  if ((json.startsWith('"') && json.endsWith('"')) || (json.startsWith("'") && json.endsWith("'"))) json = json.slice(1, -1);
  let creds: any;
  try { creds = JSON.parse(json); } catch { creds = JSON.parse(Buffer.from(json, 'base64').toString('utf8')); }
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  return initializeApp({ credential: cert(creds) });
}

export function getFirestore() {
  return _getFirestore(ensureApp());
}

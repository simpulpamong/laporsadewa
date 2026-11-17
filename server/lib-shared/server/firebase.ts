import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore as firestore } from 'firebase-admin/firestore';

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\r/g, '');
}

function stripWrappingQuotes(value: string) {
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
  return t;
}

function parseServiceAccount(rawInput: string): ServiceAccount {
  let raw = stripWrappingQuotes(rawInput);
  let credentials: Record<string, unknown> | null = null;

  const tryParse = (value: string) => {
    try { return JSON.parse(value) as unknown; } catch { return null; }
  };

  let parsed: unknown = tryParse(raw);
  if (typeof parsed === 'string') parsed = tryParse(parsed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) credentials = parsed as Record<string, unknown>;

  if (!credentials) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT harus berisi JSON service account yang valid.');
  }

  const projectId = credentials.project_id ?? credentials.projectId;
  const clientEmail = credentials.client_email ?? credentials.clientEmail;
  const privateKey = credentials.private_key ?? credentials.privateKey;
  if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error('Service account Firebase harus memiliki project_id, client_email, dan private_key.');
  }

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };
}

export function getFirestore() {
  const candidates = [process.env.FIREBASE_SERVICE_ACCOUNT, process.env.FIREBASE_SERVICE_ACCOUNT_JSON]
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);

  if (candidates.length === 0) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT atau FIREBASE_SERVICE_ACCOUNT_JSON belum dikonfigurasi di environment server.');
  }

  const existing = getApps()[0];
  if (existing) return firestore(existing);

  let lastError: unknown;
  for (const raw of candidates) {
    try {
      const serviceAccount = parseServiceAccount(raw);
      const app = initializeApp({ credential: cert(serviceAccount) });
      return firestore(app);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('FIREBASE_SERVICE_ACCOUNT harus berisi JSON service account yang valid.');
}

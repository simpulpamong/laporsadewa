import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore as firestore } from 'firebase-admin/firestore';

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\r/g, '');
}

export function getFirestore() {
  const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawEnv?.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT atau FIREBASE_SERVICE_ACCOUNT_JSON belum dikonfigurasi di environment server.');
  }

  const raw = rawEnv.trim();
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    try {
      // dukung nilai yang ter-escape ganda (mis. tersimpan sebagai string JSON di env)
      const unwrapped = JSON.parse(raw) as unknown;
      if (typeof unwrapped === 'string') credentials = JSON.parse(unwrapped) as Record<string, unknown>;
      else throw new Error('invalid');
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT harus berisi JSON service account yang valid.');
    }
  }

  const projectId = credentials.project_id ?? credentials.projectId;
  const clientEmail = credentials.client_email ?? credentials.clientEmail;
  const privateKey = credentials.private_key ?? credentials.privateKey;
  if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error('Service account Firebase harus memiliki project_id, client_email, dan private_key.');
  }

  const serviceAccount: ServiceAccount = {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };

  const existing = getApps()[0];
  const app = existing || initializeApp({ credential: cert(serviceAccount) });
  return firestore(app);
}

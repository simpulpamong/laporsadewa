import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore as firestore } from 'firebase-admin/firestore';

export function getFirestore() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT atau FIREBASE_SERVICE_ACCOUNT_JSON belum dikonfigurasi di environment server.');
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT harus berisi JSON service account yang valid.');
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
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };

  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  return firestore(app);
}

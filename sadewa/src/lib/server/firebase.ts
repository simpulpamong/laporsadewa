import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore as firestore } from 'firebase-admin/firestore';
export function getFirestore() {
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT; if(!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum dikonfigurasi');
  const app=getApps()[0]||initializeApp({credential:cert(JSON.parse(raw))}); return firestore(app);
}

import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

/** Klien autentikasi yang dipakai googleapis. */
type GoogleAuthClient = OAuth2Client | GoogleAuth;

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type GoogleAuth = InstanceType<typeof google.auth.GoogleAuth>;

let cachedAuth: GoogleAuthClient | null = null;
let cachedAuthMode: 'oauth' | 'service-account' | null = null;

function createServiceAccountAuth(): GoogleAuthClient | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(raw);
    if (typeof credentials.private_key === 'string') {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.');
  }

  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

function isOAuthCredentialError(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown; response?: { data?: unknown } };
  return /(invalid[_ ]grant|unauthorized[_ ]client|invalid[_ ]client)/i.test(
    `${String(value?.code || '')} ${String(value?.message || '')} ${JSON.stringify(value?.response?.data || '')}`,
  );
}

/**
 * Autentikasi Google.
 *
 * Gunakan service account sebagai autentikasi utama agar upload cepat dan stabil.
 * OAuth hanya menjadi fallback jika service account tidak dikonfigurasi.
 */
function resolveAuth(): GoogleAuthClient {
  if (cachedAuth) return cachedAuth;

  const serviceAccount = createServiceAccountAuth();
  if (serviceAccount) {
    cachedAuth = serviceAccount;
    cachedAuthMode = 'service-account';
    return cachedAuth;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const client = new google.auth.OAuth2(clientId, clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    cachedAuth = client;
    cachedAuthMode = 'oauth';
    return cachedAuth;
  }

  if (!serviceAccount) {
    throw new Error(
      'Kredensial Google belum dikonfigurasi. Isi GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN atau GOOGLE_SERVICE_ACCOUNT_JSON.',
    );
  }

  cachedAuth = serviceAccount;
  cachedAuthMode = 'service-account';
  return cachedAuth;
}

async function withGoogleAuthFallback<T>(
  operation: (auth: GoogleAuthClient) => Promise<T>,
): Promise<T> {
  const auth = resolveAuth();
  try {
    return await operation(auth);
  } catch (error) {
    if (cachedAuthMode !== 'oauth' || !isOAuthCredentialError(error)) throw error;

    const fallback = createServiceAccountAuth();
    if (!fallback) {
      throw new Error(
        'Kredensial Google OAuth ditolak (unauthorized_client/invalid_grant). Perbarui pasangan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REFRESH_TOKEN, atau sediakan GOOGLE_SERVICE_ACCOUNT_JSON dengan akses ke Drive dan Spreadsheet.',
      );
    }

    console.warn('[google] OAuth ditolak, mencoba service account cadangan.');
    cachedAuth = fallback;
    cachedAuthMode = 'service-account';
    return operation(fallback);
  }
}

function getDrive(auth: GoogleAuthClient = resolveAuth()) {
  return google.drive({ version: 'v3', auth });
}

function getSheets(auth: GoogleAuthClient = resolveAuth()) {
  return google.sheets({ version: 'v4', auth });
}

export function withDriveFallback<T>(operation: (drive: ReturnType<typeof getDrive>) => Promise<T>) {
  return withGoogleAuthFallback(auth => operation(getDrive(auth)));
}

export function withSheetsFallback<T>(operation: (sheets: ReturnType<typeof getSheets>) => Promise<T>) {
  return withGoogleAuthFallback(auth => operation(getSheets(auth)));
}

export async function verifyGoogleAccess(): Promise<void> {
  await withGoogleAuthFallback(async auth => {
    const result = await auth.getAccessToken();
    const token = typeof result === 'string' ? result : result.token;
    if (!token) throw new Error('Google tidak memberikan access token.');
  });
}

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID || process.env.SPREADSHEET_ID || '';
  if (!id) throw new Error('GOOGLE_SHEET_ID belum dikonfigurasi.');
  return id;
}

export function getMainFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.FOLDER_UTAMA_ID || '';
  if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi.');
  return id;
}

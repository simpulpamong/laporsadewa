import {
  appendDraftPhoto,
  consumeDraft,
  createDraft,
  deleteDraft,
  listDrafts,
  type DraftPhotoMeta,
} from '@/lib/server/drafts';
import { ApiError, assertImageDataUrl, checkRateLimit, ok, readJson, route, str } from '@/lib/server/http';
import { MAX_PHOTOS, MAX_PHOTO_KB } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TEXT = 20_000;
const MAX_BASE64 = 8 * 1024 * 1024;

/** GET /api/drafts?scope=sadewa — daftar draft. */
export async function GET(request: Request) {
  return route(async () => {
    checkRateLimit(request, 'drafts:get', 60, 60_000);
    const scope = str(new URL(request.url).searchParams.get('scope'), 40) || 'sadewa';
    const drafts = await listDrafts(scope);
    return ok({ drafts });
  });
}

/**
 * POST /api/drafts
 * body: { action: 'create' | 'append' | 'load' | 'delete', ... }
 */
export async function POST(request: Request) {
  return route(async () => {
    checkRateLimit(request, 'drafts:post', 120, 60_000);
    const body = await readJson<Record<string, unknown>>(request);
    const action = str(body.action, 30);

    switch (action) {
      case 'create':
        return createDraftAction(body);
      case 'append':
        checkRateLimit(request, 'drafts:append', 60, 60_000);
        return appendDraftAction(body);
      case 'load':
        return loadDraftAction(body);
      case 'delete':
        return deleteDraftAction(body);
      default:
        throw new ApiError(`Aksi tidak dikenal: ${action || '(kosong)'}`, 400, 'unknown_action');
    }
  });
}

async function createDraftAction(body: Record<string, unknown>) {
  const scope = str(body.scope, 40) || 'sadewa';
  const teks = str(body.teks, MAX_TEXT);
  const label = str(body.label, 120);
  const draftId = str(body.draftId, 80) || `DRF-${Date.now().toString(36).toUpperCase()}`;

  const id = await createDraft({ draftId, scope, teks, label });
  return ok({ draftId: id, jumlahFoto: 0 });
}

async function appendDraftAction(body: Record<string, unknown>) {
  const draftId = str(body.draftId, 80);
  if (!draftId) throw new ApiError('ID draft tidak ditemukan.', 400, 'missing_draft_id');

  const foto = (body.foto || {}) as { data?: unknown; mime?: unknown; source?: unknown };
  const dataUrl = typeof foto.data === 'string' ? foto.data : '';
  assertImageDataUrl(dataUrl, 'foto');
  if (dataUrl.length > MAX_BASE64) {
    throw new ApiError('Ukuran foto melebihi batas upload.', 413, 'payload_too_large');
  }

  const meta = normalizeMeta(body.exifMeta);
  const sizeKB = Math.min(Math.max(Number(body.sizeKB) || 0, 0), MAX_PHOTO_KB);

  const asset = await appendDraftPhoto({
    draftId,
    photoKey: str(body.photoKey, 180),
    scope: str(body.scope, 40) || 'sadewa',
    dataUrl,
    mime: str(foto.mime, 60) || 'image/jpeg',
    source: str(foto.source, 20) || 'camera',
    sizeKB,
    exifMeta: meta,
  });

  return ok({ publicId: asset.publicId });
}

async function loadDraftAction(body: Record<string, unknown>) {
  const draftId = str(body.draftId, 80);
  if (!draftId) throw new ApiError('ID draft tidak ditemukan.', 400, 'missing_draft_id');

  const draft = await consumeDraft(draftId);
  return ok({
    draftId,
    teks: draft.teks,
    jumlahFoto: draft.photos.length,
    label: draft.summary.teksPreview,
    photos: draft.photos.slice(0, MAX_PHOTOS),
  });
}

async function deleteDraftAction(body: Record<string, unknown>) {
  const draftId = str(body.draftId, 80);
  if (!draftId) throw new ApiError('ID draft tidak ditemukan.', 400, 'missing_draft_id');
  const removed = await deleteDraft(draftId);
  return ok({ removed });
}

function normalizeMeta(value: unknown): DraftPhotoMeta {
  const meta = (value || {}) as Record<string, unknown>;
  const lat = Number(meta.lat);
  const lng = Number(meta.lng);
  const hasGps =
    meta.hasGps === true &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  return {
    hasGps,
    lat: hasGps ? Number(lat.toFixed(6)) : null,
    lng: hasGps ? Number(lng.toFixed(6)) : null,
    datetime: str(meta.datetime, 40) || null,
    address: str(meta.address, 300) || null,
    source: str(meta.source, 20) || 'camera',
  };
}

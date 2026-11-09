import type { Request, Response } from 'express';
import { appendDraftPhoto, consumeDraft, createDraft, deleteDraft, listDrafts } from './drafts';
import { ApiError, assertImageDataUrl, checkRateLimit, ok, str, toError } from './http';

async function toDataUrl(url: string, mimeHint?: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    const r = await fetch(url, { signal: ac.signal } as any);
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = String(r.headers.get('content-type') || mimeHint || 'image/jpeg').split(';')[0].trim();
    const ab = await r.arrayBuffer();
    if (!ab.byteLength || ab.byteLength > 8 * 1024 * 1024) return null;
    return `data:${ct};base64,${Buffer.from(ab).toString('base64')}`;
  } catch { return null; }
}

const MAX_TEXT = 20000;
const MAX_BASE64 = 8 * 1024 * 1024;
const MAX_PHOTO_KB = 400;
const MAX_PHOTOS = 20;

export async function handleDraftsGet(req: Request, res: Response) {
  try {
    checkRateLimit(req, 'drafts:get', 60, 60_000);
    const scope = str((req.query as any)?.scope, 40) || 'sadewa';
    const drafts = await listDrafts(scope);
    return ok(res, { drafts });
  } catch (e) { return toError(res, e); }
}

export async function handleDraftsPost(req: Request, res: Response) {
  try {
    checkRateLimit(req, 'drafts:post', 120, 60_000);
    const body = (req.body || {}) as any;
    const action = str(body.action, 30);
    switch (action) {
      case 'create': {
        const scope = str(body.scope, 40) || 'sadewa';
        const draftId = str(body.draftId, 80) || `DRF-${Date.now().toString(36).toUpperCase()}`;
        const teks = str(body.teks, MAX_TEXT);
        const label = str(body.label, 120);
        await createDraft({ draftId, scope, teks, label });
        return ok(res, { draftId, jumlahFoto: 0 });
      }
      case 'append': {
        checkRateLimit(req, 'drafts:append', 60, 60_000);
        const draftId = str(body.draftId, 80);
        if (!draftId) throw new ApiError('draftId wajib.', 400, 'missing_draft');
        const foto = (body.foto || {}) as any;
        const dataUrl = typeof foto.data === 'string' ? foto.data : '';
        assertImageDataUrl(dataUrl);
        if (dataUrl.length > MAX_BASE64) throw new ApiError('Ukuran foto melebihi batas upload.', 413, 'payload_too_large');
        const raw = body.exifMeta && typeof body.exifMeta === 'object' ? body.exifMeta : {};
        const lat = Number.isFinite(raw.lat) && Math.abs(raw.lat) <= 90 ? Number(raw.lat) : null;
        const lng = Number.isFinite(raw.lng) && Math.abs(raw.lng) <= 180 ? Number(raw.lng) : null;
        const exifMeta = {
          hasGps: Boolean(raw.hasGps && lat !== null && lng !== null),
          lat: lat !== null ? Number(lat.toFixed(6)) : null,
          lng: lng !== null ? Number(lng.toFixed(6)) : null,
          datetime: str(raw.datetime, 40) || null,
          address: str(raw.address, 300) || null,
          source: foto.source === 'camera' ? 'camera' : 'gallery',
        };
        const result = await appendDraftPhoto({
          draftId, scope: str(body.scope, 40) || 'sadewa',
          dataUrl, mime: str(foto.mime, 60) || 'image/jpeg', source: exifMeta.source,
          sizeKB: Math.max(0, Math.min(MAX_PHOTO_KB, Number(body.sizeKB) || 0)),
          exifMeta, photoKey: str(body.photoKey, 120),
        });
        return ok(res, { publicId: result.publicId });
      }
      case 'load': {
        const draftId = str(body.draftId, 80);
        if (!draftId) throw new ApiError('draftId wajib.', 400, 'missing_draft');
        const draft = await consumeDraft(draftId);
        const rawPhotos = Array.isArray(draft.photos) ? draft.photos.slice(0, MAX_PHOTOS) : [];
        const photos = await Promise.all(rawPhotos.map(async (p: any) => {
          const data = (typeof p?.data === 'string' && p.data.startsWith('data:'))
            ? p.data
            : (typeof p?.dataUrl === 'string' && p.dataUrl.startsWith('data:'))
              ? p.dataUrl
              : await toDataUrl(String(p?.url || ''), str(p?.mime, 60) || 'image/jpeg');
          return {
            data: data || '',
            mime: str(p?.mime, 60) || 'image/jpeg',
            source: str(p?.source, 20) || 'camera',
            sizeKB: Number(p?.sizeKB) || 0,
            exifMeta: p?.exifMeta || {},
            photoKey: str(p?.photoKey, 180),
            url: str(p?.url, 500),
            publicId: str(p?.publicId, 200),
          };
        }));
        return ok(res, { draftId, teks: draft.teks, jumlahFoto: photos.filter(p => p.data).length, label: draft.summary?.teksPreview || (draft as any).label || '', photos });
      }
      case 'delete': {
        const draftId = str(body.draftId, 80);
        if (!draftId) throw new ApiError('draftId wajib.', 400, 'missing_draft');
        return ok(res, { removed: await deleteDraft(draftId) });
      }
      default: throw new ApiError(`Aksi tidak dikenal: ${action || '(kosong)'}`, 400, 'unknown_action');
    }
  } catch (e) { return toError(res, e); }
}

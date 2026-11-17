import { metaGet, metaSet, metaDel } from '@/features/core/storage';

const KEY_LAST_SUB = 'nav:lastSub';
const KEY_LAST_CAT = 'nav:lastCat';

export async function getLastSubSlug(): Promise<string | null> {
  const v = await metaGet<string>(KEY_LAST_SUB);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function setLastSubSlug(slug: string): Promise<void> {
  if (!slug) { await metaDel(KEY_LAST_SUB); return; }
  await metaSet(KEY_LAST_SUB, slug);
}

export async function getLastCatId(): Promise<string | null> {
  const v = await metaGet<string>(KEY_LAST_CAT);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function setLastCatId(id: string): Promise<void> {
  if (!id) { await metaDel(KEY_LAST_CAT); return; }
  await metaSet(KEY_LAST_CAT, id);
}

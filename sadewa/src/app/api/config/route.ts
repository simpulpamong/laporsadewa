import { NextResponse } from 'next/server';
import { loadDynamicConfig } from '@/lib/server/dynamicConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';
    const cfg = await loadDynamicConfig({ force });
    return NextResponse.json(
      { success: true, ...cfg, fallback: cfg.categories.length === 0 },
      { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, categories: [], subcategories: [], fallback: true, message: e.message },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

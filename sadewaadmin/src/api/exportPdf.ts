/**
 * POST /api/export-pdf — PETA VEKTOR MURNI (HD) (adaptasi Express)
 * Port dari /data/PETA/app/api/export-pdf/route.tsx
 * Merangkai PDF vektor via @react-pdf/renderer dari payload proyeksi client.
 */
import type { Request, Response } from 'express';
import React from 'react';
import fs from 'fs';
import path from 'path';

interface VectorPayload {
  paper: { widthMm: number; heightMm: number };
  header: {
    show: boolean;
    agencyLine1: string;
    agencyLine2: string;
    yearLabel: string;
    title: string;
    subtitle: string;
    logo: string | null;
  };
  map: {
    x: number; y: number; width: number; height: number;
    paths: { d: string; fill: string | null; fillOpacity: number; stroke: string | null; strokeWidth: number; dash?: string }[];
    labels: { x: number; y: number; text: string; fontSize?: number }[];
    north: { x: number; y: number; size: number } | null;
    scaleBar: { x: number; y: number; segWidth: number; segments: number; label: string; denominator: string } | null;
  };
  legend: {
    show: boolean; x: number; y: number; width: number; height: number;
    title: string;
    rows: { color: string; label: string; kind: 'band' | 'noData' }[];
    footerLines: string[];
  };
  footer: {
    showTimestamp: boolean; printedAt: string; basedNote: string[];
    signature: { show: boolean; dateText: string; jabatan: string; nama: string; nip: string };
  };
}

const MM = 72 / 25.4; // mm → pt
const h = React.createElement;

export async function handleExportPdf(req: Request, res: Response) {
  let payload: VectorPayload;
  try {
    payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as VectorPayload;
  } catch {
    return res.status(400).json({ error: 'Payload JSON tidak valid.' });
  }

  if (!payload?.paper?.widthMm || !payload?.paper?.heightMm) {
    return res.status(400).json({ error: 'Ukuran kertas wajib diisi.' });
  }

  const widthPt = Math.min(6 * 1440, payload.paper.widthMm * MM);
  const heightPt = Math.min(6 * 1440, payload.paper.heightMm * MM);
  const pagePad = 10 * MM;

  try {
    const pdf = await import('@react-pdf/renderer');
    const { Document, Page, Text, View, Svg, Path, Image, Rect, renderToBuffer } = pdf as any;

    /* ------------------------------ legenda ------------------------------- */
    const legendChildren: React.ReactNode[] = [];
    if (payload.legend.show) {
      legendChildren.push(
        h(Text, {
          key: 'lg-title',
          style: { position: 'absolute', left: pagePad, top: 10 * MM, fontFamily: 'Helvetica-Bold', fontSize: 8.4, color: '#0f172a' },
        }, payload.legend.title),
      );
      const rows = (payload.legend.rows || []).slice(0, 24);
      rows.forEach((row, i) => {
        legendChildren.push(
          h(View, {
            key: `lg-row-${i}`,
            style: { position: 'absolute', left: pagePad, top: (20 + i * 4.6) * MM, flexDirection: 'row', alignItems: 'center' },
          },
            h(Rect, { width: 7.4, height: 7.4, fill: row.color, stroke: '#94a3b8', strokeWidth: 0.3 }),
            h(Text, { style: { marginLeft: 5, fontFamily: 'Helvetica', fontSize: 7.2, color: '#334155' } }, row.label),
          ),
        );
      });
      const fy = (22 + rows.length * 4.6) * MM;
      (payload.legend.footerLines || []).slice(0, 4).forEach((line, i) => {
        legendChildren.push(
          h(Text, {
            key: `lg-foot-${i}`,
            style: { position: 'absolute', left: pagePad, top: fy + i * 9, width: Math.max(60, payload.legend.width - pagePad * 2), fontFamily: 'Helvetica', fontSize: 6.2, color: '#64748b' },
          }, line),
        );
      });
    }

    /* ------------------------------ batang skala --------------------------- */
    const bar = payload.map.scaleBar;
    const barChildren: React.ReactNode[] = [];
    if (bar) {
      for (let i = 0; i < bar.segments; i++) {
        barChildren.push(
          h(Rect, {
            key: `bar-${i}`, x: bar.x + i * bar.segWidth, y: bar.y, width: bar.segWidth, height: 4.2,
            fill: i % 2 === 0 ? '#0f172a' : '#ffffff', stroke: '#0f172a', strokeWidth: 0.6,
          }),
        );
      }
      barChildren.push(
        h(Text, { key: 'bar-label', x: bar.x, y: bar.y - 4, style: { fontFamily: 'Helvetica-Bold', fontSize: 7, fill: '#0f172a' } }, bar.label),
        h(Text, { key: 'bar-denom', x: bar.x + bar.segments * bar.segWidth + 6, y: bar.y + 3, style: { fontFamily: 'Helvetica', fontSize: 5.8, fill: '#64748b' } }, bar.denominator),
      );
    }

    /* ------------------------------ muka peta ------------------------------ */
    const pathNodes = (payload.map.paths || []).map((p, i) =>
      h(Path, {
        key: `mp-${i}`, d: p.d,
        fill: p.fill ?? 'none', fillOpacity: p.fillOpacity,
        stroke: p.stroke ?? 'none', strokeWidth: p.strokeWidth,
        ...(p.dash ? { strokeDasharray: p.dash, strokeLinejoin: 'round' } : { strokeLinejoin: 'round' }),
      }),
    );
    const labelNodes = (payload.map.labels || []).map((lb, i) =>
      h(Text, {
        key: `mp-lab-${i}`, x: lb.x, y: lb.y,
        style: { fontFamily: 'Helvetica-Bold', fontSize: lb.fontSize ?? 6.8, fill: '#0f172a', stroke: '#ffffff', strokeWidth: Math.min(1.6, lb.fontSize ? lb.fontSize * 0.22 : 1.6), textAnchor: 'middle' },
      }, lb.text),
    );
    const northNodes: React.ReactNode[] = [];
    if (payload.map.north) {
      const n = payload.map.north;
      northNodes.push(
        h(Path, {
          key: 'north',
          d: `M ${n.x} ${n.y - n.size} L ${n.x + n.size * 0.55} ${n.y + n.size * 0.55} L ${n.x} ${n.y + n.size * 0.25} L ${n.x - n.size * 0.55} ${n.y + n.size * 0.55} Z`,
          fill: '#0f172a', stroke: '#ffffff', strokeWidth: 0.8,
        }),
        h(Text, { key: 'north-u', x: n.x, y: n.y - n.size - 4, style: { fontFamily: 'Helvetica-Bold', fontSize: 8, fill: '#0f172a', textAnchor: 'middle' } }, 'U'),
      );
    }

    const svgMap = h(Svg, {
      style: { position: 'absolute', left: payload.map.x, top: payload.map.y, width: payload.map.width, height: payload.map.height, border: '1px solid #94a3b8' },
      viewBox: `0 0 ${payload.map.width} ${payload.map.height}`,
    },
      h(Rect, { x: 0, y: 0, width: payload.map.width, height: payload.map.height, fill: '#eef2f6', stroke: '#94a3b8', strokeWidth: 0.8 }),
      ...pathNodes, ...labelNodes, ...northNodes, ...barChildren,
    );

    /* ------------------------------ kop ------------------------------------ */
    const kopNodes: React.ReactNode[] = [];
    if (payload.header.show) {
      if (payload.header.logo) {
        let logoSrc = payload.header.logo;
        if (logoSrc.startsWith('/assets/')) {
          const localPath = path.resolve(process.cwd(), 'public' + logoSrc);
          if (fs.existsSync(localPath)) logoSrc = localPath;
        }
        kopNodes.push(h(Image, { key: 'kop-logo', style: { position: 'absolute', left: pagePad, top: 3 * MM, width: 20 * MM, height: 20 * MM, objectFit: 'contain' }, src: logoSrc }));
      }
      kopNodes.push(
        h(Text, { key: 'kop-l1', style: { position: 'absolute', left: payload.header.logo ? 32 * MM : pagePad, top: 4.5 * MM, fontFamily: 'Times-Bold', fontSize: 11, color: '#0f172a' } }, (payload.header.agencyLine1 || '').toUpperCase()),
      );
      if (payload.header.agencyLine2) {
        kopNodes.push(h(Text, { key: 'kop-l2', style: { position: 'absolute', left: payload.header.logo ? 32 * MM : pagePad, top: 10.8 * MM, fontFamily: 'Times-Roman', fontSize: 9.5, color: '#1e293b' } }, payload.header.agencyLine2.toUpperCase()));
      }
      kopNodes.push(h(View, { key: 'kop-rule', style: { position: 'absolute', left: pagePad, right: pagePad, top: 17.8 * MM, height: 0, borderBottomWidth: 0.5, borderBottomColor: '#94a3b8' } }));
      if (payload.header.title) {
        kopNodes.push(h(Text, { key: 'kop-title', style: { position: 'absolute', left: 0, right: 0, top: 20.5 * MM, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: '#0f172a' } }, payload.header.title));
      }
      if (payload.header.subtitle) {
        kopNodes.push(h(Text, { key: 'kop-sub', style: { position: 'absolute', left: 0, right: 0, top: 25 * MM, textAlign: 'center', fontFamily: 'Helvetica', fontSize: 7.8, color: '#64748b' } }, payload.header.subtitle));
      }
    } else if (payload.header.title) {
      kopNodes.push(h(Text, { key: 'solo-title', style: { position: 'absolute', left: 0, right: 0, top: 12 * MM, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#0f172a' } }, payload.header.title));
    }

    /* ------------------------------ catatan + ttd -------------------------- */
    const noteNodes = (payload.footer.basedNote || []).slice(0, 5).map((line, i) =>
      h(Text, {
        key: `fn-${i}`,
        style: { position: 'absolute', left: pagePad, top: heightPt - 9.4 * MM - ((payload.footer.basedNote || []).length - i) * 9, width: widthPt - pagePad * 2 - 50 * MM, fontFamily: 'Helvetica', fontSize: 6.4, color: '#64748b' },
      }, line),
    );
    const sigNodes: React.ReactNode[] = [];
    if (payload.footer.signature?.show) {
      const s = payload.footer.signature;
      sigNodes.push(
        h(Text, { key: 'sig-date', style: { position: 'absolute', right: pagePad, top: heightPt - 78, fontFamily: 'Helvetica', fontSize: 7.8, color: '#0f172a' } }, s.dateText),
        h(Text, { key: 'sig-jab', style: { position: 'absolute', right: pagePad, top: heightPt - 66, fontFamily: 'Helvetica-Bold', fontSize: 8.2, color: '#0f172a' } }, (s.jabatan || '').toUpperCase()),
        h(Text, { key: 'sig-nama', style: { position: 'absolute', right: pagePad, top: heightPt - 36, fontFamily: 'Helvetica-Bold', fontSize: 8.8, color: '#0f172a' } }, s.nama || '______________________'),
        h(Text, { key: 'sig-nip', style: { position: 'absolute', right: pagePad, top: heightPt - 26, fontFamily: 'Helvetica', fontSize: 7.4, color: '#334155' } }, s.nip ? `NIP. ${s.nip}` : 'NIP. ______________________'),
      );
    }

    /* ------------------------------ dokumen -------------------------------- */
    const legendBox = payload.legend.show ? h(View, {
      style: { position: 'absolute', left: payload.legend.x, top: payload.legend.y, width: payload.legend.width, height: payload.legend.height, border: '1px solid #cbd5e1', backgroundColor: '#ffffff' },
    }, ...legendChildren) : null;

    const doc = h(Document, {
      title: payload.header.title || 'Peta Kerawanan Wilayah',
      author: 'SADEWA Admin',
      creator: 'SADEWA Admin — @react-pdf/renderer',
      keywords: 'peta kerawanan, geojson, hd, vektor, percetakan',
    },
      h(Page, { size: [widthPt, heightPt], style: { backgroundColor: '#ffffff' } },
        ...kopNodes, svgMap, legendBox, ...noteNodes, ...sigNodes,
      ),
    );

    const buffer = await renderToBuffer(doc);
    const fileName = `peta-vektor-${payload.paper.widthMm}x${payload.paper.heightMm}mm-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[export-pdf] gagal:', err);
    return res.status(500).json({
      error: 'Gagal merender PDF vektor.',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

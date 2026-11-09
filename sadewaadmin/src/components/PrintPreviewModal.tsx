import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, FileText } from 'lucide-react';
import { Modal } from '@/components/ui';
import { Dropdown } from '@/components/ui';
import { printDocumentHtml, type Orientation, type PaperSize, type PrintOptions } from '@/lib/cetak';

export type PrintDoc = { title: string; html: string; orientation?: Orientation };

export function PrintPreviewModal({ open, onClose, build, defaultOrientation = 'portrait' }: {
  open: boolean;
  onClose: () => void;
  build: (opt: PrintOptions) => PrintDoc | null;
  defaultOrientation?: Orientation;
}) {
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>(defaultOrientation);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => { if (open) setOrientation(defaultOrientation); }, [open, defaultOrientation]);

  const doc = useMemo(() => (open ? build({ paper, orientation }) : null), [open, build, paper, orientation]);

  useEffect(() => {
    if (!doc || !frameRef.current) return;
    const fr = frameRef.current;
    const id = setTimeout(() => {
      const d = fr.contentDocument; if (!d) return;
      d.open(); d.write(doc.html); d.close();
    }, 30);
    return () => clearTimeout(id);
  }, [doc]);

  const onPrint = () => { if (doc) printDocumentHtml(doc.html); };

  return (
    <Modal open={open} onClose={onClose} title={doc?.title || 'Pratinjau Cetak'} icon={<Printer className="w-4 h-4 text-blue-400" />} size="full"
      footer={<>
        <button onClick={onClose} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold">Tutup</button>
        <button onClick={onPrint} disabled={!doc} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><Printer className="w-4 h-4"/>Cetak</button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Kertas</span>
            <div className="mt-1 min-w-[140px]"><Dropdown value={paper} onChange={v => setPaper(v as PaperSize)} options={[{value:'A4',label:'A4'},{value:'F4',label:'F4 / Folio'}]} /></div>
          </label>
          <label className="block"><span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Orientasi</span>
            <div className="mt-1 min-w-[160px]"><Dropdown value={orientation} onChange={v => setOrientation(v as Orientation)} options={[{value:'portrait',label:'Portrait (Tegak)'},{value:'landscape',label:'Landscape (Mendatar)'}]} /></div>
          </label>
          {!doc && <span className="text-xs text-slate-500 flex items-center gap-1"><FileText className="w-3.5 h-3.5"/>Tidak ada dokumen.</span>}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/40 overflow-hidden">
          <iframe ref={frameRef} title="Pratinjau cetak" className="w-full bg-white" style={{ height: '62vh', minHeight: 360 }} />
        </div>
      </div>
    </Modal>
  );
}

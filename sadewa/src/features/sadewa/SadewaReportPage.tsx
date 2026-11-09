'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import BrandHeader from '@/components/BrandHeader';
import Modals from '@/components/Modals';
import SettingsSheet from '@/components/SettingsSheet';
import PhotoManager from '@/components/PhotoManager';
import SubmitBar from '@/components/SubmitBar';
import SadewaForm from './SadewaForm';
import DraftSheet from './DraftSheet';
import { useDraftManager } from './useDraftManager';
import { useSadewaSubmit } from './useSadewaSubmit';
import { useSadewaWatermarkContext } from './watermarkContext';
import { useApp } from '../core/AppContext';
import { setLastSubSlug, setLastCatId } from '@/lib/navMemory';

/** Halaman laporan sadewa: tempel teks + foto → Google Drive + Spreadsheet. */
export default function SadewaReportPage({ template = '', format = null }: { template?: string; format?: any }) {
  const { activeDraftId, isProcessing, photoCount, scope } = useApp();
  const buildContext = useSadewaWatermarkContext();
  const drafts = useDraftManager();
  const { submit, busy } = useSadewaSubmit();

  useEffect(() => { if (scope) void setLastSubSlug(scope); }, [scope]);

  return (
    <div className="shell">
      <div className="shell-inner">
        <BrandHeader />

        <div className="page-bar">
          <Link
            className="back-link"
            href="/"
            onClick={() => { void setLastSubSlug(''); void setLastCatId(''); }}
          >
            <Icon name="arrowLeft" /> Menu kategori
          </Link>
        </div>

        <div className="form-grid">
          <SadewaForm className="slot-form" template={template} format={format} />
          <PhotoManager
            className="slot-photos"
            buildContext={buildContext}
          >
            <div className="draft-row">
              <button
                type="button"
                className="btn-secondary"
                onClick={drafts.saveDraft}
                disabled={drafts.saving || busy}
              >
                {drafts.saving ? (
                  <>
                    <Icon name="loader" className="spin" /> Menyimpan…
                  </>
                ) : (
                  <>
                    <Icon name="cloudUpload" /> Simpan Draft
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={drafts.openSheet}
                disabled={busy}
              >
                <Icon name="cloudDownload" /> Draft
                {activeDraftId ? <span className="dot-pill" title="Ada draft aktif" /> : null}
              </button>
            </div>
          </PhotoManager>
        </div>

        <SubmitBar
          onSubmit={submit}
          busy={busy}
          disabled={photoCount === 0 || isProcessing}
          label="KIRIM LAPORAN"
        />
      </div>

      <SettingsSheet />
      <DraftSheet
        open={drafts.sheetOpen}
        loading={drafts.listing}
        error={drafts.listError}
        drafts={drafts.drafts}
        removing={drafts.removing}
        onClose={drafts.closeSheet}
        onLoad={drafts.loadDraft}
        onRemove={drafts.removeDraft}
      />
      <Modals />
    </div>
  );
}

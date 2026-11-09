'use client';

/**
 * MapCanvas — peta interaktif react-leaflet.
 *
 * - Choropleth kecamatan / desa berdasarkan skor kategori aktif (update style
 *   secara imperatif agar 307+ poligon tidak re-render suka-suka).
 * - Overlay batas kabupaten & kecamatan, label, tooltip hover, klik wilayah.
 * - Overlay titik laporan (GPS/foto) dari SADEWA — toggleable, berbasis data rekap.
 * - moveend → menyimpan bounds/zoom yang dipakai renderer cetak.
 */

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { CirclePlus, CircleMinus, Crosshair, Loader2, Camera } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';

import { baseLayerOption } from '@/pemetaan/lib/defaults';
import {
  labelAnchorOfFeature,
  colorForScore,
  leafletBoundsOf,
} from '@/pemetaan/lib/geo';
import { useApp } from '@/pemetaan/lib/store';
import type { Bounds, RegionFeature } from '@/pemetaan/lib/types';

/** Titik laporan SADEWA (GPS/EXIF) yang di-overlay pada peta pemetaan. */
export interface ReportPoint {
  id: string;
  lat: number;
  lng: number;
  categoryId?: string;
  subcategoryId?: string;
  lokasi?: string;
  pelapor?: string;
  tanggal?: string;
  waktuSubmit?: string;
  createdAt?: number | string;
  status?: string;
  jumlahFoto?: number;
  categoryName?: string;
  subcategoryName?: string;
  keterangan?: string;
  photos?: Array<{ thumbUrl?: string; viewUrl?: string; fileId?: string; name?: string }>;
}

function reportIcon() {
  const html = `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#2563eb;color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.35)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>`;
  return L.divIcon({ className: 'report-point-marker', html, iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -22] });
}

function esc(text: string): string {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default function MapCanvas({ reportPoints = [] }: { reportPoints?: ReportPoint[] }) {
  const app = useApp();
  const { geo, view } = app;
  const mapRef = useRef<L.Map | null>(null);
  const [showReports, setShowReports] = useState(true);

  const kecamatanFeatures = useMemo(
    () => (geo.kecamatan ? (geo.kecamatan.features as RegionFeature[]) : []),
    [geo.kecamatan],
  );
  const kelurahanFeatures = useMemo(
    () => (geo.kelurahan ? (geo.kelurahan.features as RegionFeature[]) : []),
    [geo.kelurahan],
  );
  const kabupatenFeature = useMemo(
    () => (geo.kabupaten ? (geo.kabupaten.features[0] as RegionFeature) : null),
    [geo.kabupaten],
  );
  const focusedDistrict = view.mode === 'desa' ? view.selectedKecamatanCode : null;
  const visibleDistrictFeatures = useMemo(
    () => focusedDistrict
      ? kecamatanFeatures.filter((feature) => feature.properties.code === focusedDistrict)
      : kecamatanFeatures,
    [focusedDistrict, kecamatanFeatures],
  );
  const visibleVillageFeatures = useMemo(
    () => focusedDistrict
      ? kelurahanFeatures.filter((feature) => feature.properties.districtCode === focusedDistrict)
      : kelurahanFeatures,
    [focusedDistrict, kelurahanFeatures],
  );
  const visibleMapFeatures = view.mode === 'desa' ? visibleVillageFeatures : kecamatanFeatures;
  const selectedFeature = useMemo(
    () => [...visibleMapFeatures, ...visibleDistrictFeatures].find((feature) => feature.properties.id === app.selectedRegionId) ?? null,
    [app.selectedRegionId, visibleDistrictFeatures, visibleMapFeatures],
  );

  const validReports = useMemo(
    () => (reportPoints || []).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng)),
    [reportPoints],
  );
  const reportIconInstance = useMemo(() => reportIcon(), []);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[-7.867, 111.47]}
        zoom={10}
        minZoom={9}
        maxZoom={19}
        zoomControl={false}
        attributionControl
        ref={(map) => {
          mapRef.current = map ?? null;
        }}
        className="h-full w-full"
      >
        <TileLayerAutoplay />

        {kabupatenFeature && !focusedDistrict ? (
          <BoundaryGeoJSON feature={kabupatenFeature} />
        ) : null}

        <ChoroplethLayer
          features={visibleMapFeatures}
          strokeWeight={view.mode === 'desa' ? 0.45 : 0.8}
        />

        {view.mode === 'desa' && visibleDistrictFeatures.length ? (
          <DistrictOverlay features={visibleDistrictFeatures} />
        ) : null}

        {selectedFeature ? <SelectedRegionOutline feature={selectedFeature} /> : null}

        {view.labels ? <DistrictLabels features={visibleDistrictFeatures} /> : null}

        {showReports && validReports.map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={reportIconInstance}>
            <Popup maxWidth={320} minWidth={220}>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, lineHeight: 1.45 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: '#0f172a' }}>{esc(r.lokasi || 'Laporan')}</div>
                {(r.categoryName || r.subcategoryName) ? (
                  <div style={{ color: '#2563eb', fontWeight: 600, marginBottom: 4 }}>{esc([r.categoryName, r.subcategoryName].filter(Boolean).join(' · '))}</div>
                ) : null}
                <div style={{ color: '#475569' }}>
                  {r.tanggal || r.waktuSubmit ? <div><b>Waktu:</b> {esc(r.tanggal || r.waktuSubmit || '')}</div> : null}
                  {r.pelapor ? <div><b>Pelapor:</b> {esc(r.pelapor)}</div> : null}
                  {r.status ? <div><b>Status:</b> {esc(r.status)}</div> : null}
                  {r.jumlahFoto ? <div style={{ display:'inline-flex', alignItems:'center', gap:4 }}><b>Foto:</b> {r.jumlahFoto}</div> : null}
                  <div><b>Koordinat:</b> {r.lat.toFixed(6)}, {r.lng.toFixed(6)}</div>
                </div>
                {r.keterangan ? <div style={{ marginTop: 6, color: '#334155' }}>{esc(r.keterangan.slice(0, 180))}{r.keterangan.length > 180 ? '…' : ''}</div> : null}
                {r.photos?.[0]?.thumbUrl ? (
                  <img src={r.photos[0].thumbUrl} alt="" style={{ marginTop: 8, width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}

        <ZoomWatcher />
        <FitController
          features={visibleMapFeatures}
          selectedKecamatanCode={view.mode === 'desa' ? view.selectedKecamatanCode : null}
          mode={view.mode}
          geoReady={geo.loading === false && kecamatanFeatures.length > 0}
        />
      </MapContainer>

      {/* Overlay kontrol kiri atas */}
      <TopLeftOverlay app={app} reportCount={validReports.length} showReports={showReports} onToggleReports={() => setShowReports(v => !v)} />

      {/* Kontrol zoom kanan atas */}
      <div className="absolute right-[10px] top-[10px] z-[500] flex flex-col gap-[3px]">
        <MapButton
          onClick={() => mapRef.current?.zoomIn()}
          label="Perbesar"
          icon={<CirclePlus size={16} />}
        />
        <MapButton
          onClick={() => mapRef.current?.zoomOut()}
          label="Perkecil"
          icon={<CircleMinus size={16} />}
        />
        <MapButton
          onClick={() => {
            const features = view.mode === 'desa' ? kelurahanFeatures : kecamatanFeatures;
            const bounds = leafletBoundsOf(features);
            if (bounds && mapRef.current) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
          }}
          label="Pas wilayah"
          icon={<Crosshair size={16} />}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-komponen internal                                                       */
/* -------------------------------------------------------------------------- */

const mapBtnBase = 'flex h-[30px] w-[30px] items-center justify-center rounded-md border shadow-md backdrop-blur-sm transition-all';
const mapBtnIdle = 'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white';
const mapBtnActive = 'border-blue-500 bg-blue-600 text-white';

function MapButton({
  onClick,
  label,
  icon,
  active,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(mapBtnBase, active ? mapBtnActive : mapBtnIdle)}
    >
      {icon}
    </button>
  );
}

function TileLayerAutoplay() {
  const { view, toast } = useApp();
  const map = useMap();
  const option = baseLayerOption(view.baseLayer);
  useEffect(() => {
    let cancelled = false;
    let layer: L.TileLayer | null = null;
    let attribution = '';

    void (async () => {
      try {
        if (!option.url) throw new Error('URL tile basemap belum tersedia.');
        const source = { url: option.url, attribution: option.attribution };
        if (cancelled) return;
        attribution = source.attribution;
        layer = L.tileLayer(source.url, {
          attribution,
          maxZoom: option.maxZoom,
          maxNativeZoom: option.maxZoom,
          tileSize: 256,
          subdomains: option.subdomains ?? 'abc',
          crossOrigin: true,
        });
        layer.addTo(map);
        map.attributionControl?.addAttribution(attribution);
      } catch (error) {
        if (!cancelled) {
          toast({
            type: 'error',
            title: `Basemap ${option.label} tidak dapat dimuat`,
            description: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
      if (attribution) map.attributionControl?.removeAttribution(attribution);
    };
  }, [map, option.id, option.attribution, option.maxZoom, toast]);

  return null;
}

/** Batas kabupaten: hitam solid dan paling tebal. */
function BoundaryGeoJSON({ feature }: { feature: RegionFeature }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.geoJSON(feature as never, {
      style: () => ({
        color: '#111111',
        weight: 1.4,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        fill: false,
        interactive: false,
      }),
    });
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [feature, map]);
  return null;
}

/** Garis kecamatan di atas batas desa, dengan bobot yang tetap halus. */
function DistrictOverlay({ features }: { features: RegionFeature[] }) {
  const map = useMap();
  const key = useMemo(() => features.map((f) => f.properties.id).join(','), [features]);

  useEffect(() => {
    const layer = L.geoJSON(
      { type: 'FeatureCollection', features } as never,
      {
        style: () => ({
          color: '#111111',
          weight: 0.95,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
          fill: false,
          interactive: false,
        }),
      },
    );
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [key, features, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/** Outline seleksi dirender paling atas agar selalu jelas mengikuti geometri asli. */
function SelectedRegionOutline({ feature }: { feature: RegionFeature }) {
  const map = useMap();

  useEffect(() => {
    const outline = L.geoJSON(feature as never, {
      style: () => ({
        color: '#2563eb',
        weight: 3,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        fill: false,
        interactive: false,
      }),
      interactive: false,
    });
    outline.addTo(map);
    outline.bringToFront();
    return () => {
      outline.remove();
    };
  }, [feature, map]);

  return null;
}

/** Label kecamatan selalu berpusat di titik interior dan tetap tampak saat zoom-out. */
function DistrictLabels({ features }: { features: RegionFeature[] }) {
  const map = useMap();
  const key = useMemo(() => features.map((f) => f.properties.id).join('|'), [features]);

  useEffect(() => {
    const group = L.layerGroup();
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    context.font = '600 11px Inter,system-ui,sans-serif';

    for (const feature of features) {
      const { coordinate } = labelAnchorOfFeature(feature);
      const [lon, lat] = coordinate;
      const width = Math.ceil(context.measureText(feature.properties.name).width + 4);
      const height = 18;
      group.addLayer(
        L.marker([lat, lon], {
          interactive: false,
          icon: L.divIcon({
            className: 'district-label-marker',
            html: `<span style="display:block;width:${width}px;height:${height}px;font:600 11px/18px Inter,system-ui,sans-serif;color:#0f172a;text-align:center;text-shadow:-1.5px -1.5px 0 #fff,1.5px -1.5px 0 #fff,-1.5px 1.5px 0 #fff,1.5px 1.5px 0 #fff,0 0 4px #fff;white-space:nowrap">${escapeHtml(
              feature.properties.name,
            )}</span>`,
            iconSize: [width, height],
            iconAnchor: [width / 2, height / 2],
          }),
        }),
      );
    }

    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [key, features, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Choropleth utama — L.geoJSON imperatif, style di-update in-place setiap
 * skor/kategori berubah (tanpa rip penuh layer).
 */
function ChoroplethLayer({
  features,
  strokeWeight,
}: {
  features: RegionFeature[];
  strokeWeight: number;
}) {
  const app = useApp();
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const styleStateRef = useRef({ activeCategory: app.activeCategory, scores: app.scores });
  styleStateRef.current = { activeCategory: app.activeCategory, scores: app.scores };
  const fc = useMemo(
    () => ({ type: 'FeatureCollection', features }) as never,
    [features],
  );
  const dataKey = useMemo(() => features.map((f) => f.properties.id).join(','), [features]);

  const featureStyle = (props: RegionFeature['properties'], hovered = false): L.PathOptions => {
    const { activeCategory, scores } = styleStateRef.current;
    const record = activeCategory ? scores[`${activeCategory.id}::${props.id}`] : undefined;
    return {
      fillColor: colorForScore(activeCategory, record?.score ?? null),
      fillOpacity: hovered
        ? Math.min(0.92, activeCategory ? 0.78 : 0.5)
        : activeCategory
          ? 0.62
          : 0.45,
      color: '#111111',
      weight: hovered ? Math.min(1.3, strokeWeight + 0.4) : strokeWeight,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    };
  };

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }

    const highlight = (target: L.Path, on: boolean) => {
      const props = (target as unknown as { feature?: RegionFeature }).feature?.properties;
      if (props) target.setStyle(featureStyle(props, on));
      if (on) target.bringToFront();
    };

    const layer = L.geoJSON(fc, {
      style: (feature) => {
        const props = feature?.properties as RegionFeature['properties'];
        return featureStyle(props);
      },
      onEachFeature: (feature, target) => {
        const props = (feature as RegionFeature).properties;
        target.on('click', () => {
          app.selectRegion(props.id);
          if (props.type === 'kecamatan') {
            app.updateView({ selectedKecamatanCode: props.code });
          }
        });
        target.on('mouseover', () => highlight(target as L.Path, true));
        target.on('mouseout', () => highlight(target as L.Path, false));
        target.bindTooltip(
          `<b>${escapeHtml(props.name)}</b><br/><span style="color:#94a3b8">${
            props.type === 'kelurahan' ? `Kec. ${escapeHtml(props.districtName ?? '')}` : 'Kecamatan'
          }</span>`,
          { sticky: true, className: 'map-hover-tooltip', direction: 'top', offset: [0, -6] },
        );
      },
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fc, dataKey]);

  /* Update style in-place ketika skor/kategori berubah */
  const styleVersion = useMemo(() => {
    const cat = app.activeCategory;
    if (!cat) return `${app.activeCategoryId}::`;
    return `${app.activeCategoryId}::${Object.entries(app.scores)
      .filter(([key]) => key.startsWith(`${cat.id}::`))
      .map(([key, value]) => `${key}=${value.score}`)
      .sort()
      .join(';')}`;
  }, [app.activeCategoryId, app.activeCategory, app.scores]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((child) => {
      const feature = (child as L.GeoJSON as unknown as { feature?: RegionFeature }).feature;
      const props = feature?.properties;
      if (!props) return;
      (child as L.Path).setStyle(featureStyle(props));
    });
  }, [styleVersion, strokeWeight, app.activeCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/** Menyimpan bounds/zoom/center untuk renderer cetak. */
function ZoomWatcher() {
  const app = useApp();
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const bounds = map.getBounds();
      app.setMapInfo({
        bounds: [
          [bounds.getSouth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()],
        ] as Bounds,
        zoom: map.getZoom(),
        center: [map.getCenter().lat, map.getCenter().lng],
      });
    };
    map.on('moveend', handler);
    return () => { map.off('moveend', handler); };
  }, [map, app]);
  return null;
}

/** Fit bounds saat mode/kecamatan/ganti data. */
function FitController({
  features,
  selectedKecamatanCode,
  mode,
  geoReady,
}: {
  features: RegionFeature[];
  selectedKecamatanCode: string | null;
  mode: string;
  geoReady: boolean;
}) {
  const map = useMap();
  const firstFit = useRef(false);

  useEffect(() => {
    if (!geoReady) return;
    if (!firstFit.current) {
      firstFit.current = true;
      const bounds = leafletBoundsOf(features);
      if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
      return;
    }
    const target = selectedKecamatanCode
      ? features.filter((f) => f.properties.districtCode === selectedKecamatanCode)
      : features;
    const bounds = leafletBoundsOf(target);
    if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoReady, mode, selectedKecamatanCode]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* Overlay kiri atas: toggle titik laporan + indikator memuat geometri        */
/* -------------------------------------------------------------------------- */

function TopLeftOverlay({
  app,
  reportCount,
  showReports,
  onToggleReports,
}: {
  app: ReturnType<typeof useApp>;
  reportCount: number;
  showReports: boolean;
  onToggleReports: () => void;
}) {
  return (
    <div className="absolute left-[10px] top-[10px] z-[500] flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggleReports}
        title={showReports ? 'Sembunyikan titik laporan' : 'Tampilkan titik laporan'}
        className={clsx(
          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 shadow-md backdrop-blur-sm text-[11px] font-semibold transition-all',
          showReports
            ? 'border-blue-500 bg-blue-600 text-white'
            : 'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white',
        )}
      >
        <Camera size={14} />
        <span>Titik Laporan</span>
        <span className={clsx('ml-0.5 rounded-full px-1.5 py-0.5 text-[10px]', showReports ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200')}>
          {reportCount}
        </span>
      </button>

      {app.geo.loading ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 px-2.5 py-1.5 shadow-md backdrop-blur-sm">
          <Loader2 size={14} className="animate-spin text-blue-600" />
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Memuat geometri…</span>
        </div>
      ) : null}
    </div>
  );
}

export default function Loading() {
  return (
    <main className="shell report-loading-screen" aria-busy="true">
      <div className="report-loading-spinner" role="status">
        <span className="loading-spinner" aria-hidden="true" />
        <span>Menyiapkan formulir laporan…</span>
      </div>
    </main>
  );
}
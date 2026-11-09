import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="landing" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <span className="landing-mark">404</span>
      <p className="landing-kicker">Halaman tidak ditemukan</p>
      <h1 style={{ fontSize: 'clamp(1.2rem,4vw,1.6rem)', fontWeight: 800, margin: '8px 0 12px' }}>
        Subkategori tidak dikenali
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '.93rem', lineHeight: 1.5, maxWidth: '38ch', marginBottom: 24 }}>
        Pilih kategori dari menu utama untuk membuka formulir laporan.
      </p>
      <Link
        href="/"
        className="back-link"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
      >
        ← Kembali ke Menu
      </Link>
    </main>
  );
}

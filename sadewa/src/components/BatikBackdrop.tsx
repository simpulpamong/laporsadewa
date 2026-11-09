/**
 * Latar batik dekoratif — murni ornamen, tidak mempengaruhi layout.
 * Dipakai di CategoryLanding dan setiap halaman laporan.
 */
export default function BatikBackdrop() {
  return (
    <div className="batik-backdrop" aria-hidden="true">
      <div className="batik-backdrop-pattern" />
      <div className="batik-backdrop-wash" />
    </div>
  );
}

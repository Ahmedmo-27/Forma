/** A "→" glyph that mirrors in right-to-left layouts. */
export default function Arrow() {
  return <span className="rtl-flip" style={{ display: 'inline-block' }} aria-hidden>→</span>;
}

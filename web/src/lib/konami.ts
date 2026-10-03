/** ↑ ↑ ↓ ↓ ← → ← → B A, typed anywhere but a text field. */
const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/** Calls `found` each time the code is completed. Returns a function that stops listening. */
export function listenForKonami(found: () => void): () => void {
  let at = 0;
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // A stray extra ↑ after ↑↑ keeps the ↑↑; any other miss starts over.
    at = key === CODE[at] ? at + 1 : key === 'ArrowUp' ? (at === 2 ? 2 : 1) : 0;
    if (at === CODE.length) {
      at = 0;
      found();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

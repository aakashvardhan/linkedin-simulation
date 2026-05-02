/**
 * pdfjs-dist must not be imported statically: Vite's bundle can hit a TDZ
 * ("Cannot access 'controller' before initialization") on unrelated routes (e.g. login).
 * Load the library only when the user parses a PDF.
 */
let cached = null;

export async function loadPdfJs() {
  if (cached) return cached;
  const pdfjs = await import('pdfjs-dist');
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  cached = pdfjs;
  return pdfjs;
}

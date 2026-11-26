const tesseract='tesseract.js/dist/';
const pdf='pdfjs-dist/legacy/build/';

export const scheduleAssets={
  'tesseract.mjs':tesseract+'tesseract.esm.min.js',
  'worker.min.js':tesseract+'worker.min.js',
  'tesseract-core-lstm.wasm.js':'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'eng.traineddata.gz':'@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'nld.traineddata.gz':'@tesseract.js-data/nld/4.0.0_best_int/nld.traineddata.gz',
  'pdf.min.mjs':pdf+'pdf.min.mjs',
  'pdf.worker.min.mjs':pdf+'pdf.worker.min.mjs',
  'pdfjs-license.txt':'pdfjs-dist/LICENSE',
  'tesseract-license.txt':'tesseract.js/LICENSE.md',
  'tesseract-core-license.txt':'tesseract.js-core/LICENSE'
};

export const daymarkCSP=backend=>`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${backend}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;

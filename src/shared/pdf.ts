import { PDFDocument } from 'pdf-lib/dist/pdf-lib.esm.js';

import type { ExportSpec } from './types';

const A4_PAGE = { width: 595, height: 842 };

export async function buildPdf(
  pages: Blob[],
  _spec: ExportSpec,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  for (const pageBlob of pages) {
    const bytes = new Uint8Array(await pageBlob.arrayBuffer());
    const embedded =
      pageBlob.type === 'image/jpeg'
        ? await pdf.embedJpg(bytes)
        : await pdf.embedPng(bytes);
    const page = pdf.addPage([A4_PAGE.width, A4_PAGE.height]);
    const scale = Math.min(
      A4_PAGE.width / embedded.width,
      A4_PAGE.height / embedded.height,
    );
    const drawWidth = embedded.width * scale;
    const drawHeight = embedded.height * scale;
    const x = (A4_PAGE.width - drawWidth) / 2;
    const y = (A4_PAGE.height - drawHeight) / 2;

    page.drawImage(embedded, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return pdf.save();
}

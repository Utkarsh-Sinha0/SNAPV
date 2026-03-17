import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { buildPdf } from '../../src/shared/pdf';
import { getDefaultExportSpec } from '../../src/shared/export-spec';

function blobFromBase64(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type });
}

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nXioAAAAASUVORK5CYII=';

describe('buildPdf', () => {
  it('builds a valid pdf from a single png blob', async () => {
    const bytes = await buildPdf(
      [blobFromBase64(ONE_PIXEL_PNG, 'image/png')],
      getDefaultExportSpec(),
    );

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
  });

  it('creates one page per input blob', async () => {
    const bytes = await buildPdf(
      [
        blobFromBase64(ONE_PIXEL_PNG, 'image/png'),
        blobFromBase64(ONE_PIXEL_PNG, 'image/png'),
        blobFromBase64(ONE_PIXEL_PNG, 'image/png'),
      ],
      getDefaultExportSpec(),
    );
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(3);
  });
});

import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import { communicationFile } from './media.service.js';
it('decodes and normalizes images instead of trusting the upload name or type', async () => {
  const original = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#f00' },
  })
    .png()
    .toBuffer();
  const saved = await communicationFile(original);
  expect(saved.contentType).toBe('image/jpeg');
  expect((await sharp(saved.bytes).metadata()).width).toBe(40);
});
it('rejects unsupported bytes, corrupt images and oversized files', async () => {
  for (const bytes of [
    Buffer.from('<script>bad</script>'),
    Buffer.from([255, 216, 255]),
    Buffer.from('ID3'),
    Buffer.from('%PDF-junk%%EOF'),
    Buffer.from('xxxxftypmp42'),
    Buffer.alloc(10485761),
  ])
    await expect(communicationFile(bytes)).rejects.toThrow();
});

it('accepts a structurally valid PDF', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  expect((await communicationFile(Buffer.from(await pdf.save()))).contentType).toBe(
    'application/pdf',
  );
});
it.each(['mp3', 'mp4'])('accepts a complete synthetic %s recording', async (extension) => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(
    new URL(`../../test/fixtures/communications/synthetic.${extension}`, import.meta.url),
  );
  expect((await communicationFile(bytes)).extension).toBe(extension);
});

import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [app, surface] of [
  ['admin-web', 'panel'],
  ['qr-kiosk', 'kiosk'],
]) {
  await cp(new URL(`../../${app}/dist/`, import.meta.url), new URL(surface, output), {
    recursive: true,
    filter: (path) =>
      !path.endsWith('.map') && !path.endsWith('_headers') && !path.endsWith('_redirects'),
  });
}

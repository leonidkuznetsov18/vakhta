import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
await build({ root });
try {
  await build({
    root,
    build: { ssr: 'src/app/render.tsx', outDir: '.render', copyPublicDir: false },
  });
  const { renderPages } = await import('../.render/render.js');
  const { pages, notFound, briefs, templates } = renderPages(
    process.env.LANDING_EMAIL,
    process.env.LANDING_OPERATOR,
  );
  const template = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  for (const page of pages) {
    const destination = resolve(root, 'dist', page.file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(
      destination,
      template
        .replace('lang="uk"', `lang="${page.locale}"`)
        .replace('<!--landing-head-->', page.head)
        .replace('<!--landing-body-->', page.body),
    );
  }
  for (const file of [...briefs, ...templates]) {
    const destination = resolve(root, 'dist', file.file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  await writeFile(
    resolve(root, 'dist/404.html'),
    template
      .replace(
        '<!--landing-head-->',
        '<title>404 · Vakhta</title><meta name="robots" content="noindex, nofollow">',
      )
      .replace('<!--landing-body-->', notFound),
  );
  await writeFile(
    resolve(root, 'dist/robots.txt'),
    'User-agent: *\nAllow: /\nSitemap: https://vakhta.xyz/sitemap.xml\n',
  );
  const urls = pages.map((page) => `https://vakhta.xyz/${page.file.replace('index.html', '')}`);
  await writeFile(
    resolve(root, 'dist/sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls.map((url) => `<url><loc>${url}</loc></url>`).join('') +
      '</urlset>',
  );
} finally {
  await rm(resolve(root, '.render'), { recursive: true, force: true });
}

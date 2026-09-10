/** Regenerate localized static help and silent illustrative videos from the UI catalogs. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { messages } from '../../packages/i18n/dist/index.js';
import { format as formatSource, resolveConfig } from 'prettier';

const require = createRequire(new URL('../../apps/worker/package.json', import.meta.url));
const sharp = require('sharp');
const formatOptions = await resolveConfig(new URL('../../package.json', import.meta.url).pathname);
const output = new URL('../../apps/admin-web/public/guides/', import.meta.url);
const scratch = await mkdtemp(join(tmpdir(), 'vakhta-inspection-guide-'));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function lines(value, width) {
  const result = [''];
  for (const word of value.split(/\s+/)) {
    const index = result.length - 1;
    if (result[index].length + word.length + 1 > width && result[index]) result.push(word);
    else result[index] += `${result[index] ? ' ' : ''}${word}`;
  }
  return result;
}
function textBlock(value, x, y, width, size, color = '#18181b') {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}">${lines(value, width)
    .map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.35 : 0}">${escape(line)}</tspan>`)
    .join('')}</text>`;
}
function workplace(marked = false, clean = false) {
  return `<rect width="820" height="320" rx="14" fill="#e4e7eb"/>
  <rect x="55" y="75" width="710" height="120" rx="5" fill="#937955"/><rect x="75" y="195" width="25" height="100" fill="#63553f"/><rect x="720" y="195" width="25" height="100" fill="#63553f"/>
  ${clean ? '' : '<path d="M215 105 L300 98 L333 157 L211 169 Z" fill="#8a8581"/><rect x="560" y="105" width="17" height="66" rx="3" fill="#526575"/><rect x="537" y="94" width="64" height="23" rx="3" fill="#cd624e"/>'}
  ${marked ? '<rect x="195" y="87" width="150" height="95" rx="3" fill="none" stroke="#dc2626" stroke-width="5"/><path d="M526 82 L612 82 L603 183 L531 179 Z" fill="none" stroke="#d97706" stroke-width="4"/>' : ''}`;
}
function scene(index, t) {
  if (index === 3)
    return `<g transform="translate(70 225) scale(.64)">${workplace(false, true)}</g><g transform="translate(700 225) scale(.64)">${workplace(true)}</g>${textBlock(t.statuses.COMPLIANT, 70, 470, 35, 24, '#15803d')}${textBlock(t.statuses.PROBLEMS, 700, 470, 30, 24, '#b91c1c')}`;
  if (index === 1 || index === 5)
    return (
      [0, 1, 2]
        .map(
          (n) =>
            `<g transform="translate(${65 + n * 300} 210) scale(.32)">${workplace(n !== 1, n === 1)}</g>`,
        )
        .join('') +
      `<path d="M980 290 L1050 290 M1030 275 L1050 290 L1030 305" stroke="#71717a" stroke-width="5" fill="none" stroke-dasharray="8 5"/><rect x="1070" y="235" width="125" height="110" rx="16" fill="#f4f4f5" stroke="#a1a1aa"/><text x="1105" y="304" font-size="40">AI</text>${textBlock(t.saved, 75, 430, 60, 26)}`
    );
  return `<g transform="translate(230 180)">${workplace(index !== 4)}</g>${index === 4 ? `<rect x="425" y="267" width="150" height="95" rx="3" fill="none" stroke="#d97706" stroke-width="5" stroke-dasharray="10 6"/>${textBlock(t.aiTitle, 230, 535, 65, 24, '#92400e')}` : ''}`;
}
await mkdir(output, { recursive: true });
try {
  for (const locale of ['uk', 'en', 'ru']) {
    const catalog = messages(locale),
      guide = catalog.ui.guide.photoInspection,
      t = catalog.photoInspection;
    const examples = [0, 1, 4, 6, 9, 2].map((index) => guide.faq[index]);
    const frames = [];
    for (const [index, item] of examples.entries()) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#fafafa"/><g font-family="Arial, sans-serif">${textBlock(guide.title, 50, 42, 90, 23, '#52525b')}<text x="1150" y="42" font-size="23" fill="#52525b">${index + 1} / 6</text><rect x="50" y="60" width="${(1180 * (index + 1)) / 6}" height="4" rx="2" fill="#18181b"/>${textBlock(item.q, 50, 112, 72, 31)}${scene(index, t)}${textBlock(item.a, 50, 592, 89, 26)}</g></svg>`;
      const path = join(scratch, `${locale}-${index}.png`);
      await sharp(Buffer.from(svg)).png().toFile(path);
      if (index === 0)
        await sharp(Buffer.from(svg))
          .webp({ quality: 85 })
          .toFile(new URL(`photo-inspection.${locale}.webp`, output).pathname);
      frames.push(path);
    }
    const playlist = join(scratch, `${locale}.txt`);
    await writeFile(
      playlist,
      frames.map((frame) => `file '${frame}'\nduration 10`).join('\n') +
        `\nfile '${frames.at(-1)}'\n`,
    );
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        playlist,
        '-vf',
        'fps=24',
        '-t',
        '60',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '24',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        new URL(`photo-inspection.${locale}.mp4`, output).pathname,
      ],
      { stdio: 'pipe' },
    );
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(guide.title)} · Vakhta</title><style>body{font:17px/1.65 system-ui,sans-serif;color:#18181b;margin:0;background:#fafafa}main{max-width:52rem;margin:auto;padding:2rem 1.25rem}h1,h2{line-height:1.25}h1{font-size:2rem}h2{margin-top:2.5rem}h3{font-size:1.05rem;margin:0 0 .5rem}p{margin:.4rem 0 1rem}li{margin-bottom:1rem}section{margin:1.5rem 0;padding:1rem;background:white;border:1px solid #e4e4e7;border-radius:.75rem}video{display:block;width:100%;border-radius:.75rem;background:white}a{color:inherit;text-underline-offset:.2em}a:focus-visible{outline:3px solid #71717a}nav{display:flex;gap:1rem;flex-wrap:wrap} @media print{body{background:white;font-size:11pt}main{padding:0;max-width:none}video,nav{display:none}section{break-inside:avoid}h2,h3{break-after:avoid}}</style></head><body><main><nav><a href="/#/handover">${escape(catalog.admin.sections.handover)}</a>${['uk', 'en', 'ru'].map((lang) => `<a href="photo-inspection.${lang}.html" lang="${lang}" hreflang="${lang}">${escape(catalog.language.names[lang])}</a>`).join('')}</nav><h1>${escape(guide.title)}</h1><p>${escape(guide.purpose)}</p><h2>${escape(guide.video.label)}</h2><p>${escape(guide.video.description ?? '')}</p><video controls playsinline preload="metadata" poster="photo-inspection.${locale}.webp"><source src="photo-inspection.${locale}.mp4" type="video/mp4"></video><p><a href="photo-inspection.${locale}.mp4">${escape(guide.video.label)}</a></p><h2>${escape(catalog.ui.common.howItWorks)}</h2><ol>${guide.steps.map((step) => `<li>${escape(step)}</li>`).join('')}</ol><h2>${escape(catalog.ui.common.faq)}</h2>${guide.faq.map((item) => `<section><h3>${escape(item.q)}</h3><p>${escape(item.a)}</p></section>`).join('')}</main></body></html>`;
    await writeFile(
      new URL(`photo-inspection.${locale}.html`, output),
      await formatSource(html, { ...formatOptions, parser: 'html' }),
    );
    console.log(`Generated photo inspection help and 60-second video: ${locale}`);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { messages } from '@vakhta/i18n';
import { renderPages } from './render';
import { contactHref, readSalesContact } from '../features/contact-sales';
import { localizedHref } from '../features/switch-language';

const { pages, notFound } = renderPages(null, null);

describe('static landing journeys', () => {
  it('renders the complete Ukrainian landing at the root and all three direct locale routes', () => {
    expect(pages.slice(0, 4).map((page) => page.file)).toEqual([
      'index.html',
      'uk/index.html',
      'en/index.html',
      'ru/index.html',
    ]);
    for (const page of pages.slice(0, 4)) {
      const document = new DOMParser().parseFromString(
        `<head>${page.head}</head><body>${page.body}</body>`,
        'text/html',
      );
      const copy = messages(page.locale).landing;
      expect(document.querySelector('h1')?.textContent).toBe(copy.hero);
      expect(document.querySelectorAll('main section')).toHaveLength(13);
      expect(document.querySelectorAll('#faq details')).toHaveLength(20);
      expect(document.querySelectorAll('[data-locale-path]')).toHaveLength(6);
      expect(document.querySelector('#contact')?.textContent).toContain(copy.contactPending);
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(document.querySelector('form')).toBeNull();
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      );
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(
        /^https:\/\/vakhta\.xyz\/(uk\/|en\/|ru\/)?$/,
      );
      expect(document.querySelectorAll('link[rel="alternate"]')).toHaveLength(4);
      for (const link of document.querySelectorAll('a[href^="#"]')) {
        const id = link.getAttribute('href')?.slice(1) ?? '';
        expect(document.getElementById(id), `Missing anchor ${id}`).not.toBeNull();
      }
    }
  });

  it('exposes three truthful, distinct mail intents when real publication inputs are supplied', () => {
    const { pages: configured } = renderPages('sales@example.org', 'Example operator');
    for (const page of configured.slice(0, 4)) {
      const document = new DOMParser().parseFromString(page.body, 'text/html');
      const links = [...document.querySelectorAll('#top a[href^="mailto:"]')];
      expect(links).toHaveLength(3);
      const subjects = links.map((link) =>
        new URL(link.getAttribute('href') ?? '').searchParams.get('subject'),
      );
      expect(new Set(subjects).size).toBe(3);
      expect(document.querySelector('#contact')?.textContent).not.toContain('sales@example.org');
      expect(document.querySelector('#contact')?.textContent).toContain(
        messages(page.locale).landing.emailHint,
      );
      expect(document.querySelector('footer')?.textContent).toContain('Example operator');
    }
  });

  it('provides useful native links in every language on the 404 page', () => {
    const document = new DOMParser().parseFromString(notFound, 'text/html');
    expect([...document.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      '/uk/',
      '/en/',
      '/ru/',
    ]);
  });
});

describe('contact boundaries', () => {
  it.each([
    '',
    'not-an-email',
    'hello@example.org\nBcc:x@example.org',
    'x@example.org?subject=injected',
  ])('rejects invalid destinations: %s', (email) => {
    expect(readSalesContact(email, 'Operator')).toBeNull();
  });
  it('uses the confirmed email independently of a public operator name', () => {
    expect(readSalesContact('sales@example.org', null)?.email).toBe('sales@example.org');
    expect(contactHref(null, 'Demo', 'Details')).toBe('#contact');
  });
  it('encodes translated intent context without allowing query injection', () => {
    const contact = readSalesContact('sales@example.org', 'Operator');
    const url = new URL(contactHref(contact, 'Демо & пілот', 'Процес:\nТест?'));
    expect(url.searchParams.get('subject')).toBe('Демо & пілот');
    expect(url.searchParams.get('body')).toBe('Процес:\nТест?');
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body']);
  });
});

describe('native locale navigation', () => {
  it('retains known anchors and drops unknown anchors', () => {
    expect(localizedHref('/en/', '#pilot')).toBe('/en/#pilot');
    expect(localizedHref('/ru/', '#capabilities')).toBe('/ru/#capabilities');
    expect(localizedHref('/uk/', '#unknown')).toBe('/uk/');
    expect(localizedHref('/uk/', '')).toBe('/uk/');
  });
});

describe('visual product catalog', () => {
  it('provides every feature in every language with a reachable screenshot and contact', () => {
    const rendered = renderPages();
    expect(rendered.pages).toHaveLength(40);
    const routeFiles = new Set(
      rendered.pages.map((page) => `/${page.file.replace('index.html', '')}`),
    );
    for (const page of rendered.pages) {
      const document = new DOMParser().parseFromString(page.body, 'text/html');
      expect(document.body.textContent).not.toContain('gitmrche@gmail.com');
      for (const link of document.querySelectorAll('a[href*="/features/"]')) {
        expect(routeFiles.has(link.getAttribute('href') ?? '')).toBe(true);
      }
      if (page.file.split('/')[1] !== 'features') continue;
      expect(document.querySelector('h1')?.textContent).toBeTruthy();
      expect(document.querySelector('.product-image img')?.getAttribute('src')).toMatch(
        /^\/product\/.+\.webp$/,
      );
      expect(document.querySelector('a[href^="mailto:gitmrche@gmail.com"]')).not.toBeNull();
    }
    for (const page of rendered.pages.slice(0, 4)) {
      const document = new DOMParser().parseFromString(page.body, 'text/html');
      const controls = [...document.querySelectorAll('input[name="process"]')];
      expect(controls.map((control) => control.getAttribute('value'))).toEqual([
        'schedule',
        'arrival',
        'incident',
        'handover',
        'review',
        'bonus',
      ]);
      expect(document.querySelectorAll('input[name="process"][checked]')).toHaveLength(1);
      for (const control of controls)
        expect(
          document.querySelector(`[data-process="${control.getAttribute('value')}"]`),
        ).not.toBeNull();
    }
  });

  it('exports only localized public copy and public URLs in the handouts', () => {
    const { briefs } = renderPages();
    expect(briefs.map((brief) => brief.file)).toEqual([
      'uk/brief.txt',
      'en/brief.txt',
      'ru/brief.txt',
    ]);
    for (const brief of briefs) {
      expect(brief.content).toContain('https://vakhta.xyz/');
      expect(brief.content).not.toMatch(/localhost|\/Users\/|gitmrche@gmail.com|sales@example/);
    }
  });
});

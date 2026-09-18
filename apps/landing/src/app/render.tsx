import { renderToStaticMarkup } from 'react-dom/server';
import { messages, type Locale } from '@vakhta/i18n';
import { ProductLanding, FeaturePage, landingModel, languageLinks } from '../pages/product-landing';
import { readSalesContact, SALES_EMAIL } from '../features/contact-sales';

const origin = 'https://vakhta.xyz';
const locales: Locale[] = ['uk', 'en', 'ru'];

function PageHead({ locale, path, preview }: { locale: Locale; path: string; preview: boolean }) {
  const copy = messages(locale).landing;
  return (
    <>
      <title>{copy.title}</title>
      <meta name="description" content={copy.description} />
      <meta name="robots" content={preview ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={`${origin}${path}`} />
      {locales.map((language) => (
        <link key={language} rel="alternate" hrefLang={language} href={`${origin}/${language}/`} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${origin}/`} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Vakhta" />
      <meta property="og:title" content={copy.title} />
      <meta property="og:description" content={copy.description} />
      <meta property="og:url" content={`${origin}${path}`} />
      <meta property="og:locale" content={{ uk: 'uk_UA', en: 'en_US', ru: 'ru_RU' }[locale]} />
    </>
  );
}

export function renderPages(email: unknown = SALES_EMAIL, operator: unknown = 'Vakhta') {
  const contact = readSalesContact(email, operator);
  const preview = !contact;
  const routes: { locale: Locale; path: string; file: string }[] = [
    { locale: 'uk', path: '/', file: 'index.html' },
    ...locales.map((locale) => ({ locale, path: `/${locale}/`, file: `${locale}/index.html` })),
  ];
  const pages = routes.map(({ locale, path, file }) => ({
    locale,
    file,
    head: renderToStaticMarkup(<PageHead locale={locale} path={path} preview={preview} />),
    body: renderToStaticMarkup(
      <ProductLanding model={landingModel(locale, contact)} preview={preview} />,
    ),
  }));
  for (const locale of locales) {
    const model = landingModel(locale, contact);
    for (const feature of model.features) {
      pages.push({
        locale,
        file: `${locale}/features/${feature.id}/index.html`,
        head: renderToStaticMarkup(
          <>
            <title>{`${feature.label} · Vakhta`}</title>
            <meta name="description" content={feature.body} />
            <meta name="robots" content={preview ? 'noindex, nofollow' : 'index, follow'} />
            <link rel="canonical" href={`${origin}${feature.href}`} />
            {locales.map((language) => (
              <link
                key={language}
                rel="alternate"
                hrefLang={language}
                href={`${origin}/${language}/features/${feature.id}/`}
              />
            ))}
          </>,
        ),
        body: renderToStaticMarkup(<FeaturePage model={model} feature={feature} />),
      });
    }
  }
  const notFound = renderToStaticMarkup(
    <main className="not-found wrap">
      <h1>404</h1>
      {languageLinks.map(({ locale, path, label }) => (
        <section key={locale} lang={locale}>
          <h2>{messages(locale).landing.notFound}</h2>
          <a href={path}>
            {label} — {messages(locale).landing.backHome}
          </a>
        </section>
      ))}
    </main>,
  );
  const briefs = locales.map((locale) => {
    const copy = messages(locale).landing;
    return {
      file: `${locale}/brief.txt`,
      content: [
        `Vakhta — ${copy.hero}`,
        copy.intro,
        ...copy.tour.features.map(
          (feature) =>
            `${feature.label}\n${feature.body}\n${feature.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n${feature.value}\nhttps://vakhta.xyz/${locale}/features/${feature.id}/`,
        ),
        copy.pilot.title,
        copy.pilot.body,
        copy.pilotNote,
        copy.lossLimit,
        `${copy.contact.title}\nhttps://vakhta.xyz/${locale}/#contact`,
      ].join('\n\n'),
    };
  });
  return { pages, notFound, briefs };
}

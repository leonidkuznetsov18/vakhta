import { renderToStaticMarkup } from 'react-dom/server';
import { messages, type Locale } from '@vakhta/i18n';
import {
  ProductLanding,
  FeaturePage,
  ResourcePage,
  landingModel,
  languageLinks,
  homePath,
} from '../pages/product-landing';
import { readSalesContact, SALES_EMAIL } from '../features/contact-sales';
import { PageHead, locales } from './metadata';

type Model = ReturnType<typeof landingModel>;

function homePage(model: Model) {
  const { locale, copy } = model;
  const path = model.home;
  return {
    locale,
    file: `${path.slice(1)}index.html`,
    head: renderToStaticMarkup(
      <PageHead
        locale={locale}
        path={path}
        title={copy.title}
        description={copy.description}
        preview={!model.contact}
        imageAlt={copy.tour.overview}
      />,
    ),
    body: renderToStaticMarkup(<ProductLanding model={model} preview={!model.contact} />),
  };
}

function featurePages(model: Model) {
  return model.features.map((feature) => ({
    locale: model.locale,
    file: `${model.locale}/features/${feature.id}/index.html`,
    head: renderToStaticMarkup(
      <PageHead
        locale={model.locale}
        path={feature.href}
        title={feature.detail?.title ?? `${feature.label} · Vakhta`}
        description={feature.body}
        preview={!model.contact}
        image={feature.image}
        imageAlt={feature.label}
        suffix={`features/${feature.id}`}
      />,
    ),
    body: renderToStaticMarkup(<FeaturePage model={model} feature={feature} />),
  }));
}

function resourcePages(model: Model) {
  return model.resources.map((resource) => ({
    locale: model.locale,
    file: `${resource.href.slice(1)}index.html`,
    head: renderToStaticMarkup(
      <PageHead
        locale={model.locale}
        path={resource.href}
        title={`${resource.title} — Vakhta`}
        description={resource.intro}
        preview={!model.contact}
        imageAlt={model.copy.tour.overview}
        suffix={`resources/${resource.id}`}
      />,
    ),
    body: renderToStaticMarkup(<ResourcePage model={model} resource={resource} />),
  }));
}

function publicBrief(locale: Locale) {
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
      `${copy.contact.title}\nhttps://vakhta.xyz${homePath(locale)}#contact`,
    ].join('\n\n'),
  };
}

export function renderPages(email: unknown = SALES_EMAIL, operator: unknown = 'Vakhta') {
  const contact = readSalesContact(email, operator);
  const models = locales.map((locale) => landingModel(locale, contact));
  const pages = [
    ...models.map(homePage),
    ...models.flatMap(featurePages),
    ...models.flatMap(resourcePages),
  ];
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
  const templates = models.flatMap((model) =>
    model.resources.map((resource) => ({
      file: resource.downloadHref.slice(1),
      content: [
        resource.title,
        resource.intro,
        ...resource.sections.map((section) => `${section.title}\n${section.body}`),
        model.copy.seo.templateTitle,
        ...resource.fields.map((field) => `${field}: ____________________`),
        `https://vakhta.xyz${resource.href}`,
      ].join('\n\n'),
    })),
  );
  return { pages, notFound, briefs: locales.map(publicBrief), templates };
}

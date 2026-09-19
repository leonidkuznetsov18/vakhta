import { messages, type Locale } from '@vakhta/i18n';
import { homePath } from '../pages/product-landing';

export const origin = 'https://vakhta.xyz';
export const locales: Locale[] = ['uk', 'en', 'ru'];

type PageMetadata = {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  preview: boolean;
  image?: string;
  imageAlt: string;
  suffix?: string;
};

function StructuredData({ locale, path, title, suffix }: PageMetadata) {
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: 'Vakhta',
      url: `${origin}/`,
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: 'Vakhta',
      url: `${origin}/`,
      publisher: { '@id': `${origin}/#organization` },
    },
  ];
  if (suffix)
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: messages(locale).landing.backHome,
          item: `${origin}${homePath(locale)}`,
        },
        { '@type': 'ListItem', position: 2, name: title, item: `${origin}${path}` },
      ],
    });
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /</g,
    '\\u003c',
  );
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function PageHead(props: PageMetadata) {
  const {
    locale,
    path,
    title,
    description,
    preview,
    image = '/product/overview-uk.webp',
    imageAlt,
    suffix,
  } = props;
  const alternatePath = (language: Locale) =>
    suffix ? `/${language}/${suffix}/` : homePath(language);
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={preview ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={`${origin}${path}`} />
      {locales.map((language) => (
        <link
          key={language}
          rel="alternate"
          hrefLang={language}
          href={`${origin}${alternatePath(language)}`}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${origin}${alternatePath('uk')}`} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Vakhta" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={`${origin}${path}`} />
      <meta property="og:locale" content={{ uk: 'uk_UA', en: 'en_US', ru: 'ru_RU' }[locale]} />
      <meta property="og:image" content={`${origin}${image}`} />
      <meta property="og:image:alt" content={imageAlt} />
      <meta name="twitter:card" content="summary_large_image" />
      <StructuredData {...props} />
    </>
  );
}

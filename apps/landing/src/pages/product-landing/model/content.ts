import { messages, type Locale } from '@vakhta/i18n';
import { ContactIntent, contactHref, type SalesContact } from '../../../features/contact-sales';

export const languageLinks = [
  { locale: 'uk', label: messages('uk').landing.languageNames.uk, path: '/' },
  { locale: 'en', label: messages('en').landing.languageNames.en, path: '/en/' },
  { locale: 'ru', label: messages('ru').landing.languageNames.ru, path: '/ru/' },
] as const;

export function homePath(locale: Locale) {
  return locale === 'uk' ? '/' : `/${locale}/`;
}

export function landingModel(locale: Locale, contact: SalesContact | null) {
  const copy = messages(locale).landing;
  const actions = [
    { intent: ContactIntent.PILOT, label: copy.pilotCta, className: 'button primary' },
    { intent: ContactIntent.DEMO, label: copy.demoCta, className: 'button secondary' },
    {
      intent: ContactIntent.INVESTOR,
      label: copy.investorCta,
      className: 'text-link investor-link',
    },
  ].map((action) => ({
    ...action,
    href: contactHref(contact, copy.subjects[action.intent], copy.emailBody),
  }));
  const portraits = [
    'machine-operator',
    'maintenance-technician',
    'quality-inspector',
    'shift-supervisor',
    'packaging-operator',
    'industrial-electrician',
  ].map((profession, position) => ({
    src: `/people/${profession}.webp`,
    alt: copy.portraits[position] ?? copy.audience,
    profession,
  }));
  const images: Record<string, { name: string; width: number; height: number }> = {
    bonus: { name: 'bonus-full', width: 1184, height: 1476 },
    schedule: { name: 'schedule-full', width: 1184, height: 836 },
    operations: { name: 'operations', width: 1185, height: 760 },
    administration: { name: 'administration', width: 1185, height: 760 },
    audit: { name: 'audit', width: 1185, height: 760 },
    checklists: { name: 'checklists', width: 1185, height: 940 },
    incidents: { name: 'incident-live', width: 1024, height: 140 },
    reports: { name: 'panel-losses', width: 1440, height: 770 },
    handover: { name: 'photos-live', width: 1280, height: 1100 },
    photos: { name: 'photos-live', width: 1280, height: 1100 },
    communications: { name: 'communications', width: 640, height: 960 },
  };
  const features = copy.tour.features.map((feature) => {
    const asset = images[feature.id] ?? { name: feature.id, width: 1185, height: 800 };
    return {
      ...feature,
      detail: copy.seo.details[feature.id],
      caption: asset.name.endsWith('-live') ? copy.tour.liveEvidence : copy.tour.evidence,
      image: `/product/${asset.name}-uk.webp`,
      width: asset.width,
      height: asset.height,
      href: `/${locale}/features/${feature.id}/`,
    };
  });
  const capabilities = [copy.losses, copy.incidents, copy.checklists, copy.handover];
  return {
    copy,
    home: homePath(locale),
    resources: copy.seo.resources.map((resource) => ({
      ...resource,
      href: `/${locale}/resources/${resource.id}/`,
      downloadHref: `/${locale}/resources/${resource.id}/template.txt`,
    })),
    actions,
    portraits,
    features,
    capabilities,
    languages: languageLinks,
    locale,
    contact,
  };
}
export type LandingModel = ReturnType<typeof landingModel>;

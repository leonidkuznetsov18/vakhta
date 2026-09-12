/** Set the requested preview locale before modules capture their translated catalogs. */
const locale = new URLSearchParams(location.search).get('lang') ?? 'uk';
if (['uk', 'en', 'ru'].includes(locale)) {
  try {
    localStorage.setItem('vakhta.locale', locale);
  } catch {
    console.warn('[preview] Locale storage is unavailable; using browser language.');
  }
}

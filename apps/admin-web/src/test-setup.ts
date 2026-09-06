// Tests assert the Russian catalog regardless of the jsdom navigator language.
try {
  localStorage.setItem('vakhta.locale', 'ru');
} catch {
  // jsdom without storage: currentLocale() falls back to the browser language.
}

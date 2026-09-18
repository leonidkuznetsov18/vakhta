import { enableMediaExpansion } from '../features/expand-media';
import { localizedHref } from '../features/switch-language';
import './styles.css';

// Native links own navigation and Back; enhancement preserves the selected section.
function updateLanguageLinks() {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-locale-path]')) {
    const path = link.dataset.localePath;
    if (path) link.href = localizedHref(path, window.location.hash);
  }
}
updateLanguageLinks();
window.addEventListener('hashchange', updateLanguageLinks);
window.addEventListener('pageshow', updateLanguageLinks);

enableMediaExpansion();

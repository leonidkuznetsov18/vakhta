/**
 * The `pages.dev` host is a deployment artifact; people must land on the custom domain,
 * where the API cookie (SameSite=Lax) and CORS are valid. `VITE_CANONICAL_ORIGIN` is set
 * at build time by CI; local development leaves it empty.
 */
export function redirectToCanonicalOrigin(): boolean {
  const canonical = import.meta.env['VITE_CANONICAL_ORIGIN'];
  if (!canonical || location.origin === canonical) return false;
  location.replace(`${canonical}${location.pathname}${location.search}${location.hash}`);
  return true;
}

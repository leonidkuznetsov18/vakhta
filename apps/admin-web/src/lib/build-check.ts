import { useQuery } from '@tanstack/react-query';

/**
 * A panel left open for days keeps running the build it loaded, so a fix can be live for hours and
 * the person still sees the old screen — and reports a bug that no longer exists. Vite gives every
 * build a hashed entry script, so comparing the entry in the freshly fetched index.html with the one
 * this tab is running says whether a newer build is out there, without any extra file to deploy.
 */
const CHECK_MS = 5 * 60_000;

function loadedEntry(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return script ? new URL(script.src, location.href).pathname : null;
}

/** The entry this tab is running, read once: the document cannot change it under us. */
const MINE = loadedEntry();

async function deployedEntry(): Promise<string | null> {
  const res = await fetch(`${location.pathname}?build=${Date.now()}`, {
    cache: 'no-store',
    headers: { accept: 'text/html' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html);
  return match?.[1] ? new URL(match[1], location.href).pathname : null;
}

/**
 * True once a newer build is on the server. A poll like any other read, so it also runs when the
 * tab comes back to the foreground — the moment someone is about to trust what it shows.
 */
export function useNewBuild(intervalMs = CHECK_MS): boolean {
  const deployed = useQuery({
    queryKey: ['build'],
    queryFn: deployedEntry,
    enabled: MINE !== null,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return MINE !== null && deployed.data != null && deployed.data !== MINE;
}

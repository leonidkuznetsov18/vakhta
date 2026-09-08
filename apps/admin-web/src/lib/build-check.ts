import { useEffect, useState } from 'react';

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

/** True once a newer build is on the server; stays true until the page is reloaded. */
export function useNewBuild(intervalMs = CHECK_MS): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = loadedEntry();
    if (!mine) return;
    let alive = true;
    const check = () => {
      deployedEntry()
        .then((theirs) => {
          if (alive && theirs && theirs !== mine) setStale(true);
        })
        .catch(() => undefined);
    };
    const id = setInterval(check, intervalMs);
    // A tab coming back to the foreground is the moment someone is about to trust what it shows.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return stale;
}

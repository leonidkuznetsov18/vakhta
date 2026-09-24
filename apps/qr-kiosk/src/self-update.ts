/**
 * An open kiosk keeps running the code it loaded, so a fix released later would never reach a
 * screen nobody reloads. The kiosk asks for its own page now and then; when the published entry
 * scripts differ from the running ones, a new release is out and the caller reloads at a safe moment.
 * Vite fingerprints file names by content, so a changed name means changed code.
 */
const CHECK_INTERVAL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

let nextCheckAt = Date.now() + CHECK_INTERVAL_MS;
let releaseWaiting = false;

/** Only this origin's build output counts; scripts a proxy or the device injects are ignored. */
function scriptPaths(root: ParentNode): string[] {
  return [...root.querySelectorAll('script[src]')]
    .map((script) => new URL(script.getAttribute('src') ?? '', location.href))
    .filter((url) => url.origin === location.origin && url.pathname.startsWith('/assets/'))
    .map((url) => url.pathname)
    .sort();
}

// Empty in development, where Vite serves sources: then nothing is ever compared.
const running = scriptPaths(document).join(' ');

async function publishedScripts(): Promise<string | null> {
  const res = await fetch(new URL('/', location.href), {
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const page = new DOMParser().parseFromString(await res.text(), 'text/html');
  const paths = scriptPaths(page);
  return paths.length > 0 ? paths.join(' ') : null;
}

/** Throttled to one request per interval; a failed check simply waits for the next one. */
export async function checkForRelease(): Promise<void> {
  if (releaseWaiting) return;
  // A check further ahead than one interval means the device clock was set back.
  const ahead = nextCheckAt - Date.now();
  if (ahead > 0 && ahead <= CHECK_INTERVAL_MS) return;
  nextCheckAt = Date.now() + CHECK_INTERVAL_MS;
  try {
    const published = await publishedScripts();
    releaseWaiting = running !== '' && published !== null && published !== running;
  } catch {
    // Offline or mid-deploy: the running release keeps working.
  }
}

export function releaseIsWaiting(): boolean {
  return releaseWaiting;
}

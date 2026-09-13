/** TanStack Query aborts the pending delay and fetch together when the search key changes. */
export function waitForAudienceSearch(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 250);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

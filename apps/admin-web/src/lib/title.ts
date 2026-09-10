import { useEffect } from 'react';

/**
 * The tab title. The document belongs to the browser, not to React, so this is the one thing on a
 * screen that genuinely has to be pushed out to the world rather than returned from a render.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title !== null) document.title = title;
  }, [title]);
}

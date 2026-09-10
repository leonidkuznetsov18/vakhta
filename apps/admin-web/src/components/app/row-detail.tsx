import type { ReactNode } from 'react';

/** One reading surface for expanded desktop rows and mobile cards. */
export function RowDetail({ children }: { children: ReactNode }) {
  return (
    <div
      data-row-detail=""
      className="w-full min-w-0 max-w-5xl rounded-lg border bg-background p-3 text-sm leading-relaxed whitespace-normal [overflow-wrap:anywhere] sm:p-5 [&_form]:min-w-0 [&_form]:max-w-2xl [&_p]:max-w-prose [&_textarea]:min-h-24"
    >
      {children}
    </div>
  );
}

/** Compact preview; full prose belongs in the record details. */
export function TextPreview({ text }: { text: string }) {
  return (
    <span className="max-w-xs line-clamp-2 whitespace-normal [overflow-wrap:anywhere]" title={text}>
      {text}
    </span>
  );
}

/** Complete text remains available with line wrapping and keyboard scrolling. */
export function ScrollableText({ label, text }: { label: string; text: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-60 min-w-0 max-w-prose overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {text}
    </div>
  );
}

export function DetailText({ label, text }: { label: string; text: string }) {
  return (
    <section className="min-w-0 max-w-prose space-y-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <ScrollableText label={label} text={text} />
    </section>
  );
}

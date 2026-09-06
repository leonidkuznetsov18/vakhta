import { cn } from 'cn';

/**
 * The product mark, the same drawing as the favicon and the kiosk icon: a 24-hour dial on a dark
 * tile, the day shift in amber, the night shift dotted. Inline SVG so it scales crisply in the
 * sidebar and survives the collapsed rail.
 */
export function LogoMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" fill="#10161c" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#2a333c" strokeWidth="6" />
      <path
        d="M32 11a21 21 0 0 1 0 42"
        fill="none"
        stroke="#f0a93b"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M32 53a21 21 0 0 1 0-42"
        fill="none"
        stroke="#e7ecf1"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      <path d="M32 32V19" stroke="#e7ecf1" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 32l-8 6" stroke="#f0a93b" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3.2" fill="#e7ecf1" />
    </svg>
  );
}

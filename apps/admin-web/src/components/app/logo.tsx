import { cn } from 'cn';

/**
 * Square mark that survives the collapsed sidebar: a rounded tile with the first letter of the
 * product name. The letter follows the product name in the active locale.
 */
export function LogoMark({
  letter,
  className,
}: {
  readonly letter: string;
  readonly className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontSize="18"
        fontWeight="700"
        fontFamily="inherit"
        className="fill-primary-foreground"
      >
        {letter}
      </text>
    </svg>
  );
}

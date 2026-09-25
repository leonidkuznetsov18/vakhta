import { Fragment, type ReactNode } from 'react';
import { cn } from 'cn';

/** A named link `[label](https://…)` or a bare address. */
const LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>«»"']+/g;
/** Punctuation that closes a sentence around a link is not part of the address. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
const BULLET = /^[-•*]\s+/;
const NUMBER = /^\d+[.)]\s+/;

interface Segment {
  readonly text: string;
  readonly href?: string;
}

/** Stable keys from the content itself; a repeated line gets its occurrence number. */
function keyed<T extends { readonly text: string }>(items: readonly T[]): (T & { key: string })[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const times = (seen.get(item.text) ?? 0) + 1;
    seen.set(item.text, times);
    return { ...item, key: times === 1 ? item.text : `${item.text}#${times}` };
  });
}

/** Splits one line into plain text and the addresses it contains. */
export function linkSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of line.matchAll(LINK_PATTERN)) {
    const [raw, label, named] = match;
    if (match.index > last) segments.push({ text: line.slice(last, match.index) });
    if (label && named) {
      segments.push({ text: label, href: named });
      last = match.index + raw.length;
      continue;
    }
    const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    const href = raw.slice(0, raw.length - trailing.length);
    segments.push({ text: href, href });
    last = match.index + href.length;
  }
  if (last < line.length) segments.push({ text: line.slice(last) });
  return segments;
}

function Line({ line }: { readonly line: string }) {
  return keyed(linkSegments(line)).map((segment) =>
    segment.href ? (
      <a
        key={segment.key}
        href={segment.href}
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400 [overflow-wrap:anywhere]"
      >
        {segment.text}
      </a>
    ) : (
      <Fragment key={segment.key}>{segment.text}</Fragment>
    ),
  );
}

function Lines({ lines }: { readonly lines: readonly string[] }) {
  return keyed(lines.map((text) => ({ text }))).map((line, position) => (
    <Fragment key={line.key}>
      {position > 0 ? <br /> : null}
      <Line line={line.text} />
    </Fragment>
  ));
}

type ListKind = 'bullets' | 'numbers';

const LIST_PATTERNS: Readonly<Record<ListKind, RegExp>> = { bullets: BULLET, numbers: NUMBER };

/** A block may open with a line or two of text and then turn into one list until its end. */
function splitList(lines: readonly string[]): {
  readonly lead: readonly string[];
  readonly items: readonly string[];
  readonly kind: ListKind | null;
} {
  const start = lines.findIndex((line) => BULLET.test(line) || NUMBER.test(line));
  if (start < 0) return { lead: lines, items: [], kind: null };
  const items = lines.slice(start);
  const kind = items.every((line) => BULLET.test(line)) ? 'bullets' : 'numbers';
  if (!items.every((line) => LIST_PATTERNS[kind].test(line)))
    return { lead: lines, items: [], kind: null };
  return { lead: lines.slice(0, start), items, kind };
}

function List({ items, kind }: { readonly items: readonly string[]; readonly kind: ListKind }) {
  const rows = keyed(items.map((text) => ({ text }))).map((item) => (
    <li key={item.key}>
      <Line line={item.text.replace(LIST_PATTERNS[kind], '')} />
    </li>
  ));
  return kind === 'bullets' ? (
    <ul className="list-disc pl-5">{rows}</ul>
  ) : (
    <ol className="list-decimal pl-5">{rows}</ol>
  );
}

function Paragraph({ block }: { readonly block: string }) {
  const { lead, items, kind } = splitList(block.split('\n'));
  return (
    <>
      {lead.length ? (
        <p>
          <Lines lines={lead} />
        </p>
      ) : null}
      {kind ? <List items={items} kind={kind} /> : null}
    </>
  );
}

/**
 * Free text as people wrote it: blank lines separate paragraphs, single breaks stay, lines that
 * start with "-" or "1." become lists, and `[label](https://…)` or a bare address opens in a new tab
 * (owner rule, 2026-09-25).
 */
export function RichText({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}): ReactNode {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .filter((block) => block.trim().length > 0);
  return (
    <div className={cn('flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere]', className)}>
      {keyed(blocks.map((text) => ({ text }))).map((block) => (
        <Paragraph key={block.key} block={block.text} />
      ))}
    </div>
  );
}

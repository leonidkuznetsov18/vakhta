import { format, messages, type Locale } from '@vakhta/i18n';
import type { CalendarViewModel } from '@/shared/ui/resource-calendar';

export interface PrintInput {
  readonly model: CalendarViewModel;
  readonly locale: Locale;
  readonly siteName: string;
  readonly unitName: string;
  readonly period: { readonly from: string; readonly to: string };
  readonly timezone: string;
  readonly version: {
    readonly versionNo: number;
    readonly status: string;
    readonly publishedAt: string | null;
  } | null;
  readonly unpublished: boolean;
  readonly localChanges: boolean;
  readonly generatedAt: string;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A printable projection of the visible plan (SC-42): period, timezone, version identity and
 * creation time in the header; an unpublished plan or unsaved changes are marked on the page.
 * Pure string building so the content can be asserted without a browser.
 */
export function printDocument(input: PrintInput): string {
  const t = messages(input.locale).scheduleWorkspace;
  const statuses = messages(input.locale).admin.schedule.statuses;
  const version = input.version
    ? `${input.version.versionNo} · ${statuses[input.version.status as keyof typeof statuses] ?? input.version.status}${
        input.version.publishedAt ? ` · ${input.version.publishedAt}` : ''
      }`
    : '—';
  const head = `
    <h1>${escape(t.printTitle)} · ${escape(input.siteName)} · ${escape(input.unitName)}</h1>
    <p>${escape(t.printPeriod)}: ${escape(input.period.from)} – ${escape(input.period.to)} ·
       ${escape(t.printTimezone)}: ${escape(input.timezone)} ·
       ${escape(t.printVersion)}: ${escape(version)} ·
       ${escape(t.printGenerated)}: ${escape(input.generatedAt)}</p>
    ${input.unpublished ? `<p class="mark">${escape(t.printUnpublished)}</p>` : ''}
    ${input.localChanges ? `<p class="mark">${escape(t.printLocalChanges)}</p>` : ''}`;
  const header = `<tr><th>${escape(input.model.resourceLabel)}</th>${input.model.dates
    .map(
      (date) =>
        `<th>${escape(date.label)}${date.summary ? `<br><small>${escape(date.summary)}</small>` : ''}</th>`,
    )
    .join('')}</tr>`;
  const body = input.model.resources
    .map(
      (row) =>
        `<tr><th>${escape(row.title)}${row.description ? `<br><small>${escape(row.description)}</small>` : ''}${
          row.summary ? `<br><small>${escape(row.summary)}</small>` : ''
        }</th>${row.cells
          .map(
            (cell) =>
              `<td>${cell.note ? `<small>${escape(cell.note.text)}</small><br>` : ''}${cell.items
                .map(
                  (item) =>
                    `<div class="item${item.unpublished ? ' unpublished' : ''}">${escape(item.title)}<br><small>${escape(
                      [
                        item.time,
                        item.description,
                        ...(item.parts?.map((part) => part.label) ?? []),
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    )}</small>${item.status ? `<br><small>${escape(item.status)}</small>` : ''}</div>`,
                )
                .join('')}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return `<!doctype html><html lang="${escape(input.locale)}"><head><meta charset="utf-8"><title>${escape(
    t.printTitle,
  )}</title><style>
    body{font:12px/1.35 system-ui,sans-serif;margin:16mm;color:#111}
    h1{font-size:18px;margin:0 0 6px}
    .mark{border:2px solid #b00;color:#b00;font-weight:700;padding:4px 8px;display:inline-block;margin:4px 0}
    table{border-collapse:collapse;width:100%;table-layout:fixed}
    th,td{border:1px solid #999;vertical-align:top;padding:4px;overflow-wrap:anywhere}
    th{background:#f2f2f2;text-align:left}
    .item{border:1px solid #bbb;border-radius:3px;padding:2px 4px;margin:2px 0}
    .item.unpublished{border-style:dashed}
    small{color:#444}
    @page{size:landscape;margin:10mm}
  </style></head><body>${head}<table>${header}${body}</table>${
    input.model.resources.length === 0 ? `<p>${escape(input.model.emptyLabel)}</p>` : ''
  }<p><small>${escape(format(t.presenceAsOf, { time: input.generatedAt }))}</small></p></body></html>`;
}

/** Opens the document in a new window and asks the browser to print it; returns false when blocked. */
export function openPrint(html: string): boolean {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}

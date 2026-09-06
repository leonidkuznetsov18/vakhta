/**
 * Minimal CSV reader for the employee import: handles quoted fields, CRLF, `;` or `,`
 * separators and a BOM. Returns rows of trimmed cells; empty lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

export interface EmployeeRow {
  readonly line: number;
  readonly personnelNumber: string;
  readonly fullName: string;
  readonly error: string | null;
}

const HEADER_WORDS = /таб|номер|піб|фио|name|number|personnel/i;

/**
 * Maps CSV rows to employee cards: column 1 personnel number, column 2 full name. A first row
 * that looks like a header is skipped. Validation mirrors the API contract.
 */
export function employeesFromCsv(text: string, invalidLabel: string): EmployeeRow[] {
  const rows = parseCsv(text);
  const start = rows[0] && rows[0].some((c) => HEADER_WORDS.test(c)) ? 1 : 0;
  return rows.slice(start).map((cells, i) => {
    const personnelNumber = cells[0] ?? '';
    const fullName = cells[1] ?? '';
    const valid =
      personnelNumber.length >= 1 &&
      personnelNumber.length <= 32 &&
      fullName.length >= 3 &&
      fullName.length <= 200;
    return { line: start + i + 1, personnelNumber, fullName, error: valid ? null : invalidLabel };
  });
}

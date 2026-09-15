import { stringify } from 'csv-stringify/sync';

type CsvCell = string | number | null | undefined;

/** Preserve export dialect while treating text as untrusted and numbers as numeric cells. */
export function serializeCsv(
  rows: readonly (readonly CsvCell[])[],
  options: { bom: boolean },
): string {
  return stringify(
    rows.map((row) => [...row]),
    {
      delimiter: ';',
      record_delimiter: '\n',
      eof: false,
      bom: options.bom,
      quoted_match: /[\r\n]/,
      escape_formulas: true,
      cast: {
        number: (value) => ({ value: String(value), escape_formulas: false }),
      },
    },
  );
}

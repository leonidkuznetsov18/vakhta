import Papa from 'papaparse';
import { EMPLOYEE_IMPORT_MAX_ITEMS, ImportEmployeesCommand } from '@vakhta/contracts';

export const MAX_IMPORT_ROWS = EMPLOYEE_IMPORT_MAX_ITEMS;
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const employeeSchema = ImportEmployeesCommand.shape.items.element.pick({
  personnelNumber: true,
  fullName: true,
});
const NUMBER_HEADERS = new Set([
  'personnel number',
  'personnel_number',
  'number',
  'табельний номер',
  'табельный номер',
  'номер',
]);
const NAME_HEADERS = new Set(['full name', 'full_name', 'name', 'піб', 'фио']);

export function employeeCsvTemplate(
  numberLabel: string,
  nameLabel: string,
  exampleName: string,
): string {
  return (
    '\uFEFF' +
    Papa.unparse(
      [
        [numberLabel, nameLabel],
        ['0001', exampleName],
      ],
      { delimiter: ';', newline: '\n' },
    )
  );
}

export interface EmployeeRow {
  readonly line: number;
  readonly personnelNumber: string;
  readonly fullName: string;
  readonly error: 'INVALID' | null;
}
export interface EmployeePreview {
  readonly rows: EmployeeRow[];
  readonly command: ImportEmployeesCommand | null;
  readonly invalidCount: number;
}
export type PreviewResult =
  | { readonly status: 'ready'; readonly preview: EmployeePreview }
  | { readonly status: 'error'; readonly error: 'MALFORMED' | 'TOO_MANY_ROWS' };

/** Parse protocol syntax with Papa Parse; employee validation stays in the shared contract. */
export function previewEmployees(text: string): PreviewResult {
  if (!text.trim())
    return { status: 'ready', preview: { rows: [], command: null, invalidCount: 0 } };
  const parsed = Papa.parse<string[]>(text, {
    delimitersToGuess: [';', ','],
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    // Header plus maximum data rows plus one overflow record. Never import a truncated preview.
    preview: MAX_IMPORT_ROWS + 2,
  });
  if (parsed.errors.length) return { status: 'error', error: 'MALFORMED' };
  const first = parsed.data[0];
  const header =
    first &&
    NUMBER_HEADERS.has((first[0] ?? '').trim().toLowerCase()) &&
    NAME_HEADERS.has((first[1] ?? '').trim().toLowerCase())
      ? 1
      : 0;
  const records = parsed.data.slice(header);
  if (records.length > MAX_IMPORT_ROWS) return { status: 'error', error: 'TOO_MANY_ROWS' };
  const rows = records.map((cells, index): EmployeeRow => {
    const values = { personnelNumber: (cells[0] ?? '').trim(), fullName: (cells[1] ?? '').trim() };
    const result = employeeSchema.safeParse(values);
    return {
      line: header + index + 1,
      ...(result.success ? result.data : values),
      error: result.success ? null : 'INVALID',
    };
  });
  const valid = rows.filter((row) => row.error === null);
  const command = valid.length
    ? ImportEmployeesCommand.parse({
        items: valid.map(({ personnelNumber, fullName }) => ({ personnelNumber, fullName })),
      })
    : null;
  return { status: 'ready', preview: { rows, command, invalidCount: rows.length - valid.length } };
}

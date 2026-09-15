import { describe, expect, it } from 'vitest';
import { messages } from '@vakhta/i18n';
import { previewEmployees, employeeCsvTemplate, MAX_IMPORT_ROWS } from './preview';

describe('employee CSV preview', () => {
  it.each(['uk', 'en', 'ru'] as const)(
    'round-trips the localized %s template without importing its header',
    (locale) => {
      const e = messages(locale).admin.administration.employees;
      const csv = employeeCsvTemplate(e.personnelNumber, e.fullName, e.importExampleName);
      expect(previewEmployees(csv)).toMatchObject({
        status: 'ready',
        preview: {
          command: { items: [{ personnelNumber: '0001', fullName: e.importExampleName }] },
        },
      });
    },
  );
  it.each([';', ','])(
    'reads %s-delimited quoted fields without guessing from their punctuation',
    (separator) => {
      const result = previewEmployees(
        `\uFEFFpersonnel_number${separator}full_name\r\n0001${separator}"  Петренко; Іван, ""Старший""  "\r\n`,
      );
      expect(result).toMatchObject({
        status: 'ready',
        preview: {
          command: { items: [{ personnelNumber: '0001', fullName: 'Петренко; Іван, "Старший"' }] },
        },
      });
    },
  );

  it('handles multiline values, CR records and optional extra columns', () => {
    expect(
      previewEmployees('001;"Іван\nПетренко";ignored\r002;Анна Коваль;also ignored'),
    ).toMatchObject({
      status: 'ready',
      preview: {
        command: {
          items: [
            { personnelNumber: '001', fullName: 'Іван\nПетренко' },
            { personnelNumber: '002', fullName: 'Анна Коваль' },
          ],
        },
      },
    });
  });

  it('does not drop an employee whose name contains a header word', () => {
    expect(previewEmployees('0001;Namenson Ivan')).toMatchObject({
      status: 'ready',
      preview: { command: { items: [{ personnelNumber: '0001', fullName: 'Namenson Ivan' }] } },
    });
  });

  it.each(['Табельний номер;ПІБ', 'Табельный номер;ФИО', 'Personnel number;Full name'])(
    'recognizes %s headers',
    (header) => {
      expect(previewEmployees(`${header}\n001;Анна Коваль`)).toMatchObject({
        status: 'ready',
        preview: { rows: [{ line: 2 }], invalidCount: 0 },
      });
    },
  );

  it.each(['', ' \r\n\t', 'personnel_number;full_name\n'])(
    'reports empty input without a submit command',
    (text) => {
      expect(previewEmployees(text)).toEqual({
        status: 'ready',
        preview: { rows: [], command: null, invalidCount: 0 },
      });
    },
  );

  it('keeps invalid rows visible while validating the submitted subset with the shared contract', () => {
    const result = previewEmployees(
      '0001;Анна Коваль\n0002;A\n;Іван Коваль\n' + 'x'.repeat(33) + ';Іван Коваль',
    );
    expect(result).toMatchObject({
      status: 'ready',
      preview: {
        invalidCount: 3,
        command: { items: [{ personnelNumber: '0001', fullName: 'Анна Коваль' }] },
        rows: [{ error: null }, { error: 'INVALID' }, { error: 'INVALID' }, { error: 'INVALID' }],
      },
    });
  });

  it('rejects broken quoting instead of offering a partial import', () => {
    expect(previewEmployees('0001;Анна Коваль\n0002;"Unclosed name')).toEqual({
      status: 'error',
      error: 'MALFORMED',
    });
  });

  it('accepts the record limit and rejects overflow instead of silently truncating', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `${i};Анна Коваль`).join('\n');
    expect(previewEmployees(rows).status).toBe('ready');
    expect(previewEmployees(`${rows}\nextra;Іван Коваль`)).toEqual({
      status: 'error',
      error: 'TOO_MANY_ROWS',
    });
  });
});
